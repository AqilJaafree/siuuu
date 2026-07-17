import { describe, it, expect } from 'vitest'
import { varDecisions } from '../../src/timeline/var.js'
import { timelineFromCapture } from '../../src/timeline/build.js'
import { loadFixture, CORPUS_ROOT } from '../../src/txline/corpus.js'

const tl = (id: number) => timelineFromCapture(loadFixture(CORPUS_ROOT, id), { mergeHistorical: true })

describe('varDecisions — all five confirmed pairs in the corpus', () => {
  it('18209181: Penalty / Stands at 1550->1582', () => {
    const d = varDecisions(tl(18209181))
    expect(d).toHaveLength(1)
    expect(d[0]).toMatchObject({ eventId: 300, type: 'Penalty', outcome: 'Stands', clockStart: 1550, clockEnd: 1582 })
  })

  it('18213979: Goal/Overturned then Penalty/Overturned', () => {
    const d = varDecisions(tl(18213979))
    expect(d).toHaveLength(2)
    expect(d[0]).toMatchObject({ eventId: 492, type: 'Goal', outcome: 'Overturned', clockStart: 3315, clockEnd: 3406 })
    expect(d[1]).toMatchObject({ eventId: 843, type: 'Penalty', outcome: 'Overturned', clockStart: 5968, clockEnd: 6071 })
  })

  it('18222446: MistakenIdentity / Overturned at 4180->4272', () => {
    const d = varDecisions(tl(18222446))
    expect(d).toHaveLength(1)
    expect(d[0]).toMatchObject({ eventId: 611, type: 'MistakenIdentity', outcome: 'Overturned', clockStart: 4180, clockEnd: 4272 })
  })

  it('18237038: Goal / Overturned at 3641->3653 (the France-Spain semi-final)', () => {
    const d = varDecisions(tl(18237038))
    expect(d).toHaveLength(1)
    expect(d[0]).toMatchObject({ eventId: 571, type: 'Goal', outcome: 'Overturned', clockStart: 3641, clockEnd: 3653 })
  })

  it('18218149 and 18241006 have no VAR decisions', () => {
    expect(varDecisions(tl(18218149))).toHaveLength(0)
    expect(varDecisions(tl(18241006))).toHaveLength(0)
  })

  it('returns decisions sorted by seqStart', () => {
    const d = varDecisions(tl(18213979))
    expect(d[0].seqStart).toBeLessThan(d[1].seqStart)
  })
})
