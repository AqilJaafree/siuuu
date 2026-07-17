# SIUUU Chain Layer — Implementation Plan (Plan 2 of 4)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Prove SIUUU's claims against TxODDS's on-chain Merkle roots via `validateStat`, anchor the ProofCard, and pay clippers from a SOL escrow — turning a verified claim into money and a trustless proof.

**Architecture:** Plan 1's pure verifier already produces a ProofCard with a `seqRange`. That `seq` is the join to `validateStat`, which proves the underlying stat against `daily_scores_roots` with no intermediary. Two tiers, honestly separated: stat facts are *proven*; the VAR narrative is *attested*.

**Tech Stack:** TypeScript · `@coral-xyz/anchor` · `@solana/web3.js` · Anchor (Rust) for the escrow · Irys for blobs

**Depends on:** Plan 1 (complete — 124 tests, `main`)
**Reference:** [`../../txline-worldcup-hackathon-SKILL.md`](../../txline-worldcup-hackathon-SKILL.md) — **read §7 and §8 before Task 3.**
**Deadline:** 19 July (the final). Scope is cut accordingly.

---

## The decision that reshapes this plan

Plan 1's spec listed "TXLine Validation Proofs endpoint" as an open question "worth
an email to TxODDS." It is not an open question. It is documented, and the
hackathon brief says this about ignoring it:

> *"Skipping on-chain validation entirely — if you only hit REST, you've built a
> generic sports app on any-chain infra and thrown away the Solana-native score.
> Judges will notice."*

The original Plan 2 anchored a sha256 of **our own read of the feed**. That proves
only that *we* said something. `validateStat` proves the stat itself against roots
TxODDS already published on Solana.

**So the anchor is no longer the headline — the proof is.**

### Two tiers, stated plainly

There is **no `statKey` for a VAR decision**. The Merkle tree covers goals, cards,
corners, and the scoreline. SIUUU's controversy thesis lives in `var`/`var_end`,
which it does not cover.

| Tier | What | Trust rests on |
|---|---|---|
| **1 — Merkle-proven** | The stat the claim rests on: a red card exists at `seq` N; the score was 1–0 | **Mathematics.** No intermediary. |
| **2 — Feed-attested** | The VAR narrative: `Data.Type: MistakenIdentity`, `Data.Outcome: Overturned` | **TxODDS's operator.** Anchored as a content hash. |

**Blurring these would be the exact false statement this product exists to
refuse.** The Proof Card must render them as visibly different things. A product
whose entire pitch is "we don't overclaim" cannot overclaim about its own proof.

Stating the limit plainly is also the stronger pitch: *"the red card is proven on
Solana; the VAR reason is TxODDS's word, and here is the exact frame they said
it in."* That is a more credible sentence than pretending the whole thing is
trustless.

---

## Scope

### In

- `validateStat` client: ProofCard → stat proof → on-chain `.view()` verification
- Claim → `statKey` mapping (the join Plan 1 left open)
- ProofCard v2: carries the validation result and the two-tier distinction
- Devnet anchor of the ProofCard hash
- SOL escrow: campaign PDA, fund, release, close
- Mainnet service level 12 path (see below)

### Out (later plans)

OCR (Plan 3) · Irys blob upload (Plan 3 — it belongs with video) · PWA (Plan 4) ·
watermark burn (Plan 3)

### YAGNI'd

Odds validation via `daily_batch_roots` (impact scoring is a ranking signal, not a
claim — it does not need proof). Fixtures validation. Two-stat validation
(`statKey2`) — no SIUUU claim needs a differential. Paid tiers.

---

## Network decision: devnet to build, mainnet to demo

Plan 1's spec said devnet throughout. The skill corrects this:

| Level | Bundle | Delay | Network |
|---|---|---|---|
| 1 | World Cup | **60s** | mainnet + devnet |
| **12** | World Cup | **real-time** | **mainnet only** |

**Free real-time World Cup data is mainnet service level 12.** Devnet only offers
level 1 (60s delayed). For the final on 19 July, a 60s delay means the demo is
always a minute behind the room — which is exactly the moment that matters.

**So: build and test the escrow on devnet; run `validateStat` and the live feed on
mainnet level 12 for the demo.** The escrow is play money either way; the *proof*
is the thing that must be real, and the free tier makes mainnet proof free.

> **Critical (skill §13.1):** RPC, program ID, guest JWT, and activation endpoint
> must ALL be on one network. A devnet subscribe activated against the mainnet host
> fails. If the escrow is devnet and validation is mainnet, they are two separate
> clients with two separate configs. **Do not share a connection object.**

---

## File Structure

