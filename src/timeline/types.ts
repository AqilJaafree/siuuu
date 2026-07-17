import type { RawScore } from '../txline/types.js'

/**
 * Actions whose Clock.Seconds is meaningless — they report 0 regardless of when
 * they actually occur, so they must never count as clock coverage.
 *
 *   score_adjustment  — always reports Clock.Seconds: 0 whenever it lands.
 *   clock_adjustment  — reports Clock.Seconds: 0 / Running: false as
 *                       end-of-stream finalisation boilerplate. Verified in all
 *                       six corpus fixtures as the last two frames before the
 *                       status transitions to finished (e.g. 18209181 Seq
 *                       1112-1113, StatusId 5, right before game_finalised).
 *
 * Do NOT extend this list. Ten actions carry Clock: 0, but most — `kickoff`
 * above all — are legitimately AT clock 0 and are real coverage. Only these two
 * report a clock that does not correspond to when they happened.
 *
 * Single source of truth: coverage (build.ts) and window lookups (clock.ts)
 * must agree on what a usable clock frame is, or the verifier can count
 * boilerplate as coverage and fail to return UNVERIFIABLE.
 */
export const CLOCK_EXCLUDED_ACTIONS = new Set(['score_adjustment', 'clock_adjustment'])

export interface Frame {
  fixtureId: number
  action: string
  /** null when the frame carries no event id. */
  eventId: number | null
  seq: number
  ts: number
  /** true | false | null. null means the feed did not state it — NOT false. */
  confirmed: boolean | null
  /** Match clock in seconds. The join key. null when absent. */
  clock: number | null
  statusId: number | null
  /** Full-match goals [p1, p2], derived from Score.Total. null when Score absent. */
  goals: [number, number] | null
  /** Raw score object, kept verbatim for the ProofCard. */
  score: RawScore | null
  data: Record<string, unknown>
  participant: 1 | 2 | null
  connectionId: number | null
}

export interface Coverage {
  /** Lowest clock value with a real frame. */
  minClock: number
  /** Highest clock value with a real frame. */
  maxClock: number
  /** Largest gap in seconds between consecutive clock values. */
  maxGapSec: number
}

export interface Timeline {
  fixtureId: number
  /** Ordered by seq ascending. */
  frames: Frame[]
  /** eventId -> every frame sharing it, seq ascending. */
  byEventId: Map<number, Frame[]>
  coverage: Coverage
  /**
   * `${targetAction}|${previousClock}` -> corrected clock.
   *
   * `action_amend` does NOT share its target's `Id` — 0 of 23 in the corpus do. It
   * carries its own fresh `Id` and names its target by payload (`Data.Action` +
   * `Data.Previous`). Joining on `Id` means amendments are silently never applied,
   * and the timeline reports a clock the feed explicitly retracted.
   *
   * Only clock-MOVING amends are indexed. 22 of the 23 amends in the corpus leave
   * `Clock.Seconds` untouched and correct some other field (`Outcome`,
   * `FreeKickType`, `PlayerId`); indexing those would make `amendedFrom` claim a
   * correction that never happened.
   */
  amendIndex: Map<string, number>
}

export interface VarDecision {
  eventId: number
  /** Data.Type from the confirmed `var` frame. Observed: Goal | Penalty | MistakenIdentity. */
  type: string | null
  /** Data.Outcome from the confirmed `var_end` frame. Observed: Overturned | Stands. */
  outcome: string | null
  clockStart: number | null
  clockEnd: number | null
  seqStart: number
  seqEnd: number
}

export interface EventState {
  eventId: number
  /** Primary actions on this id, excluding action_discarded/action_amend. */
  actions: string[]
  /** true if ANY primary frame reached Confirmed: true. */
  confirmed: boolean
  /** true if an action_discarded shares this id. */
  discarded: boolean
  /** Effective clock, AFTER any action_amend correction. */
  clock: number | null
  /** The clock TXLine first reported, if an amend moved it. Null when unamended. */
  amendedFrom: number | null
  participant: 1 | 2 | null
  frames: Frame[]
}
