import type { Timeline, EventState, VarDecision } from '../timeline/types.js'
import { allEvents } from '../timeline/events.js'
import { varDecisions } from '../timeline/var.js'
import { framesInClockWindow } from '../timeline/clock.js'
import type { Claim, VerifyResult, MatchedEvent, ClaimKind } from './types.js'

/**
 * A VAR review can precede its consequence (mistaken identity 4180 -> red card
 * 4280) or follow the event it kills (goal 3262 -> VAR 3315-3406). A 30s clip
 * holds neither end, so search both directions.
 *
 * Validated on all six fixtures: catches all three real VAR links, and excludes
 * the two goals with no VAR (nearest is 380s away). Do not widen past ~200s
 * without re-running tests/verify/precision.test.ts.
 */
const VAR_CONTEXT_SEC = 180

/** Tolerance for matching a discrete event's clock to the clip window. */
const EVENT_TOL_SEC = 30

function overlaps(aStart: number, aEnd: number, bStart: number, bEnd: number): boolean {
  return aEnd >= bStart && aStart <= bEnd
}

function varInContext(
  tl: Timeline,
  claim: Claim,
  predicate: (d: VarDecision) => boolean,
): VarDecision | null {
  const lo = claim.clockStart - VAR_CONTEXT_SEC
  const hi = claim.clockEnd + VAR_CONTEXT_SEC
  for (const d of varDecisions(tl)) {
    if (!predicate(d)) continue
    const s = d.clockStart ?? d.clockEnd
    const e = d.clockEnd ?? d.clockStart
    if (s === null || e === null) continue
    if (overlaps(s, e, lo, hi)) return d
  }
  return null
}

function varMatch(d: VarDecision): MatchedEvent {
  return {
    eventId: d.eventId,
    action: 'var_end',
    clock: d.clockStart,
    seq: d.seqStart,
    confirmed: true,
    varType: d.type,
    varOutcome: d.outcome,
  }
}

function eventMatch(e: EventState): MatchedEvent {
  return {
    eventId: e.eventId,
    action: e.actions[0],
    clock: e.clock,
    seq: e.frames[0].seq,
    confirmed: e.frames.some((f) => f.confirmed === true),
  }
}

/** Events whose clock sits within the clip window (± tolerance) carrying `action`. */
function eventsWithAction(tl: Timeline, claim: Claim, action: string): EventState[] {
  const lo = claim.clockStart - EVENT_TOL_SEC
  const hi = claim.clockEnd + EVENT_TOL_SEC
  return allEvents(tl).filter(
    (e) => e.actions.includes(action) && e.clock !== null && e.clock >= lo && e.clock <= hi,
  )
}

function ok(reason: string, matched: MatchedEvent[]): VerifyResult {
  const seqs = matched.map((m) => m.seq)
  return {
    status: 'VERIFIED',
    reason,
    matchedEvents: matched,
    seqRange: seqs.length ? [Math.min(...seqs), Math.max(...seqs)] : null,
  }
}

const no = (reason: string): VerifyResult =>
  ({ status: 'REJECTED', reason, matchedEvents: [], seqRange: null })

const overturned = (reason: string, matched: MatchedEvent[]): VerifyResult => {
  const seqs = matched.map((m) => m.seq)
  return {
    status: 'OVERTURNED',
    reason,
    matchedEvents: matched,
    seqRange: seqs.length ? [Math.min(...seqs), Math.max(...seqs)] : null,
  }
}

/** What the feed DOES have in this window — used to make rejections useful. */
function describeWindow(tl: Timeline, claim: Claim): string {
  const NOISE = new Set([
    'possession', 'attack_possession', 'safe_possession',
    'danger_possession', 'high_danger_possession',
  ])
  const actions = [
    ...new Set(
      framesInClockWindow(tl, claim.clockStart, claim.clockEnd)
        .map((f) => f.action)
        .filter((a) => !NOISE.has(a)),
    ),
  ]
  return actions.length ? `TXLine has: ${actions.join(', ')}` : 'TXLine has only possession telemetry here'
}

