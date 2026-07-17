import type { RawScoreFrame, RawScore } from './types.js'
import type { Frame } from '../timeline/types.js'

function totalGoals(score: RawScore | undefined, key: 'Participant1' | 'Participant2'): number {
  return score?.[key]?.['Total']?.Goals ?? 0
}

export function normalizeScoreFrame(raw: RawScoreFrame): Frame {
  const participant = raw.Participant === 1 || raw.Participant === 2 ? raw.Participant : null

  return {
    fixtureId: raw.FixtureId,
    action: raw.Action,
    eventId: raw.Id ?? null,
    seq: raw.Seq,
    ts: raw.Ts,
    // Absent Confirmed means "not applicable" (e.g. action_discarded), never false.
    confirmed: raw.Confirmed === undefined ? null : raw.Confirmed,
    clock: raw.Clock?.Seconds ?? null,
    statusId: raw.StatusId ?? null,
    goals: raw.Score ? [totalGoals(raw.Score, 'Participant1'), totalGoals(raw.Score, 'Participant2')] : null,
    score: raw.Score ?? null,
    data: raw.Data ?? {},
    participant,
    connectionId: raw.ConnectionId ?? null,
  }
}
