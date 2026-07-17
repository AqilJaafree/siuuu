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