/** Verify a claim against a timeline. Pure — no I/O, no clock, no randomness. */
export function verify(tl: Timeline, claim: Claim): VerifyResult {
  if (tl.fixtureId !== claim.fixtureId) {
    return no(`Claim targets fixture ${claim.fixtureId} but timeline is ${tl.fixtureId}.`)
  }

  const covered = framesInClockWindow(tl, claim.clockStart, claim.clockEnd).length > 0
  if (!covered) {
    return {
      status: 'UNVERIFIABLE',
      reason:
        `No coverage for ${claim.clockStart}-${claim.clockEnd}s on fixture ${claim.fixtureId}. ` +
        `Stream covers ${tl.coverage.minClock}-${tl.coverage.maxClock}s.`,
      matchedEvents: [],
      seqRange: null,
    }
  }

  const handlers: Record<ClaimKind, () => VerifyResult> = {
    var_overturned_goal: () => {
      // Both directions must hold. Either alone states something false.
      const d = varInContext(tl, claim, (x) => x.type === 'Goal' && x.outcome === 'Overturned')
      if (!d) {
        return no(
          `No VAR decision of type Goal with outcome Overturned within ${VAR_CONTEXT_SEC}s. ` +
            `A discarded goal alone does not prove VAR. ${describeWindow(tl, claim)}`,
        )
      }

      // A VAR pair alone is NOT enough — it may have overturned a DIFFERENT goal.
      // 18237038 holds both: Id 551 @3455 is Confirmed and STOOD (one of Spain's
      // two goals), while Id 570 @3629 is the goal VAR killed, 186s later. With
      // the VAR pair as sole evidence, a clip of the goal that STOOD verifies as
      // "VAR overturned this goal" — telling the world a legitimate goal was
      // disallowed. Require a discarded goal in the window AND tie it temporally
      // to the review.
      const goal = eventsWithAction(tl, claim, 'goal').find(
        (e) =>
          e.discarded &&
          e.clock !== null &&
          d.clockStart !== null &&
          Math.abs(e.clock - d.clockStart) <= VAR_CONTEXT_SEC,
      )
      if (!goal) {
        return no(
          `A VAR Goal/Overturned decision exists at clock ${d.clockStart}, but no discarded ` +
            `goal in this window is tied to it — the review may have overturned a different ` +
            `goal. ${describeWindow(tl, claim)}`,
        )
      }

      return ok(
        `VAR reviewed a Goal and Overturned it at clock ${d.clockStart}-${d.clockEnd}.`,
        [varMatch(d), eventMatch(goal)],
      )
    },

    var_overturned_penalty: () => {
      const d = varInContext(tl, claim, (x) => x.type === 'Penalty' && x.outcome === 'Overturned')
      return d
        ? ok(`VAR reviewed a Penalty and Overturned it at clock ${d.clockStart}-${d.clockEnd}.`, [varMatch(d)])
        : no(`No VAR decision of type Penalty with outcome Overturned within ${VAR_CONTEXT_SEC}s. ${describeWindow(tl, claim)}`)
    },

    mistaken_identity: () => {
      const d = varInContext(tl, claim, (x) => x.type === 'MistakenIdentity' && x.outcome === 'Overturned')
      return d
        ? ok(`VAR found mistaken identity and Overturned it at clock ${d.clockStart}-${d.clockEnd}.`, [varMatch(d)])
        : no(`No VAR decision of type MistakenIdentity within ${VAR_CONTEXT_SEC}s. ${describeWindow(tl, claim)}`)
    },

    var_stands: () => {
      const d = varInContext(tl, claim, (x) => x.outcome === 'Stands')
      return d
        ? ok(`VAR reviewed a ${d.type ?? 'decision'} and it Stands, at clock ${d.clockStart}-${d.clockEnd}.`, [varMatch(d)])
        : no(`No VAR decision with outcome Stands within ${VAR_CONTEXT_SEC}s. ${describeWindow(tl, claim)}`)
    },

    goal_withdrawn: () => {
      const e = eventsWithAction(tl, claim, 'goal').find((x) => x.discarded)
      if (!e) return no(`No withdrawn goal in this window. ${describeWindow(tl, claim)}`)
      // True regardless of VAR. Deliberately weaker than var_overturned_goal.
      return ok(
        `A goal was reported at clock ${e.clock} and withdrawn. ` +
          `The feed does not state why — do not claim VAR or offside.`,
        [eventMatch(e)],
      )
    },

    goal: () => {
      const es = eventsWithAction(tl, claim, 'goal')
      const confirmed = es.find((e) => e.confirmed && !e.discarded)
      if (confirmed) return ok(`Confirmed goal at clock ${confirmed.clock}.`, [eventMatch(confirmed)])
      const killed = es.find((e) => e.discarded)
      if (killed) {
        return overturned(
          `A goal was reported at clock ${killed.clock} but later discarded. It did not stand.`,
          [eventMatch(killed)],
        )
      }
      return no(`No confirmed goal in this window. ${describeWindow(tl, claim)}`)
    },

    red_card: () => {
      const e = eventsWithAction(tl, claim, 'red_card').find((x) => x.confirmed && !x.discarded)
      return e
        ? ok(`Confirmed red card at clock ${e.clock}.`, [eventMatch(e)])
        : no(`No confirmed red card in this window. ${describeWindow(tl, claim)}`)
    },

    yellow_card: () => {
      // The feed tells you when it does not trust itself.
      const unreliable = framesInClockWindow(tl, claim.clockStart - EVENT_TOL_SEC, claim.clockEnd + EVENT_TOL_SEC)
        .some((f) => f.action === 'unreliable_yellow_cards')
      if (unreliable) {
        return {
          status: 'UNVERIFIABLE',
          reason: 'TXLine flagged yellow card data as unreliable in this window.',
          matchedEvents: [],
          seqRange: null,
        }
      }
      const e = eventsWithAction(tl, claim, 'yellow_card').find((x) => x.confirmed && !x.discarded)
      return e
        ? ok(`Confirmed yellow card at clock ${e.clock}.`, [eventMatch(e)])
        : no(`No confirmed yellow card in this window. ${describeWindow(tl, claim)}`)
    },

    penalty: () => {
      const e = eventsWithAction(tl, claim, 'penalty').find((x) => x.confirmed && !x.discarded)
      return e
        ? ok(`Confirmed penalty at clock ${e.clock}.`, [eventMatch(e)])
        : no(`No confirmed penalty in this window. ${describeWindow(tl, claim)}`)
    },
  }

  return handlers[claim.kind]()
}
