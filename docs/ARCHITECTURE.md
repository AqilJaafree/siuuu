# SIUUU — Architecture

Companion to [`../README.md`](../README.md). This is the technical picture: what each
module does, why the boundaries fall where they do, and which decisions are load-bearing.

---

## The shape of the thing

```
                        ┌──────────────────────────────────────┐
  30s clip ────────────▶│ src/ocr/                             │
                        │  frames.ts  ffmpeg, 1 frame / 2s     │
                        │  read.ts    Gemini 2.5 Flash Lite    │
                        └──────────────┬───────────────────────┘
                                       │ OcrRead[] — score, teams, clock|null
                                       ▼
                        ┌──────────────────────────────────────┐
                        │ src/timeline/transition.ts           │
                        │  score transition -> unique clock    │
                        └──────────────┬───────────────────────┘
                                       │ Claim {fixtureId, clockStart, clockEnd, kind}
                                       ▼
 exact-match-txline-raw/ ─▶ src/txline/ ─▶ src/timeline/ ─▶ src/verify/verifier.ts
   (91MB capture)            parse         build/events        │  PURE
                             corpus        var/clock           │
                             normalize                         ▼
                                                          VerifyResult
                                    ┌──────────────────────────┼──────────────────────────┐
                                    ▼                          ▼                          ▼
                          src/score/impact.ts        src/score/controversy.ts    src/proof/card.ts
                          1X2 probability TVD        VAR taxonomy lookup         canonical + sha256
                             PURE                       PURE                          PURE
                                                                                        │
                                                                                        ▼
                                                                            src/chain/validate.ts
                                                                            validateStat -> Solana
```

**Everything inside `verify/`, `score/` and `proof/` is a pure function.** No I/O, no
`Date.now()`, no `Math.random()`, no filesystem. Grep enforces it. Two consequences:

1. The trust argument is testable offline against six real matches, deterministically.
2. A ProofCard computed at build time is **byte-identical** to one computed per
   request — which is the only reason the site can deploy without the 91MB capture.

---

## Modules

| Module | Responsibility | Depends on |
|---|---|---|
| `src/txline/` | Parse the capture. NDJSON + the SSE-formatted `historical.raw.json`. Normalise wire frames. | disk |
| `src/timeline/` | The queryable model. "What was true at `(fixture, clock)`?" Event final-state, VAR pairs, clock↔Ts, score transitions. | txline |
| `src/verify/` | **Pure.** `(Timeline, Claim) -> VerifyResult`. | timeline |
| `src/score/impact.ts` | **Pure.** 1X2 probability total-variation distance. | — |
| `src/score/controversy.ts` | **Pure.** VAR taxonomy lookup. | — |
| `src/proof/card.ts` | **Pure.** ProofCard, canonical serialisation, sha256. | — |
| `src/chain/` | Network config, statKeys, `validateStat`, session auth. | Solana, TxODDS |
| `src/ocr/` | Vision-LLM read of the broadcast bug. | ffmpeg, OpenRouter |
| `src/replay/` | Re-emit the capture as SSE, protocol-identical to TXLine. | txline |
| `app/`, `components/` | The PWA. Reads **only** `src/generated/demo-proofs.json`. | — |

---

## The decisions that carry weight

### 1. The verifier is pure, and that is not an aesthetic choice

It is what makes "we never state something untrue" *checkable*. 191 tests run the
whole trust argument against six real matches with no network and no flake. It is also
what lets the proof move to build time without changing.

### 2. Match on the VAR pair — and on its subject

`action_discarded` on a goal is **not** a disallowed goal. All four discarded goals in
the capture were never `Confirmed: true`; two have a VAR pair behind them and two do
not. Matching on the discard alone states something false in half the cases.

But the mirror is just as fatal: **a bare VAR pair proves nothing either.** 18237038
holds a goal that *stood* (Id 551 @3455) and a goal VAR *killed* (Id 570 @3629), 174s
apart. Match on the VAR pair alone and a clip of Spain's legitimate goal verifies as
"VAR overturned it".

So the rule is a **disjunction**: the claim holds if the clip shows the **review**, or
shows the **subject the review acted on**, tied temporally — plus a causal-ordering
conjunct, because a review cannot have caused a discard that already happened
(`action_discarded` must follow `var_end` in `Seq`, true 4/4 corpus-wide).

