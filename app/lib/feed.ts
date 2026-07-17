import 'server-only'
import { proofHash, type ProofCard } from '../../src/proof/card.js'
import type { VerifiedCard } from '../../src/cli/verify.js'
import type { ClaimKind } from '../../src/verify/types.js'
import demoProofs from '../../src/generated/demo-proofs.json' with { type: 'json' }

/**
 * The five demo cases from README.md, run through the real engine against the real
 * corpus — by `scripts/precompute-proofs.ts`, on a box that HAS the corpus.
 *
 * WHY NOT `runVerify` HERE
 *
 * `runVerify` calls `loadFixture`, which reads the 91MB capture off disk. That corpus
 * is gitignored: it is not in this repo and not on Netlify. Calling the engine at
 * request time therefore builds green and then throws ENOENT on the homepage — a
 * deployed site that 500s on `/`. Every number the app renders now comes from
 * `src/generated/demo-proofs.json` instead.
 *
 * That is a move in TIME, not in kind. The verifier and both scorers are pure over an
 * in-memory timeline and `proofHash` is a canonical serialisation, so a card computed
 * at build time is byte-identical to one computed per-request — the hashes in the JSON
 * re-derive exactly from the JSON's own fields. The MERKLE_PROVEN tiers are real
 * `validateStat` calls that ran against live devnet.
 *
 * There is deliberately NO fallback to `runVerify` when the JSON is absent or stale.
 * One source, always: a fallback would hide drift between the committed cards and the
 * corpus, and drift here means shipping a claim the feed no longer backs. If a case
 * has no precomputed card, `cardFor` throws and the build fails loudly.
 *
 * `title`, `blurb` and `fixtureLabel` are the only editorial fields — prose a human
 * wrote about a real moment. Every number comes from the engine.
 */
export interface DemoCase {
  id: string
  fixtureId: number
  clockStart: number
  clockEnd: number
  claimKind: ClaimKind
  title: string
  blurb: string
  fixtureLabel: string
}

const CASES: DemoCase[] = [
  {
    // The product. A goal was withdrawn here, but no VAR backs it, so SIUUU refuses
    // to claim VAR. First in the feed, deliberately — the rejection is the pitch.
    id: 'c-rejected',
    fixtureId: 18209181,
    clockStart: 2910,
    clockEnd: 2940,
    claimKind: 'var_overturned_goal',
    title: 'The goal that vanished — and the VAR that never was',
    blurb:
      'A goal was withdrawn at 48:30. The clip says VAR. The feed does not. SIUUU will not sign the claim.',
    fixtureLabel: 'France vs Morocco · QF',
  },
  {
    id: 'c-mistaken',
    fixtureId: 18222446,
    clockStart: 4260,
    clockEnd: 4290,
    claimKind: 'mistaken_identity',
    title: 'Wrong player carded — VAR caught it',
    blurb: 'The referee booked the wrong man. VAR overturned it and the right player went off.',
    // The opponent's team id (3099) is not decodable from the capture, and no source
    // in this repo names them. Naming a team we cannot read would be the exact kind of
    // invention this product exists to refuse.
    fixtureLabel: 'Argentina · QF',
  },
  {
    // The same 30 seconds of football as `c-mistaken`, and the whole two-tier story.
    // The RED CARD is a stat in TxODDS's Merkle tree, so it proves against Solana
    // outright — statKey 6, seq 687, verified live. The VAR REASON sitting next to it
    // is not a stat and never can be, so it stays the operator's word. Two strengths
    // of evidence from one moment, shown as two different things rather than blurred
    // into one badge.
    id: 'c-redcard',
    fixtureId: 18222446,
    clockStart: 4265,
    clockEnd: 4295,
    claimKind: 'red_card',
    title: 'The red card itself — proven on Solana',
    blurb: 'The card is a stat in the tree, so mathematics backs it. Why it was shown is only the feed’s word.',
    fixtureLabel: 'Argentina · QF',
  },
  {
    id: 'c-overturned',
    fixtureId: 18237038,
    clockStart: 3625,
    clockEnd: 3655,
    claimKind: 'var_overturned_goal',
    title: 'Goal overturned — the market shrugged',
    blurb: 'A goal cancelled by VAR in the semi-final France lost. Impact 1. Controversy 90.',
    fixtureLabel: 'France vs Spain · SF',
  },
  {
    // The second card that proves on-chain: statKey 1, seq 793, verified live. The
    // window is France's second goal against Morocco, which is the goal the proof
    // actually ran against — the earlier 59:20 goal in README.md was never proven, so
    // pointing the feed at it would leave this tier unearned.
    id: 'c-goal',
    fixtureId: 18209181,
    clockStart: 3910,
    clockEnd: 3940,
    claimKind: 'goal',
    title: 'France’s second — proven on Solana',
    blurb: 'A goal is a stat in the tree. The market had already called it: impact 19, and nobody argued.',
    fixtureLabel: 'France vs Morocco · QF',
  },
]

