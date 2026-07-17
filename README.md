# siuuu-core

The SIUUU verification engine. Turns a claim about a World Cup moment into a
ProofCard backed by TXLine data.

## Quick start

    npm install
    npm test
    npm run verify -- --fixture 18222446 --clock 4260-4290 --claim mistaken_identity

## The corpus

Six real 2026 World Cup knockout matches in `exact-match-txline-raw/txline-raw/`
— the quarter-finals and semi-finals, i.e. Spain's and Argentina's road to the
final. See `docs/txline-feed-analysis.md`.

## Demo cases

| Command | Result |
|---|---|
| `--fixture 18222446 --clock 4260-4290 --claim mistaken_identity` | VERIFIED · impact 22 · controversy 100 — the referee carded the wrong player, VAR caught it, the right player went off |
| `--fixture 18237038 --clock 3625-3655 --claim var_overturned_goal` | VERIFIED · impact 1 · controversy 90 — a goal overturned in the semi-final France lost, and the market did not care |
| `--fixture 18209181 --clock 3550-3580 --claim goal` | VERIFIED · impact 56 · controversy 10 — a clean goal: the market moved, nobody argued |
| `--fixture 18209181 --clock 2910-2940 --claim var_overturned_goal` | **REJECTED** — a goal was withdrawn here, but no VAR backs it. The feed cannot say why, so neither do we |

That last row is the product.

## Design

Every verification and scoring function is **pure** — a function of an in-memory
timeline, no I/O. The trust argument is therefore testable offline against six
real matches, deterministically.

- `tests/verify/precision.test.ts` — the claim-precision tests. `action_discarded`
  on a goal is **not** a disallowed goal; two of the four in the corpus have no VAR
  behind them. Do not weaken these.
- `tests/score/impact.test.ts` — includes a control window that must score
  **exactly 0.000**. It catches two real bugs: log-ratio on raw odds exploding on
  longshots, and full-match vs first-half market mixing.

## Replay

    npm run replay
    curl -N 'http://localhost:8787/scores/18222446?speed=60'

Speaks TXLine's SSE protocol over the capture. The ingestor cannot tell the
difference — going live is a URL plus the auth flow.
