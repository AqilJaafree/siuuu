import { describe, it, expect } from 'vitest'
import { buildProofCard, canonicalise, proofHash } from '../../src/proof/card.js'
import type { ProofCard } from '../../src/proof/card.js'

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
    contentHash: 'a'.repeat(64), impact: 22, controversy: 100,
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
})
