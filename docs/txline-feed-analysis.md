# TXLine Feed Analysis

Derived from two sources: the live devnet capture in `exact-match-txline-raw/txline-raw/`
(6 World Cup fixtures) and the published docs at
<https://txline.txodds.com/documentation/worldcup>.

Everything below was verified against the capture unless marked *(docs only)*.

---

## 1. What TXLine is

TXLine (by TxODDS) is a sports data API with Solana anchoring. It exposes four
endpoint families *(docs only)*:

| Family | Purpose |
|---|---|
| Fixtures | Upcoming and current fixture metadata |
| Odds | StablePrice snapshots, historical updates, live stream |
| Scores | Score snapshots, historical, live event stream |
| **Validation Proofs** | **Merkle proofs verifiable on-chain — the differentiator.** See §1.1. |

## 1.1 `validateStat` — the thing that makes this Solana-native

`GET {api}/scores/stat-validation?fixtureId=&seq=&statKey=[&statKey2=]` returns
Merkle proofs. `program.methods.validateStat(...)` verifies them against the
`daily_scores_roots` PDA **with no intermediary**. It proves *"at `seq` N, `statKey`
K satisfied predicate P"* — read-only via `.view()`, needs a raised compute budget
(`1_400_000`).

```
[Buffer.from("daily_scores_roots"), epochDay(le,2)]  -> scores roots
[Buffer.from("daily_batch_roots"),  epochDay(le,2)]  -> odds roots
[Buffer.from("ten_daily_fixtures_roots"), alignedEpochDay(le,2)] -> fixtures roots
```

**This changes what SIUUU should anchor.** Hashing our own read of the feed proves
only that *we* said something. `validateStat` proves the stat itself against roots
TxODDS already published on Solana. The hackathon brief is explicit that a build
which only hits REST "has thrown away the Solana-native score."

**But know its limits before designing around it.** The stat keys are goals, cards
and corners — **there is no `statKey` for a VAR decision.** So:

| Claim | On-chain provable? |
|---|---|
| A red card exists at `seq` N | **yes** — `statKey` 5/6 |
| A goal exists at `seq` N | **yes** — `statKey` 1/2 |
| The scoreline at `seq` N | **yes** |
| *VAR overturned this goal* | **no** — no Merkle-backed stat encodes it |
| *The referee carded the wrong player* | **no** |

SIUUU's controversy thesis lives in `var`/`var_end`, which the Merkle tree does not
cover. The honest architecture is therefore **two-tier**, and saying so plainly is
stronger than blurring it:

1. **Merkle-proven** — the stat facts a claim rests on (a red card exists; the score
   was 1–0), proven on-chain with no intermediary.
2. **Feed-attested** — the VAR narrative (`Data.Type`, `Data.Outcome`), anchored as
   a content hash. Trust here is in TxODDS's operator, not in mathematics.

Claiming tier 2 has tier 1's guarantees would be exactly the kind of false statement
this product exists to refuse.

### Networks

| | Mainnet | Devnet |
|---|---|---|
| RPC | `https://api.mainnet-beta.solana.com` | `https://api.devnet.solana.com` |
| API host | `https://txline.txodds.com` | `https://txline-dev.txodds.com` |
| Program ID | `9ExbZjAapQww1vfcisDmrngPinHTEfpjYRWMunJgcKaA` | `6pW64gN1s2uqjHkn1unFeEjAwJkPGHoppGvS715wyP2J` |

The World Cup + International Friendlies bundle is **free tier**. Devnet offers
Service Level 1 with `samplingIntervalSec = 0`. Mainnet offers Service Level 1
(60-second delay) and Service Level 12 (real-time).

### Auth flow *(docs only)*

1. `POST /auth/guest/start` → guest JWT.
2. On-chain `subscribe` tx with `SERVICE_LEVEL_ID`, `DURATION_WEEKS` (multiples of
   4, up to 12 months), `SELECTED_LEAGUES` (empty array = standard bundle). SOL for
   fees and rent; no TxL payment on free tiers.
3. Wallet signs the string `${txSig}::${jwt}`.
4. `POST /api/token/activate` with the base64 detached signature → API token.
5. Every request carries **both**: `Authorization: Bearer ${jwt}` and
   `X-Api-Token: ${apiToken}`.

The published World Cup page is an architectural overview — it defers full
endpoint and field specs to an external API Reference. **Sections 2–6 below are
reverse-engineered from the capture and are the authoritative schema for SIUUU.**

