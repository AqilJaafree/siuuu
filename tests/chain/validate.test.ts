import { describe, it, expect } from 'vitest'
import { toBytes32, toProofNodes, shapeValidation } from '../../src/chain/validate.js'

describe('toBytes32', () => {
  it('accepts base64, hex, and byte arrays', () => {
    expect(toBytes32(Buffer.alloc(32).toString('base64'))).toHaveLength(32)
    expect(toBytes32('0x' + '00'.repeat(32))).toHaveLength(32)
    expect(toBytes32(new Uint8Array(32))).toHaveLength(32)
    // Proof hashes arrive as byte ARRAYS, not strings — the gap the probe found.
    expect(toBytes32(new Array(32).fill(7))).toHaveLength(32)
  })

  it('rejects the wrong length loudly rather than truncating', () => {
    expect(() => toBytes32(Buffer.alloc(16).toString('base64'))).toThrow(/32 bytes/)
  })
})

describe('toProofNodes', () => {
  it('preserves sibling orientation', () => {
    const nodes = toProofNodes([{ hash: Buffer.alloc(32).toString('base64'), isRightSibling: true }])
    expect(nodes[0].isRightSibling).toBe(true)
    expect(nodes[0].hash).toHaveLength(32)
  })
})

describe('shapeValidation', () => {
  it('shapes an API response into program args', () => {
    const shaped = shapeValidation({
      summary: {
        fixtureId: 18222446,
        updateStats: { updateCount: 3, minTimestamp: 1783823571727, maxTimestamp: 1783823571727 },
        eventStatsSubTreeRoot: Buffer.alloc(32).toString('base64'),
      },
      subTreeProof: [], mainTreeProof: [], statProof: [],
      statToProve: { key: 6, value: 1 },
      eventStatRoot: Buffer.alloc(32).toString('base64'),
    })
    expect(shaped.fixtureSummary.fixtureId.toString()).toBe('18222446')
    expect(shaped.stat1.eventStatRoot).toHaveLength(32)
  })
})

// Integration — needs credentials. Skipped unless SIUUU_API_TOKEN is set.
// Requires SIUUU_JWT too (the guest JWT the API token was activated against) and a
// local keypair at ~/.config/solana/id.json. The full acquire-credentials flow lives
// in scripts/probe-stat-validation.ts, which runs this end to end on devnet.
//
// statKey 6, NOT 2006: the live sweep reports 2006 EMPTY. See src/chain/statkey.ts.
describe.skipIf(!process.env.SIUUU_API_TOKEN)('validateStat (live)', () => {
  it('proves the red card in 18222446 on-chain', async () => {
    const { validateStatOnChain, loadProgram, makeFetchValidation } = await import(
      '../../src/chain/validate.js'
    )
    const ok = await validateStatOnChain(
      {
        network: 'devnet', fixtureId: 18222446, seq: 687, statKey: 6,
        predicate: { threshold: 0, comparison: 'greaterThan' },
      },
      {
        program: await loadProgram('devnet'),
        fetchValidation: makeFetchValidation({
          jwt: process.env.SIUUU_JWT!,
          apiToken: process.env.SIUUU_API_TOKEN!,
        }),
      },
    )
    expect(ok).toBe(true)
  }, 60_000)
})
