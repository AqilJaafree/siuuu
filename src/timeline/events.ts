import type { Timeline, EventState, Frame } from './types.js'

/** Frames that talk ABOUT an event rather than being one. */
const META_ACTIONS = new Set(['action_discarded', 'action_amend'])

/**
 * Resolve an event id to its FINAL state.
 *
 * `confirmed` and `discarded` are independent facts: an event can be confirmed
 * and then killed, and both matter. Callers must check `discarded` — never treat
 * `confirmed: true` alone as "this happened".
 */
export function resolveEvent(tl: Timeline, eventId: number): EventState | null {
  const frames = tl.byEventId.get(eventId)
  if (!frames || frames.length === 0) return null

  const primary = frames.filter((f) => !META_ACTIONS.has(f.action))
  if (primary.length === 0) return null

  const actions: string[] = []
  for (const f of primary) if (!actions.includes(f.action)) actions.push(f.action)

  const withClock = primary.find((f) => f.clock !== null)

  return {
    eventId,
    actions,
    confirmed: primary.some((f) => f.confirmed === true),
    discarded: frames.some((f) => f.action === 'action_discarded'),
    amended: frames.find((f) => f.action === 'action_amend') ?? null,
    clock: withClock?.clock ?? null,
    participant: primary.find((f) => f.participant !== null)?.participant ?? null,
    frames,
  }
}

export function allEvents(tl: Timeline): EventState[] {
  const out: EventState[] = []
  for (const eventId of tl.byEventId.keys()) {
    const e = resolveEvent(tl, eventId)
    if (e) out.push(e)
  }
  return out.sort((a, b) => a.frames[0].seq - b.frames[0].seq)
}

/** Frames for an event, excluding meta frames. Exported for ProofCard assembly. */
export function primaryFrames(state: EventState): Frame[] {
  return state.frames.filter((f) => !META_ACTIONS.has(f.action))
}
