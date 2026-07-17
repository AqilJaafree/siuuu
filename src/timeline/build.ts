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

/**
 * Index amendments by what they target, NOT by event id.
 *
 * An `action_amend` frame looks like:
 *   { Action: 'action_amend', Id: 460, Seq: 518,
 *     Data: { Action: 'yellow_card',
 *             Previous: { Clock: { Seconds: 518 }, PlayerId: 182068 },
 *             New:      { Clock: { Seconds: 479 }, PlayerId: 182068 } } }
 *
 * Note `Id: 460` is the AMEND's own id — the yellow card it corrects is `Id: 113`.
 * 0 of 23 amends in the corpus share their target's id, so an id-join never fires.
 *
 * `Data` is untyped wire data: every read is guarded and a malformed amend is
 * skipped rather than allowed to throw.
 */
function buildAmendIndex(frames: Frame[]): Map<string, number> {
  const index = new Map<string, number>()
  for (const f of frames) {
    if (f.action !== 'action_amend') continue
    const data = f.data as Record<string, unknown>
    const targetAction = data['Action']
    const prev = data['Previous'] as { Clock?: { Seconds?: number } } | undefined
    const next = data['New'] as { Clock?: { Seconds?: number } } | undefined
    const prevClock = prev?.Clock?.Seconds
    const newClock = next?.Clock?.Seconds
    if (typeof targetAction !== 'string') continue
    if (typeof prevClock !== 'number' || typeof newClock !== 'number') continue
    // 22 of 23 corpus amends correct a non-clock field (Outcome, FreeKickType,
    // PlayerId) and repeat the clock unchanged. Indexing those would set
    // `amendedFrom` on events whose clock the feed never retracted — a
    // correction the ProofCard would report as having happened when it did not.
    if (prevClock === newClock) continue
    index.set(`${targetAction}|${prevClock}`, newClock)
  }
  return index
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
  return {
    fixtureId,
    frames: sorted,
    byEventId,
    coverage: computeCoverage(sorted),
    amendIndex: buildAmendIndex(sorted),
  }
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
