/**
 * Vision-LLM OCR of a broadcast score bug.
 *
 * Promoted verbatim from scripts/probe-ocr.ts after the probe was run against a
 * real World Cup clip. The probe's finding, which shapes this whole module: the
 * broadcast bug on that clip carries NO CLOCK — it reads `FRA 1 | 0 MAR` and
 * nothing else, and the model correctly returned `clock: null` on all 7 frames
 * rather than inventing one. The clock cannot be assumed to exist on real
 * footage; see src/timeline/transition.ts for the join that works without it.
 */
import { readFileSync } from 'node:fs'

/**
 * Tested against google/gemini-2.5-flash-lite: identical reads to full flash at
 * a third of the price. Override with OCR_MODEL.
 */
export const MODEL = process.env.OCR_MODEL ?? 'google/gemini-2.5-flash-lite'

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
 *
 * Verified behaviour: on a frame with no scoreboard it returns
 * `clock: null, confidence: 0.0`; on an occluded clock it returns `clock: null`
 * but still reads the score. That refusal is why an LLM is acceptable here at
 * all. DO NOT EDIT this string without re-running those probes.
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
  const key = process.env.OPENROUTER_API_KEY
  if (!key) throw new Error('OPENROUTER_API_KEY not set — check .env')
  const b64 = readFileSync(imagePath).toString('base64')
  const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
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
  const json = await res.json() as { choices: { message: { content: string } }[] }
  return parseOcrJson(json.choices[0].message.content)
}

/** MM:SS -> seconds, the join key to TXLine's Clock.Seconds. Null stays null. */
export function clockToSeconds(clock: string | null): number | null {
  if (clock === null) return null
  const m = /^(\d{1,3}):([0-5]\d)$/.exec(clock)
  if (!m) return null
  return Number(m[1]) * 60 + Number(m[2])
}
