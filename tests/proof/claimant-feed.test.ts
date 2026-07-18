import { describe, it, expect } from 'vitest'
import nacl from 'tweetnacl'
import bs58 from 'bs58'
import { DEMO_CASES, cardFor } from '../../app/lib/feed.js'
import { claimMessage } from '../../src/proof/claimant.js'

// Any case works; pick the first. cardFor reads the precomputed card, so this needs no corpus.
const spec = DEMO_CASES[0]

function signFor(pubkeyKp: nacl.SignKeyPair, contentHash: string, s = spec) {
  const msg = claimMessage({ fixtureId: s.fixtureId, clockStart: s.clockStart, clockEnd: s.clockEnd, claimKind: s.claimKind, contentHash })
  const signature = Buffer.from(nacl.sign.detached(new TextEncoder().encode(msg), pubkeyKp.secretKey)).toString('base64')
  return { pubkey: bs58.encode(pubkeyKp.publicKey), signature }
}

describe('cardFor — a verified claimant rides inside the hash', () => {
  it('attaches a genuine claimant and changes the hash', () => {
    const unsigned = cardFor(spec)
    const kp = nacl.sign.keyPair()
    const claimant = signFor(kp, unsigned.contentHash)
    const signed = cardFor(spec, null, claimant)
    expect(signed.claimant).toEqual(claimant)
    expect(signed.hash).not.toBe(unsigned.hash)
  })

  it('drops a forged claimant to null — signature over a different claim', () => {
    const kp = nacl.sign.keyPair()
    // Sign the WRONG contentHash, submit against the real card.
    const forged = signFor(kp, 'b'.repeat(64))
    const signed = cardFor(spec, null, forged)
    expect(signed.claimant).toBeNull()
    // ...and the hash is unchanged from unsigned, since nothing was recorded.
    expect(signed.hash).toBe(cardFor(spec).hash)
  })
})
