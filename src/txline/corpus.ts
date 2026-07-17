import { readFileSync, readdirSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { parseNdjson, parseHistorical } from './parse.js'
import type { RawScoreFrame, RawOddsFrame } from './types.js'

/** Repo-relative root of the captured corpus. */
export const CORPUS_ROOT = 'exact-match-txline-raw/txline-raw'

export interface FixtureCapture {
  fixtureId: number
  scores: RawScoreFrame[]
  odds: RawOddsFrame[]
  /** null for 18237038 and 18241006 — their score streams are complete without it. */
  historical: RawScoreFrame[] | null
}

/** Fixture directories, ascending. Ignores macOS AppleDouble `._*` entries. */
export function listFixtures(root: string): number[] {
  return readdirSync(root)
    .filter((n) => !n.startsWith('._'))
    .filter((n) => /^\d+$/.test(n))
    .map(Number)
    .sort((a, b) => a - b)
}

export function loadFixture(root: string, fixtureId: number): FixtureCapture {
  const dir = join(root, String(fixtureId))
  if (!existsSync(dir)) {
    throw new Error(`loadFixture: no capture directory for fixture ${fixtureId} at ${dir}`)
  }
  const scores = parseNdjson<RawScoreFrame>(readFileSync(join(dir, 'scores.ndjson'), 'utf8'))
    .map((e) => e.data)
  const odds = parseNdjson<RawOddsFrame>(readFileSync(join(dir, 'odds.ndjson'), 'utf8'))
    .map((e) => e.data)

  const histPath = join(dir, 'historical.raw.json')
  const historical = existsSync(histPath)
    ? parseHistorical(readFileSync(histPath, 'utf8'))
    : null

  return { fixtureId, scores, odds, historical }
}
