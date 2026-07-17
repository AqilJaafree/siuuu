# SIUUU — Product Requirements & Design

**Date:** 2026-07-17
**Status:** Draft for review
**Companion docs:** [`docs/txline-feed-analysis.md`](../../txline-feed-analysis.md) · [`docs/design-guidelines.md`](../../design-guidelines.md)

---

## 1. The problem

Three failures stack on top of each other during a World Cup.

**Clips are unverifiable.** A clip of a disallowed goal, a red card, a referee's
blown call spreads across social media stripped of context. Was that a real VAR
overturn or a re-edit? Which match? Which minute? Nobody can tell, so nobody
trusts anything, and the loudest edit wins over the accurate one.

**Clippers don't get paid.** The people who find and cut the moment that gets 4
million views capture approximately none of the value. Platform ad revenue share
on a 30-second clip is rounding-error money. There is no mechanism to attach a
sponsor to a specific moment at the moment it matters.

**Sponsors can't move fast enough.** By the time a brand's agency has identified a
viral moment, negotiated rights, and cut an activation, the moment is four days
cold. Sponsors have no live index of *what is happening right now that people
care about*, ranked by anything more reliable than a view count they can't audit.

These are one problem: **there is no trusted, machine-readable link between a
video clip and the real-world event it claims to show.** Build that link and all
three unlock at once.

---

## 2. The insight

TXLine (TxODDS) publishes a Solana-anchored live feed for the World Cup. Analysis
of the devnet capture (see companion doc) surfaced two things that make this
buildable:

**TXLine is a referee-decision audit trail.** `var` / `var_end` pairs carry an
explicit, structured decision:

```
Data.Type    ∈ { Goal, Penalty, MistakenIdentity }
Data.Outcome ∈ { Overturned, Stands }
```

**Controversy is a literal enum value in the source of record.** "The referee
carded the wrong player and VAR corrected it" is not something to infer from
commentary — it is `Data.Type: "MistakenIdentity"`, `Data.Outcome: "Overturned"`,
at a known second. Every event arrives twice (`Confirmed: false` → `true`) sharing
a stable `Id`, so the feed records exactly when a decision was made and when it
was reversed.

**The odds feed is a drama oracle.** Around a confirmed goal the market suspends
(empty `Prices` — 2,979 of 208,504 messages in the capture) and then reprices
hard. Measured on fixture 18209181: over-2.25 moved from decimal 2.088 to 2.691,
+29%, across one goal, with a suspension window in between. The market prices
significance in seconds, objectively, and a clipper cannot fake it.

So: **the clock is the join key.** Broadcast overlays burn the match clock and
scoreline into the video. TXLine knows the full state at every `Clock.Seconds`.
That is the bridge.

### And the timing is absurd

The capture is not test data. It is the **real 2026 World Cup quarter-finals and
semi-finals**, played 9–15 July 2026 — last week. The bracket resolves to
**Spain v Argentina, 19 July, MetLife**. Two days out.

**The capture is both finalists' complete road to the final**, and it contains
the thesis outright — five confirmed VAR decisions, four of them overturns:

- **A goal overturned by VAR in France 0–2 Spain** (`Id` 571, clock 3641→3653) —
  in the semi-final France lost. Spain plays the final.
- **`MistakenIdentity` / `Overturned` in Argentina's quarter-final** (`Id` 611,
  clock 4180→4272), **immediately followed by the corpus's only red card**
  (`Id` 613, clock 4280). The referee carded the wrong player, VAR caught it, the
  right player went off. Argentina plays the final.
- A goal and a penalty both overturned in England's quarter-final.
- The one decision that *stands*: `Penalty`/`Stands` in France–Morocco — the
  negative case, which matters as much as the overturns.

So SIUUU does not demo on synthetic data and hope for a good moment. It verifies
the actual referee controversies from both finalists' road to a final that is two
days away — and then runs live on it. See §6 (replay) and §9 (scope).

---

## 3. The product

**SIUUU** is a PWA where clippers cut 30-second World Cup moments, every clip is
cryptographically verified against TXLine and anchored on Solana, and sponsors
fund bounties on verified moments ranked by market-measured drama.

The pitch in one line: **the sponsor's logo cannot appear on a clip that isn't
true.**

### The three users

