# SIUUU Verification Core — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the pure verification engine that turns a claim about a World Cup moment into a signed ProofCard backed by TXLine data — the entire differentiator of SIUUU, demoable from a CLI with no chain, no UI, and no network.

**Architecture:** Corpus files → normalised frames → per-fixture timeline → pure verifier + pure scorers → ProofCard + sha256. Every scoring and verification function is a pure function over an in-memory timeline, so the whole trust argument is testable offline against six real World Cup matches. A replay server (final task) re-emits the corpus as SSE so the ingest path is identical for live.

**Tech Stack:** TypeScript (ESM, strict) · Node 20+ · vitest · tsx · Node `crypto` (no deps)

**Spec:** [`../specs/2026-07-17-siuuu-design.md`](../specs/2026-07-17-siuuu-design.md)
**Feed analysis:** [`../../txline-feed-analysis.md`](../../txline-feed-analysis.md) — read §4.1, §7 before Task 9 and Task 10.

---

## Scope

This is **Plan 1 of 4**. The spec covers four independent subsystems; this plan
builds only the first, and it produces working, testable software on its own.

| Plan | Subsystem | Depends on |
|---|---|---|
| **1 (this)** | **Verification core** — timeline, verifier, scorers, ProofCard, CLI, replay | — |
| 2 | Chain layer — devnet anchor, campaign escrow PDA | 1 |
| 3 | Media layer — OCR, Walrus blobs, watermark burn | 1 |
| 4 | PWA — feed, clip editor, Proof Card UI, sponsor UI, wallet | 1, 2, 3 |

**Out of scope for Plan 1:** OCR, video, Solana, Redis, Next.js, sponsors, money.
Claims arrive as explicit `(fixtureId, clockStart, clockEnd, kind)` structs. Plan 3
adds OCR as an alternative front door that produces the same struct.

**Definition of done:** `npm run verify -- --fixture 18222446 --clock 4260-4290 --claim mistaken_identity`
prints a VERIFIED ProofCard with a sha256, impact 22, controversy 100.

---

## Why the tests in this plan are the deliverable

The product's only claim is that it does not state things that aren't true. Two
bugs already found during spec validation would each have shipped a verifier that
was confidently wrong:

1. **`action_discarded` on a goal is not a disallowed goal.** All four discarded
   goals in the corpus were never `Confirmed: true`. Two have a VAR pair behind
   them; two do not. Matching on the discard alone states something false in half
   the corpus cases. → Task 9, the precision tests.
2. **The impact scorer rated a dead-quiet window 57/100** because log-ratio on raw
   odds explodes on longshots, and because first-half and full-match markets stream
   concurrently and were being compared against each other. → Task 10, the control
   test.

Both are locked down by tests below with real, verified expected values. **Do not
weaken these tests to make code pass.** If one fails, the code is wrong.

---

## File Structure

```
package.json                    npm scripts, devDeps
tsconfig.json                   strict ESM
vitest.config.ts                test config

src/txline/types.ts             raw TXLine wire types (verbatim shapes)
src/txline/parse.ts             NDJSON + historical SSE parsing
src/txline/corpus.ts            read a fixture off disk
src/txline/normalize.ts         raw frame -> Frame

src/timeline/types.ts           Frame, Timeline, VarDecision, EventState
src/timeline/build.ts           frames -> Timeline (+ coverage)
src/timeline/events.ts          resolve an event's final state
src/timeline/var.ts             extract confirmed VAR decisions
src/timeline/clock.ts           clock window -> Ts window

src/verify/types.ts             Claim, VerifyResult, MatchedEvent
src/verify/verifier.ts          pure: (Timeline, Claim) -> VerifyResult

src/score/impact.ts             pure: (odds, tsWindow) -> ImpactResult
src/score/controversy.ts        pure: (MatchedEvent[]) -> number

src/proof/card.ts               ProofCard build, canonical serialise, sha256

src/cli/verify.ts               end-to-end CLI
src/replay/server.ts            corpus -> SSE (protocol-identical to TXLine)

tests/…                         mirrors src/, one file per module
tests/verify/precision.test.ts  THE MONEY TESTS
tests/score/impact.test.ts      includes the 0.000 control test
```

**Boundaries:** `verify/`, `score/`, and `proof/` never touch the filesystem or
network — they take a `Timeline` or an array and return a value. `txline/` is the
only module that knows about disk. `timeline/` is the only module that knows about
raw wire shapes. This is what makes the trust argument testable.

---

## Task 1: Project scaffold

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `vitest.config.ts`
- Create: `.gitignore` (append)

- [ ] **Step 1: Create `package.json`**

```json
{
  "name": "siuuu-core",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "engines": { "node": ">=20" },
  "scripts": {
    "test": "vitest run",
    "test:watch": "vitest",
    "typecheck": "tsc --noEmit",
    "verify": "tsx src/cli/verify.ts",
    "replay": "tsx src/replay/server.ts"
  },
  "devDependencies": {
    "@types/node": "^22.10.0",
    "tsx": "^4.19.2",
    "typescript": "^5.7.2",
    "vitest": "^2.1.8"
  }
}
```

- [ ] **Step 2: Create `tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2022"],
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "types": ["node"],
    "noEmit": true
  },
  "include": ["src", "tests"]
}
```

- [ ] **Step 3: Create `vitest.config.ts`**

```ts
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    testTimeout: 30_000, // corpus fixtures are up to 14MB; parsing is not instant
  },
})
```

- [ ] **Step 4: Append to `.gitignore`**

```
node_modules/
.next/
.DS_Store
._*
dist/
```

- [ ] **Step 5: Install and verify the toolchain**

Run: `npm install`
Expected: install succeeds.

Do **not** run `npm run typecheck` yet. With zero files matching `include`, tsc
exits non-zero with `TS18003: No inputs were found in config file`. That is
correct tsc behaviour, not a config bug — Task 2 adds the first source file and it
resolves itself. Leave `tsconfig.json` alone.

- [ ] **Step 6: Commit**

```bash
git add package.json tsconfig.json vitest.config.ts .gitignore package-lock.json
git commit -m "chore: scaffold siuuu-core with typescript and vitest"
```

---

## Task 2: Raw TXLine types

**Files:**
- Create: `src/txline/types.ts`

No tests — this file is types only, verified by `tsc` and by Task 3's tests.

- [ ] **Step 1: Create `src/txline/types.ts`**

Shapes are verbatim from the capture. Note `PascalCase` — do not rename; this is
the wire format.

```ts
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
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: exits 0, no output.

- [ ] **Step 3: Commit**

```bash
git add src/txline/types.ts
git commit -m "feat: add raw TXLine wire types"
```

---

## Task 3: NDJSON and historical parsing

**Files:**
- Create: `src/txline/parse.ts`
- Test: `tests/txline/parse.test.ts`

`historical.raw.json` is **not JSON** — it is a raw SSE body with `data: `
line prefixes. `JSON.parse` on it fails at byte 0.

- [ ] **Step 1: Write the failing test**

Create `tests/txline/parse.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { parseNdjson, parseHistorical } from '../../src/txline/parse.js'
import type { RawScoreFrame } from '../../src/txline/types.js'

describe('parseNdjson', () => {
  it('parses one envelope per line', () => {
    const text = '{"id":"a:1","data":{"FixtureId":1,"Action":"goal","Seq":1,"Ts":100}}\n' +
                 '{"id":"a:2","data":{"FixtureId":1,"Action":"corner","Seq":2,"Ts":200}}'
    const out = parseNdjson<RawScoreFrame>(text)
    expect(out).toHaveLength(2)
    expect(out[0].id).toBe('a:1')
    expect(out[0].data.Action).toBe('goal')
    expect(out[1].data.Seq).toBe(2)
  })

  it('ignores blank lines and trailing newline', () => {
    const text = '{"id":"a:1","data":{"FixtureId":1,"Action":"goal","Seq":1,"Ts":100}}\n\n\n'
    expect(parseNdjson<RawScoreFrame>(text)).toHaveLength(1)
  })

  it('throws with the line number on malformed input', () => {
    const text = '{"id":"a:1","data":{}}\nNOT JSON'
    expect(() => parseNdjson(text)).toThrow(/line 2/)
  })
})

