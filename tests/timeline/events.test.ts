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

  it('applies action_amend, which does NOT share its target id', () => {
    // Real corpus shape: the amend carries its OWN id (460) and names the yellow
    // card it corrects (id 113) by payload. 0 of 23 amends share their target id,
    // so an id-join silently never fires and the retracted clock survives.
    const tl = buildTimeline(1, [
      normalizeScoreFrame(raw({ Seq: 1, Id: 113, Action: 'yellow_card', Confirmed: true, Clock: { Running: true, Seconds: 518 } })),
      normalizeScoreFrame(raw({ Seq: 2, Id: 460, Action: 'action_amend', Data: {
        Action: 'yellow_card',
        Previous: { Clock: { Running: true, Seconds: 518 }, PlayerId: 182068 },
        New: { Clock: { Running: true, Seconds: 479 }, PlayerId: 182068 },
      } })),
    ])
    const e = resolveEvent(tl, 113)!
    expect(e.clock).toBe(479)       // the corrected value
    expect(e.amendedFrom).toBe(518) // the value TXLine retracted, kept for the proof
  })

  it('leaves an unamended event alone', () => {
    const tl = buildTimeline(1, [
      normalizeScoreFrame(raw({ Seq: 1, Id: 5, Confirmed: true, Clock: { Running: true, Seconds: 100 } })),
    ])
    expect(resolveEvent(tl, 5)!.clock).toBe(100)
    expect(resolveEvent(tl, 5)!.amendedFrom).toBeNull()
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

describe('real corpus: action_amend is applied', () => {
  // The live false claim this join fixes. Fixture 18237038 amends yellow card
  // Id 113 from clock 518 to 479. The amend carries its own Id (460) and names
  // its target by payload, so the old Id-join never fired and the verifier
  // reported 518 — a value the source of record had retracted.
  it('18237038 yellow card 113 reports the corrected clock 479, not the retracted 518', () => {
    const tl = timelineFromCapture(loadFixture(CORPUS_ROOT, 18237038), { mergeHistorical: true })
    const e = resolveEvent(tl, 113)!
    expect(e.actions).toContain('yellow_card')
    expect(e.clock).toBe(479)
    expect(e.amendedFrom).toBe(518)
  })

  it('no amend shares its target event id, corpus-wide', () => {
    for (const fixtureId of [18209181, 18213979, 18218149, 18222446, 18237038, 18241006]) {
      const tl = timelineFromCapture(loadFixture(CORPUS_ROOT, fixtureId), { mergeHistorical: true })
      for (const f of tl.frames) {
        if (f.action !== 'action_amend') continue
        const target = (f.data as { Action?: unknown }).Action
        const sharing = (tl.byEventId.get(f.eventId!) ?? []).map((x) => x.action)
        // If an amend ever shared its target's id, an id-join would be viable and
        // this payload join would need revisiting. It never does.
        expect(sharing).not.toContain(target)
      }
    }
  })

  it('leaves clock-noop amends unamended (they correct a non-clock field)', () => {
    // 22 of 23 corpus amends repeat the clock and change Outcome/FreeKickType/
    // PlayerId. Reporting amendedFrom on those would claim a clock correction
    // the feed never made. Event 63 in 18209181 is a shot amended OnTarget->OffTarget.
    const tl = timelineFromCapture(loadFixture(CORPUS_ROOT, 18209181), { mergeHistorical: true })
    const e = resolveEvent(tl, 63)!
    expect(e.clock).toBe(215)
    expect(e.amendedFrom).toBeNull()
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
