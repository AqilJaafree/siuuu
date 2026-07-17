import { describe, it, expect } from 'vitest'
import { loadFixture, listFixtures, CORPUS_ROOT } from '../../src/txline/corpus.js'

describe('listFixtures', () => {
  it('finds the six captured fixtures and ignores AppleDouble files', () => {
    const ids = listFixtures(CORPUS_ROOT)
    expect(ids).toEqual([18209181, 18213979, 18218149, 18222446, 18237038, 18241006])
  })
})

describe('loadFixture', () => {
  it('loads the France-Morocco quarter-final score and odds streams', () => {
    const f = loadFixture(CORPUS_ROOT, 18209181)
    expect(f.fixtureId).toBe(18209181)
    expect(f.scores.length).toBe(1286)
    expect(f.scores[0].FixtureId).toBe(18209181)
    expect(f.odds.length).toBeGreaterThan(1000)
    expect(f.odds[0].Bookmaker).toBe('TXLineStablePriceDemargined')
  })

  it('loads historical when present', () => {
    const f = loadFixture(CORPUS_ROOT, 18209181)
    expect(f.historical).not.toBeNull()
    expect(f.historical!.length).toBeGreaterThan(0)
    expect(f.historical![0].FixtureId).toBe(18209181)
  })

  it('returns null historical for the two semi-finals that lack it', () => {
    expect(loadFixture(CORPUS_ROOT, 18237038).historical).toBeNull()
    expect(loadFixture(CORPUS_ROOT, 18241006).historical).toBeNull()
  })

  it('throws a clear error for an unknown fixture', () => {
    expect(() => loadFixture(CORPUS_ROOT, 99999999)).toThrow(/99999999/)
  })
})