describe('parseHistorical', () => {
  it('strips the SSE `data: ` prefix and parses each line', () => {
    const text = 'data: {"FixtureId":18209181,"Action":"kickoff","Seq":1,"Ts":100}\n' +
                 'data: {"FixtureId":18209181,"Action":"goal","Seq":2,"Ts":200}'
    const out = parseHistorical(text)
    expect(out).toHaveLength(2)
    expect(out[0].Action).toBe('kickoff')
    expect(out[1].Seq).toBe(2)
  })

  it('ignores non-data SSE lines (id:, event:, comments, blanks)', () => {
    const text = 'id: 123\n' +
                 ': keepalive\n' +
                 'event: score\n' +
                 '\n' +
                 'data: {"FixtureId":1,"Action":"goal","Seq":1,"Ts":100}\n'
    expect(parseHistorical(text)).toHaveLength(1)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/txline/parse.test.ts`
Expected: FAIL — `Failed to resolve import "../../src/txline/parse.js"`

- [ ] **Step 3: Write the implementation**

Create `src/txline/parse.ts`:

```ts
import type { Envelope, RawScoreFrame } from './types.js'

/** Parse an NDJSON capture file: one `{id, data}` envelope per line. */
export function parseNdjson<T>(text: string): Envelope<T>[] {
  const out: Envelope<T>[] = []
  const lines = text.split('\n')
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim()
    if (line === '') continue
    try {
      out.push(JSON.parse(line) as Envelope<T>)
    } catch (e) {
      throw new Error(`parseNdjson: malformed JSON at line ${i + 1}: ${(e as Error).message}`)
    }
  }
  return out
}

/**
 * Parse `historical.raw.json`, which despite the extension is a raw SSE body:
 * lines prefixed with `data: `. Non-data SSE lines are ignored.
 */
export function parseHistorical(text: string): RawScoreFrame[] {
  const out: RawScoreFrame[] = []
  const lines = text.split('\n')
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    if (!line.startsWith('data:')) continue
    const payload = line.slice('data:'.length).trim()
    if (payload === '') continue
    try {
      out.push(JSON.parse(payload) as RawScoreFrame)
    } catch (e) {
      throw new Error(`parseHistorical: malformed JSON at line ${i + 1}: ${(e as Error).message}`)
    }
  }
  return out
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/txline/parse.test.ts`
Expected: PASS — 5 tests.

- [ ] **Step 5: Commit**

```bash
git add src/txline/parse.ts tests/txline/parse.test.ts
git commit -m "feat: parse NDJSON captures and SSE-formatted historical files"
```

---

## Task 4: Corpus loader

**Files:**
- Create: `src/txline/corpus.ts`
- Test: `tests/txline/corpus.test.ts`

Reads real fixture data off disk. Must ignore macOS AppleDouble `._*` files.

- [ ] **Step 1: Write the failing test**

Create `tests/txline/corpus.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { loadFixture, listFixtures, CORPUS_ROOT } from '../../src/txline/corpus.js'

describe('listFixtures', () => {
  it('finds the six captured fixtures and ignores AppleDouble files', () => {
    const ids = listFixtures(CORPUS_ROOT)
    expect(ids).toEqual([18209181, 18213979, 18218149, 18222446, 18237038, 18241006])
  })
})

describe('loadFixture', () => {
  it('loads the France-Morocco quarter-final score and odds streams', () => {
    const f = loadFixture(CORPUS_ROOT, 18209181)
    expect(f.fixtureId).toBe(18209181)
    expect(f.scores.length).toBe(1286)
    expect(f.scores[0].FixtureId).toBe(18209181)
    expect(f.odds.length).toBeGreaterThan(1000)
    expect(f.odds[0].Bookmaker).toBe('TXLineStablePriceDemargined')
  })

  it('loads historical when present', () => {
    const f = loadFixture(CORPUS_ROOT, 18209181)
    expect(f.historical).not.toBeNull()
    expect(f.historical!.length).toBeGreaterThan(0)
    expect(f.historical![0].FixtureId).toBe(18209181)
  })

  it('returns null historical for the two semi-finals that lack it', () => {
    expect(loadFixture(CORPUS_ROOT, 18237038).historical).toBeNull()
    expect(loadFixture(CORPUS_ROOT, 18241006).historical).toBeNull()
  })

  it('throws a clear error for an unknown fixture', () => {
    expect(() => loadFixture(CORPUS_ROOT, 99999999)).toThrow(/99999999/)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/txline/corpus.test.ts`
Expected: FAIL — cannot resolve `corpus.js`.

- [ ] **Step 3: Write the implementation**

Create `src/txline/corpus.ts`:

```ts
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/txline/corpus.test.ts`
Expected: PASS — 5 tests.

If `listFixtures` fails, check you are running from the repo root — `CORPUS_ROOT`
is repo-relative and vitest's cwd is the project root.

- [ ] **Step 5: Commit**

```bash
git add src/txline/corpus.ts tests/txline/corpus.test.ts
git commit -m "feat: load captured fixtures from disk"
```

---

## Task 5: Frame normalisation

**Files:**
- Create: `src/timeline/types.ts`
- Create: `src/txline/normalize.ts`
- Test: `tests/txline/normalize.test.ts`

Turns the PascalCase wire shape into a flat internal `Frame`. The key subtlety:
`Confirmed` absent means **not applicable**, not `false`.

- [ ] **Step 1: Create `src/timeline/types.ts`**

```ts
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

/**
 * Actions that report a Clock they do not occur at.
 *
 * Both report `Clock.Seconds: 0` regardless of when they happen; `clock_adjustment`
 * additionally appears as end-of-stream finalisation boilerplate (`Running: false`).
 * Excluding only `score_adjustment` collapses every fixture's minClock to 0 and
 * hides the real start-of-stream gap.
 *
 * Ten actions carry `Clock: 0`. Do NOT add `kickoff` — it is legitimately at clock
 * 0 and is real coverage. These two are the ones reporting a meaningless clock.
 *
 * Defined ONCE here. `build.ts` and `clock.ts` both import it — they previously
 * held diverging copies, and since the verifier decides coverage via `clock.ts`,
 * the drift would have counted boilerplate as real coverage.
 */
export const CLOCK_EXCLUDED_ACTIONS = new Set(['score_adjustment', 'clock_adjustment'])

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
```

- [ ] **Step 2: Write the failing test**

Create `tests/txline/normalize.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { normalizeScoreFrame } from '../../src/txline/normalize.js'
import type { RawScoreFrame } from '../../src/txline/types.js'

const base: RawScoreFrame = { FixtureId: 1, Action: 'goal', Seq: 10, Ts: 1000 }

describe('normalizeScoreFrame', () => {
  it('maps the core fields', () => {
    const f = normalizeScoreFrame({ ...base, Id: 495, StatusId: 2, Clock: { Running: true, Seconds: 2924 } })
    expect(f.fixtureId).toBe(1)
    expect(f.action).toBe('goal')
    expect(f.eventId).toBe(495)
    expect(f.seq).toBe(10)
    expect(f.clock).toBe(2924)
    expect(f.statusId).toBe(2)
  })

  it('keeps Confirmed absent as null, NOT false', () => {
    expect(normalizeScoreFrame(base).confirmed).toBeNull()
    expect(normalizeScoreFrame({ ...base, Confirmed: false }).confirmed).toBe(false)
    expect(normalizeScoreFrame({ ...base, Confirmed: true }).confirmed).toBe(true)
  })

  it('defaults omitted counters to zero when Score is present', () => {
    const f = normalizeScoreFrame({
      ...base,
      Score: { Participant1: { Total: { Corners: 3 } }, Participant2: { Total: { Goals: 1 } } },
    })
    // P1 has no Goals key at all -> 0, not undefined
    expect(f.goals).toEqual([0, 1])
  })

  it('returns null goals when Score is absent entirely', () => {
    expect(normalizeScoreFrame(base).goals).toBeNull()
  })

  it('normalises missing Id, Clock, Data and Participant', () => {
    const f = normalizeScoreFrame(base)
    expect(f.eventId).toBeNull()
    expect(f.clock).toBeNull()
    expect(f.data).toEqual({})
    expect(f.participant).toBeNull()
  })

  it('only accepts participant 1 or 2', () => {
    expect(normalizeScoreFrame({ ...base, Participant: 1 }).participant).toBe(1)
    expect(normalizeScoreFrame({ ...base, Participant: 2 }).participant).toBe(2)
    expect(normalizeScoreFrame({ ...base, Participant: 7 }).participant).toBeNull()
  })
})
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run tests/txline/normalize.test.ts`
Expected: FAIL — cannot resolve `normalize.js`.

- [ ] **Step 4: Write the implementation**

Create `src/txline/normalize.ts`:

```ts
import type { RawScoreFrame, RawScore } from './types.js'
import type { Frame } from '../timeline/types.js'

function totalGoals(score: RawScore | undefined, key: 'Participant1' | 'Participant2'): number {
  return score?.[key]?.['Total']?.Goals ?? 0
}

export function normalizeScoreFrame(raw: RawScoreFrame): Frame {
  const participant = raw.Participant === 1 || raw.Participant === 2 ? raw.Participant : null

  return {
    fixtureId: raw.FixtureId,
    action: raw.Action,
    eventId: raw.Id ?? null,
    seq: raw.Seq,
    ts: raw.Ts,
    // Absent Confirmed means "not applicable" (e.g. action_discarded), never false.
    confirmed: raw.Confirmed === undefined ? null : raw.Confirmed,
    clock: raw.Clock?.Seconds ?? null,
    statusId: raw.StatusId ?? null,
    goals: raw.Score ? [totalGoals(raw.Score, 'Participant1'), totalGoals(raw.Score, 'Participant2')] : null,
    score: raw.Score ?? null,
    data: raw.Data ?? {},
    participant,
    connectionId: raw.ConnectionId ?? null,
  }
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run tests/txline/normalize.test.ts`
Expected: PASS — 6 tests.

- [ ] **Step 6: Commit**

```bash
git add src/timeline/types.ts src/txline/normalize.ts tests/txline/normalize.test.ts
git commit -m "feat: normalise raw score frames"
```

---

## Task 6: Timeline build and coverage

**Files:**
- Create: `src/timeline/build.ts`
- Test: `tests/timeline/build.test.ts`

Coverage matters: two fixtures' streams start mid-match (18209181 at 19:19,
18218149 at 28:39), and mid-match gaps reach ~220s. A 30s window can legitimately
contain zero frames — that is `UNVERIFIABLE`, not a bug.

`score_adjustment` frames carry `Clock.Seconds: 0` and must be excluded from
coverage, or every fixture reports minClock 0 and a false gap.

- [ ] **Step 1: Write the failing test**

Create `tests/timeline/build.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { buildTimeline, timelineFromCapture } from '../../src/timeline/build.js'
import { loadFixture, CORPUS_ROOT } from '../../src/txline/corpus.js'
import { normalizeScoreFrame } from '../../src/txline/normalize.js'
import type { RawScoreFrame } from '../../src/txline/types.js'

const raw = (over: Partial<RawScoreFrame>): RawScoreFrame =>
  ({ FixtureId: 1, Action: 'goal', Seq: 1, Ts: 1000, ...over })

describe('buildTimeline', () => {
  it('orders frames by seq regardless of input order', () => {
    const tl = buildTimeline(1, [
      normalizeScoreFrame(raw({ Seq: 3 })),
      normalizeScoreFrame(raw({ Seq: 1 })),
      normalizeScoreFrame(raw({ Seq: 2 })),
    ])
    expect(tl.frames.map((f) => f.seq)).toEqual([1, 2, 3])
  })

  it('groups frames by eventId and skips frames without one', () => {
    const tl = buildTimeline(1, [
      normalizeScoreFrame(raw({ Seq: 1, Id: 100 })),
      normalizeScoreFrame(raw({ Seq: 2, Id: 100, Action: 'action_discarded' })),
      normalizeScoreFrame(raw({ Seq: 3 })), // no Id
    ])
    expect(tl.byEventId.get(100)).toHaveLength(2)
    expect(tl.byEventId.size).toBe(1)
  })

  it('excludes score_adjustment (Clock 0) from coverage', () => {
    const tl = buildTimeline(1, [
      normalizeScoreFrame(raw({ Seq: 1, Clock: { Running: true, Seconds: 100 } })),
      normalizeScoreFrame(raw({ Seq: 2, Action: 'score_adjustment', Clock: { Running: true, Seconds: 0 } })),
      normalizeScoreFrame(raw({ Seq: 3, Clock: { Running: true, Seconds: 130 } })),
    ])
    expect(tl.coverage.minClock).toBe(100)
    expect(tl.coverage.maxClock).toBe(130)
    expect(tl.coverage.maxGapSec).toBe(30)
  })
})

describe('timelineFromCapture (real corpus)', () => {
  it('reports 18209181 real coverage starting at 19:19 when historical is not merged', () => {
    const cap = loadFixture(CORPUS_ROOT, 18209181)
    const tl = timelineFromCapture(cap, { mergeHistorical: false })
    expect(tl.coverage.minClock).toBe(1159)
    expect(tl.coverage.maxClock).toBe(5768)
  })

  it('18237038 stream is complete from kickoff without historical', () => {
    const cap = loadFixture(CORPUS_ROOT, 18237038)
    const tl = timelineFromCapture(cap, { mergeHistorical: false })
    expect(tl.coverage.maxClock).toBe(5816)
    expect(tl.coverage.maxGapSec).toBeLessThan(250)
  })

  it('merging historical backfills 18209181 to kickoff', () => {
    const cap = loadFixture(CORPUS_ROOT, 18209181)
    const tl = timelineFromCapture(cap, { mergeHistorical: true })
    expect(tl.coverage.minClock).toBeLessThan(1159)
  })

  it('dedupes frames by seq when merging historical', () => {
    const cap = loadFixture(CORPUS_ROOT, 18209181)
    const tl = timelineFromCapture(cap, { mergeHistorical: true })
    const seqs = tl.frames.map((f) => f.seq)
    // seq is monotonic per fixture; merging must not duplicate the overlap
    expect(new Set(seqs).size).toBe(seqs.length)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/timeline/build.test.ts`
Expected: FAIL — cannot resolve `build.js`.

- [ ] **Step 3: Write the implementation**

Create `src/timeline/build.ts`:

```ts
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

  // 18209181's own scores.ndjson contains exact duplicate lines (1286 lines, 873
  // unique Seq) from operator retransmission, so dedupe the COMBINED set, not just
  // historical against streamed. Verified safe: zero Seq values carry differing
  // payloads corpus-wide, so first-seen-wins never drops a Confirmed:true frame.
  const backfill = cap.historical.map(normalizeScoreFrame)
  const seen = new Set<number>()
  const merged: Frame[] = []
  for (const f of [...backfill, ...streamed]) {
    if (seen.has(f.seq)) continue
    seen.add(f.seq)
    merged.push(f)
  }

  return buildTimeline(cap.fixtureId, merged)
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/timeline/build.test.ts`
Expected: PASS — 7 tests.

- [ ] **Step 5: Commit**

```bash
git add src/timeline/build.ts tests/timeline/build.test.ts
git commit -m "feat: build per-fixture timelines with coverage reporting"
```

---

## Task 7: Event final-state resolution

**Files:**
- Create: `src/timeline/events.ts`
- Test: `tests/timeline/events.test.ts`

An event's truth is its **final** state. `action_discarded` and `action_amend`
share an `Id` with what they kill or rewrite and can land minutes later.

- [ ] **Step 1: Write the failing test**

Create `tests/timeline/events.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { resolveEvent, allEvents } from '../../src/timeline/events.js'
import { buildTimeline, timelineFromCapture } from '../../src/timeline/build.js'
import { loadFixture, CORPUS_ROOT } from '../../src/txline/corpus.js'
import { normalizeScoreFrame } from '../../src/txline/normalize.js'
import type { RawScoreFrame } from '../../src/txline/types.js'

const raw = (o: Partial<RawScoreFrame>): RawScoreFrame =>
  ({ FixtureId: 1, Action: 'goal', Seq: 1, Ts: 1000, ...o })

describe('resolveEvent', () => {
  it('collapses the confirm cycle into a single state', () => {
    const tl = buildTimeline(1, [
      normalizeScoreFrame(raw({ Seq: 1, Id: 5, Confirmed: false, Clock: { Running: true, Seconds: 100 } })),
      normalizeScoreFrame(raw({ Seq: 2, Id: 5, Confirmed: true, Clock: { Running: true, Seconds: 100 } })),
    ])
    const e = resolveEvent(tl, 5)!
    expect(e.confirmed).toBe(true)
    expect(e.discarded).toBe(false)
    expect(e.actions).toEqual(['goal'])
    expect(e.clock).toBe(100)
  })

  it('marks an event discarded when action_discarded shares its id', () => {
    const tl = buildTimeline(1, [
      normalizeScoreFrame(raw({ Seq: 1, Id: 5, Confirmed: true })),
      normalizeScoreFrame(raw({ Seq: 2, Id: 5, Action: 'action_discarded' })),
    ])
    const e = resolveEvent(tl, 5)!
    expect(e.discarded).toBe(true)
    expect(e.confirmed).toBe(true) // it WAS confirmed, then killed — both facts matter
  })

  it('captures action_amend', () => {
    const tl = buildTimeline(1, [
      normalizeScoreFrame(raw({ Seq: 1, Id: 5, Action: 'shot', Confirmed: true })),
      normalizeScoreFrame(raw({ Seq: 2, Id: 5, Action: 'action_amend', Data: { Action: 'shot', New: {} } })),
    ])
    expect(resolveEvent(tl, 5)!.amended).not.toBeNull()
  })

  it('returns null for an unknown event id', () => {
    expect(resolveEvent(buildTimeline(1, []), 999)).toBeNull()
  })

  it('returns null when an id has only meta frames', () => {
    const tl = buildTimeline(1, [normalizeScoreFrame(raw({ Seq: 1, Id: 5, Action: 'action_discarded' }))])
    expect(resolveEvent(tl, 5)).toBeNull()
  })

  it('keeps multiple primary actions on one id (var + var_end)', () => {
    const tl = buildTimeline(1, [
      normalizeScoreFrame(raw({ Seq: 1, Id: 300, Action: 'var', Confirmed: true })),
      normalizeScoreFrame(raw({ Seq: 2, Id: 300, Action: 'var_end', Confirmed: true })),
    ])
    expect(resolveEvent(tl, 300)!.actions).toEqual(['var', 'var_end'])
  })
})

describe('real corpus: no discarded goal was ever confirmed', () => {
  // This is the finding the whole verifier precision rests on.
  const cases: Array<[number, number]> = [
    [18209181, 495],
    [18213979, 410],
    [18213979, 490],
    [18237038, 570],
  ]
  for (const [fixtureId, eventId] of cases) {
    it(`${fixtureId} event ${eventId} is a discarded goal that never reached Confirmed:true`, () => {
      const tl = timelineFromCapture(loadFixture(CORPUS_ROOT, fixtureId), { mergeHistorical: true })
      const e = resolveEvent(tl, eventId)!
      expect(e.actions).toContain('goal')
      expect(e.discarded).toBe(true)
      expect(e.confirmed).toBe(false)
    })
  }
})

describe('allEvents', () => {
  it('resolves every event id in a timeline', () => {
    const tl = timelineFromCapture(loadFixture(CORPUS_ROOT, 18222446), { mergeHistorical: true })
    const events = allEvents(tl)
    expect(events.length).toBeGreaterThan(0)
    expect(events.every((e) => e.frames.length > 0)).toBe(true)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/timeline/events.test.ts`
Expected: FAIL — cannot resolve `events.js`.

- [ ] **Step 3: Write the implementation**

Create `src/timeline/events.ts`:

```ts
import type { Timeline, EventState, Frame } from './types.js'

/** Frames that talk ABOUT an event rather than being one. */
const META_ACTIONS = new Set(['action_discarded', 'action_amend'])

/**
 * Resolve an event id to its FINAL state.
 *
 * `confirmed` and `discarded` are independent facts: an event can be confirmed
 * and then killed, and both matter. Callers must check `discarded` — never treat
 * `confirmed: true` alone as "this happened".
 */
export function resolveEvent(tl: Timeline, eventId: number): EventState | null {
  const frames = tl.byEventId.get(eventId)
  if (!frames || frames.length === 0) return null

  const primary = frames.filter((f) => !META_ACTIONS.has(f.action))
  if (primary.length === 0) return null

  const actions: string[] = []
  for (const f of primary) if (!actions.includes(f.action)) actions.push(f.action)

  const withClock = primary.find((f) => f.clock !== null)

  return {
    eventId,
    actions,
    confirmed: primary.some((f) => f.confirmed === true),
    discarded: frames.some((f) => f.action === 'action_discarded'),
    amended: frames.find((f) => f.action === 'action_amend') ?? null,
    clock: withClock?.clock ?? null,
    participant: primary.find((f) => f.participant !== null)?.participant ?? null,
    frames,
  }
}

export function allEvents(tl: Timeline): EventState[] {
  const out: EventState[] = []
  for (const eventId of tl.byEventId.keys()) {
    const e = resolveEvent(tl, eventId)
    if (e) out.push(e)
  }
  return out.sort((a, b) => a.frames[0].seq - b.frames[0].seq)
}

/** Frames for an event, excluding meta frames. Exported for ProofCard assembly. */
export function primaryFrames(state: EventState): Frame[] {
  return state.frames.filter((f) => !META_ACTIONS.has(f.action))
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/timeline/events.test.ts`
Expected: PASS — 11 tests. The four corpus cases confirm `confirmed: false` on
every discarded goal.

- [ ] **Step 5: Commit**

```bash
git add src/timeline/events.ts tests/timeline/events.test.ts
git commit -m "feat: resolve events to their final state across the confirm cycle"
```

---

## Task 8: VAR decision extraction

**Files:**
- Create: `src/timeline/var.ts`
- Test: `tests/timeline/var.test.ts`

The most valuable structure in the feed. A VAR decision is a `var` + `var_end`
pair sharing an `Id`, **both `Confirmed: true`**.

- [ ] **Step 1: Write the failing test**

Create `tests/timeline/var.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { varDecisions } from '../../src/timeline/var.js'
import { timelineFromCapture } from '../../src/timeline/build.js'
import { loadFixture, CORPUS_ROOT } from '../../src/txline/corpus.js'

const tl = (id: number) => timelineFromCapture(loadFixture(CORPUS_ROOT, id), { mergeHistorical: true })

describe('varDecisions — all five confirmed pairs in the corpus', () => {
  it('18209181: Penalty / Stands at 1550->1582', () => {
    const d = varDecisions(tl(18209181))
    expect(d).toHaveLength(1)
    expect(d[0]).toMatchObject({ eventId: 300, type: 'Penalty', outcome: 'Stands', clockStart: 1550, clockEnd: 1582 })
  })

  it('18213979: Goal/Overturned then Penalty/Overturned', () => {
    const d = varDecisions(tl(18213979))
    expect(d).toHaveLength(2)
    expect(d[0]).toMatchObject({ eventId: 492, type: 'Goal', outcome: 'Overturned', clockStart: 3315, clockEnd: 3406 })
    expect(d[1]).toMatchObject({ eventId: 843, type: 'Penalty', outcome: 'Overturned', clockStart: 5968, clockEnd: 6071 })
  })

  it('18222446: MistakenIdentity / Overturned at 4180->4272', () => {
    const d = varDecisions(tl(18222446))
    expect(d).toHaveLength(1)
    expect(d[0]).toMatchObject({ eventId: 611, type: 'MistakenIdentity', outcome: 'Overturned', clockStart: 4180, clockEnd: 4272 })
  })

  it('18237038: Goal / Overturned at 3641->3653 (the France-Spain semi-final)', () => {
    const d = varDecisions(tl(18237038))
    expect(d).toHaveLength(1)
    expect(d[0]).toMatchObject({ eventId: 571, type: 'Goal', outcome: 'Overturned', clockStart: 3641, clockEnd: 3653 })
  })

  it('18218149 and 18241006 have no VAR decisions', () => {
    expect(varDecisions(tl(18218149))).toHaveLength(0)
    expect(varDecisions(tl(18241006))).toHaveLength(0)
  })

  it('returns decisions sorted by seqStart', () => {
    const d = varDecisions(tl(18213979))
    expect(d[0].seqStart).toBeLessThan(d[1].seqStart)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/timeline/var.test.ts`
Expected: FAIL — cannot resolve `var.js`.

- [ ] **Step 3: Write the implementation**

Create `src/timeline/var.ts`:

```ts
import type { Timeline, VarDecision } from './types.js'

/**
 * Extract confirmed VAR decisions.
 *
 * Only `Confirmed: true` frames count — an unconfirmed `var` frame carries
 * `PossibleEvent: {VAR: true}` and means "a review MIGHT be happening".
 *
 * Observed enums (small sample, n=5 — handle unknown values without crashing):
 *   type    ∈ { Goal, Penalty, MistakenIdentity }
 *   outcome ∈ { Overturned, Stands }
 */
export function varDecisions(tl: Timeline): VarDecision[] {
  const out: VarDecision[] = []

  for (const [eventId, frames] of tl.byEventId) {
    const opens = frames.filter((f) => f.action === 'var' && f.confirmed === true)
    const closes = frames.filter((f) => f.action === 'var_end' && f.confirmed === true)
    if (opens.length === 0 || closes.length === 0) continue

    const open = opens[opens.length - 1]
    const close = closes[closes.length - 1]

    const type = open.data['Type']
    const outcome = close.data['Outcome']

    out.push({
      eventId,
      type: typeof type === 'string' ? type : null,
      outcome: typeof outcome === 'string' ? outcome : null,
      clockStart: open.clock,
      clockEnd: close.clock,
      seqStart: open.seq,
      seqEnd: close.seq,
    })
  }

  return out.sort((a, b) => a.seqStart - b.seqStart)
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/timeline/var.test.ts`
Expected: PASS — 6 tests, all five corpus VAR decisions matched exactly.

- [ ] **Step 5: Commit**

```bash
git add src/timeline/var.ts tests/timeline/var.test.ts
git commit -m "feat: extract confirmed VAR decisions with type and outcome"
```

---

## Task 9: Clock window to Ts window

**Files:**
- Create: `src/timeline/clock.ts`
- Test: `tests/timeline/clock.test.ts`

**Odds frames carry `Ts` but no `Clock`.** To score a clip's clock window against
the market, the window must first be translated to wall-clock time using the score
stream. Without this the impact scorer cannot be written at all.

- [ ] **Step 1: Write the failing test**

Create `tests/timeline/clock.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { tsWindowForClock, framesInClockWindow } from '../../src/timeline/clock.js'
import { timelineFromCapture } from '../../src/timeline/build.js'
import { loadFixture, CORPUS_ROOT } from '../../src/txline/corpus.js'

const tl = (id: number) => timelineFromCapture(loadFixture(CORPUS_ROOT, id), { mergeHistorical: true })

describe('tsWindowForClock', () => {
  it('maps a clock window to a wall-clock window', () => {
    const w = tsWindowForClock(tl(18209181), 3550, 3580)!
    expect(w).not.toBeNull()
    expect(w[0]).toBeLessThanOrEqual(w[1])
    // the France-Morocco QF kicked off 2026-07-09 20:00 UTC
    expect(w[0]).toBeGreaterThan(1783627200000)
  })

  it('returns null for a window with no frames (a real feed gap)', () => {
    // NOT clock 100 — the tl() helper merges historical, which backfills 18218149
    // to clock 0. Use a verified real mid-match gap instead: [1347, 1552], 205s.
    expect(tsWindowForClock(tl(18218149), 1400, 1430)).toBeNull()
  })

  it('excludes score_adjustment frames, which report Clock 0', () => {
    // If score_adjustment leaked in, a window near 0 would match late-match Ts values.
    const w = tsWindowForClock(tl(18213979), 0, 30)
    if (w !== null) {
      const kickoff = 1783803600000
      expect(w[0]).toBeLessThan(kickoff + 10 * 60_000)
    }
  })
})

describe('framesInClockWindow', () => {
  it('finds the red card at clock 4280 in Argentina QF', () => {
    const fs = framesInClockWindow(tl(18222446), 4270, 4290)
    expect(fs.some((f) => f.action === 'red_card')).toBe(true)
  })

  it('returns an empty array for an uncovered window', () => {
    // Inside the verified 205s gap [1347, 1552] of the MERGED 18218149 timeline.
    expect(framesInClockWindow(tl(18218149), 1400, 1430)).toEqual([])
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/timeline/clock.test.ts`
Expected: FAIL — cannot resolve `clock.js`.

- [ ] **Step 3: Write the implementation**

Create `src/timeline/clock.ts`:

```ts
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/timeline/clock.test.ts`
Expected: PASS — 5 tests.

- [ ] **Step 5: Commit**

```bash
git add src/timeline/clock.ts tests/timeline/clock.test.ts
git commit -m "feat: translate match-clock windows to wall-clock Ts windows"
```

---

## Task 10: The verifier

**Files:**
- Create: `src/verify/types.ts`
- Create: `src/verify/verifier.ts`
- Test: `tests/verify/verifier.test.ts`

**Read `docs/txline-feed-analysis.md` §4.1 before writing this.**

The rule that matters: **match on the VAR pair, never on `action_discarded`
alone.** All four discarded goals in the corpus were never confirmed; two have a
VAR pair behind them and two do not. A verifier that treats every discarded goal
as "VAR disallowed it" is wrong in half the corpus cases.

**VAR context window is ±180s.** A VAR review can precede its consequence
(mistaken identity at 4180 → red card at 4280) or follow the event it kills (goal
at 3262 → VAR at 3315–3406). A 30s clip contains neither the whole review nor both
ends, so the search window extends both ways. ±180s is validated against all six
fixtures: it catches all three real VAR-goal/red-card links and correctly excludes
the two goals with no VAR (nearest VAR is 380s away).

- [ ] **Step 1: Create `src/verify/types.ts`**

```ts
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
```

- [ ] **Step 2: Write the failing test**

Create `tests/verify/verifier.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { verify } from '../../src/verify/verifier.js'
import { timelineFromCapture } from '../../src/timeline/build.js'
import { loadFixture, CORPUS_ROOT } from '../../src/txline/corpus.js'
import type { ClaimKind } from '../../src/verify/types.js'

const tl = (id: number) => timelineFromCapture(loadFixture(CORPUS_ROOT, id), { mergeHistorical: true })
const claim = (fixtureId: number, clockStart: number, clockEnd: number, kind: ClaimKind) =>
  ({ fixtureId, clockStart, clockEnd, kind })

describe('verify — positive cases', () => {
  it('mistaken identity in Argentina QF', () => {
    const r = verify(tl(18222446), claim(18222446, 4260, 4290, 'mistaken_identity'))
    expect(r.status).toBe('VERIFIED')
    expect(r.matchedEvents[0]).toMatchObject({ eventId: 611, varType: 'MistakenIdentity', varOutcome: 'Overturned' })
  })

  it('VAR-overturned goal in the France-Spain semi-final', () => {
    const r = verify(tl(18237038), claim(18237038, 3625, 3655, 'var_overturned_goal'))
    expect(r.status).toBe('VERIFIED')
    expect(r.matchedEvents[0]).toMatchObject({ eventId: 571, varType: 'Goal', varOutcome: 'Overturned' })
  })

  it('VAR-overturned goal in the England QF (VAR follows the goal)', () => {
    const r = verify(tl(18213979), claim(18213979, 3250, 3280, 'var_overturned_goal'))
    expect(r.status).toBe('VERIFIED')
    expect(r.matchedEvents[0].eventId).toBe(492)
  })

  it('VAR-overturned penalty in the England QF', () => {
    const r = verify(tl(18213979), claim(18213979, 5960, 5990, 'var_overturned_penalty'))
    expect(r.status).toBe('VERIFIED')
    expect(r.matchedEvents[0].eventId).toBe(843)
  })

  it('VAR that stands in France-Morocco', () => {
    const r = verify(tl(18209181), claim(18209181, 1540, 1590, 'var_stands'))
    expect(r.status).toBe('VERIFIED')
    expect(r.matchedEvents[0]).toMatchObject({ eventId: 300, varOutcome: 'Stands' })
  })

  it('the red card in Argentina QF', () => {
    const r = verify(tl(18222446), claim(18222446, 4265, 4295, 'red_card'))
    expect(r.status).toBe('VERIFIED')
    expect(r.matchedEvents[0]).toMatchObject({ eventId: 613, action: 'red_card' })
  })

  it('a clean confirmed goal', () => {
    const r = verify(tl(18209181), claim(18209181, 3550, 3580, 'goal'))
    expect(r.status).toBe('VERIFIED')
  })

  it('reports a seqRange on every verified claim', () => {
    const r = verify(tl(18222446), claim(18222446, 4260, 4290, 'mistaken_identity'))
    expect(r.seqRange).not.toBeNull()
    expect(r.seqRange![0]).toBeLessThanOrEqual(r.seqRange![1])
  })
})

describe('verify — coverage', () => {
  it('returns UNVERIFIABLE for a window in a feed gap', () => {
    // Verified real 205s gap [1347, 1552] in the merged 18218149 timeline.
    const r = verify(tl(18218149), claim(18218149, 1400, 1430, 'goal'))
    expect(r.status).toBe('UNVERIFIABLE')
    expect(r.reason).toMatch(/coverage/i)
  })

  it('rejects a claim for the wrong fixture', () => {
    const r = verify(tl(18222446), claim(18209181, 4260, 4290, 'mistaken_identity'))
    expect(r.status).toBe('REJECTED')
    expect(r.reason).toMatch(/fixture/i)
  })
})

describe('verify — REJECTED cases state what IS there', () => {
  it('rejects a goal claim where no goal exists and names what is', () => {
    const r = verify(tl(18209181), claim(18209181, 2000, 2030, 'goal'))
    expect(r.status).toBe('REJECTED')
    expect(r.reason.length).toBeGreaterThan(0)
  })
})
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run tests/verify/verifier.test.ts`
Expected: FAIL — cannot resolve `verifier.js`.

- [ ] **Step 4: Write the implementation**

Create `src/verify/verifier.ts`:

```ts
import type { Timeline, EventState, VarDecision } from '../timeline/types.js'
import { allEvents } from '../timeline/events.js'
import { varDecisions } from '../timeline/var.js'
import { framesInClockWindow } from '../timeline/clock.js'
import type { Claim, VerifyResult, MatchedEvent, ClaimKind } from './types.js'

/**
 * A VAR review can precede its consequence (mistaken identity 4180 -> red card
 * 4280) or follow the event it kills (goal 3262 -> VAR 3315-3406). A 30s clip
 * holds neither end, so search both directions.
 *
 * Validated on all six fixtures: catches all three real VAR links, and excludes
 * the two goals with no VAR (nearest is 380s away). Do not widen past ~200s
 * without re-running tests/verify/precision.test.ts.
 */
const VAR_CONTEXT_SEC = 180

/** Tolerance for matching a discrete event's clock to the clip window. */
const EVENT_TOL_SEC = 30

function overlaps(aStart: number, aEnd: number, bStart: number, bEnd: number): boolean {
  return aEnd >= bStart && aStart <= bEnd
}

function varInContext(
  tl: Timeline,
  claim: Claim,
  predicate: (d: VarDecision) => boolean,
): VarDecision | null {
  const lo = claim.clockStart - VAR_CONTEXT_SEC
  const hi = claim.clockEnd + VAR_CONTEXT_SEC
  for (const d of varDecisions(tl)) {
    if (!predicate(d)) continue
    const s = d.clockStart ?? d.clockEnd
    const e = d.clockEnd ?? d.clockStart
    if (s === null || e === null) continue
    if (overlaps(s, e, lo, hi)) return d
  }
  return null
}

function varMatch(d: VarDecision): MatchedEvent {
  return {
    eventId: d.eventId,
    action: 'var_end',
    clock: d.clockStart,
    seq: d.seqStart,
    confirmed: true,
    varType: d.type,
    varOutcome: d.outcome,
  }
}

function eventMatch(e: EventState): MatchedEvent {
  return {
    eventId: e.eventId,
    action: e.actions[0],
    clock: e.clock,
    seq: e.frames[0].seq,
    confirmed: e.frames.some((f) => f.confirmed === true),
  }
}

/** Events whose clock sits within the clip window (± tolerance) carrying `action`. */
function eventsWithAction(tl: Timeline, claim: Claim, action: string): EventState[] {
  const lo = claim.clockStart - EVENT_TOL_SEC
  const hi = claim.clockEnd + EVENT_TOL_SEC
  return allEvents(tl).filter(
    (e) => e.actions.includes(action) && e.clock !== null && e.clock >= lo && e.clock <= hi,
  )
}

/**
 * What each review type acts on. A review always has a subject; naming it is the
 * difference between evidence and a coincidence of timing.
 */
const VAR_SUBJECT_ACTIONS: Record<string, string[]> = {
  Goal: ['goal'],
  Penalty: ['penalty'],
  MistakenIdentity: ['yellow_card', 'red_card'],
}

/** Does the review itself fall inside the clip? Then the clip shows the review. */
function varOverlapsClip(d: VarDecision, claim: Claim): boolean {
  if (d.clockStart === null || d.clockEnd === null) return false
  return overlaps(d.clockStart, d.clockEnd, claim.clockStart, claim.clockEnd)
}

/**
 * The event the review acted on, if it sits in the clip AND is tied to the review.
 *
 * An `Overturned` review kills its subject (the subject is discarded); a `Stands`
 * review leaves it standing (not discarded). Both directions matter.
 */
function varSubjectInClip(tl: Timeline, claim: Claim, d: VarDecision): EventState | null {
  if (d.clockStart === null || d.type === null) return null
  const actions = VAR_SUBJECT_ACTIONS[d.type]
  if (!actions) return null // unknown review type — never invent a subject for it
  const mustBeDiscarded = d.outcome === 'Overturned'

  for (const action of actions) {
    const found = eventsWithAction(tl, claim, action).find(
      (e) =>
        e.discarded === mustBeDiscarded &&
        e.clock !== null &&
        Math.abs(e.clock - (d.clockStart as number)) <= VAR_CONTEXT_SEC &&
        causallyOrdered(e, d, mustBeDiscarded),
    )
    if (found) return found
  }
  return null
}

/**
 * A review cannot have caused a discard that already happened.
 *
 * The operator discards the event BECAUSE the review overturned it, so the
 * `action_discarded` must FOLLOW the `var_end` in Seq order. Holds 4/4 corpus-wide
 * with no exceptions:
 *
 *   18237038  var_end Seq 641 -> discard Seq 642   (Id 571 -> 570)
 *   18213979  var_end Seq 538 -> discard Seq 539   (Id 492 -> 490)
 *   18213979  var_end Seq 940 -> discard Seq 941   (Id 843 -> 842)
 *   18222446  var_end Seq 683 -> discard Seq 684/685
 *
 * This is causal, not pattern-matched — which is why it generalises where `Id`
 * adjacency does not (571/570 are adjacent but 492/490 are off by two, an artifact
 * of these six fixtures).
 *
 * Its value is being ORTHOGONAL to the temporal tie. 18213979's goal Id 410 @2935
 * is otherwise excluded from VAR 492 @3315 solely because 380s > VAR_CONTEXT_SEC —
 * one constant between us and a false claim. Here it is rejected a second way: the
 * discard landed ~100 frames BEFORE the review opened, so the review cannot have
 * caused it.
 *
 * Only applies to the Overturned path. A `Stands` review discards nothing (18209181
 * penalty Id 296 has no discard at all), so there is no ordering to check.
 */
function causallyOrdered(e: EventState, d: VarDecision, mustBeDiscarded: boolean): boolean {
  if (!mustBeDiscarded) return true
  const discard = e.frames.find((f) => f.action === 'action_discarded')
  if (!discard) return false
  return discard.seq > d.seqEnd
}

/**
 * Shared resolver for every VAR-backed claim.
 *
 * A VAR pair within ±180s is NOT sufficient on its own — the review may concern a
 * different incident entirely. Two corpus cases prove it:
 *
 *   18237038: goal Id 551 @3455 STOOD (confirmed, never discarded — one of Spain's
 *   two). VAR Id 571 @3641 overturned a DIFFERENT goal, Id 570 @3629. A bare-pair
 *   match publishes a clip of Spain's legitimate goal as "VAR overturned it".
 *
 *   18222446: goal Id 595 @4010 STOOD. The MistakenIdentity VAR Id 611 @4180 is
 *   170s later and concerns a card, not that goal. A bare-pair match publishes a
 *   clip of a goal that counted as "VAR found mistaken identity".
 *
 * So the claim holds only if the clip shows the review, OR shows the subject the
 * review acted on. Tie temporally, NOT by `Id` adjacency — 570/571 are adjacent
 * but 490/492 are not, so adjacency does not generalise.
 */
function verifyVarClaim(
  tl: Timeline,
  claim: Claim,
  predicate: (d: VarDecision) => boolean,
  notFoundReason: string,
): VerifyResult {
  const d = varInContext(tl, claim, predicate)
  if (!d) return no(`${notFoundReason} ${describeWindow(tl, claim)}`)

  const describe = `VAR reviewed a ${d.type ?? 'decision'} and ${
    d.outcome === 'Stands' ? 'it Stands' : `${d.outcome ?? 'resolved'} it`
  }, at clock ${d.clockStart}-${d.clockEnd}.`

  const subject = varSubjectInClip(tl, claim, d)

  // The clip shows the review itself — the claim is about the review.
  if (varOverlapsClip(d, claim)) {
    return ok(describe, subject ? [varMatch(d), eventMatch(subject)] : [varMatch(d)])
  }

  // The clip does not show the review, so it must show what the review acted on.
  if (subject) return ok(describe, [varMatch(d), eventMatch(subject)])

  return no(
    `A VAR ${d.type ?? '?'}/${d.outcome ?? '?'} decision exists at clock ${d.clockStart}, but this ` +
      `clip contains neither the review nor the event it acted on — it may concern a different ` +
      `incident. ${describeWindow(tl, claim)}`,
  )
}

function ok(reason: string, matched: MatchedEvent[]): VerifyResult {
  const seqs = matched.map((m) => m.seq)
  return {
    status: 'VERIFIED',
    reason,
    matchedEvents: matched,
    seqRange: seqs.length ? [Math.min(...seqs), Math.max(...seqs)] : null,
  }
}

const no = (reason: string): VerifyResult =>
  ({ status: 'REJECTED', reason, matchedEvents: [], seqRange: null })

const overturned = (reason: string, matched: MatchedEvent[]): VerifyResult => {
  const seqs = matched.map((m) => m.seq)
  return {
    status: 'OVERTURNED',
    reason,
    matchedEvents: matched,
    seqRange: seqs.length ? [Math.min(...seqs), Math.max(...seqs)] : null,
  }
}

/** What the feed DOES have in this window — used to make rejections useful. */
function describeWindow(tl: Timeline, claim: Claim): string {
  const NOISE = new Set([
    'possession', 'attack_possession', 'safe_possession',
    'danger_possession', 'high_danger_possession',
  ])
  const actions = [
    ...new Set(
      framesInClockWindow(tl, claim.clockStart, claim.clockEnd)
        .map((f) => f.action)
        .filter((a) => !NOISE.has(a)),
    ),
  ]
  return actions.length ? `TXLine has: ${actions.join(', ')}` : 'TXLine has only possession telemetry here'
}

/** Verify a claim against a timeline. Pure — no I/O, no clock, no randomness. */
export function verify(tl: Timeline, claim: Claim): VerifyResult {
  if (tl.fixtureId !== claim.fixtureId) {
    return no(`Claim targets fixture ${claim.fixtureId} but timeline is ${tl.fixtureId}.`)
  }

  const covered = framesInClockWindow(tl, claim.clockStart, claim.clockEnd).length > 0
  if (!covered) {
    return {
      status: 'UNVERIFIABLE',
      reason:
        `No coverage for ${claim.clockStart}-${claim.clockEnd}s on fixture ${claim.fixtureId}. ` +
        `Stream covers ${tl.coverage.minClock}-${tl.coverage.maxClock}s.`,
      matchedEvents: [],
      seqRange: null,
    }
  }

  const handlers: Record<ClaimKind, () => VerifyResult> = {
    var_overturned_goal: () => verifyVarClaim(tl, claim, (d) => d.type === 'Goal' && d.outcome === 'Overturned',
      `No VAR decision of type Goal with outcome Overturned within ${VAR_CONTEXT_SEC}s. ` +
        `A discarded goal alone does not prove VAR.`),

    var_overturned_penalty: () => verifyVarClaim(tl, claim, (d) => d.type === 'Penalty' && d.outcome === 'Overturned',
      `No VAR decision of type Penalty with outcome Overturned within ${VAR_CONTEXT_SEC}s.`),

    mistaken_identity: () => verifyVarClaim(tl, claim, (d) => d.type === 'MistakenIdentity' && d.outcome === 'Overturned',
      `No VAR decision of type MistakenIdentity within ${VAR_CONTEXT_SEC}s.`),

    var_stands: () => verifyVarClaim(tl, claim, (d) => d.outcome === 'Stands',
      `No VAR decision with outcome Stands within ${VAR_CONTEXT_SEC}s.`),

    goal_withdrawn: () => {
      const e = eventsWithAction(tl, claim, 'goal').find((x) => x.discarded)
      if (!e) return no(`No withdrawn goal in this window. ${describeWindow(tl, claim)}`)
      // True regardless of VAR. Deliberately weaker than var_overturned_goal.
      return ok(
        `A goal was reported at clock ${e.clock} and withdrawn. ` +
          `The feed does not state why — do not claim VAR or offside.`,
        [eventMatch(e)],
      )
    },

    goal: () => {
      const es = eventsWithAction(tl, claim, 'goal')
      const confirmed = es.find((e) => e.confirmed && !e.discarded)
      if (confirmed) return ok(`Confirmed goal at clock ${confirmed.clock}.`, [eventMatch(confirmed)])
      const killed = es.find((e) => e.discarded)
      if (killed) {
        return overturned(
          `A goal was reported at clock ${killed.clock} but later discarded. It did not stand.`,
          [eventMatch(killed)],
        )
      }
      return no(`No confirmed goal in this window. ${describeWindow(tl, claim)}`)
    },

    red_card: () => {
      const e = eventsWithAction(tl, claim, 'red_card').find((x) => x.confirmed && !x.discarded)
      return e
        ? ok(`Confirmed red card at clock ${e.clock}.`, [eventMatch(e)])
        : no(`No confirmed red card in this window. ${describeWindow(tl, claim)}`)
    },

    yellow_card: () => {
      // The feed tells you when it does not trust itself.
      const unreliable = framesInClockWindow(tl, claim.clockStart - EVENT_TOL_SEC, claim.clockEnd + EVENT_TOL_SEC)
        .some((f) => f.action === 'unreliable_yellow_cards')
      if (unreliable) {
        return {
          status: 'UNVERIFIABLE',
          reason: 'TXLine flagged yellow card data as unreliable in this window.',
          matchedEvents: [],
          seqRange: null,
        }
      }
      const e = eventsWithAction(tl, claim, 'yellow_card').find((x) => x.confirmed && !x.discarded)
      return e
        ? ok(`Confirmed yellow card at clock ${e.clock}.`, [eventMatch(e)])
        : no(`No confirmed yellow card in this window. ${describeWindow(tl, claim)}`)
    },

    penalty: () => {
      const e = eventsWithAction(tl, claim, 'penalty').find((x) => x.confirmed && !x.discarded)
      return e
        ? ok(`Confirmed penalty at clock ${e.clock}.`, [eventMatch(e)])
        : no(`No confirmed penalty in this window. ${describeWindow(tl, claim)}`)
    },
  }

  return handlers[claim.kind]()
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run tests/verify/verifier.test.ts`
Expected: PASS — 11 tests.

- [ ] **Step 6: Commit**

```bash
git add src/verify/types.ts src/verify/verifier.ts tests/verify/verifier.test.ts
git commit -m "feat: verify claims against a timeline, matching on the VAR pair"
```

---

## Task 11: The claim-precision tests

**Files:**
- Test: `tests/verify/precision.test.ts`

**These are the most important tests in the codebase.** No new source code — this
task exists to lock down the distinction that the whole product's credibility
rests on. Every expected value below was verified against the corpus.

If a change makes one of these fail, **the change is wrong**. Do not relax them.

- [ ] **Step 1: Write the tests**

Create `tests/verify/precision.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { verify } from '../../src/verify/verifier.js'
import { timelineFromCapture } from '../../src/timeline/build.js'
import { loadFixture, CORPUS_ROOT } from '../../src/txline/corpus.js'
import { varDecisions } from '../../src/timeline/var.js'
import { resolveEvent } from '../../src/timeline/events.js'
import type { ClaimKind } from '../../src/verify/types.js'

const tl = (id: number) => timelineFromCapture(loadFixture(CORPUS_ROOT, id), { mergeHistorical: true })
const claim = (fixtureId: number, clockStart: number, clockEnd: number, kind: ClaimKind) =>
  ({ fixtureId, clockStart, clockEnd, kind })

/**
 * All four discarded goals in the corpus were NEVER Confirmed:true.
 * Two have a VAR pair behind them; two do not.
 *
 *   fixture   goal Id  clock  VAR pair?                       claimable as
 *   18237038  570      3629   YES - Id 571 Goal/Overturned    var_overturned_goal
 *   18213979  490      3262   YES - Id 492 Goal/Overturned    var_overturned_goal
 *   18209181  495      2924   NO                              goal_withdrawn ONLY
 *   18213979  410      2935   NO                              goal_withdrawn ONLY
 *
 * A verifier matching on action_discarded alone would state something false in
 * half of these cases. That is the failure this file exists to prevent.
 */
describe('PRECISION: VAR-backed discarded goals verify as VAR overturns', () => {
  it('18237038 Id 571 — France-Spain semi-final', () => {
    expect(verify(tl(18237038), claim(18237038, 3625, 3655, 'var_overturned_goal')).status).toBe('VERIFIED')
  })

  it('18213979 Id 492 — England QF', () => {
    expect(verify(tl(18213979), claim(18213979, 3250, 3280, 'var_overturned_goal')).status).toBe('VERIFIED')
  })
})

describe('PRECISION: goals withdrawn with NO VAR must NOT verify as a VAR overturn', () => {
  it('18209181 Id 495 — REJECTED as var_overturned_goal', () => {
    const r = verify(tl(18209181), claim(18209181, 2910, 2940, 'var_overturned_goal'))
    expect(r.status).toBe('REJECTED')
    expect(r.reason).toMatch(/does not prove VAR/i)
  })

  it('18209181 Id 495 — VERIFIED as goal_withdrawn, with no claim about why', () => {
    const r = verify(tl(18209181), claim(18209181, 2910, 2940, 'goal_withdrawn'))
    expect(r.status).toBe('VERIFIED')
    expect(r.matchedEvents[0].eventId).toBe(495)
    expect(r.reason).toMatch(/does not state why/i)
  })

  it('18213979 Id 410 — REJECTED as var_overturned_goal', () => {
    expect(verify(tl(18213979), claim(18213979, 2920, 2950, 'var_overturned_goal')).status).toBe('REJECTED')
  })

  it('18213979 Id 410 — VERIFIED as goal_withdrawn', () => {
    const r = verify(tl(18213979), claim(18213979, 2920, 2950, 'goal_withdrawn'))
    expect(r.status).toBe('VERIFIED')
    expect(r.matchedEvents[0].eventId).toBe(410)
  })
})

describe('PRECISION: a review cannot have caused a discard that already happened', () => {
  it('18213979 Id 410 is excluded by Seq ordering, independently of the ±180s tie', () => {
    // Goal 410 @2935 was discarded at Seq 441; VAR 492 opened ~100 frames later.
    // The temporal tie already rejects this (380s > 180s), but that is ONE constant.
    // This must stay REJECTED even if VAR_CONTEXT_SEC were widened.
    const r = verify(tl(18213979), claim(18213979, 2920, 2950, 'var_overturned_goal'))
    expect(r.status).toBe('REJECTED')
  })

  it('every real VAR overturn has its discard AFTER the var_end', () => {
    // The causal invariant the guard encodes. If a future fixture violates it, the
    // model is wrong and this should fail loudly rather than silently reject.
    for (const [fixtureId, varEnd, goalId] of [[18237038, 571, 570], [18213979, 492, 490]] as const) {
      const t = tl(fixtureId)
      const d = varDecisions(t).find((x) => x.eventId === varEnd)!
      const discard = resolveEvent(t, goalId)!.frames.find((f) => f.action === 'action_discarded')!
      expect(discard.seq).toBeGreaterThan(d.seqEnd)
    }
  })
})

describe('PRECISION: a bare VAR pair proves nothing — EVERY handler', () => {
  // The bug class, not the bug. It was first found in var_overturned_goal; review
  // then found the identical hole in mistaken_identity and var_overturned_penalty.
  // One test per handler, each using the "clip with no subject in it" shape.

  it('mistaken_identity: a clip of the goal that STOOD (18222446 Id 595 @4010)', () => {
    // The MistakenIdentity VAR at 4180 is 170s later and concerns a CARD, not this
    // goal. Without a subject tie, this clip publishes a goal that counted as
    // "VAR found mistaken identity and overturned it".
    const r = verify(tl(18222446), claim(18222446, 4000, 4030, 'mistaken_identity'))
    expect(r.status).toBe('REJECTED')
    expect(r.reason).toMatch(/different incident/i)
  })

  it('mistaken_identity: that same clip DOES verify as a clean confirmed goal', () => {
    const r = verify(tl(18222446), claim(18222446, 4000, 4030, 'goal'))
    expect(r.status).toBe('VERIFIED')
    expect(r.matchedEvents[0].eventId).toBe(595)
  })

  it('var_overturned_penalty: a clip containing no penalty at all (18213979 @6110)', () => {
    // 40s after the review closed. Penalty Id 842 @5929 is far outside the window.
    const r = verify(tl(18213979), claim(18213979, 6110, 6140, 'var_overturned_penalty'))
    expect(r.status).toBe('REJECTED')
  })

  it('var_stands: a clip long after the reviewed penalty resolved (18209181 @1700)', () => {
    // VAR 300 @1550-1582 does not overlap, and penalty 296 @1472 is not in the clip.
    const r = verify(tl(18209181), claim(18209181, 1700, 1730, 'var_stands'))
    expect(r.status).toBe('REJECTED')
  })

  it('a Stands review still verifies when the clip SHOWS the review', () => {
    // The subject (penalty 296 @1472) sits 78s BEFORE this clip and is never
    // discarded — a review that stands kills nothing. Requiring a discarded
    // subject in-clip would wrongly reject this. The clip shows the review itself.
    const r = verify(tl(18209181), claim(18209181, 1540, 1590, 'var_stands'))
    expect(r.status).toBe('VERIFIED')
    expect(r.matchedEvents[0].varOutcome).toBe('Stands')
  })
})

describe('PRECISION: a VAR pair alone does not prove THIS goal was overturned', () => {
  // The mirror of the discard-without-VAR trap, and just as fatal.
  // 18237038 holds a goal that STOOD (Id 551 @3455, Confirmed, never discarded)
  // and a goal VAR killed (Id 570 @3629), 186s apart. A clip of the FORMER sits
  // within ±180s of the VAR at 3641. Matching on the VAR pair alone tells the
  // world Spain's legitimate goal was disallowed.
  it('18237038: a clip of the goal that STOOD must NOT verify as a VAR overturn', () => {
    const r = verify(tl(18237038), claim(18237038, 3440, 3470, 'var_overturned_goal'))
    expect(r.status).toBe('REJECTED')
    expect(r.reason).toMatch(/different incident/i)
  })

  it('18237038: that same clip DOES verify as a clean confirmed goal', () => {
    const r = verify(tl(18237038), claim(18237038, 3440, 3470, 'goal'))
    expect(r.status).toBe('VERIFIED')
    expect(r.matchedEvents[0].eventId).toBe(551)
  })

  it('a verified VAR overturn always NAMES the goal it killed', () => {
    // Evidence must contain the goal, not just the review. An evidence array with
    // no goal in it is how the bug above hid.
    const r = verify(tl(18237038), claim(18237038, 3625, 3655, 'var_overturned_goal'))
    expect(r.status).toBe('VERIFIED')
    expect(r.matchedEvents.some((e) => e.eventId === 570)).toBe(true)
  })
})

describe('PRECISION: outcome must match — Stands is not Overturned', () => {
  it('18209181 Id 300 is Penalty/Stands — REJECTED as var_overturned_penalty', () => {
    expect(verify(tl(18209181), claim(18209181, 1540, 1590, 'var_overturned_penalty')).status).toBe('REJECTED')
  })

  it('18209181 Id 300 — VERIFIED as var_stands', () => {
    const r = verify(tl(18209181), claim(18209181, 1540, 1590, 'var_stands'))
    expect(r.status).toBe('VERIFIED')
    expect(r.matchedEvents[0].varOutcome).toBe('Stands')
  })
})

describe('PRECISION: type must match', () => {
  it('a Goal review is not a MistakenIdentity review', () => {
    expect(verify(tl(18237038), claim(18237038, 3625, 3655, 'mistaken_identity')).status).toBe('REJECTED')
  })

  it('a MistakenIdentity review is not a Goal review', () => {
    expect(verify(tl(18222446), claim(18222446, 4260, 4290, 'var_overturned_goal')).status).toBe('REJECTED')
  })
})

describe('PRECISION: the VAR context window does not over-reach', () => {
  it('18213979 Id 410 @2935 does not pick up the VAR at 3315 (380s away)', () => {
    const r = verify(tl(18213979), claim(18213979, 2920, 2950, 'var_overturned_goal'))
    expect(r.status).toBe('REJECTED')
  })

  it('18209181 @2924 does not pick up the VAR at 1550 (1370s away)', () => {
    expect(verify(tl(18209181), claim(18209181, 2910, 2940, 'var_stands')).status).toBe('REJECTED')
  })
})
```

- [ ] **Step 2: Run the precision tests**

Run: `npx vitest run tests/verify/precision.test.ts`
Expected: PASS — 22 tests.

If `18213979 Id 410` verifies as `var_overturned_goal`, `VAR_CONTEXT_SEC` is too
wide. The nearest VAR is 380s away; the constant must stay well under that.

**Prove these tests can fail.** A passing guard proves nothing until you have seen
it fire. Temporarily set `VAR_CONTEXT_SEC = 400` in `src/verify/verifier.ts` and
re-run. Exactly two tests must fail — both the `18213979 Id 410` cases — because
the widened window makes a goal with no VAR behind it falsely verify as a VAR
overturn. That is the exact false claim this file exists to prevent. Revert to
`180` and confirm 12/12 green before committing.

- [ ] **Step 3: Run the whole suite**

Run: `npm test`
Expected: PASS — all tests green.

- [ ] **Step 4: Commit**

```bash
git add tests/verify/precision.test.ts
git commit -m "test: lock down claim precision — VAR pair vs bare discard"
```

---

## Task 12: The impact scorer

**Files:**
- Create: `src/score/impact.ts`
- Test: `tests/score/impact.test.ts`

**Read `docs/txline-feed-analysis.md` §7 before writing this.** Two bugs are
already known and both are locked down by the control test:

1. **Never use log-ratio on raw odds.** It explodes on longshots (9.4 → 47.9 is
   `|ln| = 1.63`) and rated a dead-quiet window 57/100. Prices are **demargined**,
   so `1000/price` is a true probability. Use **total variation distance**, bounded
   [0,1].
2. **Never mix market periods.** `MarketPeriod` is `null` (full match), `"half=1"`,
   or `"et"`, all streaming concurrently. Comparing a first-half price to a
   full-match one produced a phantom TVD of 0.367 on a window where nothing
   happened. Filter to `MarketPeriod === null && InRunning === true`.

- [ ] **Step 1: Write the failing test**

Create `tests/score/impact.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { impactScore, toProbabilities, totalVariation } from '../../src/score/impact.js'
import { timelineFromCapture } from '../../src/timeline/build.js'
import { tsWindowForClock } from '../../src/timeline/clock.js'
import { loadFixture, CORPUS_ROOT } from '../../src/txline/corpus.js'

function scoreWindow(fixtureId: number, clockStart: number, clockEnd: number) {
  const cap = loadFixture(CORPUS_ROOT, fixtureId)
  const tl = timelineFromCapture(cap, { mergeHistorical: true })
  const w = tsWindowForClock(tl, clockStart, clockEnd)!
  expect(w).not.toBeNull()
  return impactScore(cap.odds, w[0], w[1])
}

describe('toProbabilities', () => {
  it('converts x1000 odds to probabilities that sum to ~1 (demargined)', () => {
    const p = toProbabilities([1912, 2700, 9392])
    expect(p[0]).toBeCloseTo(0.523, 2)
    expect(p[0] + p[1] + p[2]).toBeCloseTo(1.0, 2)
  })
})

describe('totalVariation', () => {
  it('is 0 for identical vectors', () => {
    expect(totalVariation([0.5, 0.3, 0.2], [0.5, 0.3, 0.2])).toBe(0)
  })
  it('is bounded at 1 for disjoint vectors', () => {
    expect(totalVariation([1, 0, 0], [0, 0, 1])).toBeCloseTo(1.0, 5)
  })
})

describe('impactScore — real corpus windows', () => {
  // THE CONTROL TEST. Catches both the longshot-log bug and market-period mixing.
  it('a quiet window scores EXACTLY zero', () => {
    const r = scoreWindow(18209181, 2000, 2030)
    expect(r.tvd).toBeCloseTo(0.0, 3)
    expect(r.score).toBe(0)
  })

  it('the clean goal at 3560 scores 56', () => {
    const r = scoreWindow(18209181, 3550, 3580)
    expect(r.tvd).toBeCloseTo(0.348, 2)
    expect(r.score).toBe(56)
    expect(r.probsBefore[0]).toBeCloseTo(0.52, 1)
    expect(r.probsAfter[0]).toBeCloseTo(0.87, 1)
  })

  it('the VAR-overturned goal in France-Spain scores ~1 — the market did not move', () => {
    const r = scoreWindow(18237038, 3625, 3655)
    expect(r.tvd).toBeCloseTo(0.004, 2)
    expect(r.score).toBe(1)
  })

  it('the mistaken-identity red card scores 22', () => {
    const r = scoreWindow(18222446, 4260, 4290)
    expect(r.tvd).toBeCloseTo(0.140, 2)
    expect(r.score).toBe(22)
  })

  it('the VAR-overturned goal in the England QF scores 48', () => {
    const r = scoreWindow(18213979, 3250, 3280)
    expect(r.tvd).toBeCloseTo(0.301, 2)
    expect(r.score).toBe(48)
  })

  it('a goal for a side already at 0.86 scores lower than the first goal', () => {
    expect(scoreWindow(18209181, 3910, 3940).score).toBeLessThan(scoreWindow(18209181, 3550, 3580).score)
  })

  it('returns null-ish result when no full-match 1X2 brackets the window', () => {
    const r = impactScore([], 1000, 2000)
    expect(r.score).toBe(0)
    expect(r.evidence).toMatch(/no full-match 1X2/i)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/score/impact.test.ts`
Expected: FAIL — cannot resolve `impact.js`.

- [ ] **Step 3: Write the implementation**

Create `src/score/impact.ts`:

```ts
import type { RawOddsFrame } from '../txline/types.js'

/** Look-back before the window for the "before" price. */
const PRE_MS = 60_000
/** Look-forward after the window for the "after" price. */
const POST_MS = 120_000
/** TVD at which impact saturates. 0.5 = half the probability mass moved. */
const TVD_FULL = 0.5
/** Suspension seconds at which the suspension term saturates. */
const SUSP_FULL_SEC = 30

export interface ImpactResult {
  /** 0-100. */
  score: number
  /** Total variation distance on the 1X2 probability vector. Bounded [0,1]. */
  tvd: number
  /** Longest empty-Prices run in the window, seconds. */
  suspensionSec: number
  probsBefore: number[]
  probsAfter: number[]
  /** Human-readable arithmetic for the Proof Card. */
  evidence: string
}

/**
 * Prices are integers scaled x1000 and DEMARGINED, so 1000/price is a true
 * probability and a 1X2 triple sums to ~1.
 */
export function toProbabilities(prices: number[]): number[] {
  return prices.map((p) => 1000 / p)
}

/** 0.5 * sum|a - b|. Bounded [0,1] for probability vectors. */
export function totalVariation(a: number[], b: number[]): number {
  let sum = 0
  for (let i = 0; i < Math.min(a.length, b.length); i++) sum += Math.abs(a[i] - b[i])
  return 0.5 * sum
}

const clamp01 = (v: number) => Math.min(1, Math.max(0, v))

const EMPTY: ImpactResult = {
  score: 0, tvd: 0, suspensionSec: 0, probsBefore: [], probsAfter: [],
  evidence: 'no full-match 1X2 prices bracket this window',
}

/**
 * Market impact across a wall-clock window.
 *
 * Full-match, in-running 1X2 ONLY. `MarketPeriod` null = full match; "half=1" and
 * "et" stream concurrently and comparing across them is meaningless — it produced
 * a phantom 0.367 TVD on a window where the full-match market never moved.
 *
 * Pure. No I/O.
 */
export function impactScore(odds: RawOddsFrame[], tsStart: number, tsEnd: number): ImpactResult {
  const market = odds
    .filter(
      (o) =>
        o.SuperOddsType === '1X2_PARTICIPANT_RESULT' &&
        o.MarketPeriod === null &&
        o.InRunning === true &&
        o.Ts >= tsStart - PRE_MS &&
        o.Ts <= tsEnd + POST_MS,
    )
    .sort((a, b) => a.Ts - b.Ts)

  if (market.length === 0) return EMPTY

  // Longest run of consecutive suspended (empty Prices) messages.
  let suspensionMs = 0
  let runStart: number | null = null
  for (const o of market) {
    if (o.Prices.length === 0) {
      if (runStart === null) runStart = o.Ts
      suspensionMs = Math.max(suspensionMs, o.Ts - runStart)
    } else {
      runStart = null
    }
  }

  const priced = market.filter((o) => o.Prices.length === 3)
  const before = priced.filter((o) => o.Ts < tsStart).at(-1)
  const after = priced.find((o) => o.Ts > tsEnd)

  const suspensionSec = suspensionMs / 1000
  if (!before || !after) return { ...EMPTY, suspensionSec }

  const probsBefore = toProbabilities(before.Prices)
  const probsAfter = toProbabilities(after.Prices)
  const tvd = totalVariation(probsBefore, probsAfter)

  const score = Math.round(
    100 * (0.8 * clamp01(tvd / TVD_FULL) + 0.2 * clamp01(suspensionSec / SUSP_FULL_SEC)),
  )

  const fmt = (p: number[]) => `[${p.map((v) => v.toFixed(2)).join(',')}]`

  return {
    score,
    tvd,
    suspensionSec,
    probsBefore,
    probsAfter,
    evidence: `1X2 ${fmt(probsBefore)} -> ${fmt(probsAfter)}  TVD ${tvd.toFixed(3)}  suspended ${suspensionSec.toFixed(0)}s`,
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/score/impact.test.ts`
Expected: PASS — 10 tests.

If the control window scores above 0, check the `MarketPeriod === null` filter
first — that is the bug it is designed to catch.

- [ ] **Step 5: Commit**

```bash
git add src/score/impact.ts tests/score/impact.test.ts
git commit -m "feat: score market impact via 1X2 probability total-variation distance"
```

---

## Task 13: The controversy scorer

**Files:**
- Create: `src/score/controversy.ts`
- Test: `tests/score/controversy.test.ts`

A deterministic lookup, not a model. Impact and controversy are **separate axes**:
the France–Spain VAR overturn is impact 1, controversy 90. Collapsing them to one
number destroys the most interesting moment in the corpus.

- [ ] **Step 1: Write the failing test**

Create `tests/score/controversy.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { controversyScore } from '../../src/score/controversy.js'
import type { MatchedEvent } from '../../src/verify/types.js'

const ev = (o: Partial<MatchedEvent>): MatchedEvent =>
  ({ eventId: 1, action: 'goal', clock: 100, seq: 1, confirmed: true, ...o })

describe('controversyScore', () => {
  it('scores mistaken identity highest', () => {
    expect(controversyScore([ev({ action: 'var_end', varType: 'MistakenIdentity', varOutcome: 'Overturned' })])).toBe(100)
  })

  it('scores an overturned goal at 90', () => {
    expect(controversyScore([ev({ action: 'var_end', varType: 'Goal', varOutcome: 'Overturned' })])).toBe(90)
  })

  it('scores an overturned penalty at 85', () => {
    expect(controversyScore([ev({ action: 'var_end', varType: 'Penalty', varOutcome: 'Overturned' })])).toBe(85)
  })

  it('scores a red card at 70', () => {
    expect(controversyScore([ev({ action: 'red_card' })])).toBe(70)
  })

  it('scores a VAR that stands at 40', () => {
    expect(controversyScore([ev({ action: 'var_end', varType: 'Penalty', varOutcome: 'Stands' })])).toBe(40)
  })

  it('scores a clean goal at 10', () => {
    expect(controversyScore([ev({ action: 'goal' })])).toBe(10)
  })

  it('takes the maximum across matched events', () => {
    const score = controversyScore([
      ev({ action: 'goal' }),
      ev({ action: 'var_end', varType: 'MistakenIdentity', varOutcome: 'Overturned' }),
    ])
    expect(score).toBe(100)
  })

  it('scores an unknown VAR type conservatively rather than crashing', () => {
    // The enum sample is n=5; unknown values WILL appear in the wild.
    expect(controversyScore([ev({ action: 'var_end', varType: 'SomethingNew', varOutcome: 'Overturned' })])).toBe(75)
  })

  it('returns 0 for no events', () => {
    expect(controversyScore([])).toBe(0)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/score/controversy.test.ts`
Expected: FAIL — cannot resolve `controversy.js`.

- [ ] **Step 3: Write the implementation**

Create `src/score/controversy.ts`:

```ts
import type { MatchedEvent } from '../verify/types.js'

/**
 * Controversy score, 0-100. Deterministic lookup over the event taxonomy — not a
 * model, not a guess. Read from an enum the feed publishes.
 *
 * Separate from impact ON PURPOSE. The France-Spain VAR overturn is impact 1,
 * controversy 90: the market ignored it and the internet did not.
 */
const VAR_OVERTURNED: Record<string, number> = {
  MistakenIdentity: 100, // the referee carded the wrong player
  Goal: 90,
  Penalty: 85,
}

/** Any Overturned review we don't have a mapping for. The enum sample is small. */
const UNKNOWN_OVERTURNED = 75
const VAR_STANDS = 40

const ACTION_SCORES: Record<string, number> = {
  red_card: 70,
  score_adjustment: 60,
  yellow_card: 20,
  goal: 10,
}

function scoreOne(e: MatchedEvent): number {
  if (e.varOutcome === 'Overturned') {
    // Ternary, not `&&`. `&&` returns the falsy operand itself, so a varType of ""
    // yields "" — and `??` only catches null/undefined, so the empty string would
    // sail through as the score instead of falling back. VarDecision.type comes off
    // the wire via a `typeof === 'string'` check, so "" is reachable. Do not
    // "simplify" this back.
    return (e.varType ? VAR_OVERTURNED[e.varType] : undefined) ?? UNKNOWN_OVERTURNED
  }
  if (e.varOutcome === 'Stands') return VAR_STANDS
  return ACTION_SCORES[e.action] ?? 0
}

export function controversyScore(matched: MatchedEvent[]): number {
  let max = 0
  for (const e of matched) max = Math.max(max, scoreOne(e))
  return max
}

/** Score for a goal withdrawn with no VAR behind it. Weaker than a VAR overturn. */
export const GOAL_WITHDRAWN_SCORE = 50
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/score/controversy.test.ts`
Expected: PASS — 9 tests.

- [ ] **Step 5: Commit**

```bash
git add src/score/controversy.ts tests/score/controversy.test.ts
git commit -m "feat: score controversy from the VAR and discipline taxonomy"
```

---

## Task 14: ProofCard and content hash

**Files:**
- Create: `src/proof/card.ts`
- Test: `tests/proof/card.test.ts`

The ProofCard is what gets anchored (Plan 2) and rendered (Plan 4). Its
serialisation must be **canonical** — same inputs, same bytes, same hash, forever.

- [ ] **Step 1: Write the failing test**

Create `tests/proof/card.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { buildProofCard, canonicalise, proofHash } from '../../src/proof/card.js'
import type { ProofCard } from '../../src/proof/card.js'

const card = (): ProofCard => ({
  fixtureId: 18222446,
  clockStart: 4260,
  clockEnd: 4290,
  status: 'VERIFIED',
  claimKind: 'mistaken_identity',
  matchedEvents: [
    { eventId: 611, action: 'var_end', clock: 4180, seq: 668, confirmed: true, varType: 'MistakenIdentity', varOutcome: 'Overturned' },
  ],
  seqRange: [668, 668],
  contentHash: 'a'.repeat(64),
  impact: 22,
  controversy: 100,
  reason: 'VAR found mistaken identity and Overturned it at clock 4180-4272.',
})

describe('canonicalise', () => {
  it('is stable regardless of key insertion order', () => {
    const a = canonicalise({ b: 2, a: 1 } as never)
    const b = canonicalise({ a: 1, b: 2 } as never)
    expect(a).toBe(b)
  })

  it('produces identical output for identical cards', () => {
    expect(canonicalise(card())).toBe(canonicalise(card()))
  })
})

describe('proofHash', () => {
  it('is a 64-char lowercase hex sha256', () => {
    expect(proofHash(card())).toMatch(/^[0-9a-f]{64}$/)
  })

  it('is stable across calls', () => {
    expect(proofHash(card())).toBe(proofHash(card()))
  })

  it('changes when any field changes', () => {
    const a = proofHash(card())
    const b = proofHash({ ...card(), impact: 23 })
    expect(a).not.toBe(b)
  })

  it('changes when a matched event changes', () => {
    const mutated = card()
    mutated.matchedEvents[0].varOutcome = 'Stands'
    expect(proofHash(card())).not.toBe(proofHash(mutated))
  })
})

describe('buildProofCard', () => {
  it('assembles a card from a verify result and scores', () => {
    const c = buildProofCard({
      fixtureId: 18222446,
      clockStart: 4260,
      clockEnd: 4290,
      claimKind: 'mistaken_identity',
      contentHash: 'b'.repeat(64),
      result: {
        status: 'VERIFIED',
        reason: 'ok',
        matchedEvents: [{ eventId: 611, action: 'var_end', clock: 4180, seq: 668, confirmed: true, varType: 'MistakenIdentity', varOutcome: 'Overturned' }],
        seqRange: [668, 668],
      },
      impact: 22,
      controversy: 100,
    })
    expect(c.status).toBe('VERIFIED')
    expect(c.impact).toBe(22)
    expect(c.controversy).toBe(100)
    expect(c.seqRange).toEqual([668, 668])
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/proof/card.test.ts`
Expected: FAIL — cannot resolve `card.js`.

- [ ] **Step 3: Write the implementation**

Create `src/proof/card.ts`:

```ts
import { createHash } from 'node:crypto'
import type { MatchedEvent, VerifyResult, VerifyStatus, ClaimKind } from '../verify/types.js'

export interface ProofCard {
  fixtureId: number
  clockStart: number
  clockEnd: number
  status: VerifyStatus
  claimKind: ClaimKind
  matchedEvents: MatchedEvent[]
  /** TXLine Seq bounds of the evidence. */
  seqRange: [number, number] | null
  /** sha256 of the clip bytes. Plan 3 supplies this; Plan 1 accepts any hex. */
  contentHash: string
  impact: number
  controversy: number
  reason: string
}

/**
 * Deterministic JSON: keys sorted recursively. Same card -> same bytes -> same
 * hash, forever. Anything anchored on-chain must be reproducible by a third party.
 */
export function canonicalise(value: unknown): string {
  return JSON.stringify(sortKeys(value))
}

function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeys)
  if (value !== null && typeof value === 'object') {
    const src = value as Record<string, unknown>
    const out: Record<string, unknown> = {}
    for (const k of Object.keys(src).sort()) out[k] = sortKeys(src[k])
    return out
  }
  return value
}

/** sha256 of the canonical serialisation, lowercase hex. This is what gets anchored. */
export function proofHash(card: ProofCard): string {
  return createHash('sha256').update(canonicalise(card), 'utf8').digest('hex')
}

export interface BuildProofCardInput {
  fixtureId: number
  clockStart: number
  clockEnd: number
  claimKind: ClaimKind
  contentHash: string
  result: VerifyResult
  impact: number
  controversy: number
}

export function buildProofCard(input: BuildProofCardInput): ProofCard {
  return {
    fixtureId: input.fixtureId,
    clockStart: input.clockStart,
    clockEnd: input.clockEnd,
    status: input.result.status,
    claimKind: input.claimKind,
    matchedEvents: input.result.matchedEvents,
    seqRange: input.result.seqRange,
    contentHash: input.contentHash,
    impact: input.impact,
    controversy: input.controversy,
    reason: input.result.reason,
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/proof/card.test.ts`
Expected: PASS — 7 tests.

- [ ] **Step 5: Commit**

```bash
git add src/proof/card.ts tests/proof/card.test.ts
git commit -m "feat: build ProofCards with canonical serialisation and sha256"
```

---

## Task 15: End-to-end CLI

**Files:**
- Create: `src/cli/verify.ts`
- Test: `tests/cli/verify.test.ts`

This is the demo. It wires every pure module together over the real corpus.

- [ ] **Step 1: Write the failing test**

Create `tests/cli/verify.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { runVerify, parseArgs } from '../../src/cli/verify.js'

describe('parseArgs', () => {
  it('parses fixture, clock range and claim', () => {
    const a = parseArgs(['--fixture', '18222446', '--clock', '4260-4290', '--claim', 'mistaken_identity'])
    expect(a).toEqual({ fixtureId: 18222446, clockStart: 4260, clockEnd: 4290, claimKind: 'mistaken_identity' })
  })

  it('rejects a malformed clock range', () => {
    expect(() => parseArgs(['--fixture', '1', '--clock', 'abc', '--claim', 'goal'])).toThrow(/clock/i)
  })

  it('rejects an unknown claim kind', () => {
    expect(() => parseArgs(['--fixture', '1', '--clock', '1-2', '--claim', 'nonsense'])).toThrow(/claim/i)
  })

  it('rejects a reversed clock range', () => {
    expect(() => parseArgs(['--fixture', '1', '--clock', '100-50', '--claim', 'goal'])).toThrow(/clock/i)
  })
})

describe('runVerify — the marquee demo cases', () => {
  it('verifies the mistaken-identity red card with impact 22 and controversy 100', () => {
    const card = runVerify({ fixtureId: 18222446, clockStart: 4260, clockEnd: 4290, claimKind: 'mistaken_identity' })
    expect(card.status).toBe('VERIFIED')
    expect(card.impact).toBe(22)
    expect(card.controversy).toBe(100)
    expect(card.matchedEvents[0].eventId).toBe(611)
  })

  it('verifies the France-Spain VAR overturn: impact 1, controversy 90', () => {
    const card = runVerify({ fixtureId: 18237038, clockStart: 3625, clockEnd: 3655, claimKind: 'var_overturned_goal' })
    expect(card.status).toBe('VERIFIED')
    expect(card.impact).toBe(1)
    expect(card.controversy).toBe(90)
  })

  it('verifies the clean goal: high impact, low controversy', () => {
    const card = runVerify({ fixtureId: 18209181, clockStart: 3550, clockEnd: 3580, claimKind: 'goal' })
    expect(card.status).toBe('VERIFIED')
    expect(card.impact).toBe(56)
    expect(card.controversy).toBe(10)
  })

  it('rejects a VAR claim with no VAR behind it', () => {
    const card = runVerify({ fixtureId: 18209181, clockStart: 2910, clockEnd: 2940, claimKind: 'var_overturned_goal' })
    expect(card.status).toBe('REJECTED')
  })

  it('produces a stable sha256 on every card', () => {
    const a = runVerify({ fixtureId: 18222446, clockStart: 4260, clockEnd: 4290, claimKind: 'mistaken_identity' })
    const b = runVerify({ fixtureId: 18222446, clockStart: 4260, clockEnd: 4290, claimKind: 'mistaken_identity' })
    expect(a.hash).toBe(b.hash)
    expect(a.hash).toMatch(/^[0-9a-f]{64}$/)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/cli/verify.test.ts`
Expected: FAIL — cannot resolve `verify.js`.

- [ ] **Step 3: Write the implementation**

Create `src/cli/verify.ts`:

```ts
import { loadFixture, CORPUS_ROOT } from '../txline/corpus.js'
import { timelineFromCapture } from '../timeline/build.js'
import { tsWindowForClock } from '../timeline/clock.js'
import { verify } from '../verify/verifier.js'
import { impactScore } from '../score/impact.js'
import { controversyScore, GOAL_WITHDRAWN_SCORE } from '../score/controversy.js'
import { buildProofCard, proofHash, type ProofCard } from '../proof/card.js'
import type { ClaimKind } from '../verify/types.js'

const CLAIM_KINDS: ClaimKind[] = [
  'goal', 'var_overturned_goal', 'var_overturned_penalty', 'mistaken_identity',
  'var_stands', 'goal_withdrawn', 'red_card', 'yellow_card', 'penalty',
]

export interface CliArgs {
  fixtureId: number
  clockStart: number
  clockEnd: number
  claimKind: ClaimKind
}

export function parseArgs(argv: string[]): CliArgs {
  const get = (flag: string): string => {
    const i = argv.indexOf(flag)
    if (i === -1 || i + 1 >= argv.length) throw new Error(`missing required flag ${flag}`)
    return argv[i + 1]
  }

  const fixtureId = Number(get('--fixture'))
  if (!Number.isInteger(fixtureId)) throw new Error('--fixture must be an integer')

  const m = /^(\d+)-(\d+)$/.exec(get('--clock'))
  if (!m) throw new Error('--clock must look like START-END in seconds, e.g. 4260-4290')
  const clockStart = Number(m[1])
  const clockEnd = Number(m[2])
  if (clockEnd <= clockStart) throw new Error('--clock END must be greater than START')

  const claim = get('--claim')
  if (!CLAIM_KINDS.includes(claim as ClaimKind)) {
    throw new Error(`--claim must be one of: ${CLAIM_KINDS.join(', ')}`)
  }

  return { fixtureId, clockStart, clockEnd, claimKind: claim as ClaimKind }
}

export interface VerifiedCard extends ProofCard {
  hash: string
  impactEvidence: string
}

export function runVerify(args: CliArgs): VerifiedCard {
  const cap = loadFixture(CORPUS_ROOT, args.fixtureId)
  const tl = timelineFromCapture(cap, { mergeHistorical: true })

  const result = verify(tl, {
    fixtureId: args.fixtureId,
    clockStart: args.clockStart,
    clockEnd: args.clockEnd,
    kind: args.claimKind,
  })

  const tsWindow = tsWindowForClock(tl, args.clockStart, args.clockEnd)
  const impact = tsWindow ? impactScore(cap.odds, tsWindow[0], tsWindow[1]) : null

  const controversy =
    args.claimKind === 'goal_withdrawn' && result.status === 'VERIFIED'
      ? GOAL_WITHDRAWN_SCORE
      : controversyScore(result.matchedEvents)

  const card = buildProofCard({
    fixtureId: args.fixtureId,
    clockStart: args.clockStart,
    clockEnd: args.clockEnd,
    claimKind: args.claimKind,
    // Plan 3 supplies the real clip hash. Until then, the window identifies the moment.
    contentHash: 'x'.repeat(64),
    result,
    impact: impact?.score ?? 0,
    controversy,
  })

  return { ...card, hash: proofHash(card), impactEvidence: impact?.evidence ?? 'no odds coverage' }
}

function render(c: VerifiedCard): string {
  const lines = [
    '',
    `  ${c.status}  ${c.claimKind}`,
    `  fixture ${c.fixtureId} · clock ${c.clockStart}-${c.clockEnd}s`,
    '',
    `  ${c.reason}`,
    '',
    `  impact       ${String(c.impact).padStart(3)}   ${c.impactEvidence}`,
    `  controversy  ${String(c.controversy).padStart(3)}`,
    '',
  ]
  if (c.matchedEvents.length) {
    lines.push('  matched events')
    for (const e of c.matchedEvents) {
      const v = e.varType ? `  ${e.varType}/${e.varOutcome}` : ''
      lines.push(`    Id ${e.eventId}  ${e.action}  clock ${e.clock}  Seq ${e.seq}  confirmed=${e.confirmed}${v}`)
    }
    lines.push('')
  }
  lines.push(`  seqRange     ${c.seqRange ? c.seqRange.join('-') : 'n/a'}`)
  lines.push(`  sha256       ${c.hash}`)
  lines.push('')
  return lines.join('\n')
}

// Entry point when run via `npm run verify -- ...`
if (process.argv[1] && process.argv[1].endsWith('verify.ts')) {
  try {
    console.log(render(runVerify(parseArgs(process.argv.slice(2)))))
  } catch (e) {
    console.error(`error: ${(e as Error).message}`)
    process.exit(1)
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/cli/verify.test.ts`
Expected: PASS — 9 tests.

- [ ] **Step 5: Run the demo by hand**

Run:
```bash
npm run verify -- --fixture 18222446 --clock 4260-4290 --claim mistaken_identity
```

Expected output (hash will differ once Plan 3 supplies real clip bytes):

```
  VERIFIED  mistaken_identity
  fixture 18222446 · clock 4260-4290s

  VAR found mistaken identity and Overturned it at clock 4180-4272.

  impact        22   1X2 [0.32,0.54,0.14] -> [0.46,0.47,0.07]  TVD 0.140  suspended 0s
  controversy  100

  matched events
    Id 611  var_end  clock 4180  Seq …  confirmed=true  MistakenIdentity/Overturned

  seqRange     …
  sha256       …
```

- [ ] **Step 6: Run the rejection case by hand**

Run:
```bash
npm run verify -- --fixture 18209181 --clock 2910-2940 --claim var_overturned_goal
```
Expected: `REJECTED`, with a reason containing "A discarded goal alone does not
prove VAR." **This is the demo that proves the product is honest.**

- [ ] **Step 7: Commit**

```bash
git add src/cli/verify.ts tests/cli/verify.test.ts
git commit -m "feat: end-to-end verification CLI over the real corpus"
```

---

## Task 16: Replay server

**Files:**
- Create: `src/replay/server.ts`
- Test: `tests/replay/server.test.ts`

Re-emits the corpus as SSE so the ingest path is **protocol-identical** to live
TXLine. Going live for the final becomes a URL change plus the auth flow, not a
rewrite.

- [ ] **Step 1: Write the failing test**

Create `tests/replay/server.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { buildSseEvents, replayScript } from '../../src/replay/server.js'

describe('buildSseEvents', () => {
  it('formats an envelope as a valid SSE frame', () => {
    const out = buildSseEvents([{ id: 'a:1', data: { FixtureId: 1, Action: 'goal', Seq: 1, Ts: 1000 } }])
    expect(out[0].payload).toBe('id: a:1\ndata: {"FixtureId":1,"Action":"goal","Seq":1,"Ts":1000}\n\n')
  })

  it('preserves the SSE id as the reconnect cursor', () => {
    const out = buildSseEvents([{ id: 'bucket:7', data: { Seq: 1, Ts: 5 } as never }])
    expect(out[0].payload).toContain('id: bucket:7')
  })
})

describe('replayScript', () => {
  it('orders events by Ts and computes relative delays', () => {
    const s = replayScript([
      { id: 'a:2', data: { Ts: 3000, Seq: 2 } as never },
      { id: 'a:1', data: { Ts: 1000, Seq: 1 } as never },
    ], 1)
    expect(s[0].delayMs).toBe(0)
    expect(s[1].delayMs).toBe(2000)
  })

  it('compresses delays by the speed factor', () => {
    const s = replayScript([
      { id: 'a:1', data: { Ts: 1000, Seq: 1 } as never },
      { id: 'a:2', data: { Ts: 3000, Seq: 2 } as never },
    ], 10)
    expect(s[1].delayMs).toBe(200)
  })

  it('handles an empty capture', () => {
    expect(replayScript([], 1)).toEqual([])
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/replay/server.test.ts`
Expected: FAIL — cannot resolve `server.js`.

- [ ] **Step 3: Write the implementation**

Create `src/replay/server.ts`:

```ts
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import { loadFixture, CORPUS_ROOT } from '../txline/corpus.js'
import type { Envelope } from '../txline/types.js'

export interface SseEvent {
  id: string
  payload: string
}

export interface ScheduledEvent extends SseEvent {
  /** ms after replay start to emit this event. */
  delayMs: number
}

/** Format envelopes as SSE frames, preserving TXLine's `id` reconnect cursor. */
export function buildSseEvents<T>(envelopes: Envelope<T>[]): SseEvent[] {
  return envelopes.map((e) => ({
    id: e.id,
    payload: `id: ${e.id}\ndata: ${JSON.stringify(e.data)}\n\n`,
  }))
}

/**
 * Schedule a capture for replay, preserving the original inter-event timing.
 * `speed` compresses wall-clock: 10 replays a 90-minute match in 9 minutes.
 */
export function replayScript<T extends { Ts: number }>(
  envelopes: Envelope<T>[],
  speed: number,
): ScheduledEvent[] {
  if (envelopes.length === 0) return []
  const sorted = [...envelopes].sort((a, b) => a.data.Ts - b.data.Ts)
  const t0 = sorted[0].data.Ts
  return buildSseEvents(sorted).map((e, i) => ({
    ...e,
    delayMs: Math.round((sorted[i].data.Ts - t0) / speed),
  }))
}

/**
 * SSE server that speaks TXLine's protocol over the captured corpus.
 *
 *   GET /scores/:fixtureId?speed=10
 *   GET /odds/:fixtureId?speed=10
 *
 * The ingestor cannot tell this from the live feed — that is the entire point.
 * Swapping to live is this URL plus the auth flow.
 */
export function startReplayServer(port: number, corpusRoot = CORPUS_ROOT) {
  const server = createServer((req: IncomingMessage, res: ServerResponse) => {
    const url = new URL(req.url ?? '/', `http://localhost:${port}`)
    const m = /^\/(scores|odds)\/(\d+)$/.exec(url.pathname)
    if (!m) {
      res.writeHead(404, { 'content-type': 'text/plain' })
      res.end('usage: GET /scores/:fixtureId or /odds/:fixtureId  [?speed=N]\n')
      return
    }

    const [, stream, fixtureIdRaw] = m
    const speed = Math.max(1, Number(url.searchParams.get('speed') ?? '1'))

    let script: ScheduledEvent[]
    try {
      const cap = loadFixture(corpusRoot, Number(fixtureIdRaw))
      // Re-wrap as envelopes; the capture's own SSE ids are not retained by loadFixture,
      // so synthesise a stable cursor from Seq.
      const rows = stream === 'scores' ? cap.scores : cap.odds
      script = replayScript(rows.map((d, i) => ({ id: `replay:${i}`, data: d })), speed)
    } catch (e) {
      res.writeHead(404, { 'content-type': 'text/plain' })
      res.end(`${(e as Error).message}\n`)
      return
    }

    res.writeHead(200, {
      'content-type': 'text/event-stream',
      'cache-control': 'no-cache',
      connection: 'keep-alive',
    })

    const timers = script.map((e) => setTimeout(() => res.write(e.payload), e.delayMs))
    const done = setTimeout(() => res.end(), (script.at(-1)?.delayMs ?? 0) + 100)

    req.on('close', () => {
      for (const t of timers) clearTimeout(t)
      clearTimeout(done)
    })
  })

  server.listen(port, () => {
    console.log(`replay server on http://localhost:${port}`)
    console.log(`  GET /scores/18222446?speed=60   (Argentina QF — mistaken identity + red card)`)
    console.log(`  GET /scores/18237038?speed=60   (France 0-2 Spain — VAR overturn)`)
  })
  return server
}

if (process.argv[1] && process.argv[1].endsWith('server.ts')) {
  startReplayServer(Number(process.env.PORT ?? 8787))
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/replay/server.test.ts`
Expected: PASS — 5 tests.

- [ ] **Step 5: Verify the server by hand**

Run in one terminal: `npm run replay`
Run in another: `curl -N 'http://localhost:8787/scores/18222446?speed=600' | head -5`
Expected: SSE frames — `id: replay:0` then `data: {"FixtureId":18222446,...}`.

- [ ] **Step 6: Commit**

```bash
git add src/replay/server.ts tests/replay/server.test.ts
git commit -m "feat: replay the corpus as SSE, protocol-identical to TXLine"
```

---

## Task 17: Full suite and README

**Files:**
- Create: `README.md`

- [ ] **Step 1: Run the whole suite and typecheck**

Run: `npm test && npm run typecheck`
Expected: all tests PASS, tsc exits 0.

- [ ] **Step 2: Create `README.md`**

```markdown
# siuuu-core

The SIUUU verification engine. Turns a claim about a World Cup moment into a
ProofCard backed by TXLine data.

## Quick start

    npm install
    npm test
    npm run verify -- --fixture 18222446 --clock 4260-4290 --claim mistaken_identity

## The corpus

Six real 2026 World Cup knockout matches in `exact-match-txline-raw/txline-raw/`
— the quarter-finals and semi-finals, i.e. Spain's and Argentina's road to the
final. See `docs/txline-feed-analysis.md`.

## Demo cases

| Command | Result |
|---|---|
| `--fixture 18222446 --clock 4260-4290 --claim mistaken_identity` | VERIFIED · impact 22 · controversy 100 — the referee carded the wrong player, VAR caught it, the right player went off |
| `--fixture 18237038 --clock 3625-3655 --claim var_overturned_goal` | VERIFIED · impact 1 · controversy 90 — a goal overturned in the semi-final France lost, and the market did not care |
| `--fixture 18209181 --clock 3550-3580 --claim goal` | VERIFIED · impact 56 · controversy 10 — a clean goal: the market moved, nobody argued |
| `--fixture 18209181 --clock 2910-2940 --claim var_overturned_goal` | **REJECTED** — a goal was withdrawn here, but no VAR backs it. The feed cannot say why, so neither do we |

That last row is the product.

## Design

Every verification and scoring function is **pure** — a function of an in-memory
timeline, no I/O. The trust argument is therefore testable offline against six
real matches, deterministically.

- `tests/verify/precision.test.ts` — the claim-precision tests. `action_discarded`
  on a goal is **not** a disallowed goal; two of the four in the corpus have no VAR
  behind them. Do not weaken these.
- `tests/score/impact.test.ts` — includes a control window that must score
  **exactly 0.000**. It catches two real bugs: log-ratio on raw odds exploding on
  longshots, and full-match vs first-half market mixing.

## Replay

    npm run replay
    curl -N 'http://localhost:8787/scores/18222446?speed=60'

Speaks TXLine's SSE protocol over the capture. The ingestor cannot tell the
difference — going live is a URL plus the auth flow.
```

- [ ] **Step 3: Commit**

```bash
git add README.md
git commit -m "docs: add siuuu-core README with demo cases"
```

---

## Self-Review

**Spec coverage (Plan 1 scope only):**

| Spec section | Task |
|---|---|
| §4 step 2 Resolve (clock join) | 9 — `tsWindowForClock`, `framesInClockWindow` |
| §4 step 3 Match, `Confirmed:true` only | 10 |
| §4 step 3 final-state / discard rule | 7, 10 |
| §4 step 3 claim table | 10, 11 |
| §4 step 4 Impact | 12 |
| §4 step 4 Controversy | 13 |
| §4 step 5 ProofCard + sha256 | 14 |
| §6 replay-first, config swap | 16 |
| §6 pure verifier / scorers | 10, 12, 13 |
| §7 UNVERIFIABLE on feed gap | 10 |
| §7 `unreliable_yellow_cards` blocks card claims | 10 |
| §7 OVERTURNED on discarded backing event | 10 (`goal` handler) |
| §8 corpus as test suite | 7, 8, 10, 11, 12, 15 |
| §8 claim-precision tests | 11 |
| §8 impact control test | 12 |

**Deferred to later plans (by design):** OCR and splice detection (§4 step 1) →
Plan 3. Anchoring (§4 step 5) → Plan 2. Watermark and publish (§4 step 6) → Plan 3.
Escrow (§5) → Plan 2. Re-verify on `game_finalised` (§7) → needs the ingestor
daemon, Plan 2.

**Type consistency check:** `Frame`, `Timeline`, `EventState`, `VarDecision` are
defined once in `src/timeline/types.ts` (Task 5) and imported everywhere.
`MatchedEvent`, `Claim`, `VerifyResult`, `ClaimKind`, `VerifyStatus` are defined
once in `src/verify/types.ts` (Task 10) and consumed by `score/controversy.ts`
(Task 13) and `proof/card.ts` (Task 14). `ProofCard` is defined in
`src/proof/card.ts` and extended by `VerifiedCard` in the CLI. `CORPUS_ROOT` and
`loadFixture` come from `src/txline/corpus.ts` throughout. No name drift.

**Known deviation from spec:** the spec's §4 called for impact normalisation
"against the fixture's own distribution". Plan 1 uses absolute thresholds
(`TVD_FULL = 0.5`, `SUSP_FULL_SEC = 30`), which is simpler, avoids a two-pass over
the odds, and is validated to produce 0 on a quiet window and 56 on a goal.
Revisit only if scores cluster in practice.

---

## Execution

**Definition of done:** `npm test` green, and both demo commands in Task 15
produce the documented output — one VERIFIED with impact/controversy split, one
REJECTED because a discarded goal does not prove VAR.