`tests/verify/precision.test.ts` is where this lives. It has been mutation-tested:
restoring bare-pair acceptance fails **four** tests, one per handler.

### 3. Impact and controversy are separate axes

See the README. One number cannot express "the market ignored it and the internet did
not". The tier and both scores sit **inside** the canonical serialisation, so a card
cannot be silently upgraded or re-scored without changing its hash.

### 4. The sponsor is bound into the hash

The product's promise is *"a sponsor's logo cannot appear on a clip that isn't true."*
So the card must **commit** to which sponsor rides on it — swap the sponsor and the
hash changes. `buildProofCard` refuses to attach a sponsor to a REJECTED card.

### 5. Two tiers, never blurred

There is no `statKey` for a VAR decision. `MERKLE_PROVEN` means a `validateStat` call
ran and returned true. `FEED_ATTESTED` means TxODDS's operator said so. **No branch
marks a card proven because a statKey merely exists** — that would assert a proof that
never happened.

### 6. Proof at build time, not request time

`validateStat` needs live TxODDS credentials, a funded devnet keypair and network
access. A Netlify build box has none. So `npm run precompute --prove` runs locally
against the real chain, and `src/generated/proven-stats.ts` records only the calls that
returned **true**.

**There is deliberately no fallback** to `runVerify` when the JSON is missing. One
source, always — a fallback hides drift, and drift means shipping a claim that no
longer matches the feed. `tests/proof/precomputed-feed.test.ts` asserts every
precomputed card equals a fresh `runVerify` against the capture, so a stale regenerate
fails the suite instead of the demo.

### 7. Replay-first ingest

`src/replay/` re-emits the capture as SSE, protocol-identical to live TXLine. The
ingestor cannot tell the difference, so going live is a URL plus the auth flow — not a
rewrite.

---

## Data notes that will bite you

Full detail in [`txline-feed-analysis.md`](txline-feed-analysis.md). The short list:

- **`Confirmed` absent means "not applicable", not `false`.** Mapping absent→false
  corrupts the verifier's core rule.
- **`Clock: 0` does not mean kickoff.** Ten actions carry it; `clock_adjustment` and
  `score_adjustment` report a clock they do not occur at. `kickoff` legitimately does.
- **`action_amend` does NOT share its target's `Id`** — 0 of 23 do. It carries its own
  and names its target by payload (`Data.Action` + `Data.Previous`). Join on `Id` and
  corrections silently never apply.
- **18209181's stream contains exact duplicate lines** — 1286 lines, 873 unique `Seq`.
  Dedupe the combined set on merge.
- **`MarketPeriod` is not always null.** Full-match, first-half and extra-time markets
  stream concurrently; comparing across them produced a phantom TVD of 0.367 on a
  window where nothing happened.
- **Never log-ratio raw odds.** It explodes on longshots and rated a dead-quiet window
  57/100. Prices are demargined — work in probability space.
- **`FixtureGroupId` is the knockout round**, not the tournament.

---

## Testing

**The capture is the test suite.** Six real matches, not fixtures someone invented to
make tests pass.

| File | What it protects |
|---|---|
| `tests/verify/precision.test.ts` | The claim-precision rules. Mutation-tested: bare-pair acceptance fails 4 tests. **Do not weaken.** |
| `tests/score/impact.test.ts` | A quiet control window must score **exactly 0.000**. Catches both scoring bugs. |
| `tests/proof/precomputed-feed.test.ts` | Build-time output equals request-time output. Catches a stale regenerate. |
| `tests/timeline/transition.test.ts` | The clockless join, incl. a real `AMBIGUOUS` case. |

---

## Probes

Each script in `scripts/` was written to test an assumption before building on it.
Each one found a real defect:

| Probe | What it found |
|---|---|
| `probe-stat-validation.ts` | The whole flow works — **plus five doc-vs-reality gaps** (ATA, statKey encoding, IDL returns, byte arrays, the `period` echo). |
| `probe-ocr.ts` | A vision LLM reads the bug **and refuses to guess** — `clock: null`, confidence 0.0, on frames it cannot read. |
| `probe-clip.ts` | **Real footage has no clock.** 0/7 frames. The score transition replaces it. |

The pattern is the point: **probe before you plan.** Every one of these ran against
live infrastructure or real footage, and every one invalidated something the design
assumed.
