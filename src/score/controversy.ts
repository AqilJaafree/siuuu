import type { MatchedEvent } from '../verify/types.js'

/**
 * Controversy score, 0-100. Deterministic lookup over the event taxonomy — not a
 * model, not a guess. Read from an enum the feed publishes.
 *
 * Separate from impact ON PURPOSE. The France-Spain VAR overturn is impact 1,
 * controversy 90: the market ignored it and the internet did not.
 */
const VAR_OVERTURNED: Record<string, number> = {
  MistakenIdentity: 100, // the referee carded the wrong player
  Goal: 90,
  Penalty: 85,
}

/** Any Overturned review we don't have a mapping for. The enum sample is small. */
const UNKNOWN_OVERTURNED = 75
const VAR_STANDS = 40

const ACTION_SCORES: Record<string, number> = {
  red_card: 70,
  score_adjustment: 60,
  yellow_card: 20,
  goal: 10,
}

function scoreOne(e: MatchedEvent): number {
  if (e.varOutcome === 'Overturned') {
    // NOT `(e.varType && VAR_OVERTURNED[e.varType]) ?? UNKNOWN_OVERTURNED`: that
    // widens to `number | ""` and `??` would return the empty string rather than
    // falling back. Ternary keeps the fallback total over every falsy varType.
    return (e.varType ? VAR_OVERTURNED[e.varType] : undefined) ?? UNKNOWN_OVERTURNED
  }
  if (e.varOutcome === 'Stands') return VAR_STANDS
  return ACTION_SCORES[e.action] ?? 0
}

export function controversyScore(matched: MatchedEvent[]): number {
  let max = 0
  for (const e of matched) max = Math.max(max, scoreOne(e))
  return max
}

/**
 * Names the event the controversy score was actually read from — `var(MistakenIdentity)
 * + Overturned`, `red_card`, and so on.
 *
 * Lives here, next to `scoreOne`, deliberately: it reads the SAME tables the score
 * reads, so the sentence under the number cannot drift from the number. A score
 * without its evidence is just an opinion (design-guidelines §3), and a UI-side
 * reimplementation of this lookup would be an opinion with extra steps.
 *
 * Returns null when nothing backs the score — the honest answer for a REJECTED
 * card with no matched events. The caller must not invent a sentence for it.
 */
export function controversyEvidence(matched: MatchedEvent[]): string | null {
  let best: MatchedEvent | null = null
  let max = -1
  for (const e of matched) {
    const s = scoreOne(e)
    if (s > max) {
      max = s
      best = e
    }
  }
  if (!best || max <= 0) return null
  if (best.varOutcome) {
    return `var(${best.varType ?? 'unknown'}) + ${best.varOutcome}`
  }
  return `${best.action} · Seq ${best.seq}`
}

/** Score for a goal withdrawn with no VAR behind it. Weaker than a VAR overturn. */
export const GOAL_WITHDRAWN_SCORE = 50