**Clipper** — cuts a moment, asserts what it shows, picks a sponsor from the
eligible campaigns, gets paid on verification. Not on views. On *truth*.

**Sponsor** — funds a campaign escrow on Solana devnet, targets by fixture, event
type, and minimum Drama Score, and watches verified clips carrying their
watermark appear in a live feed. They are buying moments, not impressions.

**Viewer** — browses the feed. Every clip carries a Proof Card. Tap it and see
exactly which TXLine events back the claim, at which clock values, anchored to
which Solana transaction.

---

## 4. The verification pipeline

This is the core of the product. Everything else is packaging.

```
 clip + asserted moment
          │
          ▼
  ┌───────────────┐   sample frames, read the broadcast overlay
  │   1. OCR      │   → clock "MM:SS", score "1-0", team marks
  └───────┬───────┘   → ocrConfidence per field
          ▼
  ┌───────────────┐   (FixtureId, clockStart..clockEnd)
  │  2. Resolve   │   OCR clock ±tolerance must agree with a
  └───────┬───────┘   TXLine frame whose Score also matches
          ▼
  ┌───────────────┐   does the asserted event exist in-window?
  │  3. Match     │   Confirmed:true frames ONLY
  └───────┬───────┘   then: any later action_discarded/amend on that Id?
          ▼
  ┌───────────────┐   suspension duration + StablePrice displacement
  │  4. Drama     │   across the clip window → 0..100
  └───────┬───────┘
          ▼
  ┌───────────────┐   {fixtureId, clockWindow, matchedEvents[],
  │  5. Proof     │    seqRange, contentHash, ocrConfidence, drama}
  └───────┬───────┘   → sha256 → anchor on Solana devnet
          ▼
  ┌───────────────┐   burn sponsor watermark, publish, release bounty
  │  6. Publish   │   ← only reachable if 1-5 all passed
  └───────────────┘
```

### Step 1 — OCR

Sample frames at 2fps across the 30s clip. Read the broadcast score bug:

- **Match clock** `MM:SS` → the join key. Recovered from multiple frames; must be
  monotonically increasing at ~1s/s or the clip is spliced.
- **Scoreline** `N-N` → the cross-check.
- **Team marks** → tri-code or crest region, used to narrow fixture candidates.

Each field carries a confidence. The monotonicity check across frames is what
catches re-edits: a clip cut from three different moments will not produce a
clean clock ramp.

### Step 2 — Resolve

Given OCR clock window and score, find TXLine frames on the asserted `FixtureId`
where `Clock.Seconds` falls in `[ocrClock - tol, ocrClock + tol]` **and** the
`Score` object agrees. Two independent signals — the burned-in overlay and the
feed — must tell the same story. Either alone is weak; together they are strong.

`tol` starts at ±3s (broadcast overlay lag vs feed emit).

**Refuse to resolve into a feed gap.** `disconnected` frames and `ConnectionId`
changes mark holes. No data, no verification.

### Step 3 — Match

Look for the asserted event inside the clock window, **on `Confirmed: true`
frames only**. An unconfirmed frame is a claim, not a fact.

Then the rule that matters most: **check the final state of the timeline, not the
first match.** `action_discarded` and `action_amend` share an `Id` with the event
they kill or rewrite, and can land minutes later. A verification computed at
ingest can be wrong by full time. So:

- Verification is **re-evaluated on `game_finalised`** for every clip on that
  fixture.
- A clip whose backing event was later discarded flips to **`OVERTURNED`** — it
  does not silently fail. The overturn is itself a fact worth showing, and often
  the more interesting one.
- `unreliable_yellow_cards` in the window **blocks** verification of card claims.

Assertable moment types, mapped to the feed:

| Claim | Backing actions |
|---|---|
| Goal | `goal`, `Confirmed: true`, no later discard |
| **VAR overturned this goal** | `var(Type=Goal)` + `var_end(Outcome=Overturned)`, **plus** `action_discarded` on an adjacent goal `Id` as corroboration |
| **VAR overturned this penalty** | `var(Type=Penalty)` + `var_end(Outcome=Overturned)` |
| **Referee carded the wrong player** | `var(Type=MistakenIdentity)` + `var_end(Outcome=Overturned)` |
| VAR checked and the decision stood | `var(...)` + `var_end(Outcome=Stands)` |
| Goal flashed and withdrawn | `action_discarded` on an unconfirmed `goal` with **no** VAR pair nearby. **Cannot claim VAR or offside — only that it was withdrawn.** |
| Red card | `red_card`, `Confirmed: true` |
| Yellow card | `yellow_card` (unless `unreliable_yellow_cards` in window) |
| Penalty awarded | `penalty`, `Confirmed: true` |
| Penalty outcome | `penalty_outcome` (`Data.Outcome`) |
| Scoreline correction | `score_adjustment` |

