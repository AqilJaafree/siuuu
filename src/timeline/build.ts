import type { Frame, Timeline, Coverage } from './types.js'
import { CLOCK_EXCLUDED_ACTIONS } from './types.js'
import type { FixtureCapture } from '../txline/corpus.js'
import { normalizeScoreFrame } from '../txline/normalize.js'

function computeCoverage(frames: Frame[]): Coverage {
  const clocks = frames
    .filter((f) => f.clock !== null && !CLOCK_EXCLUDED_ACTIONS.has(f.action))
    .map((f) => f.clock as number)
    .sort((a, b) => a - b)

  if (clocks.length === 0) return { minClock: 0, maxClock: 0, maxGapSec: 0 }

  let maxGap = 0
  for (let i = 1; i < clocks.length; i++) {
    maxGap = Math.max(maxGap, clocks[i] - clocks[i - 1])
  }
  return { minClock: clocks[0], maxClock: clocks[clocks.length - 1], maxGapSec: maxGap }
}

export function buildTimeline(fixtureId: number, frames: Frame[]): Timeline {
  const sorted = [...frames].sort((a, b) => a.seq - b.seq)
  const byEventId = new Map<number, Frame[]>()
  for (const f of sorted) {
    if (f.eventId === null) continue
    const arr = byEventId.get(f.eventId)
    if (arr) arr.push(f)
    else byEventId.set(f.eventId, [f])
  }
  return { fixtureId, frames: sorted, byEventId, coverage: computeCoverage(sorted) }
}

export interface TimelineOptions {
  /**
   * Merge historical.raw.json into the stream. REQUIRED for 18209181 and 18218149,
   * whose live streams start at 19:19 and 28:39 respectively.
   */
  mergeHistorical: boolean
}

export function timelineFromCapture(cap: FixtureCapture, opts: TimelineOptions): Timeline {
  const streamed = cap.scores.map(normalizeScoreFrame)

  if (!opts.mergeHistorical || cap.historical === null) {
    return buildTimeline(cap.fixtureId, streamed)
  }

  const historical = cap.historical.map(normalizeScoreFrame)

  // seq is intended as a monotonic per-fixture ordering key, but the raw
  // capture itself contains duplicate lines with the same Seq (broadcast
  // retransmission on operator reconnect — verified in 18209181's
  // scores.ndjson: 1286 raw lines, only 873 unique Seq values). A dedupe that
  // only checks historical-against-streamed misses those intra-stream
  // duplicates. Dedupe the full combined set by seq, keeping first-seen.
  const seen = new Set<number>()
  const merged: Frame[] = []
  for (const f of [...historical, ...streamed]) {
    if (seen.has(f.seq)) continue
    seen.add(f.seq)
    merged.push(f)
  }

  return buildTimeline(cap.fixtureId, merged)
}
