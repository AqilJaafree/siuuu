import type { RawOddsFrame } from '../txline/types.js'

/** Look-back before the window for the "before" price. */
const PRE_MS = 60_000
/** Look-forward after the window for the "after" price. */
const POST_MS = 120_000
/** TVD at which impact saturates. 0.5 = half the probability mass moved. */
const TVD_FULL = 0.5
/** Suspension seconds at which the suspension term saturates. */
const SUSP_FULL_SEC = 30

export interface ImpactResult {
  /** 0-100. */
  score: number
  /** Total variation distance on the 1X2 probability vector. Bounded [0,1]. */
  tvd: number
  /** Longest empty-Prices run in the window, seconds. */
  suspensionSec: number
  probsBefore: number[]
  probsAfter: number[]
  /** Human-readable arithmetic for the Proof Card. */
  evidence: string
}

/**
 * Prices are integers scaled x1000 and DEMARGINED, so 1000/price is a true
 * probability and a 1X2 triple sums to ~1.
 */
export function toProbabilities(prices: number[]): number[] {
  return prices.map((p) => 1000 / p)
}

/** 0.5 * sum|a - b|. Bounded [0,1] for probability vectors. */
export function totalVariation(a: number[], b: number[]): number {
  let sum = 0
  for (let i = 0; i < Math.min(a.length, b.length); i++) sum += Math.abs(a[i] - b[i])
  return 0.5 * sum
}

const clamp01 = (v: number) => Math.min(1, Math.max(0, v))

const EMPTY: ImpactResult = {
  score: 0, tvd: 0, suspensionSec: 0, probsBefore: [], probsAfter: [],
  evidence: 'no full-match 1X2 prices bracket this window',
}

/**
 * Market impact across a wall-clock window.
 *
 * Full-match, in-running 1X2 ONLY. `MarketPeriod` null = full match; "half=1" and
 * "et" stream concurrently and comparing across them is meaningless — it produced
 * a phantom 0.367 TVD on a window where the full-match market never moved.
 *
 * Pure. No I/O.
 */
export function impactScore(odds: RawOddsFrame[], tsStart: number, tsEnd: number): ImpactResult {
  const market = odds
    .filter(
      (o) =>
        o.SuperOddsType === '1X2_PARTICIPANT_RESULT' &&
        o.MarketPeriod === null &&
        o.InRunning === true &&
        o.Ts >= tsStart - PRE_MS &&
        o.Ts <= tsEnd + POST_MS,
    )
    .sort((a, b) => a.Ts - b.Ts)

  if (market.length === 0) return EMPTY

  // Longest run of consecutive suspended (empty Prices) messages.
  let suspensionMs = 0
  let runStart: number | null = null
  for (const o of market) {
    if (o.Prices.length === 0) {
      if (runStart === null) runStart = o.Ts
      suspensionMs = Math.max(suspensionMs, o.Ts - runStart)
    } else {
      runStart = null
    }
  }

  const priced = market.filter((o) => o.Prices.length === 3)
  const before = priced.filter((o) => o.Ts < tsStart).at(-1)
  const after = priced.find((o) => o.Ts > tsEnd)

  const suspensionSec = suspensionMs / 1000
  if (!before || !after) return { ...EMPTY, suspensionSec }

  const probsBefore = toProbabilities(before.Prices)
  const probsAfter = toProbabilities(after.Prices)
  const tvd = totalVariation(probsBefore, probsAfter)

  const score = Math.round(
    100 * (0.8 * clamp01(tvd / TVD_FULL) + 0.2 * clamp01(suspensionSec / SUSP_FULL_SEC)),
  )

  const fmt = (p: number[]) => `[${p.map((v) => v.toFixed(2)).join(',')}]`

  return {
    score,
    tvd,
    suspensionSec,
    probsBefore,
    probsAfter,
    evidence: `1X2 ${fmt(probsBefore)} -> ${fmt(probsAfter)}  TVD ${tvd.toFixed(3)}  suspended ${suspensionSec.toFixed(0)}s`,
  }
}