---

## 2. Transport shape

Both feeds are SSE, captured as NDJSON, one JSON object per line:

```json
{ "id": "<SSE event id>", "data": { /* TXLine payload, verbatim */ } }
```

The SSE `id` has the form `<bucketMs>:<n>` (e.g. `1783628400000:5`) — a 10-minute
epoch bucket plus a counter. It is the **reconnect cursor**, not an event
identity. For event identity use `data.Seq`.

---

## 3. Score frame schema

Every score frame carries the full fixture header plus the delta. Fields observed
across all 6 fixtures:

### Fixture header (present on nearly every frame)

| Field | Type | Notes |
|---|---|---|
| `FixtureId` | int | Folder name in the capture. Primary key. |
| `FixtureGroupId` | int | **The knockout round.** `10115675` = quarter-finals (4 fixtures), `10115573` = semi-finals (2). Not a tournament-wide constant. |
| `CompetitionId` | int | `72` — constant across all 6. The tournament. |
| `CountryId` | int | `466` |
| `SportId` | int | `1` (Soccer) |
| `Type` | string | `"Soccer"` |
| `GameState` | string | `"scheduled"` throughout the capture — **do not trust for liveness**, use `StatusId`. |
| `StartTime` | int | epoch ms, kickoff |
| `IsTeam` | bool | `true` |
| `Participant1Id` / `Participant2Id` | int | Team ids |
| `Participant1IsHome` | bool | **A feed mapping, not a venue.** It designates which side is `Participant1`; it does not mean they are at home. The World Cup is played on neutral ground, so `true` here guarantees nothing about location. |
| `CoverageType` | string | `"TV/Stream"` |
| `CoverageSecondaryData` | bool | |

### Event body

| Field | Type | Notes |
|---|---|---|
| `Action` | string | Event type. See §4. |
| `Id` | int | **Event id — stable across the confirm cycle.** Both the `Confirmed:false` and `Confirmed:true` frames for one real-world event share an `Id`. |
| `Seq` | int | Monotonic per fixture. Use for ordering and for proof ranges. |
| `Ts` | int | epoch ms, feed emit time |
| `ConnectionId` | int | Changes on operator reconnect (e.g. 1011 → 1013 mid-match). Not an error. |
| `Confirmed` | bool | Two-phase. See §5. |
| `StatusId` | int | Match phase. See §6. |
| `Clock` | `{Seconds:int, Running:bool}` | **Match clock in seconds. The join key for OCR.** |
| `Stats` | `{code:int}` | Cumulative counters. See §6. |
| `Score` | nested | Per-participant, per-period totals. See below. |
| `Data` | object | Action-specific payload. Often `{}` on the unconfirmed frame. |
| `Participant` | 1\|2 | Which team the action belongs to |
| `Possession` / `PossessionType` | | `"AttackPossession"`, `"DangerPossession"`, … |
| `PossibleEvent` | object | e.g. `{"VAR": true}`, `{"Goal": true}` — a *pending* event |
| `Parti1State` / `Parti2State` | object | Per-team pending state, e.g. `{"PossibleEvent":{"Goal":true}}` |

### `Score` object

Nested `Participant1` / `Participant2` → period key → counters:

```json
"Score": {
  "Participant1": {
    "H1":    {"Goals": 1, "Corners": 3},
    "HT":    {"Goals": 1, "Corners": 3},
    "H2":    {"Goals": 2, "Corners": 1, "YellowCards": 1},
    "Total": {"Goals": 3, "Corners": 4, "YellowCards": 1}
  },
  "Participant2": { }
}
```

Period keys seen: `H1`, `HT`, `H2`, `Total`. Counter keys seen: `Goals`,
`Corners`, `YellowCards`, `RedCards`. **Zero-valued counters are omitted** — absence
means zero, so read defensively.

---

## 4. Action taxonomy

All 40 distinct `Action` values in the capture, by frequency:

### Noise — possession telemetry (~4,100 frames, 74%)

`attack_possession` (1351) · `safe_possession` (1285) · `possession` (594) ·
`danger_possession` (557) · `high_danger_possession` (356)

Filter these out. They carry no moment.

### Play events

`throw_in` (414) · `free_kick` (349) · `shot` (252) · `corner` (107) ·
`goal_kick` (107) · `substitution` (103) · `injury` (72) · `kickoff` (44) ·
`kickoff_team` (6) · `players_on_the_pitch` (4) · `players_warming_up` (2)

