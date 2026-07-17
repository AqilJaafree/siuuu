import { describe, it, expect } from 'vitest'
import { DEMO_CASES, cardFor, loadFeed } from '../../app/lib/feed.js'
import { runVerify } from '../../src/cli/verify.js'

/**
 * The deployed site renders `src/generated/demo-proofs.json` and nothing else — no
 * fallback recomputes it, because a fallback would hide drift. That design has one
 * cost: the committed cards can silently go stale against the engine that produced
 * them, and the site would keep serving old numbers while the code claims new ones.
 *
 * These tests are what makes that cost payable. They REQUIRE the corpus, so they only
 * run where the corpus exists — which is precisely the box that would regenerate the
 * precompute. They are the reason a stale regenerate is a caught bug and not a
 * shipped lie.
 */
describe('precomputed feed matches the engine', () => {
  it('every demo case has a precomputed card', () => {
    for (const c of DEMO_CASES) {
      expect(() => cardFor(c), `no precomputed card for ${c.id}`).not.toThrow()
    }
  })

  // The core claim of the whole precompute argument: build-time and request-time
  // produce the SAME card, byte for byte, because the verifier and scorers are pure
  // and proofHash is canonical. If this fails, the committed JSON is stale and the
  // site is serving numbers the engine no longer agrees with.
  it.each(DEMO_CASES.map((c) => [c.id, c] as const))(
    '%s is byte-identical to a fresh runVerify against the corpus',
    (_id, c) => {
      const fresh = runVerify({
        fixtureId: c.fixtureId,
        clockStart: c.clockStart,
        clockEnd: c.clockEnd,
        claimKind: c.claimKind,
      })
      expect(cardFor(c)).toEqual(fresh)
    },
  )

  // The sponsor is inside the canonical bytes, so attaching one must re-hash. This is
  // the one thing the precompute cannot bake in — the sponsor is chosen at post time —
  // so `cardFor` re-hashes locally instead of calling the engine. It must land on the
  // hash the engine would have produced.
  it.each(DEMO_CASES.map((c) => [c.id, c] as const))(
    '%s with a sponsor re-hashes exactly as the engine would',
    (_id, c) => {
      const fresh = runVerify({
        fixtureId: c.fixtureId,
        clockStart: c.clockStart,
        clockEnd: c.clockEnd,
        claimKind: c.claimKind,
        sponsor: 'adidas',
      })
      expect(cardFor(c, 'adidas')).toEqual(fresh)
    },
  )

  it('a rejected claim carries no sponsor, however hard you push one at it', () => {
    const rejected = DEMO_CASES.filter((c) => cardFor(c).status === 'REJECTED')
    expect(rejected.length).toBeGreaterThan(0)
    for (const c of rejected) {
      expect(cardFor(c, 'adidas').sponsor).toBeNull()
    }
  })
})

describe('the feed keeps its promises', () => {
  it('leads with the rejection, and it carries no sponsor', () => {
    const feed = loadFeed()
    expect(feed[0].card.status).toBe('REJECTED')
    expect(feed[0].card.sponsor).toBeNull()
  })

  // Two cards were proven by validateStat calls that actually ran against live devnet.
  // Pinned by coordinate, not by count: a card that lost its proof and a card that
  // gained an unearned one must both fail here.
  it('ships exactly the two on-chain proofs that really ran', () => {
    const proven = loadFeed()
      .filter((c) => c.card.validation.tier === 'MERKLE_PROVEN')
      .map((c) => ({
        claimKind: c.card.claimKind,
        statKey: c.card.validation.statKey,
        seq: c.card.validation.seq,
        verifiedOnChain: c.card.validation.verifiedOnChain,
      }))

    expect(proven).toEqual([
      { claimKind: 'red_card', statKey: 6, seq: 687, verifiedOnChain: true },
      { claimKind: 'goal', statKey: 1, seq: 793, verifiedOnChain: true },
    ])
  })

  // Every VAR claim is the operator's word: there is no statKey for a VAR decision and
  // there never can be. A MERKLE_PROVEN VAR card would mean the tier logic started
  // inventing proofs.
  it('never claims mathematics for a VAR decision', () => {
    for (const clip of loadFeed()) {
      if (clip.card.claimKind.startsWith('var_') || clip.card.claimKind === 'mistaken_identity') {
        expect(clip.card.validation.tier).toBe('FEED_ATTESTED')
        expect(clip.card.validation.statKey).toBeNull()
      }
    }
  })
})
