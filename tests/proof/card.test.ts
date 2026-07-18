import { describe, it, expect } from 'vitest'
import { buildProofCard, canonicalise, proofHash } from '../../src/proof/card.js'
import type { ProofCard } from '../../src/proof/card.js'
import nacl from 'tweetnacl'
import bs58 from 'bs58'
import { claimMessage } from '../../src/proof/claimant.js'

const card = (): ProofCard => ({
  fixtureId: 18222446,
  clockStart: 4260,
  clockEnd: 4290,
  status: 'VERIFIED',
  claimKind: 'mistaken_identity',
  matchedEvents: [
    { eventId: 611, action: 'var_end', clock: 4180, seq: 668, confirmed: true, varType: 'MistakenIdentity', varOutcome: 'Overturned' },
  ],
  seqRange: [668, 668],
  contentHash: 'a'.repeat(64),
  impact: 22,
  controversy: 100,
  reason: 'VAR found mistaken identity and Overturned it at clock 4180-4272.',
  sponsor: null,
  claimant: null,
  validation: { tier: 'FEED_ATTESTED', statKey: null, seq: 668, network: 'devnet' },
})

describe('canonicalise', () => {
  it('is stable regardless of key insertion order', () => {
    const a = canonicalise({ b: 2, a: 1 } as never)
    const b = canonicalise({ a: 1, b: 2 } as never)
    expect(a).toBe(b)
  })

  it('produces identical output for identical cards', () => {
    expect(canonicalise(card())).toBe(canonicalise(card()))
  })
})

describe('proofHash', () => {
  it('is a 64-char lowercase hex sha256', () => {
    expect(proofHash(card())).toMatch(/^[0-9a-f]{64}$/)
  })

  it('is stable across calls', () => {
    expect(proofHash(card())).toBe(proofHash(card()))
  })

  it('changes when any field changes', () => {
    const a = proofHash(card())
    const b = proofHash({ ...card(), impact: 23 })
    expect(a).not.toBe(b)
  })

  it('changes when a matched event changes', () => {
    const mutated = card()
    mutated.matchedEvents[0].varOutcome = 'Stands'
    expect(proofHash(card())).not.toBe(proofHash(mutated))
  })
})

describe('buildProofCard', () => {
  it('assembles a card from a verify result and scores', () => {
    const c = buildProofCard({
      fixtureId: 18222446,
      clockStart: 4260,
      clockEnd: 4290,
      claimKind: 'mistaken_identity',
      contentHash: 'b'.repeat(64),
      result: {
        status: 'VERIFIED',
        reason: 'ok',
        matchedEvents: [{ eventId: 611, action: 'var_end', clock: 4180, seq: 668, confirmed: true, varType: 'MistakenIdentity', varOutcome: 'Overturned' }],
        seqRange: [668, 668],
      },
      impact: 22,
      controversy: 100,
      sponsor: null,
      validation: { tier: 'FEED_ATTESTED', statKey: null, seq: 668, network: 'devnet' },
    })
    expect(c.status).toBe('VERIFIED')
    expect(c.impact).toBe(22)
    expect(c.controversy).toBe(100)
    expect(c.seqRange).toEqual([668, 668])
  })
})

describe('ProofCard v2 — proof tier', () => {
  const base = {
    fixtureId: 18222446, clockStart: 4260, clockEnd: 4290,
    contentHash: 'a'.repeat(64), impact: 22, controversy: 100, sponsor: null,
    result: { status: 'VERIFIED' as const, reason: 'ok', matchedEvents: [], seqRange: [687, 687] as [number, number] },
  }

  it('marks a Merkle-proven claim as PROVEN and records the statKey', () => {
    const c = buildProofCard({ ...base, claimKind: 'red_card',
      validation: { tier: 'MERKLE_PROVEN', statKey: 6, seq: 687, network: 'devnet' } })
    expect(c.validation.tier).toBe('MERKLE_PROVEN')
    expect(c.validation.statKey).toBe(6)
  })

  it('marks a VAR claim as FEED_ATTESTED with no statKey', () => {
    // There is no Merkle-backed stat for a VAR decision. Saying otherwise would be
    // the exact overclaim this product refuses.
    const c = buildProofCard({ ...base, claimKind: 'mistaken_identity',
      validation: { tier: 'FEED_ATTESTED', statKey: null, seq: 681, network: 'devnet' } })
    expect(c.validation.tier).toBe('FEED_ATTESTED')
    expect(c.validation.statKey).toBeNull()
  })

  it('the tier changes the hash — a card cannot be silently upgraded', () => {
    const proven = buildProofCard({ ...base, claimKind: 'red_card',
      validation: { tier: 'MERKLE_PROVEN', statKey: 6, seq: 687, network: 'devnet' } })
    const attested = buildProofCard({ ...base, claimKind: 'red_card',
      validation: { tier: 'FEED_ATTESTED', statKey: 6, seq: 687, network: 'devnet' } })
    expect(proofHash(proven)).not.toBe(proofHash(attested))
  })

  it('binds verifiedOnChain into the hash — an unproven card cannot claim it was proven', () => {
    const claimed = buildProofCard({ ...base, claimKind: 'red_card',
      validation: { tier: 'MERKLE_PROVEN', statKey: 6, seq: 687, network: 'devnet', verifiedOnChain: true } })
    const notYet = buildProofCard({ ...base, claimKind: 'red_card',
      validation: { tier: 'MERKLE_PROVEN', statKey: 6, seq: 687, network: 'devnet' } })
    expect(proofHash(claimed)).not.toBe(proofHash(notYet))
  })

  it('binds the roots PDA into the hash — the card commits to what it was proven against', () => {
    const a = buildProofCard({ ...base, claimKind: 'red_card',
      validation: { tier: 'MERKLE_PROVEN', statKey: 6, seq: 687, network: 'devnet', verifiedOnChain: true, rootsPda: 'FtnZq4V8mp56GUNEGGXfL1MuyT81cvoz59yeKn192HdH' } })
    const b = buildProofCard({ ...base, claimKind: 'red_card',
      validation: { tier: 'MERKLE_PROVEN', statKey: 6, seq: 687, network: 'devnet', verifiedOnChain: true, rootsPda: 'EUCbk9vftUek4vChr6rnXP9hhR8UuHGBDJKLsAQTZ9Zr' } })
    expect(proofHash(a)).not.toBe(proofHash(b))
  })
})

