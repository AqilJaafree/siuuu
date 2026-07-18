import { describe, it, expect } from 'vitest'
import nacl from 'tweetnacl'
import bs58 from 'bs58'
import { claimMessage, verifyClaimant, acceptClaimant } from '../../src/proof/claimant.js'

const INPUT = {
  fixtureId: 18209181,
  clockStart: 3910,
  clockEnd: 3940,
  claimKind: 'goal',
  contentHash: 'a'.repeat(64),
}

/** A real ed25519 keypair — the same curve a Solana wallet signs with. */
function wallet() {
  const kp = nacl.sign.keyPair()
  return {
    pubkey: bs58.encode(kp.publicKey),
    sign: (msg: string) =>
      Buffer.from(nacl.sign.detached(new TextEncoder().encode(msg), kp.secretKey)).toString('base64'),
  }
}

describe('claimMessage', () => {
  it('is deterministic', () => {
    expect(claimMessage(INPUT)).toBe(claimMessage({ ...INPUT }))
  })

  it('is human-readable — a wallet shows this to the user before they sign', () => {
    // Signing an opaque blob is not meaningful consent. Every field a user is
    // attesting to must be legible in the prompt they actually see.
    const msg = claimMessage(INPUT)
    expect(msg).toContain('SIUUU claim')
    expect(msg).toContain('fixture: 18209181')
    expect(msg).toContain('window: 3910-3940')
    expect(msg).toContain('claim: goal')
  })

  it('changes when ANY field of the claim changes', () => {
    const base = claimMessage(INPUT)
    expect(claimMessage({ ...INPUT, fixtureId: 18222446 })).not.toBe(base)
    expect(claimMessage({ ...INPUT, clockStart: 3911 })).not.toBe(base)
    expect(claimMessage({ ...INPUT, claimKind: 'red_card' })).not.toBe(base)
    expect(claimMessage({ ...INPUT, contentHash: 'b'.repeat(64) })).not.toBe(base)
  })
})

describe('verifyClaimant', () => {
  it('accepts a genuine signature', () => {
    const w = wallet()
    expect(verifyClaimant(INPUT, { pubkey: w.pubkey, signature: w.sign(claimMessage(INPUT)) })).toBe(true)
  })

  it('REJECTS a signature over a different claim', () => {
    // The attack this exists to stop: sign a cheap claim, submit it against another.
    const w = wallet()
    const sigForOtherClaim = w.sign(claimMessage({ ...INPUT, claimKind: 'red_card' }))
    expect(verifyClaimant(INPUT, { pubkey: w.pubkey, signature: sigForOtherClaim })).toBe(false)
  })

  it('REJECTS a signature lifted onto different footage', () => {
    // contentHash is in the message, so a signature cannot be moved to another clip.
    const w = wallet()
    const sig = w.sign(claimMessage(INPUT))
    expect(verifyClaimant({ ...INPUT, contentHash: 'b'.repeat(64) }, { pubkey: w.pubkey, signature: sig })).toBe(false)
  })

  it("REJECTS someone else's pubkey with a valid signature", () => {
    // Claiming authorship by pasting a stranger's address.
    const mine = wallet()
    const theirs = wallet()
    expect(verifyClaimant(INPUT, { pubkey: theirs.pubkey, signature: mine.sign(claimMessage(INPUT)) })).toBe(false)
  })

  it('returns false rather than throwing on garbage', () => {
    expect(verifyClaimant(INPUT, { pubkey: 'not-base58!!', signature: 'nope' })).toBe(false)
    expect(verifyClaimant(INPUT, { pubkey: '', signature: '' })).toBe(false)
    expect(verifyClaimant(INPUT, { pubkey: bs58.encode(new Uint8Array(31)), signature: 'AAAA' })).toBe(false)
  })
})

describe('acceptClaimant', () => {
  it('records a verified claimant', () => {
    const w = wallet()
    const c = { pubkey: w.pubkey, signature: w.sign(claimMessage(INPUT)) }
    expect(acceptClaimant(INPUT, c)).toEqual(c)
  })

  it('records NOTHING when the signature does not verify', () => {
    // The load-bearing case. A card showing a pubkey whose signature failed would
    // credit someone who never signed — worse than showing no claimant at all.
    const w = wallet()
    const forged = { pubkey: w.pubkey, signature: wallet().sign(claimMessage(INPUT)) }
    expect(acceptClaimant(INPUT, forged)).toBeNull()
  })

  it('accepts absence — unsigned is honest', () => {
    expect(acceptClaimant(INPUT, null)).toBeNull()
    expect(acceptClaimant(INPUT, undefined)).toBeNull()
  })
})
