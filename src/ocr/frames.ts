/**
 * Frame extraction from a clip via ffmpeg.
 *
 * Clips are <=30s, so a naive "decode the whole thing" is fine — there is no
 * streaming path to justify. fps=1/2 (one frame every two seconds) is what the
 * real-footage probe used: dense enough to catch a score transition, sparse
 * enough that a 30s clip costs ~15 OCR calls.
 */
import { execFileSync } from 'node:child_process'
import { mkdtempSync, readdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

export interface ExtractOptions {
  /** Frames per second to sample. Default 1/2 — one frame every two seconds. */
  fps?: string
  /** Where to write frames. Defaults to a fresh temp dir. */
  outDir?: string
}

/**
 * Extract frames to PNG and return their paths in playback order.
 *
 * Sorted lexicographically, which is playback order because ffmpeg's %03d
 * counter is zero-padded. Throws if ffmpeg fails or produces no frames — a
 * silent empty read would look like "the score never changed".
 */
export function extractFrames(videoPath: string, opts: ExtractOptions = {}): string[] {
  const fps = opts.fps ?? '1/2'
  const dir = opts.outDir ?? mkdtempSync(join(tmpdir(), 'siuuu-frames-'))
  try {
    execFileSync('ffmpeg', [
      '-hide_banner', '-loglevel', 'error',
      '-i', videoPath,
      '-vf', `fps=${fps}`,
      join(dir, 'frame-%03d.png'),
    ], { stdio: ['ignore', 'ignore', 'pipe'] })
  } catch (e) {
    const stderr = (e as { stderr?: Buffer }).stderr?.toString().trim()
    throw new Error(`ffmpeg failed on ${videoPath}: ${stderr || (e as Error).message}`)
  }
  const frames = readdirSync(dir).filter((n) => /^frame-\d+\.png$/.test(n)).sort()
  if (frames.length === 0) throw new Error(`ffmpeg produced no frames from ${videoPath}`)
  return frames.map((n) => join(dir, n))
}
