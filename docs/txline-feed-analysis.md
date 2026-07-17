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
| Validation Proofs | Fixture / odds / score proofs for on-chain validation |

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
| `FixtureGroupId` | int | `10115675` for all 6 — the World Cup grouping. |
| `CompetitionId` | int | `72` |
| `CountryId` | int | `466` |
| `SportId` | int | `1` (Soccer) |
| `Type` | string | `"Soccer"` |
| `GameState` | string | `"scheduled"` throughout the capture — **do not trust for liveness**, use `StatusId`. |
| `StartTime` | int | epoch ms, kickoff |
| `IsTeam` | bool | `true` |
| `Participant1Id` / `Participant2Id` | int | Team ids |
| `Participant1IsHome` | bool | |
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
| `var` | 10 | VAR review opened. `Data.Type` names the subject once confirmed (e.g. `{"Type":"Penalty"}`). Unconfirmed frame carries `PossibleEvent:{VAR:true}`. |
| `var_end` | 5 | Review closed. `Data.Outcome` holds the decision. |
| `action_discarded` | 30 | **An event was retracted.** Shares `Id` with the event it kills. This is a disallowed goal / rescinded card. |
| `action_amend` | 21 | An event was rewritten. `Data` carries `{Action, New:{...}}` — the corrected values. |
| `score_adjustment` | 3 | Scoreline corrected out-of-band. `Clock.Seconds` is `0` on these. |
| `unreliable_yellow_cards` | 4 | Operator flags card data as untrustworthy. **Must gate verification.** |

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
- **Always check for a later `action_discarded` / `action_amend` with the same `Id`.**
  A confirmed goal can still be killed. Verification must be evaluated against the
  *final* state of the timeline, not the first matching frame.
- `Confirmed` is absent on some actions (`action_discarded`, `score_adjustment`,
  `comment`). Treat absence as "not applicable", not as `false`.

---

## 6. Enumerations

### `StatusId` — match phase

| Id | Meaning | n |
|---|---|---|
| 1 | Not started | 20 |
| 2 | 1st half | 2603 |
| 3 | Halftime | 38 |
| 4 | 2nd half | 2797 |
| 5 | Full time | 12 |
| 6 | Extra time 1st half | 11 |
| 7 | (extra time / break) | 342 |
| 8 | (extra time) | 11 |
| 9 | (penalties / post-ET) | 350 |
| 10 | | 6 |
| 100 | Finalised | 6 |

Ids 1–5 are confirmed by the capture README. 6–10 and 100 are inferred from
position and the known extra-time fixtures (18213979, 18222446); confirm against
the API Reference before relying on them.

### `Stats` — cumulative counters

Base codes:

| Code | Meaning |
|---|---|
| 1 / 2 | team1 / team2 goals |
| 3 / 4 | team1 / team2 yellows |
| 5 / 6 | team1 / team2 reds |
| 7 / 8 | team1 / team2 corners |

Period-prefixed: `code = period * 1000 + base`. So `1001` = team1 goals in 1st
half, `2007` = team1 corners in 2nd half. Periods 1–7 observed.

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
| `PriceNames` / `Prices` | Parallel arrays. **Prices are integers scaled ×1000** — `2088` = decimal odds 2.088. |
| `InRunning` | true = live |
| `Pct` | `"NA"` throughout the capture |

### Suspension is a signal

**2,979 messages (1.4%) carry an empty `Prices: []`.** That is the market
suspending — the operator pulling prices because something is happening.

Measured on fixture 18209181, `line=2.25`, around the confirmed goal at
`Clock.Seconds` 3560:

- immediately before: `Prices: []` — **suspended**
- ~20s after: `[2691, 1591]`
- baseline earlier in the match: `[2088, 1919]`

Decimal odds on *over* moved 2.088 → 2.691 (+29%) across the goal. The market
suspended, absorbed the event, and repriced.

**This is the Drama Score.** Suspension duration plus post-resume price
displacement gives an objective, market-priced measure of how much a moment
mattered — available seconds after it happens, with no view counts, no
engagement metrics, and nothing a clipper can game. See the design spec for the
scoring formula.

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

## 9. The six fixtures

| FixtureId | Result | Notable |
|---|---|---|
| 18209181 | FRA–MAR 2–0 | VAR → penalty sequence at clock 1472–1665. Has historical. |
| 18213979 | 1–2 | Extra time. `score_adjustment` + `action_amend`. Has historical. |
| 18218149 | 2–1 | Has historical. |
| 18222446 | 3–1 | Extra time. **The only `red_card` in the bundle.** Has historical. |
| 18237038 | 0–2 | No historical. |
| 18241006 | 1–2 | No historical. |

All share `FixtureGroupId` 10115675, `CompetitionId` 72.

---

## 10. Implications for SIUUU

1. **The clock is the join key.** `Clock.Seconds` is what OCR must recover from the
   broadcast overlay. Everything else follows from `(FixtureId, Clock.Seconds)`.
2. **`Score` is the OCR cross-check.** The scoreboard shows the score; the feed
   knows the score at every clock value. Two independent signals agreeing is a much
   stronger claim than either alone.
3. **Controversy is a first-class type, not an inference.** `var` / `var_end` /
   `action_discarded` / `action_amend` mean SIUUU can verify *"this goal was
   disallowed"* against the source of record. No other clipping platform can do
   this.
4. **Verify against the final timeline state.** `action_discarded` can retract a
   `Confirmed: true` event minutes later. A verification computed at ingest time
   can be wrong. Re-evaluate on `game_finalised`.
5. **The odds feed prices virality before humans notice it.** Drama Score from
   suspension + displacement is the sponsor discovery mechanism.
6. **`unreliable_yellow_cards` exists.** The feed tells you when it does not trust
   itself. Refuse to verify card claims in a window flagged unreliable.
7. **Watch `ConnectionId` changes and `disconnected` frames.** Gaps in the feed are
   visible; do not verify into a gap.
