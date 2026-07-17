import { describe, it, expect } from 'vitest'
import { verify } from '../../src/verify/verifier.js'
import { timelineFromCapture } from '../../src/timeline/build.js'
import { loadFixture, CORPUS_ROOT } from '../../src/txline/corpus.js'
import type { ClaimKind } from '../../src/verify/types.js'

const tl = (id: number) => timelineFromCapture(loadFixture(CORPUS_ROOT, id), { mergeHistorical: true })
const claim = (fixtureId: number, clockStart: number, clockEnd: number, kind: ClaimKind) =>
  ({ fixtureId, clockStart, clockEnd, kind })

/**
 * All four discarded goals in the corpus were NEVER Confirmed:true.
 * Two have a VAR pair behind them; two do not.
 *
 *   fixture   goal Id  clock  VAR pair?                       claimable as
 *   18237038  570      3629   YES - Id 571 Goal/Overturned    var_overturned_goal
 *   18213979  490      3262   YES - Id 492 Goal/Overturned    var_overturned_goal
 *   18209181  495      2924   NO                              goal_withdrawn ONLY
 *   18213979  410      2935   NO                              goal_withdrawn ONLY
 *
 * A verifier matching on action_discarded alone would state something false in
 * half of these cases. That is the failure this file exists to prevent.
 */
describe('PRECISION: VAR-backed discarded goals verify as VAR overturns', () => {
  it('18237038 Id 571 — France-Spain semi-final', () => {
    expect(verify(tl(18237038), claim(18237038, 3625, 3655, 'var_overturned_goal')).status).toBe('VERIFIED')
  })

  it('18213979 Id 492 — England QF', () => {
    expect(verify(tl(18213979), claim(18213979, 3250, 3280, 'var_overturned_goal')).status).toBe('VERIFIED')
  })
})

describe('PRECISION: goals withdrawn with NO VAR must NOT verify as a VAR overturn', () => {
  it('18209181 Id 495 — REJECTED as var_overturned_goal', () => {
    const r = verify(tl(18209181), claim(18209181, 2910, 2940, 'var_overturned_goal'))
    expect(r.status).toBe('REJECTED')
    expect(r.reason).toMatch(/does not prove VAR/i)
  })

  it('18209181 Id 495 — VERIFIED as goal_withdrawn, with no claim about why', () => {
    const r = verify(tl(18209181), claim(18209181, 2910, 2940, 'goal_withdrawn'))
    expect(r.status).toBe('VERIFIED')
    expect(r.matchedEvents[0].eventId).toBe(495)
    expect(r.reason).toMatch(/does not state why/i)
  })

  it('18213979 Id 410 — REJECTED as var_overturned_goal', () => {
    expect(verify(tl(18213979), claim(18213979, 2920, 2950, 'var_overturned_goal')).status).toBe('REJECTED')
  })

  it('18213979 Id 410 — VERIFIED as goal_withdrawn', () => {
    const r = verify(tl(18213979), claim(18213979, 2920, 2950, 'goal_withdrawn'))
    expect(r.status).toBe('VERIFIED')
    expect(r.matchedEvents[0].eventId).toBe(410)
  })
})

describe('PRECISION: outcome must match — Stands is not Overturned', () => {
  it('18209181 Id 300 is Penalty/Stands — REJECTED as var_overturned_penalty', () => {
    expect(verify(tl(18209181), claim(18209181, 1540, 1590, 'var_overturned_penalty')).status).toBe('REJECTED')
  })

  it('18209181 Id 300 — VERIFIED as var_stands', () => {
    const r = verify(tl(18209181), claim(18209181, 1540, 1590, 'var_stands'))
    expect(r.status).toBe('VERIFIED')
    expect(r.matchedEvents[0].varOutcome).toBe('Stands')
  })
})

describe('PRECISION: type must match', () => {
  it('a Goal review is not a MistakenIdentity review', () => {
    expect(verify(tl(18237038), claim(18237038, 3625, 3655, 'mistaken_identity')).status).toBe('REJECTED')
  })

  it('a MistakenIdentity review is not a Goal review', () => {
    expect(verify(tl(18222446), claim(18222446, 4260, 4290, 'var_overturned_goal')).status).toBe('REJECTED')
  })
})

describe('PRECISION: the VAR context window does not over-reach', () => {
  it('18213979 Id 410 @2935 does not pick up the VAR at 3315 (380s away)', () => {
    const r = verify(tl(18213979), claim(18213979, 2920, 2950, 'var_overturned_goal'))
    expect(r.status).toBe('REJECTED')
  })

  it('18209181 @2924 does not pick up the VAR at 1550 (1370s away)', () => {
    expect(verify(tl(18209181), claim(18209181, 2910, 2940, 'var_stands')).status).toBe('REJECTED')
  })
})
