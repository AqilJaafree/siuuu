# SIUUU

**A World Cup clip is worthless unless you can prove what it shows.**

SIUUU verifies clips against TXLine — TxODDS's live World Cup feed — and proves the
facts underneath them against Merkle roots TxODDS has already published on Solana.
Sponsors fund the moments; clippers get paid on **verification**, not on views.

Built for the Superteam MY × TxOdds World Cup Hackathon.

---

## The one thing that matters

```
$ npm run verify -- --fixture 18209181 --clock 2910-2940 --claim var_overturned_goal

  REJECTED  var_overturned_goal
  fixture 18209181 · clock 2910-2940s

  No VAR decision of type Goal with outcome Overturned within 180s.
  A discarded goal alone does not prove VAR.
  TXLine has: goal, action_discarded, shot, free_kick, possible
```

Morocco scored against France at 48:44 and it was withdrawn six seconds later. Every
clipping platform on earth would caption that "VAR CHAOS". **SIUUU refuses**, because
TXLine records no VAR decision there — the feed cannot say *why* the goal went away,
so neither do we.

**That refusal is the product.** Anyone can show you a green tick.

---

## What is actually proven, and what is not

There is **no `statKey` for a VAR decision**. TxODDS's Merkle tree covers goals,
cards, corners and the scoreline — not referee reasoning. So every claim carries one
of two tiers, rendered as visibly different things:

| Tier | Example | Trust rests on |
|---|---|---|
| **`MERKLE_PROVEN`** | *a red card exists at seq 687* | **Mathematics.** `validateStat` against `daily_scores_roots`, no intermediary. |
| **`FEED_ATTESTED`** | *VAR called it mistaken identity* | **TxODDS's operator.** Anchored as a content hash. |

The feed shows both halves of **the same 30 seconds** of Argentina's quarter-final:

- **The red card** → `MERKLE_PROVEN`, statKey 6, seq 687, roots PDA
  `FtnZq4V8mp56GUNEGGXfL1MuyT81cvoz59yeKn192HdH`
- **The reason it was shown** — "the referee carded the wrong player, VAR overruled"
  → `FEED_ATTESTED`, and it never can be anything else

Most projects would paint both green. Collapsing them would be the exact overclaim
this product exists to refuse.

> **We do not "anchor on Solana."** The roots are already there; we *check against*
> them. Saying otherwise reverses the direction of the guarantee.

---

## Two scores, never averaged

Market movement measures **match impact**, not drama. Measured on the capture:

| Moment | Impact | Controversy |
|---|---|---|
| Clean goal, France–Morocco | **56** | 10 |
| Mistaken-identity red card | 22 | **100** |
| VAR-overturned goal, France–Spain | **1** | **90** |
| Quiet control window | **0** | 0 |

The third row is why one number cannot work. That goal was overturned, so the market
ended exactly where it started — impact ~zero — while being the most argued-about
moment of the match. Average them to 45 and you destroy the only interesting thing
about it.

So a boot brand buys `minImpact: 50, maxControversy: 20` — clean decisive football. A
betting brand buys `minControversy: 80` — the argument. Both computed: one from a
market, one from an enum. **Neither is a view count.**

---

## Quick start

```bash
npm install
npm test                 # 191 tests, all against the real capture
npm run dev              # the PWA
```

```bash
# the marquee case
npm run verify -- --fixture 18222446 --clock 4260-4290 --claim mistaken_identity

# the honest refusal — this is the product
npm run verify -- --fixture 18209181 --clock 2910-2940 --claim var_overturned_goal
```

**The capture is not in this repo.** `exact-match-txline-raw/` is 91MB of TxODDS
data — six real 2026 World Cup knockout matches, 5,554 score frames, 208,504 odds
messages. Tests and `npm run precompute` need it; the deployed site does not.

---

## The demo feed

Five cases. Every number computed by the real engine against the real capture:

| Claim | Verdict | Impact | Controversy | Tier |
|---|---|---|---|---|
| Referee cards the wrong player — VAR overrules | VERIFIED | 22 | 100 | `FEED_ATTESTED` |
| **The red card itself** | VERIFIED | 22 | 70 | **`MERKLE_PROVEN`** |
| Spain goal overturned by VAR | VERIFIED | 1 | 90 | `FEED_ATTESTED` |
| **France second goal** | VERIFIED | 19 | 10 | **`MERKLE_PROVEN`** |
| **Morocco goal ruled out — was it VAR?** | **REJECTED** | 5 | 0 | — |

