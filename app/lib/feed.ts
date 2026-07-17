import 'server-only'
import { runVerify, type VerifiedCard } from '../../src/cli/verify.js'
import type { ClaimKind } from '../../src/verify/types.js'

/**
 * The four demo cases from README.md, run through the real engine against the real
 * corpus. Nothing here is a fixture or a mock: every status, score, event row and
 * hash below is computed by `runVerify` at request time from
 * `exact-match-txline-raw/`.
 *
 * `title` and `blurb` are the only editorial fields — prose a human wrote about a
 * real moment. Every number comes from the engine.
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
    fixtureLabel: 'Spain vs Germany · QF',
  },
  {
    id: 'c-mistaken',
    fixtureId: 18222446,
    clockStart: 4260,
    clockEnd: 4290,
    claimKind: 'mistaken_identity',
    title: 'Wrong player carded — VAR caught it',
    blurb: 'The referee booked the wrong man. VAR overturned it and the right player went off.',
    fixtureLabel: 'Argentina vs Brazil · QF',
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
    id: 'c-goal',
    fixtureId: 18209181,
    clockStart: 3550,
    clockEnd: 3580,
    claimKind: 'goal',
    title: 'Clean goal, 59:20',
    blurb: 'The market moved. Nobody argued.',
    fixtureLabel: 'Spain vs Germany · QF',
  },
]

export interface FeedClip extends DemoCase {
  card: VerifiedCard
}

/**
 * Runs every demo case through the engine. Server-side only: `loadFixture` reads the
 * corpus off disk, and the corpus is 91MB that never goes near a browser.
 */
export function loadFeed(): FeedClip[] {
  return CASES.map((c) => ({
    ...c,
    card: runVerify({
      fixtureId: c.fixtureId,
      clockStart: c.clockStart,
      clockEnd: c.clockEnd,
      claimKind: c.claimKind,
    }),
  }))
}

export function findCase(id: string): DemoCase | undefined {
  return CASES.find((c) => c.id === id)
}

export const DEMO_CASES = CASES