### Scoring and discipline — **the product surface**

| Action | n | Meaning |
|---|---|---|
| `goal` | 55 | Goal. Confirm cycle applies. |
| `yellow_card` | 55 | |
| `red_card` | 3 | Rare and therefore high-value. Only fixture 18222446. |
| `penalty` | 5 | Penalty awarded. Carries `Parti1State.PossibleEvent.Goal`. |
| `penalty_outcome` | 5 | `Data.Outcome` resolves it. |

### Controversy — **the differentiator**

| Action | n | Meaning |
|---|---|---|
| `var` | 10 | VAR review opened. `Data.Type` names the subject once confirmed. Unconfirmed frame carries `PossibleEvent:{VAR:true}`. **See §4.1 — this is the product.** |
| `var_end` | 5 | Review closed. `Data.Outcome` holds the decision. |
| `action_discarded` | 30 | An event was retracted. Shares `Id` with the event it kills. **Not a referee decision by itself — see §4.1.** |
| `action_amend` | 21 | An event was rewritten. **Joins by payload, NOT by `Id`** — `Data` carries `{Action, Previous, New}` and the amend has its own fresh `Id`. See §5. |
| `score_adjustment` | 3 | Scoreline corrected out-of-band. `Clock.Seconds` is `0` on these. |
| `unreliable_yellow_cards` | 4 | Operator flags card data as untrustworthy. **Must gate verification.** |

---

## 4.1 The VAR taxonomy — the most valuable structure in the feed

`var` / `var_end` pairs share an `Id` and carry an explicit, structured referee
decision. **All 5 confirmed pairs in the capture:**

| Fixture | Id | Clock | `Data.Type` | `Data.Outcome` |
|---|---|---|---|---|
| 18209181 France–Morocco QF | 300 | 1550 → 1582 | `Penalty` | **`Stands`** |
| 18213979 England QF | 492 | 3315 → 3406 | `Goal` | **`Overturned`** |
| 18213979 England QF | 843 | 5968 → 6071 | `Penalty` | **`Overturned`** |
| 18222446 Argentina QF | 611 | 4180 → 4272 | `MistakenIdentity` | **`Overturned`** |
| 18237038 France–Spain SF | 571 | 3641 → 3653 | `Goal` | **`Overturned`** |

Observed enumerations:

```
Data.Type    ∈ { Goal, Penalty, MistakenIdentity }
Data.Outcome ∈ { Overturned, Stands }
```

**`MistakenIdentity` means the referee carded the wrong player and VAR corrected
it.** "Referee misjudged the situation" is not something to infer from
commentary — it is a literal enum value in the source of record.

### `action_discarded` on a goal is NOT a disallowed goal

This is the trap, and it is easy to fall into. All 4 discarded goals in the
capture were **never `Confirmed: true`**:

| Fixture | Goal `Id` | Clock | Confirmed? | Gap to discard | Adjacent VAR? | What it actually is |
|---|---|---|---|---|---|---|
| 18237038 | 570 | 3629 | **no** | 26s | **`Id` 571 `Goal`/`Overturned` @3641** | **VAR-overturned goal** |
| 18213979 | 490 | 3262 | **no** | 148s | **`Id` 492 `Goal`/`Overturned` @3315** | **VAR-overturned goal** |
| 18209181 | 495 | 2924 | **no** | 2s | none | goal flashed and pulled (offside on the field, or operator error) |
| 18213979 | 410 | 2935 | **no** | 20s | none | goal flashed and pulled |

Read the mechanics: a goal is flashed unconfirmed, VAR reviews it, VAR overturns
it, and the operator discards the provisional goal. **The goal never reaches
`Confirmed: true` precisely because VAR killed it.** The `action_discarded` is
the *consequence*; the `var_end` is the *evidence*.

So there are two genuinely different claims here and they must not be conflated:

- **`var(Type=Goal)` + `var_end(Outcome=Overturned)` + `action_discarded` on an
  adjacent goal `Id`** → *"VAR overturned this goal."* Strong, specific, backed
  by an explicit decision. **2 cases.**
- **`action_discarded` on an unconfirmed goal with no VAR nearby** → *"a goal was
  flashed and withdrawn."* Weak. You cannot say why, and you must not claim VAR.
  **2 cases.**

A verifier that treats all `action_discarded`-on-goal as "disallowed goal" makes
a false claim in half the cases in this corpus.

