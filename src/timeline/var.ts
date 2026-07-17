import type { Timeline, VarDecision } from './types.js'

/**
 * Extract confirmed VAR decisions.
 *
 * Only `Confirmed: true` frames count — an unconfirmed `var` frame carries
 * `PossibleEvent: {VAR: true}` and means "a review MIGHT be happening".
 *
 * Observed enums (small sample, n=5 — handle unknown values without crashing):
 *   type    ∈ { Goal, Penalty, MistakenIdentity }
 *   outcome ∈ { Overturned, Stands }
 */
export function varDecisions(tl: Timeline): VarDecision[] {
  const out: VarDecision[] = []

  for (const [eventId, frames] of tl.byEventId) {
    const opens = frames.filter((f) => f.action === 'var' && f.confirmed === true)
    const closes = frames.filter((f) => f.action === 'var_end' && f.confirmed === true)
    if (opens.length === 0 || closes.length === 0) continue

    const open = opens[opens.length - 1]
    const close = closes[closes.length - 1]

    const type = open.data['Type']
    const outcome = close.data['Outcome']

    out.push({
      eventId,
      type: typeof type === 'string' ? type : null,
      outcome: typeof outcome === 'string' ? outcome : null,
      clockStart: open.clock,
      clockEnd: close.clock,
      seqStart: open.seq,
      seqEnd: close.seq,
    })
  }

  return out.sort((a, b) => a.seqStart - b.seqStart)
}