```
src/chain/config.ts          network config, program ids, PDAs — ONE per network
src/chain/auth.ts            guest JWT -> subscribe -> sign -> activate
src/chain/client.ts          authenticated HTTP client (both headers)
src/chain/statkey.ts         ClaimKind + timeline -> statKey   [pure]
src/chain/validate.ts        stat-validation fetch + validateStat .view()
src/chain/anchor-proof.ts    ProofCard hash -> devnet tx
src/proof/card.ts            EXTEND: ProofCard v2 with validation + tier
programs/siuuu-escrow/       Anchor program: campaign PDA, fund, release, close
src/chain/escrow-client.ts   TS client for the escrow
tests/chain/statkey.test.ts  pure, corpus-backed
tests/chain/validate.test.ts network-gated integration
```

**`statkey.ts` is pure and corpus-testable** — same discipline as Plan 1. The
network-touching parts are thin wrappers around it.

---

## Task 1: Network config

**Files:** Create `src/chain/config.ts`, `tests/chain/config.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from 'vitest'
import { CONFIG, pdas } from '../../src/chain/config.js'

describe('CONFIG', () => {
  it('never mixes networks — every field agrees', () => {
    expect(CONFIG.mainnet.apiOrigin).toContain('txline.txodds.com')
    expect(CONFIG.mainnet.apiOrigin).not.toContain('dev')
    expect(CONFIG.devnet.apiOrigin).toContain('txline-dev')
    expect(CONFIG.mainnet.rpcUrl).toContain('mainnet-beta')
    expect(CONFIG.devnet.rpcUrl).toContain('devnet')
  })

  it('carries the documented program ids', () => {
    expect(CONFIG.mainnet.programId).toBe('9ExbZjAapQww1vfcisDmrngPinHTEfpjYRWMunJgcKaA')
    expect(CONFIG.devnet.programId).toBe('6pW64gN1s2uqjHkn1unFeEjAwJkPGHoppGvS715wyP2J')
  })

  it('derives the daily scores root PDA from an epoch day', () => {
    // 2026-07-14, the France-Spain semi-final
    const epochDay = Math.floor(Date.UTC(2026, 6, 14) / 86_400_000)
    const pda = pdas('devnet').dailyScoresRoots(epochDay)
    expect(pda.toBase58()).toMatch(/^[1-9A-HJ-NP-Za-km-z]{32,44}$/)
  })

  it('derives the same PDA for the same day, a different one for another', () => {
    const p = pdas('devnet')
    expect(p.dailyScoresRoots(20649).toBase58()).toBe(p.dailyScoresRoots(20649).toBase58())
    expect(p.dailyScoresRoots(20649).toBase58()).not.toBe(p.dailyScoresRoots(20650).toBase58())
  })
})
```

- [ ] **Step 2: Run it, confirm it fails**

Run: `npx vitest run tests/chain/config.test.ts` → FAIL, cannot resolve `config.js`

- [ ] **Step 3: Implement**

```ts
import { PublicKey } from '@solana/web3.js'
// NOT `import { BN } from '@coral-xyz/anchor'` — that is what the docs show and it
// throws "does not provide an export named 'BN'" under ESM. Destructuring the
// namespace (`const { BN } = anchor`) then fails with "BN is not a constructor".
import BN from 'bn.js'

export type Network = 'mainnet' | 'devnet'

/**
 * ONE network, everywhere. RPC, program id, guest JWT and activation host must all
 * agree — a devnet subscribe activated against the mainnet host fails (skill §13.1).
 *
 * Free real-time World Cup data is MAINNET service level 12. Devnet only has level
 * 1 (60s delayed). Build the escrow on devnet; prove on mainnet.
 */
export const CONFIG = {
  mainnet: {
    rpcUrl: 'https://api.mainnet-beta.solana.com',
    apiOrigin: 'https://txline.txodds.com',
    programId: '9ExbZjAapQww1vfcisDmrngPinHTEfpjYRWMunJgcKaA',
    txlTokenMint: 'Zhw9TVKp68a1QrftncMSd6ELXKDtpVMNuMGr1jNwdeL',
    /** 12 = real-time. Mainnet only. */
    serviceLevelId: 12,
  },
  devnet: {
    rpcUrl: 'https://api.devnet.solana.com',
    apiOrigin: 'https://txline-dev.txodds.com',
    programId: '6pW64gN1s2uqjHkn1unFeEjAwJkPGHoppGvS715wyP2J',
    txlTokenMint: '4Zao8ocPhmMgq7PdsYWyxvqySMGx7xb9cMftPMkEokRG',
    /** 1 = 60s delay. The only level devnet documents. */
    serviceLevelId: 1,
  },
} as const

export const apiBase = (n: Network) => `${CONFIG[n].apiOrigin}/api`

export function pdas(network: Network) {
  const programId = new PublicKey(CONFIG[network].programId)
  const seed = (s: string) => Buffer.from(s)
  const le2 = (n: number) => new BN(n).toArrayLike(Buffer, 'le', 2)

  return {
    programId,
    tokenTreasury: () => PublicKey.findProgramAddressSync([seed('token_treasury_v2')], programId)[0],
    pricingMatrix: () => PublicKey.findProgramAddressSync([seed('pricing_matrix')], programId)[0],
    /** Validate SCORES against this. The one SIUUU needs. */
    dailyScoresRoots: (epochDay: number) =>
      PublicKey.findProgramAddressSync([seed('daily_scores_roots'), le2(epochDay)], programId)[0],
    /** Validate ODDS. Not used — impact is a ranking signal, not a claim. */
    dailyBatchRoots: (epochDay: number) =>
      PublicKey.findProgramAddressSync([seed('daily_batch_roots'), le2(epochDay)], programId)[0],
    /** Fixtures roots bucket per TEN days, not one. */
    tenDailyFixturesRoots: (epochDay: number) =>
      PublicKey.findProgramAddressSync(
        [seed('ten_daily_fixtures_roots'), le2(Math.floor(epochDay / 10) * 10)],
        programId,
      )[0],
  }
}

/** epochDay for a stat's timestamp. Note: ms -> days, NOT seconds. */
export const epochDayOf = (tsMs: number) => Math.floor(tsMs / 86_400_000)
```

