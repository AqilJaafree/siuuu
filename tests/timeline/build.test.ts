import { describe, it, expect } from 'vitest'
import { buildTimeline, timelineFromCapture } from '../../src/timeline/build.js'
import { loadFixture, CORPUS_ROOT } from '../../src/txline/corpus.js'
import { normalizeScoreFrame } from '../../src/txline/normalize.js'
import type { RawScoreFrame } from '../../src/txline/types.js'

const raw = (over: Partial<RawScoreFrame>): RawScoreFrame =>
  ({ FixtureId: 1, Action: 'goal', Seq: 1, Ts: 1000, ...over })

describe('buildTimeline', () => {
  it('orders frames by seq regardless of input order', () => {
    const tl = buildTimeline(1, [
      normalizeScoreFrame(raw({ Seq: 3 })),
      normalizeScoreFrame(raw({ Seq: 1 })),
      normalizeScoreFrame(raw({ Seq: 2 })),
    ])
    expect(tl.frames.map((f) => f.seq)).toEqual([1, 2, 3])
  })

  it('groups frames by eventId and skips frames without one', () => {
    const tl = buildTimeline(1, [
      normalizeScoreFrame(raw({ Seq: 1, Id: 100 })),
      normalizeScoreFrame(raw({ Seq: 2, Id: 100, Action: 'action_discarded' })),
      normalizeScoreFrame(raw({ Seq: 3 })), // no Id
    ])
    expect(tl.byEventId.get(100)).toHaveLength(2)
    expect(tl.byEventId.size).toBe(1)
  })

  it('excludes score_adjustment (Clock 0) from coverage', () => {
    const tl = buildTimeline(1, [
      normalizeScoreFrame(raw({ Seq: 1, Clock: { Running: true, Seconds: 100 } })),
      normalizeScoreFrame(raw({ Seq: 2, Action: 'score_adjustment', Clock: { Running: true, Seconds: 0 } })),
      normalizeScoreFrame(raw({ Seq: 3, Clock: { Running: true, Seconds: 130 } })),
    ])
    expect(tl.coverage.minClock).toBe(100)
    expect(tl.coverage.maxClock).toBe(130)
    expect(tl.coverage.maxGapSec).toBe(30)
  })
})

describe('timelineFromCapture (real corpus)', () => {
  it('reports 18209181 stream starting at 19:19 when historical is not merged', () => {
    const cap = loadFixture(CORPUS_ROOT, 18209181)
    const tl = timelineFromCapture(cap, { mergeHistorical: false })
    expect(tl.coverage.minClock).toBe(1159)
    expect(tl.coverage.maxClock).toBe(5768)
  })

  it('18237038 stream is complete from kickoff without historical', () => {
    const cap = loadFixture(CORPUS_ROOT, 18237038)
    const tl = timelineFromCapture(cap, { mergeHistorical: false })
    expect(tl.coverage.maxClock).toBe(5816)
    expect(tl.coverage.maxGapSec).toBeLessThan(250)
  })

  it('merging historical backfills 18209181 to kickoff', () => {
    const cap = loadFixture(CORPUS_ROOT, 18209181)
    const tl = timelineFromCapture(cap, { mergeHistorical: true })
    expect(tl.coverage.minClock).toBeLessThan(1159)
  })

  it('dedupes frames by seq when merging historical', () => {
    const cap = loadFixture(CORPUS_ROOT, 18209181)
    const tl = timelineFromCapture(cap, { mergeHistorical: true })
    const seqs = tl.frames.map((f) => f.seq)
    // seq is monotonic per fixture; merging must not duplicate the overlap
    expect(new Set(seqs).size).toBe(seqs.length)
  })
})
