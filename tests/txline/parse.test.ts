import { describe, it, expect } from 'vitest'
import { parseNdjson, parseHistorical } from '../../src/txline/parse.js'
import type { RawScoreFrame } from '../../src/txline/types.js'

describe('parseNdjson', () => {
  it('parses one envelope per line', () => {
    const text = '{"id":"a:1","data":{"FixtureId":1,"Action":"goal","Seq":1,"Ts":100}}\n' +
                 '{"id":"a:2","data":{"FixtureId":1,"Action":"corner","Seq":2,"Ts":200}}'
    const out = parseNdjson<RawScoreFrame>(text)
    expect(out).toHaveLength(2)
    expect(out[0].id).toBe('a:1')
    expect(out[0].data.Action).toBe('goal')
    expect(out[1].data.Seq).toBe(2)
  })

  it('ignores blank lines and trailing newline', () => {
    const text = '{"id":"a:1","data":{"FixtureId":1,"Action":"goal","Seq":1,"Ts":100}}\n\n\n'
    expect(parseNdjson<RawScoreFrame>(text)).toHaveLength(1)
  })

  it('throws with the line number on malformed input', () => {
    const text = '{"id":"a:1","data":{}}\nNOT JSON'
    expect(() => parseNdjson(text)).toThrow(/line 2/)
  })
})

describe('parseHistorical', () => {
  it('strips the SSE `data: ` prefix and parses each line', () => {
    const text = 'data: {"FixtureId":18209181,"Action":"kickoff","Seq":1,"Ts":100}\n' +
                 'data: {"FixtureId":18209181,"Action":"goal","Seq":2,"Ts":200}'
    const out = parseHistorical(text)
    expect(out).toHaveLength(2)
    expect(out[0].Action).toBe('kickoff')
    expect(out[1].Seq).toBe(2)
  })

  it('ignores non-data SSE lines (id:, event:, comments, blanks)', () => {
    const text = 'id: 123\n' +
                 ': keepalive\n' +
                 'event: score\n' +
                 '\n' +
                 'data: {"FixtureId":1,"Action":"goal","Seq":1,"Ts":100}\n'
    expect(parseHistorical(text)).toHaveLength(1)
  })
})