- [ ] **Step 4: Run it, confirm pass.** `npx vitest run tests/chain/config.test.ts`

- [ ] **Step 5: Commit**

```bash
git add src/chain/config.ts tests/chain/config.test.ts
git commit -m "feat(chain): network config and TxLINE PDAs"
```

---

## Task 2: Claim → statKey

**Files:** Create `src/chain/statkey.ts`, `tests/chain/statkey.test.ts`

**This task was rewritten after `scripts/probe-stat-validation.ts` ran against the
live devnet feed. The original version used the documented period multipliers and
would have produced `value: 0` for every claim.**

### What the probe found

The docs (skill §8) say `statKey = period * 1000 + base`, H2 → `+2000`. So the
mistaken-identity red card (18222446, seq 687, P2, StatusId 4 = H2) should be
`2006`. The live endpoint disagrees:

```
statKey    6 -> value 1   <-- proves the red card
statKey 2006 -> value 0   <-- what the docs imply. Empty.
statKey 3006 -> value 1   <-- where it actually lives
statKey 4006 -> value 0
statKey    5 -> value 0   (P1 reds — correctly zero)
```

Empirically the live prefix is H1 → 1 *and* 2, H2 → **3**, ET1 → **4**, ET2 → **5**.
The documented mapping is off by one from reality, and prefixes 1/2 both move during
H1 (mirroring the `Score` object's `H1`/`HT` cumulative keys).

### The design consequence: use the TOTALS

**`statKey 6` — the un-prefixed total — proves the red card exactly as well as
`3006`, and sidesteps the broken period encoding entirely.** Totals are 1–8, are
unambiguous, and do not depend on decoding a scheme whose documentation is wrong.

This costs nothing, because **`validateStat` takes a `seq`** — it proves the total
*as of that sequence number*. "P2's red-card total was 1 as of seq 687" is exactly
the fact a red-card claim needs, and the ProofCard already carries `seqRange` from
Plan 1.

> **Optional hardening, if time allows:** prove the *transition*. `key 6 = 0` at
> seq 686 and `= 1` at seq 687 pins the card to that seq rather than merely "by"
> it. Two proofs instead of one. Not needed for the demo; note it and move on.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from 'vitest'
import { statKeyFor, PROVABLE_CLAIMS } from '../../src/chain/statkey.js'

describe('statKeyFor — totals, not period-prefixed', () => {
  it('red card, participant 2 -> 6 (verified against the live endpoint)', () => {
    expect(statKeyFor('red_card', 2)).toBe(6)
  })

  it('red card, participant 1 -> 5', () => {
    expect(statKeyFor('red_card', 1)).toBe(5)
  })

  it('goal -> 1 / 2', () => {
    expect(statKeyFor('goal', 1)).toBe(1)
    expect(statKeyFor('goal', 2)).toBe(2)
  })

  it('yellow card -> 3 / 4', () => {
    expect(statKeyFor('yellow_card', 1)).toBe(3)
    expect(statKeyFor('yellow_card', 2)).toBe(4)
  })

  it('never returns a period-prefixed key', () => {
    // 2006 is what the docs imply and the live endpoint reports it EMPTY.
    // If this ever returns > 8, the period encoding has crept back in.
    for (const kind of ['goal', 'yellow_card', 'red_card'] as const) {
      for (const p of [1, 2] as const) {
        expect(statKeyFor(kind, p)!).toBeLessThanOrEqual(8)
      }
    }
  })

  it('returns null for claims with no Merkle-backed stat', () => {
    // The point of this module. There is no statKey for a VAR decision.
    expect(statKeyFor('var_overturned_goal', 1)).toBeNull()
    expect(statKeyFor('mistaken_identity', 1)).toBeNull()
    expect(statKeyFor('var_stands', 1)).toBeNull()
    expect(statKeyFor('goal_withdrawn', 1)).toBeNull()
  })
})

describe('PROVABLE_CLAIMS', () => {
  it('names exactly the claims a Merkle proof can back', () => {
    expect([...PROVABLE_CLAIMS].sort()).toEqual(['goal', 'red_card', 'yellow_card'])
  })
})
```

- [ ] **Step 2: Run it, confirm it fails.**

- [ ] **Step 3: Implement**

```ts
import type { ClaimKind } from '../verify/types.js'

/**
 * Un-prefixed TOTAL stat keys. Verified against the live devnet endpoint.
 *
 * Do NOT reintroduce period prefixes. The docs say `period * 1000 + base` with
 * H2 -> +2000, which would make a P2 second-half red card 2006. The live endpoint
 * reports 2006 EMPTY and the card at 3006 — the documented mapping is off by one
 * from reality (measured: H1 -> 1 and 2, H2 -> 3, ET1 -> 4, ET2 -> 5).
 *
 * Totals sidestep the whole broken scheme and cost nothing: validateStat proves
 * the total AS OF a given `seq`, which is exactly the fact a claim needs.
 */
const TOTAL_KEYS: Record<string, [p1: number, p2: number]> = {
  goal: [1, 2],
  yellow_card: [3, 4],
  red_card: [5, 6],
  // corners are 7/8 — no SIUUU claim needs them
}

/**
 * Claims a Merkle proof can back.
 *
 * There is NO statKey for a VAR decision, so `var_overturned_goal`,
 * `mistaken_identity`, `var_stands` and `goal_withdrawn` are feed-attested only.
 * That is a weaker guarantee and must never be rendered as if it were a proof.
 */
export const PROVABLE_CLAIMS: ReadonlySet<string> = new Set(['goal', 'red_card', 'yellow_card'])

/**
 * (claim, participant) -> statKey, or null when no Merkle-backed stat exists.
 *
 * Null is not a failure — it is the honest answer for a VAR claim. The caller must
 * surface it as FEED_ATTESTED rather than silently downgrading to unproven.
 */
export function statKeyFor(kind: ClaimKind | string, participant: 1 | 2): number | null {
  const keys = TOTAL_KEYS[kind]
  return keys ? keys[participant - 1] : null
}
```

- [ ] **Step 4: Run it, confirm pass.**

- [ ] **Step 5: Cross-check against the live endpoint**

`scripts/probe-stat-validation.ts` already does this. Run it and confirm `statKey 6`
still returns `value 1` for 18222446 / seq 687:

```bash
npx tsx scripts/probe-stat-validation.ts
```

**If the sweep ever shows a different key carrying the card, the mapping changed —
stop and re-derive rather than adjusting the test.**

- [ ] **Step 6: Commit**

```bash
git add src/chain/statkey.ts tests/chain/statkey.test.ts
git commit -m "feat(chain): map claims to Merkle-backed total statKeys"
```

---

## Task 3: `validateStat` client

**Files:** Create `src/chain/validate.ts`, `tests/chain/validate.test.ts`

**Read skill §7 in full before writing this — then note where it is wrong.**

`scripts/probe-stat-validation.ts` proved this flow end to end on devnet. Three
gaps between the docs and reality, all found by running it:

1. **The docs never create the TxL ATA.** `subscribe` fails `AccountNotInitialized`
   (3012) without it, before it looks at the service level. The free tier charges no
   TxL, but the account must exist. Use
   `createAssociatedTokenAccountIdempotentInstruction` with `TOKEN_2022_PROGRAM_ID`.
2. **The on-chain IDL declares no `returns` for `validate_stat`**, so Anchor's
   `.view()` rejects it — yet the docs' example calls `.view()` and reads a bool.
   The patched IDL is vendored at `idl/txoracle-devnet.json` with `returns: 'bool'`
   added. Do not re-fetch it with `anchor idl fetch` and expect `.view()` to work.
3. **`toBytes32` must accept byte ARRAYS** — proof hashes do not arrive as strings.

Also: the response's `period` field echoes **StatusId**, not the key's period. It
read `4` for every key in the sweep. Do not use it to derive a statKey.

- [ ] **Step 1: Write the test (network-gated)**

```ts
import { describe, it, expect } from 'vitest'
import { toBytes32, toProofNodes, shapeValidation } from '../../src/chain/validate.js'

describe('toBytes32', () => {
  it('accepts base64, hex, and byte arrays', () => {
    expect(toBytes32(Buffer.alloc(32).toString('base64'))).toHaveLength(32)
    expect(toBytes32('0x' + '00'.repeat(32))).toHaveLength(32)
    expect(toBytes32(new Uint8Array(32))).toHaveLength(32)
  })

  it('rejects the wrong length loudly rather than truncating', () => {
    expect(() => toBytes32(Buffer.alloc(16).toString('base64'))).toThrow(/32 bytes/)
  })
})

describe('toProofNodes', () => {
  it('preserves sibling orientation', () => {
    const nodes = toProofNodes([{ hash: Buffer.alloc(32).toString('base64'), isRightSibling: true }])
    expect(nodes[0].isRightSibling).toBe(true)
    expect(nodes[0].hash).toHaveLength(32)
  })
})

describe('shapeValidation', () => {
  it('shapes an API response into program args', () => {
    const shaped = shapeValidation({
      summary: {
        fixtureId: 18222446,
        updateStats: { updateCount: 3, minTimestamp: 1783823571727, maxTimestamp: 1783823571727 },
        eventStatsSubTreeRoot: Buffer.alloc(32).toString('base64'),
      },
      subTreeProof: [], mainTreeProof: [], statProof: [],
      statToProve: { key: 2006, value: 1 },
      eventStatRoot: Buffer.alloc(32).toString('base64'),
    })
    expect(shaped.fixtureSummary.fixtureId.toString()).toBe('18222446')
    expect(shaped.stat1.eventStatRoot).toHaveLength(32)
  })
})

// Integration — needs credentials. Skipped unless SIUUU_API_TOKEN is set.
describe.skipIf(!process.env.SIUUU_API_TOKEN)('validateStat (live)', () => {
  it('proves the red card in 18222446 on-chain', async () => {
    const { validateStatOnChain } = await import('../../src/chain/validate.js')
    const ok = await validateStatOnChain({
      network: 'mainnet', fixtureId: 18222446, seq: 687, statKey: 2006,
      predicate: { threshold: 0, comparison: 'greaterThan' },
    })
    expect(ok).toBe(true)
  })
})
```

- [ ] **Step 2: Run it, confirm the pure tests fail.**

- [ ] **Step 3: Implement**

```ts
import * as anchor from '@coral-xyz/anchor'
import { BN } from '@coral-xyz/anchor'
import { ComputeBudgetProgram } from '@solana/web3.js'
import { pdas, epochDayOf, type Network } from './config.js'

export function toBytes32(value: string | number[] | Uint8Array): number[] {
  const bytes = Array.isArray(value)
    ? Uint8Array.from(value)
    : value instanceof Uint8Array
      ? value
      : value.startsWith('0x')
        ? Buffer.from(value.slice(2), 'hex')
        : Buffer.from(value, 'base64')
  if (bytes.length !== 32) throw new Error(`Expected 32 bytes, received ${bytes.length}`)
  return Array.from(bytes)
}

export interface RawProofNode { hash: string | number[] | Uint8Array; isRightSibling: boolean }

export function toProofNodes(nodes: RawProofNode[]) {
  return nodes.map((n) => ({ hash: toBytes32(n.hash), isRightSibling: n.isRightSibling }))
}

/** Shape the API's validation response into the program's arg types. */
export function shapeValidation(v: any) {
  return {
    fixtureSummary: {
      fixtureId: new BN(v.summary.fixtureId),
      updateStats: {
        updateCount: v.summary.updateStats.updateCount,
        minTimestamp: new BN(v.summary.updateStats.minTimestamp),
        maxTimestamp: new BN(v.summary.updateStats.maxTimestamp),
      },
      eventsSubTreeRoot: toBytes32(v.summary.eventStatsSubTreeRoot),
    },
    fixtureProof: toProofNodes(v.subTreeProof),
    mainTreeProof: toProofNodes(v.mainTreeProof),
    stat1: {
      statToProve: v.statToProve,
      eventStatRoot: toBytes32(v.eventStatRoot),
      statProof: toProofNodes(v.statProof),
    },
    minTimestamp: v.summary.updateStats.minTimestamp as number,
  }
}

export interface ValidateArgs {
  network: Network
  fixtureId: number
  seq: number
  statKey: number
  predicate: { threshold: number; comparison: 'greaterThan' | 'lessThan' | 'equalTo' }
}

/**
 * Prove a stat against `daily_scores_roots` on-chain. Read-only via `.view()`.
 *
 * Needs a raised compute budget — 1_400_000. Without it the simulation runs out and
 * fails in a way that looks like an invalid proof (skill §13.5).
 */
export async function validateStatOnChain(
  args: ValidateArgs,
  deps: { program: anchor.Program; fetchValidation: (a: ValidateArgs) => Promise<any> },
): Promise<boolean> {
  const v = await deps.fetchValidation(args)
  const shaped = shapeValidation(v)
  const dailyScoresPda = pdas(args.network).dailyScoresRoots(epochDayOf(shaped.minTimestamp))

  return deps.program.methods
    .validateStat(
      new BN(shaped.minTimestamp),
      shaped.fixtureSummary,
      shaped.fixtureProof,
      shaped.mainTreeProof,
      { threshold: args.predicate.threshold, comparison: { [args.predicate.comparison]: {} } },
      shaped.stat1,
      null,
      null,
    )
    .accounts({ dailyScoresMerkleRoots: dailyScoresPda })
    .preInstructions([ComputeBudgetProgram.setComputeUnitLimit({ units: 1_400_000 })])
    .view()
}
```

- [ ] **Step 4: Run the pure tests, confirm pass.**

- [ ] **Step 5: Commit**

```bash
git add src/chain/validate.ts tests/chain/validate.test.ts
git commit -m "feat(chain): validateStat client with Merkle proof shaping"
```

---

## Task 4: ProofCard v2 — two tiers, visibly separate

**Files:** Modify `src/proof/card.ts`, `tests/proof/card.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from 'vitest'
import { buildProofCard, proofHash } from '../../src/proof/card.js'

describe('ProofCard v2 — proof tier', () => {
  const base = {
    fixtureId: 18222446, clockStart: 4260, clockEnd: 4290,
    contentHash: 'a'.repeat(64), impact: 22, controversy: 100,
    result: { status: 'VERIFIED' as const, reason: 'ok', matchedEvents: [], seqRange: [687, 687] as [number, number] },
  }

  it('marks a Merkle-proven claim as PROVEN and records the statKey', () => {
    const c = buildProofCard({ ...base, claimKind: 'red_card',
      validation: { tier: 'MERKLE_PROVEN', statKey: 2006, seq: 687, network: 'mainnet' } })
    expect(c.validation.tier).toBe('MERKLE_PROVEN')
    expect(c.validation.statKey).toBe(2006)
  })

  it('marks a VAR claim as FEED_ATTESTED with no statKey', () => {
    // There is no Merkle-backed stat for a VAR decision. Saying otherwise would be
    // the exact overclaim this product refuses.
    const c = buildProofCard({ ...base, claimKind: 'mistaken_identity',
      validation: { tier: 'FEED_ATTESTED', statKey: null, seq: 681, network: 'mainnet' } })
    expect(c.validation.tier).toBe('FEED_ATTESTED')
    expect(c.validation.statKey).toBeNull()
  })

  it('the tier changes the hash — a card cannot be silently upgraded', () => {
    const proven = buildProofCard({ ...base, claimKind: 'red_card',
      validation: { tier: 'MERKLE_PROVEN', statKey: 2006, seq: 687, network: 'mainnet' } })
    const attested = buildProofCard({ ...base, claimKind: 'red_card',
      validation: { tier: 'FEED_ATTESTED', statKey: 2006, seq: 687, network: 'mainnet' } })
    expect(proofHash(proven)).not.toBe(proofHash(attested))
  })
})
```

- [ ] **Step 2: Run it, confirm it fails.**

- [ ] **Step 3: Extend `src/proof/card.ts`**

```ts
/**
 * How much a claim is actually worth.
 *
 * MERKLE_PROVEN — the stat is proven against daily_scores_roots on-chain, no
 *   intermediary. Trust rests on mathematics.
 * FEED_ATTESTED — TxODDS's operator said it and we anchored a hash of them saying
 *   it. There is no statKey for a VAR decision, so every VAR claim lands here.
 *   Trust rests on the operator.
 *
 * These are NOT interchangeable, and the Proof Card must render them as visibly
 * different things. A product whose pitch is "we don't overclaim" cannot overclaim
 * about its own proof.
 */
export type ProofTier = 'MERKLE_PROVEN' | 'FEED_ATTESTED'

export interface Validation {
  tier: ProofTier
  /** null for every feed-attested claim. Not a failure — the honest answer. */
  statKey: number | null
  seq: number
  network: 'mainnet' | 'devnet'
  /** Set once validateStat has actually returned true. */
  verifiedOnChain?: boolean
  /** The daily_scores_roots PDA the proof was checked against. */
  rootsPda?: string
}

export interface ProofCard {
  // ... existing fields ...
  validation: Validation
}
```

Add `validation` to `BuildProofCardInput` and thread it through `buildProofCard`.
It is inside the canonical serialisation, so the tier is bound into the hash.

- [ ] **Step 4: Run it, confirm pass. All 124 existing tests must still pass.**

- [ ] **Step 5: Commit**

```bash
git add src/proof/card.ts tests/proof/card.test.ts
git commit -m "feat(proof): ProofCard v2 records proof tier and statKey"
```

---

## Task 5: The escrow program (Anchor, SOL)

**Files:** Create `programs/siuuu-escrow/src/lib.rs`, `tests/escrow.ts`

Native SOL — lamports in a PDA. No mint, no ATAs, no token program. Fastest to
build and hardest to break on stage.

- [ ] **Step 1: Write the program**

```rust
use anchor_lang::prelude::*;

declare_id!("SiuuuEscrow11111111111111111111111111111111");

#[program]
pub mod siuuu_escrow {
    use super::*;

    /// Fund a campaign. Lamports live in the PDA itself.
    pub fn create_campaign(
        ctx: Context<CreateCampaign>,
        campaign_id: u64,
        bounty_lamports: u64,
        budget_lamports: u64,
        min_impact: u8,
        min_controversy: u8,
    ) -> Result<()> {
        require!(bounty_lamports > 0, EscrowError::ZeroBounty);
        require!(budget_lamports >= bounty_lamports, EscrowError::BudgetBelowBounty);
        require!(min_impact <= 100 && min_controversy <= 100, EscrowError::ScoreOutOfRange);

        let c = &mut ctx.accounts.campaign;
        c.sponsor = ctx.accounts.sponsor.key();
        c.campaign_id = campaign_id;
        c.bounty_lamports = bounty_lamports;
        c.remaining_lamports = budget_lamports;
        c.min_impact = min_impact;
        c.min_controversy = min_controversy;
        c.active = true;
        c.bump = ctx.bumps.campaign;

        anchor_lang::system_program::transfer(
            CpiContext::new(
                ctx.accounts.system_program.to_account_info(),
                anchor_lang::system_program::Transfer {
                    from: ctx.accounts.sponsor.to_account_info(),
                    to: c.to_account_info(),
                },
            ),
            budget_lamports,
        )
    }

    /// Release one bounty to a clipper.
    ///
    /// The scores are asserted by the caller, NOT computed here — a Solana program
    /// cannot recompute a market TVD or read the TXLine feed. The trust boundary is
    /// therefore off-chain, and pretending otherwise would be dishonest. The proof
    /// hash is recorded so any release can be audited against the ProofCard that
    /// justified it.
    pub fn release(ctx: Context<Release>, impact: u8, controversy: u8, proof_hash: [u8; 32]) -> Result<()> {
        let c = &mut ctx.accounts.campaign;
        require!(c.active, EscrowError::CampaignInactive);
        require!(impact >= c.min_impact, EscrowError::ImpactBelowMinimum);
        require!(controversy >= c.min_controversy, EscrowError::ControversyBelowMinimum);
        require!(c.remaining_lamports >= c.bounty_lamports, EscrowError::BudgetExhausted);

        let bounty = c.bounty_lamports;
        **c.to_account_info().try_borrow_mut_lamports()? -= bounty;
        **ctx.accounts.clipper.try_borrow_mut_lamports()? += bounty;
        c.remaining_lamports -= bounty;

        emit!(BountyReleased {
            campaign: c.key(), clipper: ctx.accounts.clipper.key(),
            lamports: bounty, impact, controversy, proof_hash,
        });
        Ok(())
    }

    /// Close a campaign and refund the remainder to the sponsor.
    pub fn close_campaign(ctx: Context<CloseCampaign>) -> Result<()> {
        ctx.accounts.campaign.active = false;
        Ok(())
    }
}

#[account]
pub struct Campaign {
    pub sponsor: Pubkey,
    pub campaign_id: u64,
    pub bounty_lamports: u64,
    pub remaining_lamports: u64,
    pub min_impact: u8,
    pub min_controversy: u8,
    pub active: bool,
    pub bump: u8,
}
impl Campaign { pub const LEN: usize = 8 + 32 + 8 + 8 + 8 + 1 + 1 + 1 + 1; }

#[event]
pub struct BountyReleased {
    pub campaign: Pubkey,
    pub clipper: Pubkey,
    pub lamports: u64,
    pub impact: u8,
    pub controversy: u8,
    pub proof_hash: [u8; 32],
}

#[derive(Accounts)]
#[instruction(campaign_id: u64)]
pub struct CreateCampaign<'info> {
    #[account(mut)]
    pub sponsor: Signer<'info>,
    #[account(
        init, payer = sponsor, space = Campaign::LEN,
        seeds = [b"campaign", sponsor.key().as_ref(), &campaign_id.to_le_bytes()],
        bump
    )]
    pub campaign: Account<'info, Campaign>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct Release<'info> {
    /// Only the sponsor may release. A clipper must not be able to pay themselves.
    pub sponsor: Signer<'info>,
    #[account(
        mut, has_one = sponsor,
        seeds = [b"campaign", sponsor.key().as_ref(), &campaign.campaign_id.to_le_bytes()],
        bump = campaign.bump
    )]
    pub campaign: Account<'info, Campaign>,
    /// CHECK: recipient of lamports only
    #[account(mut)]
    pub clipper: AccountInfo<'info>,
}

