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