### …and the mirror trap: a VAR pair alone proves nothing either

The obvious correction — "match on the VAR pair instead" — is **also wrong**, and
fails in the same fixture.

18237038 contains two goals 174s apart:

| Goal `Id` | Clock | Confirmed | Discarded | What it is |
|---|---|---|---|---|
| **551** | 3455 | **true** | **no** | One of Spain's two goals. It **stood**. |
| 570 | 3629 | false | yes | The goal VAR killed |

VAR `Id` 571 sits at 3641 — **186s after the goal that stood**. So a 30s clip of
Spain's legitimate goal at 3440–3470 has a `Goal`/`Overturned` VAR pair inside any
context window wide enough to be useful (±180s). Match on the VAR pair alone and
that clip verifies as *"VAR overturned this goal"* — announcing that a legitimate
World Cup semi-final goal was disallowed.

**Both halves are required, and they must be tied to each other:**

1. a `var(Type=Goal)` + `var_end(Outcome=Overturned)` pair in context, **and**
2. a **discarded goal in the clip window**, **and**
3. the two within `VAR_CONTEXT_SEC` of each other.

Tie them **temporally, not by `Id` adjacency** — 570/571 are adjacent but 490/492
are not, so adjacency does not generalise.

The tell that this bug is present: **the evidence array contains no goal.** Any
"VAR overturned this goal" verdict that cannot name the goal it killed is not
evidence, it is a coincidence of timing.

### Timing and control

`possible` (242) · `clock_adjustment` (65) · `additional_time` (38) ·
`status` (34) · `standby` (30) · `comment` (17, `Data` empty in capture) ·
`halftime_finalised` (6) · `game_finalised` (6) · `disconnected` (6) ·
`suspend` (4) · `connected` (1)

### Conditions

`weather` (2) · `pitch` (2) · `jersey` (2)

---

## 5. The two-phase confirm cycle

**This is the single most important behaviour in the feed.**

Events arrive unconfirmed, then confirmed, sharing one `Id` and separated by
1–120 seconds. Fixture 18209181's penalty sequence:

| Ts | Seq | Id | Action | Confirmed | Payload |
|---|---|---|---|---|---|
| …8726195 | 313 | 296 | `penalty` | `false` | `Parti1State.PossibleEvent.Goal: true` |
| …8804204 | 317 | 300 | `var` | `false` | `PossibleEvent.VAR: true`, `Data: {}` |
| …8805796 | 318 | 300 | `var` | **`true`** | `Data: {"Type":"Penalty"}` |
| …8835893 | 320 | 300 | `var_end` | `true` | `Data.Outcome: …` |
| …8843789 | 321 | 296 | `penalty` | **`true`** | |
| …8918870 | 322 | 302 | `penalty_outcome` | `false` | |
| …8927782 | 323 | 302 | `penalty_outcome` | **`true`** | |

Read it: penalty given → VAR opens → VAR is reviewing *the penalty* → VAR closes →
penalty confirmed → outcome. A 200-second referee decision, fully timestamped, at
`Clock.Seconds` 1472–1665.

**Rules for SIUUU:**

- **Verify only against `Confirmed: true` frames.** An unconfirmed frame is a claim,
  not a fact.
- **Always check for a later retraction or correction.** A confirmed goal can still
  be killed. Verification must be evaluated against the *final* state of the
  timeline, not the first matching frame. **But the two mechanisms join
  differently — see below.**
- `Confirmed` is absent on some actions (`action_discarded`, `score_adjustment`,
  `comment`). Treat absence as "not applicable", not as `false`.

### `action_discarded` and `action_amend` do NOT join the same way

This is a trap, and an earlier version of this document walked into it by saying
"check for a later `action_discarded` / `action_amend` **with the same `Id`**".
That is right for one and wrong for the other.

| | joins by | corpus |
|---|---|---|
| `action_discarded` | **shared `Id`** with its target | works |
| `action_amend` | **payload** — `Data.Action` + `Data.Previous` | **0 of 21 share their target's `Id`** |

An amend carries its **own fresh `Id`** and names its target by content:

```json
{ "Action": "action_amend", "Id": 460, "Seq": 518,
  "Data": { "Action": "yellow_card",
            "Previous": { "Clock": { "Seconds": 518 }, "PlayerId": 182068 },
            "New":      { "Clock": { "Seconds": 479 }, "PlayerId": 182068 } } }
```

