import { describe, it, expect } from 'vitest'
import { controversyScore } from '../../src/score/controversy.js'
import type { MatchedEvent } from '../../src/verify/types.js'

const ev = (o: Partial<MatchedEvent>): MatchedEvent =>
  ({ eventId: 1, action: 'goal', clock: 100, seq: 1, confirmed: true, ...o })

describe('controversyScore', () => {
  it('scores mistaken identity highest', () => {
    expect(controversyScore([ev({ action: 'var_end', varType: 'MistakenIdentity', varOutcome: 'Overturned' })])).toBe(100)
  })

  it('scores an overturned goal at 90', () => {
    expect(controversyScore([ev({ action: 'var_end', varType: 'Goal', varOutcome: 'Overturned' })])).toBe(90)
  })

  it('scores an overturned penalty at 85', () => {
    expect(controversyScore([ev({ action: 'var_end', varType: 'Penalty', varOutcome: 'Overturned' })])).toBe(85)
  })

  it('scores a red card at 70', () => {
    expect(controversyScore([ev({ action: 'red_card' })])).toBe(70)
  })

  it('scores a VAR that stands at 40', () => {
    expect(controversyScore([ev({ action: 'var_end', varType: 'Penalty', varOutcome: 'Stands' })])).toBe(40)
  })

  it('scores a clean goal at 10', () => {
    expect(controversyScore([ev({ action: 'goal' })])).toBe(10)
  })

  it('takes the maximum across matched events', () => {
    const score = controversyScore([
      ev({ action: 'goal' }),
      ev({ action: 'var_end', varType: 'MistakenIdentity', varOutcome: 'Overturned' }),
    ])
    expect(score).toBe(100)
  })

  it('scores an unknown VAR type conservatively rather than crashing', () => {
    // The enum sample is n=5; unknown values WILL appear in the wild.
    expect(controversyScore([ev({ action: 'var_end', varType: 'SomethingNew', varOutcome: 'Overturned' })])).toBe(75)
  })

  it('returns 0 for no events', () => {
    expect(controversyScore([])).toBe(0)
  })
})
