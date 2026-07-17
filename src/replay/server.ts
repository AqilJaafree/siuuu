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