**`action_discarded` on a goal is not a disallowed goal.** This is the single
easiest way to ship a verifier that confidently states something false. All four
discarded goals in the corpus were **never `Confirmed: true`** — a goal is flashed
provisionally, VAR reviews it, VAR kills it, and the operator withdraws the
provisional goal. The discard is the *consequence*; the `var_end` is the
*evidence*. Two of the four have a VAR pair behind them and two do not — and for
those two you cannot say why the goal went away.

**Match on the VAR pair. Use the discard only as corroboration.** A verifier that
treats every discarded goal as "VAR disallowed it" is wrong in half the cases in
this corpus, and being wrong is the one thing this product cannot survive.

### Step 4 — Drama Score

Computed from the odds feed across the clip's clock window. Three components:

- **Suspension** — total duration of empty-`Prices` windows. The market pulling
  prices means the operator saw something.
- **Displacement** — max absolute log-change in demargined price across the window,
  taken on the most liquid line. Prices are integers scaled ×1000.
- **Breadth** — how many `SuperOddsType` markets moved together
  (`1X2_PARTICIPANT_RESULT` shifting alongside `OVERUNDER_PARTICIPANT_GOALS` means
  the match state changed, not just noise).

Normalised to 0–100 against the fixture's own distribution, so a drab group game
and a final are scored on their own terms.

Drama Score is **computed, not claimed**. It is a market fact. A clipper cannot
inflate it and a sponsor can audit it.

### Step 5 — Proof

```
ProofCard {
  fixtureId:      u64
  clockStart:     u32     // seconds
  clockEnd:       u32
  matchedEvents:  [{ id, action, clock, seq, confirmed }]
  seqRange:       [u32, u32]   // TXLine Seq bounds — the audit window
  contentHash:    [u8; 32]     // sha256 of the clip bytes
  ocrConfidence:  u8
  dramaScore:     u8
  status:         VERIFIED | OVERTURNED | REJECTED
}
```

sha256 of the canonical serialisation is anchored on Solana devnet. The card
itself is stored with the clip; the chain holds the commitment. Anyone can
recompute and check.

### Step 6 — Publish

**The watermark burns in only after verification passes.** This is the whole
trust product. There is no code path from an unverified clip to a sponsor's logo.
That constraint is the thing worth defending in a demo.

---

## 5. Sponsor economics

**Fixed bounty per verified clip, paid from a campaign escrow PDA, first-come
against budget.**

Deliberately **not** paid on views. View counts are unverifiable and a judge will
find that hole in ten seconds. Paying on *verification* is the mechanism only
SIUUU has — it is the honest version of the product and the stronger pitch.

```
Campaign {
  sponsor:        Pubkey
  budget:         u64        // devnet USDC
  bountyPerClip:  u64
  remaining:      u64
  targeting: {
    fixtures:     [u64]
    eventTypes:   [ActionKind]   // e.g. [red_card, var, action_discarded]
    minDrama:     u8
  }
  watermarkUri:   String
  active:         bool
}
```

Flow: sponsor funds escrow → clipper picks an eligible campaign at clip time →
verification passes → escrow releases `bountyPerClip` to the clipper's wallet,
`remaining` decrements → clip publishes with watermark.

A campaign only accepts clips its targeting matches, so a sponsor who wants
`minDrama: 80` and `[red_card, action_discarded]` is literally buying
controversy, priced by the market, verified against the source of record.

**Views as a stretch goal, not v1.** A virality bonus tier can layer on later via
an oracle. It is not needed to prove the thesis.

---

## 6. Architecture

