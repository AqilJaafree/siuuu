import { describe, it, expect } from 'vitest'
import { CONFIG, pdas } from '../../src/chain/config.js'

describe('CONFIG', () => {
  it('never mixes networks — every field agrees', () => {
    expect(CONFIG.mainnet.apiOrigin).toContain('txline.txodds.com')
    expect(CONFIG.mainnet.apiOrigin).not.toContain('dev')
    expect(CONFIG.devnet.apiOrigin).toContain('txline-dev')
    expect(CONFIG.mainnet.rpcUrl).toContain('mainnet-beta')
    expect(CONFIG.devnet.rpcUrl).toContain('devnet')
  })

  it('carries the documented program ids', () => {
    expect(CONFIG.mainnet.programId).toBe('9ExbZjAapQww1vfcisDmrngPinHTEfpjYRWMunJgcKaA')
    expect(CONFIG.devnet.programId).toBe('6pW64gN1s2uqjHkn1unFeEjAwJkPGHoppGvS715wyP2J')
  })

  it('derives the daily scores root PDA from an epoch day', () => {
    // 2026-07-14, the France-Spain semi-final
    const epochDay = Math.floor(Date.UTC(2026, 6, 14) / 86_400_000)
    const pda = pdas('devnet').dailyScoresRoots(epochDay)
    expect(pda.toBase58()).toMatch(/^[1-9A-HJ-NP-Za-km-z]{32,44}$/)
  })

  it('derives the same PDA for the same day, a different one for another', () => {
    const p = pdas('devnet')
    expect(p.dailyScoresRoots(20649).toBase58()).toBe(p.dailyScoresRoots(20649).toBase58())
    expect(p.dailyScoresRoots(20649).toBase58()).not.toBe(p.dailyScoresRoots(20650).toBase58())
  })
})
