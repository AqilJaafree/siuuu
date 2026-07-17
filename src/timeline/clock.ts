import type { Timeline, Frame } from './types.js'
import { CLOCK_EXCLUDED_ACTIONS } from './types.js'

function usableClockFrames(tl: Timeline): Frame[] {
  return tl.frames.filter((f) => f.clock !== null && !CLOCK_EXCLUDED_ACTIONS.has(f.action))
}

/** Frames whose match clock falls inside [clockStart, clockEnd]. */
export function framesInClockWindow(tl: Timeline, clockStart: number, clockEnd: number): Frame[] {
  return usableClockFrames(tl).filter((f) => {
    const c = f.clock as number
    return c >= clockStart && c <= clockEnd
  })
}

/**
 * Translate a match-clock window to a wall-clock (Ts) window.
 *
 * Odds frames carry Ts but no Clock, so this is the only bridge between a clip's
 * clock window and the market.
 *
 * Returns null when no frame covers the window — a real feed gap (gaps reach
 * ~220s mid-match). Null means UNVERIFIABLE, not an error.
 */
export function tsWindowForClock(
  tl: Timeline,
  clockStart: number,
  clockEnd: number,
): [number, number] | null {
  const inWindow = framesInClockWindow(tl, clockStart, clockEnd)
  if (inWindow.length === 0) return null

  let min = Infinity
  let max = -Infinity
  for (const f of inWindow) {
    if (f.ts < min) min = f.ts
    if (f.ts > max) max = f.ts
  }
  return [min, max]
}
