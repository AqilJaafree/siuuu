/**
 * Probe: can a vision LLM read a broadcast score bug, and — more importantly —
 * does it REFUSE TO GUESS when it can't?
 *
 * The second question is the one that matters. SIUUU's whole claim is that it
 * never states something untrue. An OCR that confidently invents "47:12" on an
 * unreadable frame is the exact failure this product cannot survive. A model that
 * returns null is useless-but-honest; a model that hallucinates is worse than no
 * model at all.
 *
 * Mitigation beyond the model: the verifier cross-checks OCR against TXLine on TWO
 * independent signals (clock AND score), so a hallucinated clock must also come
 * with a hallucinated score that happens to match the feed's real state at exactly
 * that clock. It won't. OCR error degrades to REJECTED, not to a false claim.
 *
 * STATUS: run against synthetic frames AND against a real World Cup clip
 * (France 2-0 Morocco, fixture 18209181). The real clip's finding: the broadcast
 * bug has NO CLOCK at all, and the model returned `clock: null` on all 7 frames
 * rather than inventing one. The logic this probe exercised now lives in
 * src/ocr/read.ts; see scripts/probe-clip.ts for the clockless join.
 *
 * Run: npx tsx scripts/probe-ocr.ts [image...]
 */
import { readFrame, clockToSeconds } from '../src/ocr/read.js'

const files = process.argv.slice(2)
if (files.length === 0) {
  console.error('usage: npx tsx scripts/probe-ocr.ts <image.png> [more.png...]')
  process.exit(1)
}
for (const f of files) {
  try {
    const r = await readFrame(f)
    console.log(`\n${f}`)
    console.log(`  clock ${r.clock ?? 'null'} (${clockToSeconds(r.clock) ?? '-'}s)  ` +
      `score ${r.scoreHome ?? '-'}-${r.scoreAway ?? '-'}  ${r.teamHome ?? '?'}/${r.teamAway ?? '?'}  ` +
      `conf ${r.confidence}`)
    if (r.notes) console.log(`  notes: ${r.notes}`)
  } catch (e) {
    console.log(`\n${f}\n  FAILED: ${(e as Error).message}`)
  }
}
