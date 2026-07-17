import type { VerifyStatus } from '../../src/verify/types.js'
import type { ProofTier } from '../../src/proof/card.js'

/** Seconds of match clock -> `mm:ss`. TXLine clocks are match seconds, not wall time. */
export function clock(seconds: number | null): string {
  if (seconds === null) return '--:--'
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

/** Spoken form for screen readers — `24:32` announced as "24 minutes 32 seconds". */
export function clockSpoken(seconds: number | null): string {
  if (seconds === null) return 'no clock'
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return `${m} minutes ${s} seconds`
}

/**
 * Status fill. Straight from design-guidelines §3 — REJECTED is flat grey on
 * purpose: rejection should feel like nothing happened, not like an alarm.
 */
export const STATUS_FILL: Record<VerifyStatus, string> = {
  VERIFIED: 'var(--verified)',
  OVERTURNED: 'var(--overturned)',
  REJECTED: 'var(--rejected)',
  UNVERIFIABLE: 'var(--sunk)',
}

/**
 * Statuses whose fill is neutral rather than chroma, and therefore flips with the
 * theme. They need the theme's ink for text; the chroma badges keep fixed dark text
 * because their fill is bright in both themes.
 */
const NEUTRAL_STATUS: ReadonlySet<VerifyStatus> = new Set<VerifyStatus>(['REJECTED', 'UNVERIFIABLE'])

/** Class list for a status pill. Always call this — never hand-roll the fill. */
export function pillClass(status: VerifyStatus): string {
  return NEUTRAL_STATUS.has(status) ? 'pill pill--neutral' : 'pill'
}

/** Truncate a hash in the middle. Mono, and the ends are what people compare. */
export function truncateMiddle(value: string, head = 8, tail = 8): string {
  if (value.length <= head + tail + 1) return value
  return `${value.slice(0, head)}…${value.slice(-tail)}`
}

export interface TierCopy {
  label: string
  /** One line stating exactly what trust rests on. Never blurs the two tiers. */
  rests: string
  fill: string
}

/**
 * The two tiers must render as visibly different things. A product whose pitch is
 * "we don't overclaim" cannot overclaim about its own proof.
 */
export const TIER_COPY: Record<ProofTier, TierCopy> = {
  MERKLE_PROVEN: {
    label: 'MERKLE PROVEN',
    rests: 'Proven against daily_scores_roots on Solana. No intermediary. Trust rests on mathematics.',
    fill: 'var(--verified)',
  },
  FEED_ATTESTED: {
    label: 'FEED ATTESTED',
    rests: "TxODDS's operator said it and we hashed them saying it. Trust rests on the operator.",
    fill: 'var(--pending)',
  },
}