#[derive(Accounts)]
pub struct CloseCampaign<'info> {
    pub sponsor: Signer<'info>,
    #[account(
        mut, has_one = sponsor, close = sponsor,
        seeds = [b"campaign", sponsor.key().as_ref(), &campaign.campaign_id.to_le_bytes()],
        bump = campaign.bump
    )]
    pub campaign: Account<'info, Campaign>,
}

#[error_code]
pub enum EscrowError {
    #[msg("Bounty must be greater than zero")] ZeroBounty,
    #[msg("Budget must cover at least one bounty")] BudgetBelowBounty,
    #[msg("Scores must be 0-100")] ScoreOutOfRange,
    #[msg("Campaign is not active")] CampaignInactive,
    #[msg("Impact below campaign minimum")] ImpactBelowMinimum,
    #[msg("Controversy below campaign minimum")] ControversyBelowMinimum,
    #[msg("Campaign budget exhausted")] BudgetExhausted,
}
```

- [ ] **Step 2: Write the tests**

Cover: fund → release → budget decrements; release below `min_impact` fails;
release below `min_controversy` fails; **a non-sponsor cannot release** (the
important one — a clipper paying themselves); budget exhaustion fails; close
refunds.

- [ ] **Step 3: `anchor test`, confirm green.**

- [ ] **Step 4: Commit**

```bash
git add programs/siuuu-escrow tests/escrow.ts
git commit -m "feat(escrow): SOL campaign PDA with fund, release, close"
```

---

## Task 6: CLI — prove a claim end to end

**Files:** Modify `src/cli/verify.ts`

- [ ] **Step 1: Add a `--prove` flag**

When set, and the claim is in `PROVABLE_CLAIMS`, derive the `statKey`, call
`validateStat`, and render the result:

```
  VERIFIED  red_card
  fixture 18222446 · clock 4265-4295s

  proof        MERKLE_PROVEN · statKey 2006 · Seq 687 · mainnet
               validated against daily_scores_roots — no intermediary
  sha256       7e6afb03…
