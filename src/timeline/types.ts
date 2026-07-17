import type { RawScore } from '../txline/types.js'

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
  /** The action_amend frame, if any. */
  amended: Frame | null
  clock: number | null
  participant: 1 | 2 | null
  frames: Frame[]
}
