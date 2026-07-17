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

/** Score for a goal withdrawn with no VAR behind it. Weaker than a VAR overturn. */
export const GOAL_WITHDRAWN_SCORE = 50
