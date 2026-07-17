import { describe, it, expect } from 'vitest'
import { runVerify, parseArgs } from '../../src/cli/verify.js'

describe('parseArgs', () => {
  it('parses fixture, clock range and claim', () => {
    const a = parseArgs(['--fixture', '18222446', '--clock', '4260-4290', '--claim', 'mistaken_identity'])
    expect(a).toEqual({
      fixtureId: 18222446, clockStart: 4260, clockEnd: 4290,
      claimKind: 'mistaken_identity', sponsor: null,
    })
  })

  it('parses an optional sponsor, and defaults it to none', () => {
    const withSponsor = parseArgs(['--fixture', '1', '--clock', '1-2', '--claim', 'goal', '--sponsor', 'adidas'])
    expect(withSponsor.sponsor).toBe('adidas')
    // A claim with no sponsor is the normal case, not a missing argument.
    expect(parseArgs(['--fixture', '1', '--clock', '1-2', '--claim', 'goal']).sponsor).toBeNull()
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

/**
 * The tier is the product's own honesty, so it gets the same scrutiny as a claim.
 * These state the ledger outright rather than depending on whichever proofs happen
 * to be baked in today — the RULE is what is under test, not the current ledger.
 */
describe('runVerify — MERKLE_PROVEN requires a proof that actually ran', () => {
  const REDCARD = { fixtureId: 18222446, clockStart: 4265, clockEnd: 4295, claimKind: 'red_card' as const }

  const provenRedCard = {
    ...REDCARD, statKey: 6, seq: 687, network: 'devnet' as const,
    rootsPda: 'FtnZq4V8mp56GUNEGGXfL1MuyT81cvoz59yeKn192HdH',
    statValue: 1, provenAt: '2026-07-17T07:00:00.000Z',
  }

  it('an empty ledger leaves a provable claim FEED_ATTESTED', () => {
    // A statKey EXISTING for red_card earns nothing. Only a proof does.
    const card = runVerify(REDCARD, { provenStats: [] })
    expect(card.status).toBe('VERIFIED')
    expect(card.validation.tier).toBe('FEED_ATTESTED')
    expect(card.validation.statKey).toBeNull()
    expect(card.validation.verifiedOnChain).toBeUndefined()
  })

  it('a ledger entry promotes the card and records what it was proven against', () => {
    const card = runVerify(REDCARD, { provenStats: [provenRedCard] })
    expect(card.validation.tier).toBe('MERKLE_PROVEN')
    expect(card.validation.statKey).toBe(6)
    expect(card.validation.verifiedOnChain).toBe(true)
    expect(card.validation.rootsPda).toBe('FtnZq4V8mp56GUNEGGXfL1MuyT81cvoz59yeKn192HdH')
    // The seq the proof was checked at — 687, where the tree carries the increment.
    // NOT the evidence window's first seq (686), which reads value 0 on-chain.
    expect(card.validation.seq).toBe(687)
  })

  it('a proof for a different claim never leaks onto this card', () => {
    const card = runVerify(REDCARD, { provenStats: [{ ...provenRedCard, claimKind: 'goal' }] })
    expect(card.validation.tier).toBe('FEED_ATTESTED')
  })

  it('a proof for a different window never leaks onto this card', () => {
    const card = runVerify(REDCARD, { provenStats: [{ ...provenRedCard, clockStart: 1 }] })
    expect(card.validation.tier).toBe('FEED_ATTESTED')
  })

  it('a REJECTED claim is never promoted, even with a matching ledger entry', () => {
    // The refusal is the product. A proof must never override it.
    const rejected = { fixtureId: 18209181, clockStart: 2910, clockEnd: 2940, claimKind: 'var_overturned_goal' as const }
    const card = runVerify(rejected, {
      provenStats: [{ ...provenRedCard, ...rejected, statKey: 1 }],
    })
    expect(card.status).toBe('REJECTED')
    expect(card.validation.tier).toBe('FEED_ATTESTED')
  })

  it('the tier travels into the hash — the same claim hashes differently once proven', () => {
    const attested = runVerify(REDCARD, { provenStats: [] })
    const proven = runVerify(REDCARD, { provenStats: [provenRedCard] })
    expect(attested.hash).not.toBe(proven.hash)
  })
})

describe('runVerify — the sponsor', () => {
  const GOAL = { fixtureId: 18209181, clockStart: 3550, clockEnd: 3580, claimKind: 'goal' as const }

  it('threads the sponsor onto a verified card and into its hash', () => {
    const none = runVerify(GOAL)
    const adidas = runVerify({ ...GOAL, sponsor: 'adidas' })
    expect(adidas.sponsor).toBe('adidas')
    expect(adidas.hash).not.toBe(none.hash)
  })

  it('drops the sponsor from a REJECTED card', () => {
    const card = runVerify(
      { fixtureId: 18209181, clockStart: 2910, clockEnd: 2940, claimKind: 'var_overturned_goal', sponsor: 'adidas' },
    )
    expect(card.status).toBe('REJECTED')
    expect(card.sponsor).toBeNull()
  })
})