```
┌─────────────────────────────────────────────────┐
│  PWA — Next.js (App Router)                     │
│  clip editor · feed · proof cards · sponsor UI  │
│  @solana/wallet-adapter                         │
└───────────────┬─────────────────────────────────┘
                │
┌───────────────▼─────────────────────────────────┐
│  API — Next.js route handlers                   │
│  ┌───────────┐ ┌───────────┐ ┌───────────────┐  │
│  │ ingest    │ │ verifier  │ │ drama scorer  │  │
│  │ (upload)  │ │ (OCR+match)│ │ (odds)       │  │
│  └───────────┘ └───────────┘ └───────────────┘  │
└──┬─────────┬──────────┬───────────┬─────────────┘
   │         │          │           │
┌──▼───┐ ┌───▼────┐ ┌───▼──────┐ ┌──▼──────────┐
│Walrus│ │ Redis  │ │ TXLine   │ │ Solana      │
│blobs │ │ index  │ │ devnet   │ │ devnet      │
│30s   │ │ +time- │ │ SSE +    │ │ anchor +    │
│clips │ │ lines  │ │ historical│ │ escrow PDA │
└──────┘ └────────┘ └──────────┘ └─────────────┘
```

### Components and their boundaries

| Component | Does one thing | Depends on |
|---|---|---|
| **Replay server** | Read the captured NDJSON, re-emit as SSE. Original `Ts` pacing, or accelerated. **Speaks the same protocol as TXLine.** | capture files |
| **TXLine ingestor** | Consume SSE, normalise frames, materialise per-fixture timelines. Owns reconnect via SSE `id` cursor. Does not know or care whether the source is replay or live. | SSE source, Redis |
| **Timeline store** | Answer "what was true at `(fixtureId, clock)`" and "what is the final state of event `Id`". | Redis |
| **OCR reader** | Video bytes → `{clock[], score[], teamMarks[], confidence}`. Knows nothing about TXLine. | ffmpeg, OCR engine |
| **Verifier** | ProofCard from an OCR result + a timeline. **Pure function.** No I/O. Unit-testable against the 6 captured fixtures. | — |
| **Drama scorer** | Odds window → 0–100. Pure. | — |
| **Anchor client** | ProofCard → sha256 → devnet tx. | Solana |
| **Escrow program** | Campaign PDA, fund, release, close. | Anchor |
| **Blob store** | Put/get 30s clips by content hash. | Walrus |

The verifier and drama scorer being **pure functions** is the key design
decision. The whole trust argument is testable offline against the captured
fixtures — no network, no flake, deterministic. That is also what makes the demo
robust.

### Replay-first — the feed source is a config swap

**v1 ingests the capture via the replay server, not the live TXLine feed.** This
is a deliberate choice, not a shortcut.

- **The footage is real.** These are real matches, so real broadcast video exists.
  OCR reads an actual broadcast overlay and joins it to an independently captured
  feed — two sources that were never derived from each other. Had these been
  simulated fixtures there would be no video, and the only option would be
  rendering an overlay *from* the feed and then OCRing it back to verify against
  that same feed. That is circular, and a judge would say so out loud.
- **It deletes the largest build risk.** Live ingest requires the full auth flow
  first — guest JWT → on-chain `subscribe` tx → sign `${txSig}::${jwt}` →
  `POST /api/token/activate` — before a single frame arrives. Hours of work, four
  failure points, all of them on the critical path and all of them live on stage.
- **The demo is deterministic.** The same bytes, every run.
- **The corpus is better than a live match would be.** Five confirmed VAR
  decisions (four overturns, one stands), a wrong-player red card, extra time,
  `score_adjustment`, `action_amend`. A live group game gives you a 0–0 and
  nothing to verify.

The replay server speaks SSE, so the ingestor is identical either way. Going live
for the final is **a URL and the auth flow**, not a rewrite. Build replay, prove
the pipeline, then bolt on auth once the thesis is standing.

**Do not let the replay path leak into the trust story.** The clips are real, the
feed data is real, the verification is real. The only thing replayed is the
*transport*. Say exactly that, unprompted, before anyone asks.

### Storage — and one honest flag

**Walrus for blobs, Redis for the hot index, Solana for the anchor and escrow.**

Walrus is faster and cheaper than IPFS for 30s clips and its blob IDs are
content-addressed, which fits the proof model cleanly.

**Risk, stated plainly:** Walrus is Sui infrastructure, and this is a Solana
hackathon. Expect to be asked why a Solana project has a Sui dependency in the
storage path. The defensible answer is that the *proof* lives on Solana — Walrus
holds bytes, Solana holds the commitment and the money, and the bytes are
content-addressed so the store is swappable. **Documented fallback: Irys, which
settles on Solana**, if the cross-chain dependency reads badly to judges. Decide
before the pitch, not during Q&A.

