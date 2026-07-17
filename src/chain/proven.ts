import type { Network } from './config.js'

/**
 * A proof that ACTUALLY RAN.
 *
 * One entry means: `validateStat` was called on `network` against `rootsPda` for this
 * claim's stat at this `seq`, and the program returned true. Nothing else earns an
 * entry. In particular, "a statKey exists for this claim kind" does NOT — that would
 * assert a proof that never happened, which is the worst bug this product can have.
 */
export interface ProvenStat {
  fixtureId: number
  clockStart: number
  clockEnd: number
  claimKind: string
  /** Un-prefixed TOTAL key (1-8). See statkey.ts for why totals, not period keys. */
  statKey: number
  /** The seq the proof was checked AT — the stat is proven as of this point in the feed. */
  seq: number
  /** The daily_scores_roots PDA the Merkle path terminated at. */
  rootsPda: string
  network: Network
  /** The value the feed had put in the tree. The predicate was `> 0`. */
  statValue: number
  /** When the proof ran. A proof is a historical fact; it has a date. */
  provenAt: string
}

/** Identity of a claim — the same four fields that identify a ProofCard. */
export interface ClaimIdentity {
  fixtureId: number
  clockStart: number
  clockEnd: number
  claimKind: string
}

/**
 * Find the proof for a claim, or null.
 *
 * Null is the default and the safe answer: no entry means no proof ran, which means
 * the card stays FEED_ATTESTED. There is deliberately no fallback that infers a
 * proof from anything else.
 */
export function lookupProven(entries: readonly ProvenStat[], claim: ClaimIdentity): ProvenStat | null {
  return (
    entries.find(
      (e) =>
        e.fixtureId === claim.fixtureId &&
        e.clockStart === claim.clockStart &&
        e.clockEnd === claim.clockEnd &&
        e.claimKind === claim.claimKind,
    ) ?? null
  )
}