```

And for a VAR claim, the honest version:

```
  VERIFIED  mistaken_identity
  proof        FEED_ATTESTED · no statKey exists for a VAR decision
               TxODDS attests this; the hash below anchors what they said
```

- [ ] **Step 2: Run both by hand, paste real output.**

- [ ] **Step 3: Commit**

---

## Self-Review

**Spec coverage:** §5 escrow → Task 5. §4 step 5 anchor → Task 4 + 6.
Open question #4 (validation proofs) → **resolved, Tasks 2–3**. Open question #5
(USDC vs SOL) → **resolved: SOL**.

**Known deviation from Plan 1's spec:** the spec said devnet throughout. Free
real-time World Cup data is mainnet level 12; devnet is 60s delayed. Escrow stays
devnet, validation moves to mainnet.

**The honest limit, restated:** SIUUU's headline claims — VAR overturns, mistaken
identity — are **not** Merkle-provable. Only the stat facts beneath them are. The
Proof Card must show both tiers as different things, and the pitch should say so
out loud. "The red card is proven on Solana; the VAR reason is TxODDS's word, and
here is the frame they said it in" is more credible than pretending otherwise.

---

## Open questions

1. **Does `stat-validation` cover the corpus fixtures?** `/scores/historical` only
   serves fixtures started between 2 weeks and 6 hours ago. If the proof endpoint
   has the same window, the QFs (9–12 July) expire mid-hackathon and the semi-finals
   follow. **Test this first — it could invalidate Task 3's demo.**
2. **Is `Seq` the right proof key?** The ProofCard's `seqRange` comes from our
   normalised timeline; `validateStat` wants the feed's `seq`. They should be the
   same number — verify on one real call before building on it.
3. **Penalty shootout is untested.** Neither ET fixture reached one, so `StatusId`
   11–13 and the `+5000` stat keys have never run. The final could go to penalties.
