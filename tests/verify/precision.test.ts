import { describe, it, expect } from 'vitest'
import { verify } from '../../src/verify/verifier.js'
import { timelineFromCapture } from '../../src/timeline/build.js'
import { loadFixture, CORPUS_ROOT } from '../../src/txline/corpus.js'
import { varDecisions } from '../../src/timeline/var.js'
import { resolveEvent } from '../../src/timeline/events.js'
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

describe('PRECISION: a review cannot have caused a discard that already happened', () => {
  it('18213979 Id 410 is excluded by Seq ordering, independently of the ±180s tie', () => {
    // Goal 410 @2935 was discarded at Seq 441; VAR 492 opened ~100 frames later.
    // The temporal tie already rejects this (380s > 180s), but that is ONE constant.
    // This must stay REJECTED even if VAR_CONTEXT_SEC were widened.
    const r = verify(tl(18213979), claim(18213979, 2920, 2950, 'var_overturned_goal'))
    expect(r.status).toBe('REJECTED')
  })

  it('every real VAR overturn has its discard AFTER the var_end', () => {
    // The causal invariant the guard encodes. If a future fixture violates it, the
    // model is wrong and this should fail loudly rather than silently reject.
    for (const [fixtureId, varEnd, subjectId] of [
      [18237038, 571, 570],  // Goal/Overturned
      [18213979, 492, 490],  // Goal/Overturned
      [18213979, 843, 842],  // Penalty/Overturned
      [18222446, 611, 608],  // MistakenIdentity/Overturned -> the wrong-player card
    ] as const) {
      const t = tl(fixtureId)
      const d = varDecisions(t).find((x) => x.eventId === varEnd)!
      const discard = resolveEvent(t, subjectId)!.frames.find((f) => f.action === 'action_discarded')!
      expect(discard.seq).toBeGreaterThan(d.seqEnd)
    }
  })
})

describe('PRECISION: a bare VAR pair proves nothing — EVERY handler', () => {
  // The bug class, not the bug. It was first found in var_overturned_goal; review
  // then found the identical hole in mistaken_identity and var_overturned_penalty.
  // One test per handler, each using the "clip with no subject in it" shape.

  it('mistaken_identity: a clip of the goal that STOOD (18222446 Id 595 @4010)', () => {
    // The MistakenIdentity VAR at 4180 is 170s later and concerns a CARD, not this
    // goal. Without a subject tie, this clip publishes a goal that counted as
    // "VAR found mistaken identity and overturned it".
    const r = verify(tl(18222446), claim(18222446, 4000, 4030, 'mistaken_identity'))
    expect(r.status).toBe('REJECTED')
    expect(r.reason).toMatch(/different incident/i)
  })

  it('mistaken_identity: that same clip DOES verify as a clean confirmed goal', () => {
    const r = verify(tl(18222446), claim(18222446, 4000, 4030, 'goal'))
    expect(r.status).toBe('VERIFIED')
    expect(r.matchedEvents[0].eventId).toBe(595)
  })

  it('var_overturned_penalty: a clip containing no penalty at all (18213979 @6110)', () => {
    // 40s after the review closed. Penalty Id 842 @5929 is far outside the window.
    const r = verify(tl(18213979), claim(18213979, 6110, 6140, 'var_overturned_penalty'))
    expect(r.status).toBe('REJECTED')
  })

  it('var_stands: a clip long after the reviewed penalty resolved (18209181 @1700)', () => {
    // VAR 300 @1550-1582 does not overlap, and penalty 296 @1472 is not in the clip.
    const r = verify(tl(18209181), claim(18209181, 1700, 1730, 'var_stands'))
    expect(r.status).toBe('REJECTED')
  })

  it('a Stands review still verifies when the clip SHOWS the review', () => {
    // The subject (penalty 296 @1472) sits 78s BEFORE this clip and is never
    // discarded — a review that stands kills nothing. Requiring a discarded
    // subject in-clip would wrongly reject this. The clip shows the review itself.
    const r = verify(tl(18209181), claim(18209181, 1540, 1590, 'var_stands'))
    expect(r.status).toBe('VERIFIED')
    expect(r.matchedEvents[0].varOutcome).toBe('Stands')
  })
})

describe('PRECISION: a VAR pair alone does not prove THIS goal was overturned', () => {
  // The mirror of the discard-without-VAR trap, and just as fatal.
  // 18237038 holds a goal that STOOD (Id 551 @3455, Confirmed, never discarded)
  // and a goal VAR killed (Id 570 @3629), 186s apart. A clip of the FORMER sits
  // within ±180s of the VAR at 3641. Matching on the VAR pair alone tells the
  // world Spain's legitimate goal was disallowed.
  it('18237038: a clip of the goal that STOOD must NOT verify as a VAR overturn', () => {
    const r = verify(tl(18237038), claim(18237038, 3440, 3470, 'var_overturned_goal'))
    expect(r.status).toBe('REJECTED')
    // The shared resolver says "different incident" — it generalises across goals,
    // penalties and cards. Same assertion strength as the old /different goal/.
    expect(r.reason).toMatch(/different incident/i)
  })

  it('18237038: that same clip DOES verify as a clean confirmed goal', () => {
    const r = verify(tl(18237038), claim(18237038, 3440, 3470, 'goal'))
    expect(r.status).toBe('VERIFIED')
    expect(r.matchedEvents[0].eventId).toBe(551)
  })

  it('a verified VAR overturn always NAMES the goal it killed', () => {
    // Evidence must contain the goal, not just the review. An evidence array with
    // no goal in it is how the bug above hid.
    const r = verify(tl(18237038), claim(18237038, 3625, 3655, 'var_overturned_goal'))
    expect(r.status).toBe('VERIFIED')
    expect(r.matchedEvents.some((e) => e.eventId === 570)).toBe(true)
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

describe('PRECISION: rejection text names what is EFFECTIVELY in the window', () => {
  // The describeWindow half of the amend bug. Matching already used corrected
  // clocks; the explanatory text did not. Its stated job is telling a sponsor what
  // IS there, so naming an event the feed moved out of the window is a false
  // statement even in a rejection. 18237038's yellow card was amended 518 -> 479.
  it('does not name the card in the window it was moved OUT of (505-535)', () => {
    const r = verify(tl(18237038), claim(18237038, 505, 535, 'goal'))
    expect(r.status).toBe('REJECTED')
    expect(r.reason).not.toMatch(/yellow_card/)
  })

  it('does name the card in the window it was moved INTO (465-495)', () => {
    const r = verify(tl(18237038), claim(18237038, 465, 495, 'goal'))
    expect(r.status).toBe('REJECTED')
    expect(r.reason).toMatch(/yellow_card/)
  })
})
