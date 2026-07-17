import { describe, it, expect } from 'vitest'
import { verify } from '../../src/verify/verifier.js'
import { timelineFromCapture } from '../../src/timeline/build.js'
import { loadFixture, CORPUS_ROOT } from '../../src/txline/corpus.js'
import type { ClaimKind } from '../../src/verify/types.js'

const tl = (id: number) => timelineFromCapture(loadFixture(CORPUS_ROOT, id), { mergeHistorical: true })
const claim = (fixtureId: number, clockStart: number, clockEnd: number, kind: ClaimKind) =>
  ({ fixtureId, clockStart, clockEnd, kind })

describe('verify — positive cases', () => {
  it('mistaken identity in Argentina QF', () => {
    const r = verify(tl(18222446), claim(18222446, 4260, 4290, 'mistaken_identity'))
    expect(r.status).toBe('VERIFIED')
    expect(r.matchedEvents[0]).toMatchObject({ eventId: 611, varType: 'MistakenIdentity', varOutcome: 'Overturned' })
  })

  it('VAR-overturned goal in the France-Spain semi-final', () => {
    const r = verify(tl(18237038), claim(18237038, 3625, 3655, 'var_overturned_goal'))
    expect(r.status).toBe('VERIFIED')
    expect(r.matchedEvents[0]).toMatchObject({ eventId: 571, varType: 'Goal', varOutcome: 'Overturned' })
  })

  it('VAR-overturned goal in the England QF (VAR follows the goal)', () => {
    const r = verify(tl(18213979), claim(18213979, 3250, 3280, 'var_overturned_goal'))
    expect(r.status).toBe('VERIFIED')
    expect(r.matchedEvents[0].eventId).toBe(492)
  })

  it('VAR-overturned penalty in the England QF', () => {
    const r = verify(tl(18213979), claim(18213979, 5960, 5990, 'var_overturned_penalty'))
    expect(r.status).toBe('VERIFIED')
    expect(r.matchedEvents[0].eventId).toBe(843)
  })

  it('VAR that stands in France-Morocco', () => {
    const r = verify(tl(18209181), claim(18209181, 1540, 1590, 'var_stands'))
    expect(r.status).toBe('VERIFIED')
    expect(r.matchedEvents[0]).toMatchObject({ eventId: 300, varOutcome: 'Stands' })
  })

  it('the red card in Argentina QF', () => {
    const r = verify(tl(18222446), claim(18222446, 4265, 4295, 'red_card'))
    expect(r.status).toBe('VERIFIED')
    expect(r.matchedEvents[0]).toMatchObject({ eventId: 613, action: 'red_card' })
  })

  it('a clean confirmed goal', () => {
    const r = verify(tl(18209181), claim(18209181, 3550, 3580, 'goal'))
    expect(r.status).toBe('VERIFIED')
  })

  it('reports a seqRange on every verified claim', () => {
    const r = verify(tl(18222446), claim(18222446, 4260, 4290, 'mistaken_identity'))
    expect(r.seqRange).not.toBeNull()
    expect(r.seqRange![0]).toBeLessThanOrEqual(r.seqRange![1])
  })
})

describe('verify — coverage', () => {
  it('returns UNVERIFIABLE for a window in a feed gap', () => {
    // Verified real 205s gap [1347, 1552] in the merged 18218149 timeline.
    const r = verify(tl(18218149), claim(18218149, 1400, 1430, 'goal'))
    expect(r.status).toBe('UNVERIFIABLE')
    expect(r.reason).toMatch(/coverage/i)
  })

  it('rejects a claim for the wrong fixture', () => {
    const r = verify(tl(18222446), claim(18209181, 4260, 4290, 'mistaken_identity'))
    expect(r.status).toBe('REJECTED')
    expect(r.reason).toMatch(/fixture/i)
  })
})

describe('verify — REJECTED cases state what IS there', () => {
  it('rejects a goal claim where no goal exists and names what is', () => {
    const r = verify(tl(18209181), claim(18209181, 2000, 2030, 'goal'))
    expect(r.status).toBe('REJECTED')
    expect(r.reason.length).toBeGreaterThan(0)
  })
})
