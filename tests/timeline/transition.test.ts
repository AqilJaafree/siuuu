import { describe, it, expect } from 'vitest'
import {
  scorelineTransitions,
  matchTransition,
  transitionFromReads,
} from '../../src/timeline/transition.js'
import { timelineFromCapture } from '../../src/timeline/build.js'
import { loadFixture, CORPUS_ROOT } from '../../src/txline/corpus.js'
import type { OcrRead } from '../../src/ocr/read.js'

const tl = (id: number) => timelineFromCapture(loadFixture(CORPUS_ROOT, id), { mergeHistorical: true })

const read = (h: number | null, a: number | null): OcrRead => ({
  clock: null, // the real clip has NO clock — this is the point of the whole module
  scoreHome: h,
  scoreAway: a,
  teamHome: 'FRA',
  teamAway: 'MAR',
  confidence: 0.9,
  notes: '',
})

describe('scorelineTransitions', () => {
  it('reports every change in France-Morocco, including the one that runs BACKWARDS', () => {
    // Verified against the raw capture. Morocco scored at 2924 and it was
    // discarded at 2918 — the discard is stamped EARLIER than the goal it
    // undoes, and the scoreline goes 0-1 -> 0-0.
    const ts = scorelineTransitions(tl(18209181))
    expect(ts.map((t) => `${t.from.join('-')}->${t.to.join('-')}@${t.clock}#${t.seq}`)).toEqual([
      '0-0->0-1@2924#534',
      '0-1->0-0@2918#535',
      '0-0->1-0@3560#738',
      '1-0->2-0@3922#793',
    ])
    expect(ts.map((t) => t.action)).toEqual(['goal', 'action_discarded', 'goal', 'goal'])
  })

  it('reports a null clock rather than inventing one when the feed states none', () => {
    // 18213979 Seq 539: an action_discarded that carries no Clock at all.
    const t = scorelineTransitions(tl(18213979)).find((x) => x.seq === 539)!
    expect(t.clock).toBeNull()
    expect(t.action).toBe('action_discarded')
  })
})

describe('matchTransition', () => {
  it('pins the real clip: 1-0 -> 2-0 is UNIQUE at clock 3922', () => {
    // This is the actual OCR'd France-Morocco clip. No clock on the bug; the
    // transition alone lands the moment.
    expect(matchTransition(tl(18209181), { from: [1, 0], to: [2, 0] })).toEqual({
      kind: 'UNIQUE',
      clock: 3922,
      seq: 793,
    })
  })

  it('pins 0-0 -> 1-0 at clock 3560 even though 0-0 occurs twice', () => {
    // The scoreline visits 0-0 twice (after the discard), but only one of those
    // visits LEAVES to 1-0 — so the transition is still unique. Uniqueness is a
    // property of the pair, not of the from-score.
    expect(matchTransition(tl(18209181), { from: [0, 0], to: [1, 0] })).toEqual({
      kind: 'UNIQUE',
      clock: 3560,
      seq: 738,
    })
  })

  it('returns NONE for a scoreline that never happened', () => {
    expect(matchTransition(tl(18209181), { from: [0, 0], to: [5, 0] })).toEqual({ kind: 'NONE' })
  })

  it('returns AMBIGUOUS — not a guess — when a transition happened TWICE', () => {
    // Real corpus case, no synthetic needed: in 18213979 the visitors go 1-2 up
    // at clock 2935, the goal is discarded back to 1-1 at 2931, and they go 1-2
    // up AGAIN at clock 5555. `1-1 -> 1-2` therefore has two distinct answers.
    // Picking either one would be a confident false claim about which goal the
    // clip shows. This assertion is the whole reason the module exists.
    const m = matchTransition(tl(18213979), { from: [1, 1], to: [1, 2] })
    expect(m.kind).toBe('AMBIGUOUS')
    expect(m).toEqual({ kind: 'AMBIGUOUS', clocks: [2935, 5555] })
  })

  it('refuses to pin a unique transition the feed gave no clock for', () => {
    // 18237038: 0-3 -> 0-2 happens exactly once, but on a clockless
    // action_discarded (Seq 642). It is real, so NONE would be a lie; it is
    // unpinnable, so UNIQUE would be a worse one.
    const m = matchTransition(tl(18237038), { from: [0, 3], to: [0, 2] })
    expect(m).toEqual({ kind: 'AMBIGUOUS', clocks: [] })
  })
})

describe('transitionFromReads', () => {
  it('derives 1-0 -> 2-0 from the real clip shape: a score change and no clock', () => {
    expect(transitionFromReads([read(1, 0), read(1, 0), read(2, 0), read(2, 0)])).toEqual({
      from: [1, 0],
      to: [2, 0],
    })
  })

  it('returns null when the score never changes across the clip', () => {
    expect(transitionFromReads([read(1, 0), read(1, 0), read(1, 0)])).toBeNull()
  })

  it('skips unreadable frames instead of treating them as a change', () => {
    // An occluded bug (lower-third sliding over it) reads null. If null counted
    // as a score, every occlusion would manufacture a transition out of nothing.
    expect(transitionFromReads([read(1, 0), read(null, null), read(1, 0)])).toBeNull()
    expect(transitionFromReads([read(1, 0), read(null, null), read(2, 0)])).toEqual({
      from: [1, 0],
      to: [2, 0],
    })
  })

  it('returns null for an empty or single-frame clip', () => {
    expect(transitionFromReads([])).toBeNull()
    expect(transitionFromReads([read(1, 0)])).toBeNull()
  })
})

describe('end to end: the clockless join lands the real clip', () => {
  it('OCR reads with no clock at all still resolve to 18209181 clock 3922', () => {
    const reads = [read(1, 0), read(1, 0), read(2, 0)]
    expect(reads.every((r) => r.clock === null)).toBe(true)
    const t = transitionFromReads(reads)!
    expect(matchTransition(tl(18209181), t)).toEqual({ kind: 'UNIQUE', clock: 3922, seq: 793 })
  })
})