/**
 * A precomputed card, exactly as `runVerify` returned it, plus the two editorial
 * strings the precompute script records for its own console output.
 *
 * `title`/`note` are stripped before anything is hashed: they were never part of the
 * ProofCard, and leaving them in would change the canonical bytes.
 */
type PrecomputedCard = VerifiedCard & { title: string; note: string }

const PRECOMPUTED = demoProofs.cards as unknown as PrecomputedCard[]

const key = (c: { fixtureId: number; clockStart: number; clockEnd: number; claimKind: ClaimKind }) =>
  `${c.fixtureId}:${c.clockStart}:${c.clockEnd}:${c.claimKind}`

const BY_KEY = new Map(PRECOMPUTED.map((c) => [key(c), c]))

/**
 * The precomputed card for a demo case.
 *
 * Throws when there is none. That is the point: the alternative is a fallback that
 * silently verifies against a corpus which does not exist on the deploy target, or a
 * placeholder card that claims something nobody computed. A missing card is a
 * regenerate-the-precompute problem, and it should stop the build.
 */
export function cardFor(spec: DemoCase, sponsor: string | null = null): VerifiedCard {
  const hit = BY_KEY.get(key(spec))
  if (!hit) {
    throw new Error(
      `No precomputed card for ${spec.id} (${key(spec)}). ` +
        'Re-run `npm run precompute` on a box with exact-match-txline-raw/.',
    )
  }

  const { title: _t, note: _n, ...card } = hit
  return sponsor === null ? card : withSponsor(card)

  /**
   * Re-attach the sponsor and re-hash.
   *
   * Pure: `proofHash` is a canonical sha256 over the card's own fields and touches no
   * corpus. This produces the identical hash `runVerify` would have produced for the
   * same claim with the same sponsor — the sponsor is inside the canonical bytes, so
   * the card commits to which brand rides on it and a post-hoc swap is detectable.
   */
  function withSponsor(base: VerifiedCard): VerifiedCard {
    const { hash: _h, impactEvidence, controversyEvidence, ...proofCard } = base
    // Mirrors `buildProofCard`: a refused claim carries no sponsor, ever. The clip
    // still posts, with the refusal attached — no brand rides on an unbacked claim.
    const next: ProofCard = {
      ...proofCard,
      sponsor: proofCard.status === 'REJECTED' ? null : sponsor,
    }
    return { ...next, hash: proofHash(next), impactEvidence, controversyEvidence }
  }
}

export interface FeedClip extends DemoCase {
  card: VerifiedCard
}

/**
 * The feed, read from the precomputed cards. Server-side only, and no longer because
 * of the corpus — the JSON is small — but because the card shape is the server's
 * contract with the client and there is no reason to widen it.
 */
export function loadFeed(): FeedClip[] {
  return CASES.map((c) => ({ ...c, card: cardFor(c) }))
}

export function findCase(id: string): DemoCase | undefined {
  return CASES.find((c) => c.id === id)
}

export const DEMO_CASES = CASES
