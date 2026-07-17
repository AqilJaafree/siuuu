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
 * STATUS: run against SYNTHETIC frames only. Real broadcast graphics — motion,
 * compression, stylised clock faces, lower-thirds sliding over the bug — are the
 * actual test and have NOT been run. Do not read these results as proof the
 * pipeline works on real footage.
 *
 * Run: npx tsx scripts/probe-ocr.ts [image...]
 */
import { readFileSync } from 'node:fs'

const MODEL = process.env.OCR_MODEL ?? 'google/gemini-2.5-flash-lite'
const KEY = process.env.OPENROUTER_API_KEY

export interface OcrRead {
  clock: string | null
  scoreHome: number | null
  scoreAway: number | null
  teamHome: string | null
  teamAway: string | null
  confidence: number
  notes: string
}

/**
 * The refusal instruction is load-bearing, not politeness. Without "NEVER guess",
 * a vision model will happily supply a plausible clock for an unreadable frame —
 * and plausible-but-wrong is the one output this product must never produce.
 */
export const OCR_PROMPT =
  'Read the broadcast score bug in this football frame. Return ONLY strict JSON, no prose:\n' +
  '{"clock":"MM:SS"|null,"scoreHome":int|null,"scoreAway":int|null,' +
  '"teamHome":str|null,"teamAway":str|null,"confidence":0.0-1.0,"notes":str}\n' +
  'Rules: report ONLY what is legible. If a field is not visible, use null and lower confidence. ' +
  'NEVER guess or infer a plausible value - a wrong value is far worse than null.'

/** Strip markdown fences — the models wrap JSON in ```json despite being told not to. */
export function parseOcrJson(raw: string): OcrRead {
  const cleaned = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim()
  return JSON.parse(cleaned) as OcrRead
}

export async function readFrame(imagePath: string, model = MODEL): Promise<OcrRead> {
  if (!KEY) throw new Error('OPENROUTER_API_KEY not set — check .env')
  const b64 = readFileSync(imagePath).toString('base64')
  const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model,
      temperature: 0, // determinism matters — the same frame must read the same way
      messages: [{
        role: 'user',
        content: [
          { type: 'text', text: OCR_PROMPT },
          { type: 'image_url', image_url: { url: `data:image/png;base64,${b64}` } },
        ],
      }],
    }),
  })
  if (!res.ok) throw new Error(`OpenRouter ${res.status}: ${(await res.text()).slice(0, 200)}`)
  const json = await res.json() as any
  return parseOcrJson(json.choices[0].message.content)
}

/** MM:SS -> seconds, the join key to TXLine's Clock.Seconds. Null stays null. */
export function clockToSeconds(clock: string | null): number | null {
  if (clock === null) return null
  const m = /^(\d{1,3}):([0-5]\d)$/.exec(clock)
  if (!m) return null
  return Number(m[1]) * 60 + Number(m[2])
}

if (process.argv[1]?.endsWith('probe-ocr.ts')) {
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
}