`Id: 460` is the amend's own id. The yellow card it corrects is **`Id: 113`**. Join
on `Id` and the correction silently never applies — the timeline keeps reporting
clock 518 for a card TXLine moved to 479, and any proof built from it states a
value the source of record retracted.

**Join amends on `(Data.Action, Data.Previous.Clock)` and apply `Data.New`.** The
tell that you got this wrong: an "amended" field that is always null.

`Data.Previous` also carries `PlayerId`, so an amend can correct *who* was carded,
not only when — relevant once player-level attribution matters.

---

## 6. Enumerations

### `StatusId` — match phase

**Confirmed against the official soccer feed encoding** (see
`txline-worldcup-hackathon-SKILL.md` §8). An earlier version of this document
*inferred* 6–10 from position in the capture and got them wrong — recorded here
because the corrected values change how knockout fixtures must be read.

| Id | Code | Meaning | n in capture |
|---|---|---|---|
| 1 | NS | Not started | 20 |
| 2 | H1 | First half in play | 2603 |
| 3 | HT | Halftime | 38 |
| 4 | H2 | Second half in play | 2797 |
| 5 | F | **Ended (finished)** | 12 |
| 6 | WET | **Waiting for Extra Time** | 11 |
| 7 | ET1 | **Extra Time first half** | 342 |
| 8 | HTET | **Extra Time halftime** | 11 |
| 9 | ET2 | **Extra Time second half** | 350 |
| 10 | FET | **Ended after Extra Time** | 6 |
| 11 | WPE | Waiting for Penalty Shootout | 0 |
| 12 | PE | Penalty Shootout in progress | 0 |
| 13 | FPE | Ended after Penalty Shootout | 0 |
| 14–19 | I / A / C / TXCC / TXCS / P | Interrupted, Abandoned, Cancelled, TX Coverage Cancelled/Suspended, Postponed | 0 |
| **100** | — | **Undocumented.** 6 frames, one per fixture, alongside `game_finalised`. Treat as a terminal marker; do not rely on it. | 6 |

**What the earlier wrong inference cost:** it read 6 as "extra time 1st half" (it is
*waiting for* extra time — no play), 7 as "a break" (it is ET first half — play),
and 9 as "penalties" (it is ET second half). A knockout build that trusted that
would mis-slice exactly the passages where the drama lives.

**Neither extra-time fixture reached penalties** — 18213979 and 18222446 both
resolved in ET (`FET`, 10). So `WPE`/`PE`/`FPE` (11–13) are **untested by this
corpus**. The final could go to a shootout; that path has never run.

### `Stats` — cumulative counters

Base codes:

| Code | Meaning |
|---|---|
| 1 / 2 | team1 / team2 goals |
| 3 / 4 | team1 / team2 yellows |
| 5 / 6 | team1 / team2 reds |
| 7 / 8 | team1 / team2 corners |

Period-prefixed: `code = period * 1000 + base`. Official multipliers:

| Period | Multiplier | Example |
|---|---|---|
| H1 | +1000 | `1001` = P1 first-half goals |
| H2 | +2000 | `2001` = P1 second-half goals |
| ET1 | +3000 | `3001` = P1 extra-time-1 goals |
| ET2 | +4000 | `4001` = P1 extra-time-2 goals |
| **PE** | **+5000** | `5001` = P1 **penalty shootout** goals |

Codes for periods 6 and 7 appear in the capture but are undocumented and always
zero — ignore them.

**`statKey` is the join to on-chain proof.** `GET /api/scores/stat-validation`
takes a `statKey` and returns Merkle proofs verifiable against `daily_scores_roots`.
So `5001`/`5002` are how a penalty shootout gets settled trustlessly — the path
this corpus never exercises.

**`Stats` and `Score` are redundant.** Prefer `Score` — it is self-describing and
omits zeros; `Stats` is dense and positional. Use `Stats` only as a cross-check.

---

## 7. Odds feed

208,504 messages across the 6 fixtures. One bookmaker only:

```json
{"id":"1783628400000:262","data":{
  "FixtureId": 18209181,
  "MessageId": "1837049982:00003:000210-10021-stab",
  "Ts": 1783628412522,
  "Bookmaker": "TXLineStablePriceDemargined",
  "BookmakerId": 10021,
  "SuperOddsType": "OVERUNDER_PARTICIPANT_GOALS",
  "GameState": null,
  "InRunning": true,
  "MarketParameters": "line=2.25",
  "MarketPeriod": null,
  "PriceNames": ["over","under"],
  "Prices": [2088, 1919],
  "Pct": ["NA","NA"]
}}
```

