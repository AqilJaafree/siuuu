import { describe, it, expect } from 'vitest'
import { impactScore, toProbabilities, totalVariation } from '../../src/score/impact.js'
import { timelineFromCapture } from '../../src/timeline/build.js'
import { tsWindowForClock } from '../../src/timeline/clock.js'
import { loadFixture, CORPUS_ROOT } from '../../src/txline/corpus.js'

function scoreWindow(fixtureId: number, clockStart: number, clockEnd: number) {
  const cap = loadFixture(CORPUS_ROOT, fixtureId)
  const tl = timelineFromCapture(cap, { mergeHistorical: true })
  const w = tsWindowForClock(tl, clockStart, clockEnd)!
  expect(w).not.toBeNull()
  return impactScore(cap.odds, w[0], w[1])
}

describe('toProbabilities', () => {
  it('converts x1000 odds to probabilities that sum to ~1 (demargined)', () => {
    const p = toProbabilities([1912, 2700, 9392])
    expect(p[0]).toBeCloseTo(0.523, 2)
    expect(p[0] + p[1] + p[2]).toBeCloseTo(1.0, 2)
  })
})

describe('totalVariation', () => {
  it('is 0 for identical vectors', () => {
    expect(totalVariation([0.5, 0.3, 0.2], [0.5, 0.3, 0.2])).toBe(0)
  })
  it('is bounded at 1 for disjoint vectors', () => {
    expect(totalVariation([1, 0, 0], [0, 0, 1])).toBeCloseTo(1.0, 5)
  })
})

describe('impactScore — real corpus windows', () => {
  // THE CONTROL TEST. Catches both the longshot-log bug and market-period mixing.
  it('a quiet window scores EXACTLY zero', () => {
    const r = scoreWindow(18209181, 2000, 2030)
    expect(r.tvd).toBeCloseTo(0.0, 3)
    expect(r.score).toBe(0)
  })

  it('the clean goal at 3560 scores 56', () => {
    const r = scoreWindow(18209181, 3550, 3580)
    expect(r.tvd).toBeCloseTo(0.348, 2)
    expect(r.score).toBe(56)
    expect(r.probsBefore[0]).toBeCloseTo(0.52, 1)
    expect(r.probsAfter[0]).toBeCloseTo(0.87, 1)
  })

  it('the VAR-overturned goal in France-Spain scores ~1 — the market did not move', () => {
    const r = scoreWindow(18237038, 3625, 3655)
    expect(r.tvd).toBeCloseTo(0.004, 2)
    expect(r.score).toBe(1)
  })

  it('the mistaken-identity red card scores 22', () => {
    const r = scoreWindow(18222446, 4260, 4290)
    expect(r.tvd).toBeCloseTo(0.140, 2)
    expect(r.score).toBe(22)
  })

  it('the VAR-overturned goal in the England QF scores 48', () => {
    const r = scoreWindow(18213979, 3250, 3280)
    expect(r.tvd).toBeCloseTo(0.301, 2)
    expect(r.score).toBe(48)
  })

  it('a goal for a side already at 0.86 scores lower than the first goal', () => {
    expect(scoreWindow(18209181, 3910, 3940).score).toBeLessThan(scoreWindow(18209181, 3550, 3580).score)
  })

  it('returns null-ish result when no full-match 1X2 brackets the window', () => {
    const r = impactScore([], 1000, 2000)
    expect(r.score).toBe(0)
    expect(r.evidence).toMatch(/no full-match 1X2/i)
  })
})
