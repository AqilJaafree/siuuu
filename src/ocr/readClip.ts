/**
 * Clip -> one OcrRead per sampled frame, in playback order.
 *
 * Network touches only readFrame; everything else here is bookkeeping. Frames
 * are read SEQUENTIALLY, not in parallel: a 30s clip is ~15 calls, and keeping
 * order and rate limits simple is worth more than a few seconds of latency.
 */
import { extractFrames, type ExtractOptions } from './frames.js'
import { readFrame, type OcrRead } from './read.js'

export interface ClipRead {
  framePath: string
  read: OcrRead
}

export async function readClipFrames(
  videoPath: string,
  opts: ExtractOptions = {},
): Promise<ClipRead[]> {
  const paths = extractFrames(videoPath, opts)
  const out: ClipRead[] = []
  for (const p of paths) {
    out.push({ framePath: p, read: await readFrame(p) })
  }
  return out
}

/** Video path -> OcrRead[], one per frame, in order. */
export async function readClip(videoPath: string, opts: ExtractOptions = {}): Promise<OcrRead[]> {
  return (await readClipFrames(videoPath, opts)).map((r) => r.read)
}
