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
