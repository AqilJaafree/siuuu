import { createHash } from 'node:crypto'
import type { MatchedEvent, VerifyResult, VerifyStatus, ClaimKind } from '../verify/types.js'

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
  }
}
