import { describe, it, expect } from 'vitest'
import { normalizeScoreFrame } from '../../src/txline/normalize.js'
import type { RawScoreFrame } from '../../src/txline/types.js'

const base: RawScoreFrame = { FixtureId: 1, Action: 'goal', Seq: 10, Ts: 1000 }

describe('normalizeScoreFrame', () => {
  it('maps the core fields', () => {
    const f = normalizeScoreFrame({ ...base, Id: 495, StatusId: 2, Clock: { Running: true, Seconds: 2924 } })
    expect(f.fixtureId).toBe(1)
    expect(f.action).toBe('goal')
    expect(f.eventId).toBe(495)
    expect(f.seq).toBe(10)
    expect(f.clock).toBe(2924)
    expect(f.statusId).toBe(2)
  })

  it('keeps Confirmed absent as null, NOT false', () => {
    expect(normalizeScoreFrame(base).confirmed).toBeNull()
    expect(normalizeScoreFrame({ ...base, Confirmed: false }).confirmed).toBe(false)
    expect(normalizeScoreFrame({ ...base, Confirmed: true }).confirmed).toBe(true)
  })

  it('defaults omitted counters to zero when Score is present', () => {
    const f = normalizeScoreFrame({
      ...base,
      Score: { Participant1: { Total: { Corners: 3 } }, Participant2: { Total: { Goals: 1 } } },
    })
    // P1 has no Goals key at all -> 0, not undefined
    expect(f.goals).toEqual([0, 1])
  })

  it('returns null goals when Score is absent entirely', () => {
    expect(normalizeScoreFrame(base).goals).toBeNull()
  })

  it('normalises missing Id, Clock, Data and Participant', () => {
    const f = normalizeScoreFrame(base)
    expect(f.eventId).toBeNull()
    expect(f.clock).toBeNull()
    expect(f.data).toEqual({})
    expect(f.participant).toBeNull()
  })

  it('only accepts participant 1 or 2', () => {
    expect(normalizeScoreFrame({ ...base, Participant: 1 }).participant).toBe(1)
    expect(normalizeScoreFrame({ ...base, Participant: 2 }).participant).toBe(2)
    expect(normalizeScoreFrame({ ...base, Participant: 7 }).participant).toBeNull()
  })
})
