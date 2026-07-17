import { describe, it, expect } from 'vitest'
import { parseOcrJson, clockToSeconds, OCR_PROMPT } from '../../src/ocr/read.js'

describe('OCR_PROMPT', () => {
  it('still carries the refusal instruction', () => {
    // Load-bearing, not politeness. Without it the model invents a plausible
    // clock for an unreadable frame — the one output this product cannot make.
    // If this test fails, someone "tidied" the prompt; re-run the probes.
    expect(OCR_PROMPT).toContain('NEVER guess')
    expect(OCR_PROMPT).toContain('a wrong value is far worse than null')
  })
})

describe('parseOcrJson', () => {
  it('parses a bare JSON read', () => {
    const r = parseOcrJson('{"clock":"47:12","scoreHome":1,"scoreAway":0,' +
      '"teamHome":"FRA","teamAway":"MAR","confidence":0.9,"notes":""}')
    expect(r.clock).toBe('47:12')
    expect(r.scoreHome).toBe(1)
  })

  it('strips the markdown fence the models add despite being told not to', () => {
    const r = parseOcrJson('```json\n{"clock":null,"scoreHome":2,"scoreAway":0,' +
      '"teamHome":"FRA","teamAway":"MAR","confidence":0.85,"notes":"no clock on bug"}\n```')
    expect(r.clock).toBeNull()
    expect(r.scoreHome).toBe(2)
    expect(r.notes).toBe('no clock on bug')
  })

  it('preserves a full refusal (no scoreboard in frame)', () => {
    const r = parseOcrJson('{"clock":null,"scoreHome":null,"scoreAway":null,' +
      '"teamHome":null,"teamAway":null,"confidence":0.0,"notes":"no score bug visible"}')
    expect(r.confidence).toBe(0)
    expect(r.scoreHome).toBeNull()
  })
})

describe('clockToSeconds', () => {
  it('converts MM:SS to the TXLine join key', () => {
    expect(clockToSeconds('65:22')).toBe(3922) // the France-Morocco second goal
    expect(clockToSeconds('0:00')).toBe(0)
    expect(clockToSeconds('59:59')).toBe(3599)
  })

  it('keeps null as null — a refusal must not become a number', () => {
    expect(clockToSeconds(null)).toBeNull()
  })

  it('returns null for malformed clocks rather than a plausible number', () => {
    expect(clockToSeconds('65:99')).toBeNull() // 99 seconds is not a clock
    expect(clockToSeconds('47')).toBeNull()
    expect(clockToSeconds('')).toBeNull()
    expect(clockToSeconds('4712')).toBeNull()
  })
})
