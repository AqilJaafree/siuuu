import { describe, it, expect } from 'vitest'
import { tsWindowForClock, framesInClockWindow } from '../../src/timeline/clock.js'
import { timelineFromCapture } from '../../src/timeline/build.js'
import { loadFixture, CORPUS_ROOT } from '../../src/txline/corpus.js'

const tl = (id: number) => timelineFromCapture(loadFixture(CORPUS_ROOT, id), { mergeHistorical: true })

describe('tsWindowForClock', () => {
  it('maps a clock window to a wall-clock window', () => {
    const w = tsWindowForClock(tl(18209181), 3550, 3580)!
    expect(w).not.toBeNull()
    expect(w[0]).toBeLessThanOrEqual(w[1])
    // the France-Morocco QF kicked off 2026-07-09 20:00 UTC
    expect(w[0]).toBeGreaterThan(1783627200000)
  })

  it('returns null for a window with no frames (a real feed gap)', () => {
    // CORRECTED from the plan: the plan's window (18218149, 100, 130) assumed
    // the live stream's start at clock 1719 (28:39) with no merge, but tl()
    // always merges historical, and 18218149's historical.raw.json backfills
    // clock all the way to 0 (verified: 1089 frames, min clock 0, max 5821).
    // So (100, 130) is NOT a gap once merged. The real ~205s gap verified in
    // the merged timeline is [1347, 1552] (coverage.maxGapSec === 205); a
    // window fully inside it has no frames.
    expect(tsWindowForClock(tl(18218149), 1400, 1430)).toBeNull()
  })

  it('excludes score_adjustment frames, which report Clock 0', () => {
    // If score_adjustment leaked in, a window near 0 would match late-match Ts values.
    const w = tsWindowForClock(tl(18213979), 0, 30)
    if (w !== null) {
      const kickoff = 1783803600000
      expect(w[0]).toBeLessThan(kickoff + 10 * 60_000)
    }
  })
})

describe('framesInClockWindow', () => {
  it('finds the red card at clock 4280 in Argentina QF', () => {
    const fs = framesInClockWindow(tl(18222446), 4270, 4290)
    expect(fs.some((f) => f.action === 'red_card')).toBe(true)
  })

  it('returns an empty array for an uncovered window', () => {
    // See correction note above — (100, 130) has coverage once historical is
    // merged; [1400, 1430] is inside the verified real 205s gap.
    expect(framesInClockWindow(tl(18218149), 1400, 1430)).toEqual([])
  })
})