describe('ProofCard v3 — the sponsor rides inside the hash', () => {
  const base = {
    fixtureId: 18222446, clockStart: 4260, clockEnd: 4290, claimKind: 'red_card' as const,
    contentHash: 'a'.repeat(64), impact: 22, controversy: 70,
    validation: { tier: 'FEED_ATTESTED' as const, statKey: null, seq: 686, network: 'devnet' as const },
  }
  const verified = { status: 'VERIFIED' as const, reason: 'ok', matchedEvents: [], seqRange: [686, 686] as [number, number] }
  const rejected = { status: 'REJECTED' as const, reason: 'no backing event', matchedEvents: [], seqRange: null }

  it('carries the sponsor on a verified card', () => {
    expect(buildProofCard({ ...base, result: verified, sponsor: 'adidas' }).sponsor).toBe('adidas')
  })

  it('changes the hash — a sponsor swapped after the fact cannot keep the same proof', () => {
    // The product's core promise. If the sponsor sat outside the hash, the same proof
    // would validate a card with anyone's logo on it.
    const adidas = buildProofCard({ ...base, result: verified, sponsor: 'adidas' })
    const nike = buildProofCard({ ...base, result: verified, sponsor: 'nike' })
    const none = buildProofCard({ ...base, result: verified, sponsor: null })
    expect(proofHash(adidas)).not.toBe(proofHash(nike))
    expect(proofHash(adidas)).not.toBe(proofHash(none))
    expect(proofHash(nike)).not.toBe(proofHash(none))
  })

  it('NEVER attaches a sponsor to a REJECTED card — the whole thesis', () => {
    // "The sponsor's logo cannot appear on a clip that isn't true." Enforced where
    // every card is built, not left to each caller to remember.
    const c = buildProofCard({ ...base, result: rejected, sponsor: 'adidas' })
    expect(c.sponsor).toBeNull()
  })

  it('a rejected card hashes identically whichever sponsor was requested', () => {
    // The corollary: since no sponsor survives rejection, no brand can be smuggled
    // into a refused claim's hash either.
    const a = buildProofCard({ ...base, result: rejected, sponsor: 'adidas' })
    const b = buildProofCard({ ...base, result: rejected, sponsor: 'nike' })
    expect(proofHash(a)).toBe(proofHash(b))
  })
})

describe('ProofCard v4 — authorship rides inside the hash', () => {
  const base = {
    fixtureId: 18222446, clockStart: 4260, clockEnd: 4290, claimKind: 'red_card' as const,
    contentHash: 'a'.repeat(64), impact: 22, controversy: 70, sponsor: null,
    validation: { tier: 'FEED_ATTESTED' as const, statKey: null, seq: 686, network: 'devnet' as const },
    result: { status: 'VERIFIED' as const, reason: 'ok', matchedEvents: [], seqRange: [686, 686] as [number, number] },
  }
  const msg = claimMessage({
    fixtureId: base.fixtureId, clockStart: base.clockStart, clockEnd: base.clockEnd,
    claimKind: base.claimKind, contentHash: base.contentHash,
  })
  const sign = () => {
    const kp = nacl.sign.keyPair()
    return {
      pubkey: bs58.encode(kp.publicKey),
      signature: Buffer.from(nacl.sign.detached(new TextEncoder().encode(msg), kp.secretKey)).toString('base64'),
    }
  }

  it('records a verified claimant and binds it into the hash', () => {
    const c = sign()
    const signed = buildProofCard({ ...base, claimant: c })
    const unsigned = buildProofCard({ ...base })
    expect(signed.claimant).toEqual(c)
    expect(proofHash(signed)).not.toBe(proofHash(unsigned))
  })

  it('drops a forged claimant to null — a signature that does not verify is never recorded', () => {
    // The load-bearing case: someone else's signature pasted under a real pubkey.
    const real = sign()
    const forged = { pubkey: real.pubkey, signature: sign().signature }
    expect(buildProofCard({ ...base, claimant: forged }).claimant).toBeNull()
  })

  it('default is unsigned — an omitted claimant is null, not a crash', () => {
    expect(buildProofCard({ ...base }).claimant).toBeNull()
  })
})