---

## Architecture

Full detail in [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md); the reverse-engineered
feed schema in [`docs/txline-feed-analysis.md`](docs/txline-feed-analysis.md).

```
clip ─▶ OCR (Gemini 2.5 Flash Lite) ─▶ score transition ─▶ TXLine timeline
                                                                │
                                                    verify ◀────┘
                                                       │
                    impact (market TVD) ◀──────────────┼─────────▶ controversy (VAR enum)
                                                       │
                                                  ProofCard ─▶ validateStat ─▶ Solana
```

The verifier and both scorers are **pure functions** over an in-memory timeline — no
I/O, no clock, no randomness. That is what makes the trust argument testable offline
against six real matches, deterministically, and what lets the proof be computed at
build time and stay byte-identical.

---

## What we found that the docs get wrong

Five gaps between TxODDS's documentation and reality, every one found by executing
the flow rather than reading about it:

1. **The docs derive the TxL associated token account but never create it.**
   `subscribe` fails `AccountNotInitialized` (3012) before it looks at the service
   level. The free tier charges no TxL — the account must still exist.
2. **The period stat-key encoding is wrong for this feed.** Docs say `H2 → +2000`, so
   a P2 second-half red card should be `2006`. The live endpoint reports `2006`
   **empty**; the card is at `3006`. Measured: H1 → prefixes 1 *and* 2, H2 → 3,
   ET1 → 4, ET2 → 5.
3. **So use the un-prefixed totals (1–8).** `statKey 6` proves the red card and
   sidesteps the broken scheme — `validateStat` takes a `seq`, so it proves the total
   *as of* that sequence.
4. **The on-chain IDL declares no return type for `validate_stat`**, so Anchor's
   `.view()` rejects it — yet the docs' own example calls `.view()`. Patched IDL
   vendored at [`idl/txoracle-devnet.json`](idl/txoracle-devnet.json).
5. **`StatusId` 6–10 are not what position implies.** 6 is *Waiting for* Extra Time
   (no play), 7 is ET first half, 9 is ET second half.

One more, worth its own section:

---

## The clock does not exist

The design assumed `Clock.Seconds` was the join key between video and feed. A real
France–Morocco clip killed that:

```
frames reporting a clock: 0/7   ← the bug reads "FRA 1 | 0 MAR" and nothing else
transition observed: 1-0 -> 2-0
match: UNIQUE  clock 3922  seq 793
```

The OCR returned `clock: null` on all seven frames — it refused to invent one. So the
join is the **score transition**: `1-0 → 2-0` happens exactly once in that match, at
clock 3922. The scoreline's *history* pins the moment with no clock at all.

Uniqueness is checked, never assumed. Scorelines run **backwards** when goals are
discarded, so `1-1 → 1-2` occurs twice in 18213979 and correctly returns `AMBIGUOUS`
rather than a guess.

---

## Honest limits

- **The upload path does not work on the deployed site.** No capture there, so nothing
  to verify against. Demo it locally.
- **OCR is not wired into the UI.** Proven in `scripts/probe-clip.ts` against real
  footage; the app does not call it yet.
- **No escrow.** Sponsor selection binds into the ProofCard hash — so a sponsor's logo
  cannot be swapped onto a clip without changing its proof — but no money moves.
- **Devnet, service level 1.** Real-time (level 12) is mainnet-only and untested.
- **Proofs will expire.** `/scores/historical` serves a 2-week-to-6-hour window;
  re-running `precompute --prove` later may fail as fixtures age out.
- **Broadcast footage is rights-encumbered.** Normal for a hackathon demo; the first
  question a real sponsor conversation asks.

---

## Layout

```
src/txline/      capture parsing, corpus loading
src/timeline/    the queryable model: events, VAR pairs, clock, score transitions
src/verify/      pure verifier — claims -> verdicts
src/score/       impact (market TVD) and controversy (VAR taxonomy)
src/chain/       validateStat, statKeys, network config
src/ocr/         vision-LLM reading of the broadcast bug
src/proof/       ProofCard + canonical hash
app/ components/ the PWA
scripts/         probes — each one found a real defect
docs/            feed analysis, spec, plans, design system
```

## Replay

```bash
npm run replay
curl -N 'http://localhost:8787/scores/18222446?speed=60'
```

Speaks TXLine's SSE protocol over the capture. The ingestor cannot tell the
difference — going live is a URL plus the auth flow.