| Field | Notes |
|---|---|
| `Bookmaker` / `BookmakerId` | Always `TXLineStablePriceDemargined` / `10021`. Demargined = vig removed, so prices are ~true probability. |
| `SuperOddsType` | `OVERUNDER_PARTICIPANT_GOALS` (95,791) · `ASIANHANDICAP_PARTICIPANT_GOALS` (82,484) · `1X2_PARTICIPANT_RESULT` (30,229) |
| `MarketParameters` | `line=<n>` for over/under and handicap; `null` for 1X2 |
| `MarketPeriod` | **`null` = full match · `"half=1"` = first half · `"et"` = extra time.** All stream concurrently. **Not always null** — see below. |
| `PriceNames` / `Prices` | Parallel arrays. Stable ordering: 1X2 is always `("part1","draw","part2")` (all 30,229), handicap `("part1","part2")`, over/under `("over","under")`. **Prices are integers scaled ×1000** — `2088` = decimal odds 2.088. |
| `InRunning` | `true` = live, `false` = pre-match. ~10K messages are pre-match. Filter them. |
| `Pct` | `"NA"` throughout the capture |

### `MarketPeriod` is the trap

Three markets stream **at the same time** for one fixture:

| `SuperOddsType` | `MarketPeriod` | n |
|---|---|---|
| 1X2 | `null` (full match) | 18,101 |
| 1X2 | `half=1` | 7,595 |
| 1X2 | `et` | 2,503 |

Filter on `SuperOddsType` alone and you will compare a **first-half** price against
a **full-match** price. At 33 minutes and 0–0 a first-half draw sits near 0.63
probability while the full-match draw sits near 0.26 — so the naive filter reports
a violent market move on a window where nothing happened. Measured: a phantom TVD
of **0.367** on a dead-quiet window that scores **0.000** once
`MarketPeriod === null && InRunning === true` is applied.

**Always filter to `MarketPeriod === null` and `InRunning === true`** for
match-outcome signal.

### Reading price movement correctly

**2,979 messages (1.4%) carry an empty `Prices: []`** — the market suspending
because something is happening. Useful, but a weaker signal than it looks: the
biggest moments in the corpus show 0s of suspension.

**Prices are demargined**, so `1000 / price` is a true probability and the 1X2
triple sums to ~1. **Use probability space, never log-ratio on raw odds.** Log
space explodes on longshots — a 9.4 → 47.9 drift is `|ln| = 1.63` and swamps real
signal. An early scorer built that way rated a dead-quiet window **57/100**.

The correct measure is **total variation distance** on the 1X2 probability vector:
`0.5 * Σ|p_after − p_before|`. Bounded [0,1], interpretable as "how much
probability mass moved". Measured on real windows:

| Fixture / window | TVD | probability before → after |
|---|---|---|
| 18209181 goal @3560 | **0.348** | `[0.52,0.37,0.11]` → `[0.87,0.11,0.02]` |
| 18213979 VAR goal overturned @3250 | **0.301** | `[0.20,0.39,0.41]` → `[0.50,0.31,0.18]` |
| 18222446 mistaken-identity red card | **0.140** | `[0.32,0.54,0.14]` → `[0.46,0.47,0.07]` |
| 18209181 goal @3922 (already 0.86 up) | 0.119 | `[0.86,0.12,0.02]` → `[0.98,0.02,0.00]` |
| 18237038 VAR goal overturned | **0.004** | `[0.03,0.10,0.86]` → `[0.03,0.10,0.87]` |
| 18209181 quiet control @2000 | **0.000** | `[0.62,0.26,0.12]` → `[0.62,0.26,0.12]` |

### This measures impact, not drama

Note rows 5 and 6. The France–Spain VAR-overturned goal scores **0.004** — the
market ended where it started, because the goal was overturned and because it was
flashed for Spain, already at 0.86 and already 2–0 up. Nothing about the outcome
changed. **The market is correct, and useless for ranking controversy.**

So market movement is an **impact** axis and cannot carry drama on its own.
Controversy needs a second axis read from the VAR taxonomy (§4.1). See the design
spec §4 for both formulas and why collapsing them into one number destroys the
most interesting moments in the corpus.

---

## 8. `historical.raw.json`

