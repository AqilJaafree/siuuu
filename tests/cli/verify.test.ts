import { describe, it, expect } from 'vitest'
import { runVerify, parseArgs } from '../../src/cli/verify.js'

describe('parseArgs', () => {
  it('parses fixture, clock range and claim', () => {
    const a = parseArgs(['--fixture', '18222446', '--clock', '4260-4290', '--claim', 'mistaken_identity'])
    expect(a).toEqual({ fixtureId: 18222446, clockStart: 4260, clockEnd: 4290, claimKind: 'mistaken_identity' })
  })

  it('rejects a malformed clock range', () => {
    expect(() => parseArgs(['--fixture', '1', '--clock', 'abc', '--claim', 'goal'])).toThrow(/clock/i)
  })

  it('rejects an unknown claim kind', () => {
    expect(() => parseArgs(['--fixture', '1', '--clock', '1-2', '--claim', 'nonsense'])).toThrow(/claim/i)
  })

  it('rejects a reversed clock range', () => {
    expect(() => parseArgs(['--fixture', '1', '--clock', '100-50', '--claim', 'goal'])).toThrow(/clock/i)
  })
})

describe('runVerify — the marquee demo cases', () => {
  it('verifies the mistaken-identity red card with impact 22 and controversy 100', () => {
    const card = runVerify({ fixtureId: 18222446, clockStart: 4260, clockEnd: 4290, claimKind: 'mistaken_identity' })
    expect(card.status).toBe('VERIFIED')
    expect(card.impact).toBe(22)
    expect(card.controversy).toBe(100)
    expect(card.matchedEvents[0].eventId).toBe(611)
  })

  it('verifies the France-Spain VAR overturn: impact 1, controversy 90', () => {
    const card = runVerify({ fixtureId: 18237038, clockStart: 3625, clockEnd: 3655, claimKind: 'var_overturned_goal' })
    expect(card.status).toBe('VERIFIED')
    expect(card.impact).toBe(1)
    expect(card.controversy).toBe(90)
  })

  it('verifies the clean goal: high impact, low controversy', () => {
    const card = runVerify({ fixtureId: 18209181, clockStart: 3550, clockEnd: 3580, claimKind: 'goal' })
    expect(card.status).toBe('VERIFIED')
    expect(card.impact).toBe(56)
    expect(card.controversy).toBe(10)
  })

  it('rejects a VAR claim with no VAR behind it', () => {
    const card = runVerify({ fixtureId: 18209181, clockStart: 2910, clockEnd: 2940, claimKind: 'var_overturned_goal' })
    expect(card.status).toBe('REJECTED')
  })

  it('produces a stable sha256 on every card', () => {
    const a = runVerify({ fixtureId: 18222446, clockStart: 4260, clockEnd: 4290, claimKind: 'mistaken_identity' })
    const b = runVerify({ fixtureId: 18222446, clockStart: 4260, clockEnd: 4290, claimKind: 'mistaken_identity' })
    expect(a.hash).toBe(b.hash)
    expect(a.hash).toMatch(/^[0-9a-f]{64}$/)
  })
})
