/**
 * Probe: can a real clip with NO CLOCK on the score bug still be pinned to a
 * moment in the feed?
 *
 * The whole design assumed the match clock was the join key. Real footage killed
 * that assumption — the France-Morocco broadcast bug reads `FRA 1 | 0 MAR` and
 * carries no clock at all. This probe runs the replacement join end to end:
 *
 *   clip -> ffmpeg frames -> vision OCR -> score transition -> feed clock
 *
 * It deliberately does NOT call the verifier. It prints the clock window it
 * would claim, and stops. If that window is wrong, the failure should be visible
 * here rather than laundered through a VERIFIED status.
 *
 * Run: set -a; . ./.env; set +a
 *      npx tsx scripts/probe-clip.ts ~/Downloads/france-score-vs-morocco 18209181
 */
import { readClipFrames } from '../src/ocr/readClip.js'
import { transitionFromReads, matchTransition } from '../src/timeline/transition.js'
import { timelineFromCapture } from '../src/timeline/build.js'
import { loadFixture, CORPUS_ROOT } from '../src/txline/corpus.js'

/** Half-width of the claimed clock window, seconds. The feed stamps a goal at a
 *  single second; the clip around it spans a few. */
const PAD_SEC = 15

const [videoPath, fixtureArg] = process.argv.slice(2)
if (!videoPath || !fixtureArg) {
  console.error('usage: npx tsx scripts/probe-clip.ts <video> <fixtureId>')
  process.exit(1)
}
const fixtureId = Number(fixtureArg)

console.log(`clip     ${videoPath}`)
console.log(`fixture  ${fixtureId}`)

const clip = await readClipFrames(videoPath)
console.log(`\n--- OCR (${clip.length} frames) ---`)
for (const { framePath, read: r } of clip) {
  console.log(
    `  ${framePath.split('/').pop()}  clock ${String(r.clock ?? 'null').padEnd(6)} ` +
    `score ${r.scoreHome ?? '-'}-${r.scoreAway ?? '-'}  ` +
    `${r.teamHome ?? '?'}/${r.teamAway ?? '?'}  conf ${r.confidence}`,
  )
}

const reads = clip.map((c) => c.read)
const withClock = reads.filter((r) => r.clock !== null).length
console.log(`\nframes reporting a clock: ${withClock}/${reads.length}` +
  (withClock === 0 ? '  <- no clock on the bug; the clock join is unavailable' : ''))

const t = transitionFromReads(reads)
if (t === null) {
  console.log('\ntransition: NONE OBSERVED — the score never changed across this clip.')
  console.log('            Nothing to join on. Caller must NEEDS_REVIEW, not guess.')
  process.exit(0)
}
console.log(`\ntransition observed: ${t.from.join('-')} -> ${t.to.join('-')}`)

const tl = timelineFromCapture(loadFixture(CORPUS_ROOT, fixtureId), { mergeHistorical: true })
const m = matchTransition(tl, t)

switch (m.kind) {
  case 'UNIQUE':
    console.log(`match: UNIQUE  clock ${m.clock}  seq ${m.seq}`)
    console.log(`\nwould claim window: [${m.clock - PAD_SEC}, ${m.clock + PAD_SEC}] ` +
      `(clock ${m.clock} +/- ${PAD_SEC}s)`)
    break
  case 'AMBIGUOUS':
    console.log(`match: AMBIGUOUS  occurs ${m.clocks.length} times at [${m.clocks.join(', ')}]`)
    console.log('\nwould claim NOTHING. Caller must NEEDS_REVIEW.')
    break
  case 'NONE':
    console.log('match: NONE — this transition never happened in this fixture.')
    console.log('\nwould claim NOTHING. Caller must REJECT.')
    break
}
