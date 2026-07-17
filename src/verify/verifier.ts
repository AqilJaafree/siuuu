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

/**
 * What each review type acts on. A review always has a subject; naming it is the
 * difference between evidence and a coincidence of timing.
 */
const VAR_SUBJECT_ACTIONS: Record<string, string[]> = {
  Goal: ['goal'],
  Penalty: ['penalty'],
  MistakenIdentity: ['yellow_card', 'red_card'],
}

/** Does the review itself fall inside the clip? Then the clip shows the review. */
function varOverlapsClip(d: VarDecision, claim: Claim): boolean {
  if (d.clockStart === null || d.clockEnd === null) return false
  return overlaps(d.clockStart, d.clockEnd, claim.clockStart, claim.clockEnd)
}

/**
 * The event the review acted on, if it sits in the clip AND is tied to the review.
 *
 * An `Overturned` review kills its subject (the subject is discarded); a `Stands`
 * review leaves it standing (not discarded). Both directions matter.
 */
function varSubjectInClip(tl: Timeline, claim: Claim, d: VarDecision): EventState | null {
  if (d.clockStart === null || d.type === null) return null
  const actions = VAR_SUBJECT_ACTIONS[d.type]
  if (!actions) return null // unknown review type — never invent a subject for it
  const mustBeDiscarded = d.outcome === 'Overturned'

  for (const action of actions) {
    const found = eventsWithAction(tl, claim, action).find(
      (e) =>
        e.discarded === mustBeDiscarded &&
        e.clock !== null &&
        Math.abs(e.clock - (d.clockStart as number)) <= VAR_CONTEXT_SEC &&
        causallyOrdered(e, d, mustBeDiscarded),
    )
    if (found) return found
  }
  return null
}

/**
 * A review cannot have caused a discard that already happened.
 *
 * The operator discards the event BECAUSE the review overturned it, so the
 * `action_discarded` must FOLLOW the `var_end` in Seq order. Holds 4/4 corpus-wide
 * with no exceptions:
 *
 *   18237038  var_end Seq 641 -> discard Seq 642   (Id 571 -> 570)
 *   18213979  var_end Seq 538 -> discard Seq 539   (Id 492 -> 490)
 *   18213979  var_end Seq 940 -> discard Seq 941   (Id 843 -> 842)
 *   18222446  var_end Seq 683 -> discard Seq 684/685
 *
 * This is causal, not pattern-matched — which is why it generalises where `Id`
 * adjacency does not (571/570 are adjacent but 492/490 are off by two, an artifact
 * of these six fixtures).
 *
 * Its value is being ORTHOGONAL to the temporal tie. 18213979's goal Id 410 @2935
 * is otherwise excluded from VAR 492 @3315 solely because 380s > VAR_CONTEXT_SEC —
 * one constant between us and a false claim. Here it is rejected a second way: the
 * discard landed ~100 frames BEFORE the review opened, so the review cannot have
 * caused it.
 *
 * Only applies to the Overturned path. A `Stands` review discards nothing (18209181
 * penalty Id 296 has no discard at all), so there is no ordering to check.
 */
function causallyOrdered(e: EventState, d: VarDecision, mustBeDiscarded: boolean): boolean {
  if (!mustBeDiscarded) return true
  const discard = e.frames.find((f) => f.action === 'action_discarded')
  if (!discard) return false
  return discard.seq > d.seqEnd
}

/**
 * Shared resolver for every VAR-backed claim.
 *
 * A VAR pair within ±180s is NOT sufficient on its own — the review may concern a
 * different incident entirely. Two corpus cases prove it:
 *
 *   18237038: goal Id 551 @3455 STOOD (confirmed, never discarded — one of Spain's
 *   two). VAR Id 571 @3641 overturned a DIFFERENT goal, Id 570 @3629. A bare-pair
 *   match publishes a clip of Spain's legitimate goal as "VAR overturned it".
 *
 *   18222446: goal Id 595 @4010 STOOD. The MistakenIdentity VAR Id 611 @4180 is
 *   170s later and concerns a card, not that goal. A bare-pair match publishes a
 *   clip of a goal that counted as "VAR found mistaken identity".
 *
 * So the claim holds only if the clip shows the review, OR shows the subject the
 * review acted on. Tie temporally, NOT by `Id` adjacency — 570/571 are adjacent
 * but 490/492 are not, so adjacency does not generalise.
 */
function verifyVarClaim(
  tl: Timeline,
  claim: Claim,
  predicate: (d: VarDecision) => boolean,
  notFoundReason: string,
): VerifyResult {
  const d = varInContext(tl, claim, predicate)
  if (!d) return no(`${notFoundReason} ${describeWindow(tl, claim)}`)

  const describe = `VAR reviewed a ${d.type ?? 'decision'} and ${
    d.outcome === 'Stands' ? 'it Stands' : `${d.outcome ?? 'resolved'} it`
  }, at clock ${d.clockStart}-${d.clockEnd}.`

  const subject = varSubjectInClip(tl, claim, d)

  // The clip shows the review itself — the claim is about the review.
  if (varOverlapsClip(d, claim)) {
    return ok(describe, subject ? [varMatch(d), eventMatch(subject)] : [varMatch(d)])
  }

  // The clip does not show the review, so it must show what the review acted on.
  if (subject) return ok(describe, [varMatch(d), eventMatch(subject)])

  return no(
    `A VAR ${d.type ?? '?'}/${d.outcome ?? '?'} decision exists at clock ${d.clockStart}, but this ` +
      `clip contains neither the review nor the event it acted on — it may concern a different ` +
      `incident. ${describeWindow(tl, claim)}`,
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
    var_overturned_goal: () => verifyVarClaim(tl, claim, (d) => d.type === 'Goal' && d.outcome === 'Overturned',
      `No VAR decision of type Goal with outcome Overturned within ${VAR_CONTEXT_SEC}s. ` +
        `A discarded goal alone does not prove VAR.`),

    var_overturned_penalty: () => verifyVarClaim(tl, claim, (d) => d.type === 'Penalty' && d.outcome === 'Overturned',
      `No VAR decision of type Penalty with outcome Overturned within ${VAR_CONTEXT_SEC}s.`),

    mistaken_identity: () => verifyVarClaim(tl, claim, (d) => d.type === 'MistakenIdentity' && d.outcome === 'Overturned',
      `No VAR decision of type MistakenIdentity within ${VAR_CONTEXT_SEC}s.`),

    var_stands: () => verifyVarClaim(tl, claim, (d) => d.outcome === 'Stands',
      `No VAR decision with outcome Stands within ${VAR_CONTEXT_SEC}s.`),

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
