import { describe, it, expect } from 'vitest'
import { statKeyFor, PROVABLE_CLAIMS } from '../../src/chain/statkey.js'

describe('statKeyFor — totals, not period-prefixed', () => {
  it('red card, participant 2 -> 6 (verified against the live endpoint)', () => {
    expect(statKeyFor('red_card', 2)).toBe(6)
  })

  it('red card, participant 1 -> 5', () => {
    expect(statKeyFor('red_card', 1)).toBe(5)
  })

  it('goal -> 1 / 2', () => {
    expect(statKeyFor('goal', 1)).toBe(1)
    expect(statKeyFor('goal', 2)).toBe(2)
  })

  it('yellow card -> 3 / 4', () => {
    expect(statKeyFor('yellow_card', 1)).toBe(3)
    expect(statKeyFor('yellow_card', 2)).toBe(4)
  })

  it('never returns a period-prefixed key', () => {
    // 2006 is what the docs imply and the live endpoint reports it EMPTY.
    // If this ever returns > 8, the period encoding has crept back in.
    for (const kind of ['goal', 'yellow_card', 'red_card'] as const) {
      for (const p of [1, 2] as const) {
        expect(statKeyFor(kind, p)!).toBeLessThanOrEqual(8)
      }
    }
  })

  it('returns null for claims with no Merkle-backed stat', () => {
    // The point of this module. There is no statKey for a VAR decision.
    expect(statKeyFor('var_overturned_goal', 1)).toBeNull()
    expect(statKeyFor('mistaken_identity', 1)).toBeNull()
    expect(statKeyFor('var_stands', 1)).toBeNull()
    expect(statKeyFor('goal_withdrawn', 1)).toBeNull()
  })
})

describe('PROVABLE_CLAIMS', () => {
  it('names exactly the claims a Merkle proof can back', () => {
    expect([...PROVABLE_CLAIMS].sort()).toEqual(['goal', 'red_card', 'yellow_card'])
  })
})