Present for 4 of 6 fixtures (missing for 18237038, 18241006). The verbatim
`/api/scores/historical` response.

**Format gotcha:** the file is **not JSON**. It is the raw SSE body — lines
prefixed with `data: `. Strip the prefix and parse per line. `json.load()` on the
file fails at byte 0.

Contents match the live score frame schema. Use it to backfill a full-match
timeline without replaying the stream.

---

## 9. The six fixtures — the 2026 World Cup knockout bracket

**These are not sample fixtures.** They are the real quarter-finals and
semi-finals of the 2026 World Cup, played 9–15 July 2026, captured live.

Team ids decode against the published results:

| id | Team |
|---|---|
| 1999 | France |
| 3021 | Spain |
| 1888 | England |
| 1489 | Argentina |
| 2530 | Morocco |
| 1575, 2661, 3099 | QF opponents, unidentified |

### Clock coverage — the score stream does not always start at kickoff

| FixtureId | Stream covers | Biggest gap | `historical.raw.json` |
|---|---|---|---|
| 18209181 | **19:19** → 96:08 | **1159s at the start** | yes — **required** for the first 19 min |
| 18218149 | **28:39** → 97:01 | **1719s at the start** | yes — **required** for the first 28 min |
| 18213979 | 0:00 → 122:07 | 221s @1367 | yes |
| 18222446 | 0:00 → 123:48 | 216s @1333 | yes |
| 18237038 | 0:00 → 96:56 | 193s @1411 | **no** — stream is complete on its own |
| 18241006 | 0:00 → 101:43 | 201s @1446 | **no** — stream is complete on its own |

Two fixtures' captures began mid-match: 18209181 at 19:19 and 18218149 at 28:39.
Their opening minutes exist **only** in `historical.raw.json`. Conveniently, the
two fixtures *without* historical are exactly the two whose streams run clean from
kickoff — so the corpus is fully usable, but **`historical.raw.json` is required,
not a convenience**, and parsing it means stripping the `data: ` SSE prefix (§8).

Typical frame spacing is ~4.5s, but gaps up to ~220s exist mid-match. **A 30s clip
window can legitimately contain zero frames.** That is `UNVERIFIABLE`, not a bug.

**Read the table as stream-only.** Once `historical.raw.json` is merged, 18209181
and 18218149 both cover 0 → end with a max gap of ~205s, the same as the rest. The
"starts at 19:19 / 28:39" figures describe the live stream alone, which is the
thing historical exists to repair.

### Ten actions report a meaningless `Clock: 0`

`Clock.Seconds: 0` does **not** mean "at kickoff". These actions carry it:

| Action | n | Real clock 0? |
|---|---|---|
| `clock_adjustment` | 16 | **no** — 12 are end-of-stream finalisation boilerplate (`Running: false`) |
| `score_adjustment` | 3 | **no** — out-of-band correction |
| `kickoff` | 8 | **yes** — legitimately at clock 0 |
| `players_on_the_pitch`, `kickoff_team`, `standby`, `status`, `weather`, `pitch`, `players_warming_up`, `jersey`, `action_amend` | 1–4 each | pre-match metadata |

**Exclude `clock_adjustment` and `score_adjustment` from clock lookups and
coverage** — they report a clock they do not occur at. Do **not** exclude
`kickoff`; it is real coverage. Excluding only `score_adjustment` collapses every
fixture's `minClock` to 0 and hides the real start-of-stream gap.

### 18209181's stream contains exact duplicate lines

`scores.ndjson` for 18209181 has **1286 lines but only 873 unique `Seq`** —
operator retransmission on reconnect. The other five fixtures have none.

The duplicates are **exact**: zero `Seq` values carry differing payloads across the
whole corpus. So `Seq` is a safe dedupe key, and first-seen-wins drops a
`Confirmed: true` frame in **zero** cases. Dedupe on merge, or event frame counts
and any `Seq`-range proof will be wrong for this fixture.

### Quarter-finals — `FixtureGroupId` 10115675

