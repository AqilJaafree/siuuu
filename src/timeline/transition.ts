/**
 * THE JOIN — pinning a clip to a moment when the clip has no clock.
 *
 * The design assumed the match clock was the join key. Real footage says
 * otherwise: the broadcast score bug on the France-Morocco clip reads
 * `FRA 1 | 0 MAR` and carries NO CLOCK at all (verified, 7/7 frames, OCR
 * correctly refused to guess one). If the clock is the only join, the pipeline
 * cannot turn a real clip into a claim.
 *
 * What the clip DOES show is a score TRANSITION: 1-0 at one frame, 2-0 at the
 * next. In fixture 18209181 the transition `1-0 -> 2-0` happens exactly once, at
 * clock 3922. The transition pins the moment with no clock in the clip at all.
 *
 * UNIQUENESS IS CHECKED, NEVER ASSUMED. Scorelines are not monotonic — they run
 * BACKWARDS when a goal is discarded. In 18209181 Morocco scored at 2924 and it
 * was discarded at 2918, so the scoreline is
 *   0-0 -> 0-1 -> 0-0 -> 1-0 -> 2-0
 * and `0-0` occurs TWICE. `1-1 -> 1-2` occurs twice in 18213979 (clock 2935 and
 * clock 5555) for the same reason. Returning a confident clock for a transition
 * that happened more than once would be exactly the false claim this product
 * exists to refuse — so an ambiguous transition returns AMBIGUOUS and the caller
 * must NEEDS_REVIEW.
 *
 * Pure. No I/O.
 */
import type { Timeline, Frame } from './types.js'
import { CLOCK_EXCLUDED_ACTIONS } from './types.js'
import { effectiveClock } from './clock.js'
import type { OcrRead } from '../ocr/read.js'

/** A scoreline change: full-match goals [p1, p2] before -> after. */
export interface ScoreTransition {
  from: [number, number]
  to: [number, number]
}

/** One occurrence of a scoreline change in the feed. */
export interface TransitionOccurrence extends ScoreTransition {
  /**
   * Effective (amend-corrected) clock, or null when the frame states none.
   * A null clock is not a bug: `action_discarded` frames frequently carry no
   * clock (18213979 Seq 539, 18237038 Seq 642), and score_adjustment /
   * clock_adjustment report a Clock.Seconds of 0 that does not correspond to
   * when they happened (see CLOCK_EXCLUDED_ACTIONS) and is nulled here.
   */
  clock: number | null
  seq: number
  /** The feed action that moved the score: goal, penalty_outcome, action_discarded... */
  action: string
}

export type TransitionMatch =
  | { kind: 'UNIQUE'; clock: number; seq: number }
  /** >1 occurrence, or one occurrence the feed gave no usable clock for. Caller must NEEDS_REVIEW. */
  | { kind: 'AMBIGUOUS'; clocks: number[] }
  /** Never happened in this fixture. Caller must REJECT. */
  | { kind: 'NONE' }

/**
 * A frame's clock for the purpose of pinning a moment.
 *
 * Amend-corrected (a retracted clock must never be reported), and nulled for the
 * actions whose Clock.Seconds is boilerplate rather than a time.
 */
function pinnableClock(tl: Timeline, f: Frame): number | null {
  if (CLOCK_EXCLUDED_ACTIONS.has(f.action)) return null
  return effectiveClock(tl, f)
}

const sameScore = (a: [number, number], b: [number, number]) => a[0] === b[0] && a[1] === b[1]

/**
 * Every scoreline change in the timeline, in seq order.
 *
 * Frames with no Score are skipped rather than treated as 0-0 — absence of a
 * score is not a score of zero, and treating it as one would invent transitions
 * on every non-scoring frame.
 */
export function scorelineTransitions(tl: Timeline): TransitionOccurrence[] {
  const out: TransitionOccurrence[] = []
  let prev: [number, number] | null = null
  for (const f of tl.frames) {
    if (f.goals === null) continue
    const goals: [number, number] = [f.goals[0], f.goals[1]]
    if (prev === null) {
      prev = goals
      continue
    }
    if (!sameScore(prev, goals)) {
      out.push({
        from: prev,
        to: goals,
        clock: pinnableClock(tl, f),
        seq: f.seq,
        action: f.action,
      })
      prev = goals
    }
  }
  return out
}

/**
 * Where — if anywhere unambiguously — a given scoreline change happened.
 *
 * One occurrence with a clock is the only case that yields a claimable moment.
 * One occurrence WITHOUT a clock is reported AMBIGUOUS with an empty clock list:
 * the change is real, so NONE would be a lie, but nothing here can pin it, so
 * UNIQUE would be a worse one. The caller must NEEDS_REVIEW either way.
 */
export function matchTransition(tl: Timeline, t: ScoreTransition): TransitionMatch {
  const hits = scorelineTransitions(tl).filter(
    (o) => sameScore(o.from, t.from) && sameScore(o.to, t.to),
  )
  if (hits.length === 0) return { kind: 'NONE' }
  if (hits.length === 1 && hits[0].clock !== null) {
    return { kind: 'UNIQUE', clock: hits[0].clock, seq: hits[0].seq }
  }
  return {
    kind: 'AMBIGUOUS',
    clocks: hits.map((h) => h.clock).filter((c): c is number => c !== null),
  }
}

/**
 * The score transition observed across a clip's OCR reads, or null if the score
 * never changed.
 *
 * Reads with a null score are skipped, not treated as a change: an occluded
 * scoreboard means "unknown", and letting it read as a transition would
 * manufacture a join out of a lower-third sliding over the bug.
 *
 * Returns the FIRST change. Clips are <=30s and a second scoreline change inside
 * one is not a thing that happens in football; if the reads somehow contain more
 * than one, the first is the one the clip is about and the extra will simply fail
 * to match a real occurrence downstream rather than be silently blended in.
 */
export function transitionFromReads(reads: OcrRead[]): ScoreTransition | null {
  let prev: [number, number] | null = null
  for (const r of reads) {
    if (r.scoreHome === null || r.scoreAway === null) continue
    const goals: [number, number] = [r.scoreHome, r.scoreAway]
    if (prev === null) {
      prev = goals
      continue
    }
    if (!sameScore(prev, goals)) return { from: prev, to: goals }
  }
  return null
}