Redis holds materialised timelines, the drama index, and the sponsor discovery
leaderboard — all of it rebuildable from TXLine, so it is a cache, never a source
of truth.

### Data flow — clip to payout

1. Clipper selects fixture + clock window in the PWA, uploads 30s.
2. Ingest hashes bytes, puts to Walrus, writes pending record to Redis.
3. Verifier runs OCR → resolve → match against the Redis timeline.
4. Drama scorer reads the odds window.
5. ProofCard built → sha256 → anchored on devnet.
6. If `VERIFIED` and a campaign matches: watermark burned, escrow releases bounty.
7. Clip publishes to the feed with its Proof Card.
8. On `game_finalised`: every clip on that fixture is re-verified. Discarded
   backing event → status flips to `OVERTURNED`.

---

## 7. Error handling

The failure modes are the product. Each one gets an explicit, user-visible state
— never a silent failure and never a spinner that ends in nothing.

| Failure | Behaviour |
|---|---|
| OCR can't read the clock | `NEEDS_REVIEW` — ask the clipper to confirm the minute manually; verification proceeds at lower confidence and the Proof Card says so. |
| OCR clock non-monotonic | `REJECTED — spliced`. The clip is cut from multiple moments. |
| Score disagrees with feed at that clock | `REJECTED — wrong match or wrong minute`. Show both values. |
| Asserted event not in window | `REJECTED — no backing event`. Show what TXLine *does* have there; often the clipper mis-asserted and can re-file. |
| Window falls in a feed gap | `UNVERIFIABLE — no coverage`. Not the clipper's fault; say so. |
| `unreliable_yellow_cards` in window | Card claims blocked. Other claims unaffected. |
| Backing event later discarded | `OVERTURNED`. Surface it — this is a story, not an error. Bounty already paid is not clawed back; the clipper acted in good faith on the feed's confirmed state. |
| Campaign budget exhausted mid-verify | Clip still publishes verified, unsponsored. Verification never depends on money. |
| Anchor tx fails | Retry with backoff; clip sits `VERIFIED_PENDING_ANCHOR`. Verification is a fact before it is a transaction. |
| Walrus unavailable | Fail the upload loudly at ingest. Never publish a clip whose bytes we can't serve. |

---

## 8. Testing

**The captured fixtures are the test suite.** Six real World Cup knockout matches,
5,554 score frames, 208,504 odds messages, five confirmed VAR decisions, a red
card, extra time, `score_adjustment`, and `action_amend`. This is not a fixture set
someone invented to make the tests pass.

| Layer | Approach |
|---|---|
| **Verifier** | Pure function, golden tests against all 6 fixtures. Marquee: `MistakenIdentity`/`Overturned` → `red_card` on 18222446 (`Id` 611→613, clock 4180–4280), and `Goal`/`Overturned` on 18237038 (`Id` 571, clock 3641). |
| **The claim-precision tests** | **The most important tests in the suite.** 18237038 `Id` 570 and 18213979 `Id` 490 have a VAR pair → must verify as *"VAR overturned this goal"*. 18209181 `Id` 495 and 18213979 `Id` 410 have **no** VAR pair → must verify only as *"goal withdrawn"* and must **fail** an assertion of "VAR disallowed it". If these four tests pass, the verifier states exactly what it can back and nothing more. |
| **Negative case** | 18209181 `Id` 300 is `Penalty`/`Stands` — the only non-overturn. A clip asserting "VAR overturned the penalty" here must be `REJECTED`. |
| **Overturn handling** | Replay a fixture up to a `Confirmed: true` event, verify, then feed a later `action_discarded`/`action_amend` on that `Id` and assert the flip to `OVERTURNED`. Note: no corpus case has a *confirmed* goal later discarded, so this path needs a synthetic timeline built from real frames. |
| **Drama scorer** | Golden scores across the known goals. The 18209181 goal at clock 3560 (2.088 → 2.691) is the reference case. |
| **OCR** | Synthetic overlays at known clock/score, plus adversarial cases: spliced clips, occluded bugs, low bitrate. |
| **Escrow** | Anchor tests — fund, release, budget exhaustion, double-claim rejection. |
| **E2E** | One devnet path: upload → verify → anchor → watermark → payout. |

