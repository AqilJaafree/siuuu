export type ClaimKind =
  | 'goal'
  | 'var_overturned_goal'
  | 'var_overturned_penalty'
  | 'mistaken_identity'
  | 'var_stands'
  | 'goal_withdrawn'
  | 'red_card'
  | 'yellow_card'
  | 'penalty'

export interface Claim {
  fixtureId: number
  clockStart: number
  clockEnd: number
  kind: ClaimKind
}

export type VerifyStatus = 'VERIFIED' | 'REJECTED' | 'OVERTURNED' | 'UNVERIFIABLE'

export interface MatchedEvent {
  eventId: number
  action: string
  clock: number | null
  seq: number
  confirmed: boolean | null
  /** Present on VAR matches. */
  varType?: string | null
  varOutcome?: string | null
}

export interface VerifyResult {
  status: VerifyStatus
  /** Human-readable, states what is true and what is missing. Never apologises. */
  reason: string
  matchedEvents: MatchedEvent[]
  /** TXLine Seq bounds of the evidence — the audit window. */
  seqRange: [number, number] | null
}
