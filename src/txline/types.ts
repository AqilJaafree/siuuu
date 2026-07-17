/** SSE envelope: every NDJSON line is `{ id, data }`. */
export interface Envelope<T> {
  /** SSE event id, form `<bucketMs>:<n>`. A reconnect cursor, NOT an event identity. */
  id: string
  data: T
}

export interface RawClock {
  Running: boolean
  Seconds: number
}

/** Zero-valued counters are OMITTED by the feed. Absence means zero. */
export interface RawCounters {
  Goals?: number
  Corners?: number
  YellowCards?: number
  RedCards?: number
}

/** Period keys seen: H1, HT, H2, Total. */
export type RawParticipantScore = Partial<Record<string, RawCounters>>

export interface RawScore {
  Participant1?: RawParticipantScore
  Participant2?: RawParticipantScore
}

export interface RawScoreFrame {
  FixtureId: number
  /** Knockout round: 10115675 = QF, 10115573 = SF. Not the tournament. */
  FixtureGroupId?: number
  CompetitionId?: number
  Participant1Id?: number
  Participant2Id?: number
  Participant1IsHome?: boolean
  StartTime?: number
  Action: string
  /** Event id — stable across the confirm cycle. Absent on some frames. */
  Id?: number
  /** Monotonic per fixture. Ordering key. */
  Seq: number
  /** epoch ms, feed emit time */
  Ts: number
  /** Changes on operator reconnect. Not an error. */
  ConnectionId?: number
  /** Two-phase confirm. Absent = not applicable, NOT false. */
  Confirmed?: boolean
  StatusId?: number
  Clock?: RawClock
  Score?: RawScore
  Stats?: Record<string, number>
  Data?: Record<string, unknown>
  Participant?: number
}

export interface RawOddsFrame {
  FixtureId: number
  MessageId: string
  Ts: number
  Bookmaker: string
  BookmakerId: number
  /** OVERUNDER_PARTICIPANT_GOALS | ASIANHANDICAP_PARTICIPANT_GOALS | 1X2_PARTICIPANT_RESULT */
  SuperOddsType: string
  /** `line=<n>` for over/under and handicap; null for 1X2. */
  MarketParameters: string | null
  /** null = full match, "half=1" = first half, "et" = extra time. THE TRAP — see analysis §7. */
  MarketPeriod: string | null
  InRunning: boolean
  /** Stable ordering. 1X2 is always ("part1","draw","part2"). */
  PriceNames: string[]
  /** Integers scaled x1000: 2088 = decimal odds 2.088. EMPTY = market suspended. */
  Prices: number[]
  Pct: string[]
  GameState?: string | null
}
