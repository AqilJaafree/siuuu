import { createHash } from 'node:crypto'
import type { MatchedEvent, VerifyResult, VerifyStatus, ClaimKind } from '../verify/types.js'

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
  /**
   * null for every feed-attested claim. Not a failure — the honest answer.
   *
   * Always an un-prefixed TOTAL key (1-8) from `src/chain/statkey.ts`. A key > 8
   * means the documented period encoding has crept back in; the live endpoint
   * reports those empty.
   */
  statKey: number | null
  seq: number
  network: 'mainnet' | 'devnet'
  /** Set once validateStat has actually returned true. */
  verifiedOnChain?: boolean
  /** The daily_scores_roots PDA the proof was checked against. */
  rootsPda?: string
}

export interface ProofCard {
  fixtureId: number
  clockStart: number
  clockEnd: number
  status: VerifyStatus
  claimKind: ClaimKind
  matchedEvents: MatchedEvent[]
  /** TXLine Seq bounds of the evidence. */
  seqRange: [number, number] | null
  /** sha256 of the clip bytes. Plan 3 supplies this; Plan 1 accepts any hex. */
  contentHash: string
  impact: number
  controversy: number
  reason: string
  /**
   * The sponsor riding on this claim, or null.
   *
   * INSIDE the canonical serialisation, and therefore inside the hash. This is the
   * product's core promise: the card commits to which sponsor rides on it, so a
   * sponsor swapped after the fact produces a different hash and the swap is
   * detectable. A sponsor outside the hash would be a logo anyone could move onto any
   * clip.
   *
   * Always null on a REJECTED card — `buildProofCard` enforces it.
   */
  sponsor: string | null
  /**
   * What the claim is actually backed by. Required, and inside the canonical
   * serialisation — the tier is bound into the hash, so a card cannot be silently
   * upgraded from attested to proven after the fact.
   */
  validation: Validation
}

/**
 * Deterministic JSON: keys sorted recursively. Same card -> same bytes -> same
 * hash, forever. Anything anchored on-chain must be reproducible by a third party.
 */
export function canonicalise(value: unknown): string {
  return JSON.stringify(sortKeys(value))
}

function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeys)
  if (value !== null && typeof value === 'object') {
    const src = value as Record<string, unknown>
    const out: Record<string, unknown> = {}
    for (const k of Object.keys(src).sort()) out[k] = sortKeys(src[k])
    return out
  }
  return value
}

/** sha256 of the canonical serialisation, lowercase hex. This is what gets anchored. */
export function proofHash(card: ProofCard): string {
  return createHash('sha256').update(canonicalise(card), 'utf8').digest('hex')
}

export interface BuildProofCardInput {
  fixtureId: number
  clockStart: number
  clockEnd: number
  claimKind: ClaimKind
  contentHash: string
  result: VerifyResult
  impact: number
  controversy: number
  /** Explicit and required. There is no default sponsor — null means none. */
  sponsor: string | null
  /** Explicit and required. There is no default tier — guessing one would overclaim. */
  validation: Validation
}

export function buildProofCard(input: BuildProofCardInput): ProofCard {
  return {
    fixtureId: input.fixtureId,
    clockStart: input.clockStart,
    clockEnd: input.clockEnd,
    status: input.result.status,
    claimKind: input.claimKind,
    matchedEvents: input.result.matchedEvents,
    seqRange: input.result.seqRange,
    contentHash: input.contentHash,
    impact: input.impact,
    controversy: input.controversy,
    reason: input.result.reason,
    // The thesis, enforced at the one place every card is built rather than left to
    // each caller to remember: a refused claim carries no sponsor. The clip still
    // posts — with the refusal attached — but no brand rides on a claim the feed does
    // not back. Dropped rather than thrown: rejection is a normal outcome of posting,
    // not a programming error.
    sponsor: input.result.status === 'REJECTED' ? null : input.sponsor,
    validation: input.validation,
  }
}