TDD applies to the verifier and drama scorer without argument — they are pure, the
corpus exists, and they carry the entire trust claim.

---

## 9. Scope

### v1 — the thesis

- **Replay server** over the 6 captured fixtures (Spain's and Argentina's road to
  the final). No live auth flow.
- OCR clock + score from broadcast overlays
- Verify goal / red card / yellow / penalty / VAR overturn / `MistakenIdentity` /
  goal-withdrawn — each claim stated only to the precision the feed supports
- Drama Score from the odds feed
- ProofCard anchored on Solana devnet
- Wallet connect, 30s clip upload to Walrus
- Sponsor campaign escrow, targeting, fixed bounty
- Watermark burn gated on verification
- Feed with Proof Cards, ranked by Drama Score
- Re-verify on `game_finalised`, `OVERTURNED` state

### v1.5 — the final, 19 July

Live ingest for **Spain v Argentina**. This is the whole reason to build v1 as a
config swap. Requires only: the TXLine auth flow (guest JWT → `subscribe` tx →
sign → activate) and pointing the ingestor at `txline-dev.txodds.com` instead of
the replay server.

Ship v1 first. Do not build the auth flow until the pipeline verifies a clip
end-to-end on replay.

### Explicitly out

- View-based payouts (unverifiable — the hole in every competitor's pitch)
- Player-level attribution (TXLine gives team-level, not who scored)
- Mainnet
- Clips over 30s
- Sports other than soccer
- Social graph, comments, follows
- Mobile-native apps — PWA only

### YAGNI'd

Multi-bookmaker odds (the capture has exactly one). Video transcoding ladders.
Sponsor bidding/auctions. Clipper reputation scores. Sub-clip highlight detection.

---

## 10. Why this wins

Every other clipping platform is a distribution play. SIUUU is a **truth**
play — and it can be, specifically because TXLine records referee decisions as
structured data with a confirm cycle and a retraction mechanism.

Three claims no competitor can make:

1. **"VAR overturned this goal" and "the referee carded the wrong player" are
   verifiable** — against the source of record, at a known second, anchored
   on-chain. Not inferred from commentary. Read from an enum.
2. **Virality is priced by a market, not counted by a platform** — objective,
   instant, ungameable.
3. **A sponsor's logo cannot appear on a clip that isn't true** — enforced by the
   architecture, not a policy.

And one accident of timing worth more than any of them: **the corpus is both
finalists' road to a final that hasn't been played yet.** Demo the VAR-overturned
goal from France–Spain, and the wrong-player red card from Argentina's quarter-
final — verified, scored by the market, anchored. Then say: *we're live on Sunday.*

---

## 11. Open questions

1. **Walrus vs Irys.** Sui dependency in a Solana hackathon. Decide before the
   pitch. (§6)
2. **`StatusId` 6–10 semantics.** Inferred from the capture, not documented.
   Confirm against the TXLine API Reference. (analysis §6)
3. **OCR tolerance.** ±3s is a starting guess for overlay-vs-feed lag. Calibrate
   against real broadcast footage.
4. **TXLine Validation Proofs endpoint.** The docs reference it but do not spec
   it. If it returns signed proofs, SIUUU should anchor *those* rather than
   trusting its own read of the feed — a materially stronger claim. Worth an email
   to TxODDS.
5. **Devnet USDC vs SOL** for escrow denomination.
6. **Broadcast footage rights.** World Cup video is heavily rights-encumbered.
   Normal hackathon territory, but it is the first question a sponsor asks in a
   real conversation, so have an answer. Does not block the build.
7. ~~Two of six fixtures lack `historical.raw.json`.~~ **Resolved.** 18237038's
   score stream is complete on its own — 1013 frames, `kickoff` → `game_finalised`,
   clock 0→5816, VAR pair intact. `historical.raw.json` is a convenience, not a
   requirement. The France–Spain marquee case is safe.
8. **`Data.Type` / `Data.Outcome` enums are observed, not documented.** Three types
   and two outcomes across 5 pairs is a small sample. There are almost certainly
   more (`Offside`? `RedCard`? `NotOverturned`?). Handle unknown values without
   crashing, and never map an unrecognised type to a human claim.
