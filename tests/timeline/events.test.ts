import { describe, it, expect } from 'vitest'
import { resolveEvent, allEvents } from '../../src/timeline/events.js'
import { buildTimeline, timelineFromCapture } from '../../src/timeline/build.js'
import { loadFixture, CORPUS_ROOT } from '../../src/txline/corpus.js'
import { normalizeScoreFrame } from '../../src/txline/normalize.js'
import type { RawScoreFrame } from '../../src/txline/types.js'

const raw = (o: Partial<RawScoreFrame>): RawScoreFrame =>
  ({ FixtureId: 1, Action: 'goal', Seq: 1, Ts: 1000, ...o })

describe('resolveEvent', () => {
  it('collapses the confirm cycle into a single state', () => {
    const tl = buildTimeline(1, [
      normalizeScoreFrame(raw({ Seq: 1, Id: 5, Confirmed: false, Clock: { Running: true, Seconds: 100 } })),
      normalizeScoreFrame(raw({ Seq: 2, Id: 5, Confirmed: true, Clock: { Running: true, Seconds: 100 } })),
    ])
    const e = resolveEvent(tl, 5)!
    expect(e.confirmed).toBe(true)
    expect(e.discarded).toBe(false)
    expect(e.actions).toEqual(['goal'])
    expect(e.clock).toBe(100)
  })

  it('marks an event discarded when action_discarded shares its id', () => {
    const tl = buildTimeline(1, [
      normalizeScoreFrame(raw({ Seq: 1, Id: 5, Confirmed: true })),
      normalizeScoreFrame(raw({ Seq: 2, Id: 5, Action: 'action_discarded' })),
    ])
    const e = resolveEvent(tl, 5)!
    expect(e.discarded).toBe(true)
    expect(e.confirmed).toBe(true) // it WAS confirmed, then killed — both facts matter
  })

  it('captures action_amend', () => {
    const tl = buildTimeline(1, [
      normalizeScoreFrame(raw({ Seq: 1, Id: 5, Action: 'shot', Confirmed: true })),
      normalizeScoreFrame(raw({ Seq: 2, Id: 5, Action: 'action_amend', Data: { Action: 'shot', New: {} } })),
    ])
    expect(resolveEvent(tl, 5)!.amended).not.toBeNull()
  })

  it('returns null for an unknown event id', () => {
    expect(resolveEvent(buildTimeline(1, []), 999)).toBeNull()
  })

  it('returns null when an id has only meta frames', () => {
    const tl = buildTimeline(1, [normalizeScoreFrame(raw({ Seq: 1, Id: 5, Action: 'action_discarded' }))])
    expect(resolveEvent(tl, 5)).toBeNull()
  })

  it('keeps multiple primary actions on one id (var + var_end)', () => {
    const tl = buildTimeline(1, [
      normalizeScoreFrame(raw({ Seq: 1, Id: 300, Action: 'var', Confirmed: true })),
      normalizeScoreFrame(raw({ Seq: 2, Id: 300, Action: 'var_end', Confirmed: true })),
    ])
    expect(resolveEvent(tl, 300)!.actions).toEqual(['var', 'var_end'])
  })
})

describe('real corpus: no discarded goal was ever confirmed', () => {
  // This is the finding the whole verifier precision rests on.
  const cases: Array<[number, number]> = [
    [18209181, 495],
    [18213979, 410],
    [18213979, 490],
    [18237038, 570],
  ]
  for (const [fixtureId, eventId] of cases) {
    it(`${fixtureId} event ${eventId} is a discarded goal that never reached Confirmed:true`, () => {
      const tl = timelineFromCapture(loadFixture(CORPUS_ROOT, fixtureId), { mergeHistorical: true })
      const e = resolveEvent(tl, eventId)!
      expect(e.actions).toContain('goal')
      expect(e.discarded).toBe(true)
      expect(e.confirmed).toBe(false)
    })
  }
})

describe('allEvents', () => {
  it('resolves every event id in a timeline', () => {
    const tl = timelineFromCapture(loadFixture(CORPUS_ROOT, 18222446), { mergeHistorical: true })
    const events = allEvents(tl)
    expect(events.length).toBeGreaterThan(0)
    expect(events.every((e) => e.frames.length > 0)).toBe(true)
  })
})