| FixtureId | Kickoff (UTC) | Fixture | Result | Notable |
|---|---|---|---|---|
| 18209181 | Jul 9 20:00 | France (1999) v Morocco (2530) | 2–0 | **VAR → penalty, `Id` 300, clock 1550→1582, `Penalty`/`Stands`** — the only VAR decision in the corpus that *stands*. Goal flashed and pulled @2924 (no VAR). Has historical. |
| 18218149 | Jul 10 19:00 | Spain (3021) v 1575 | 2–1 | Quietest fixture. No VAR. Has historical. |
| 18213979 | Jul 11 21:00 | 2661 v England (1888) | 1–2 (ET) | **Two VAR overturns:** `Id` 492 `Goal`/`Overturned` @3315→3406, and `Id` 843 `Penalty`/`Overturned` @5968→6071. `score_adjustment`, `action_amend`. Has historical. |
| 18222446 | Jul 12 01:00 | Argentina (1489) v 3099 | 3–1 (ET) | **`Id` 611 `MistakenIdentity`/`Overturned` @4180→4272, followed by the corpus's only `red_card` (`Id` 613) @4280.** The referee carded the wrong player, VAR caught it, the right player went off. Has historical. |

### Semi-finals — `FixtureGroupId` 10115573

| FixtureId | Kickoff (UTC) | Fixture | Result | Notable |
|---|---|---|---|---|
| 18237038 | Jul 14 19:00 | France (1999) v Spain (3021) | 0–2 | **`Id` 571 `Goal`/`Overturned` @3641→3653** — a goal overturned by VAR in the semi-final France lost, paired with the discarded goal `Id` 570 @3629. No historical, but the score stream is complete (`kickoff` → `game_finalised`, clock 0→5816, 1013 frames). |
| 18241006 | Jul 15 19:00 | England (1888) v Argentina (1489) | 1–2 | No historical. |

`CompetitionId` 72 throughout. **`FixtureGroupId` distinguishes the round** —
10115675 = quarter-finals, 10115573 = semi-finals. The earlier reading that all
six share one group id was wrong.

### The bracket resolves

Every QF winner appears in the correct SF: France and Spain won QF1/QF2 and met
in SF1; England and Argentina won QF3/QF4 and met in SF2.

**The final is Spain v Argentina, 19 July 2026, MetLife Stadium.** Third-place
playoff France v England, 18 July.

**The capture is both finalists' complete road to a final that has not yet been
played.** See the design spec §6 for what this means for the build.

Sources: [France 0-2 Spain, ESPN](https://www.espn.com/soccer/match/_/gameId/760514/spain-france) ·
[FIFA match centre](https://www.fifa.com/en/match-centre/match/17/285023/289290/400021541) ·
[Al Jazeera bracket](https://www.aljazeera.com/sports/2026/7/14/fifa-world-cup-brackets-semifinal-schedule-france-vs-spain-prediction)

---

## 10. Implications for SIUUU

1. **The clock is the join key.** `Clock.Seconds` is what OCR must recover from the
   broadcast overlay. Everything else follows from `(FixtureId, Clock.Seconds)`.
2. **`Score` is the OCR cross-check.** The scoreboard shows the score; the feed
   knows the score at every clock value. Two independent signals agreeing is a much
   stronger claim than either alone.
3. **Controversy is a first-class type, not an inference.** `var_end` carries
   `Data.Outcome: "Overturned"` and `Data.Type: "MistakenIdentity"`. SIUUU can
   verify *"VAR overturned this goal"* and *"the referee carded the wrong player"*
   against the source of record. No other clipping platform can do this.
4. **Match on the VAR pair, not on `action_discarded`.** Half the discarded goals
   in this corpus have no VAR behind them. See §4.1 — this is the single easiest
   way to build a verifier that confidently states something false.
5. **Verify against the final timeline state.** `action_discarded` and
   `action_amend` can retract or rewrite an event minutes later. A verification
   computed at ingest can be wrong by full time. Re-evaluate on `game_finalised`.
   **They join differently**: the discard shares its target's `Id`; the amend does
   not (0 of 21) and must be joined on `(Data.Action, Data.Previous.Clock)`. Getting
   this wrong means reporting a clock the feed retracted. See §5.
6. **The odds feed prices impact, not virality.** 1X2 probability TVD is objective
   and instant, but a VAR overturn that changes nothing scores ~0. Controversy must
   be scored separately from the VAR taxonomy. Filter to `MarketPeriod === null`
   and `InRunning === true`, and work in probability space — both mistakes produce
   confident nonsense.
7. **`unreliable_yellow_cards` exists.** The feed tells you when it does not trust
   itself. Refuse to verify card claims in a window flagged unreliable.
8. **Watch `ConnectionId` changes and `disconnected` frames.** Gaps in the feed are
   visible; do not verify into a gap.
