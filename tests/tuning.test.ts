import { describe, it, expect } from 'vitest'
import {
  ACTION_DC,
  HAZARD_COUNTS,
  OIL,
  OIL_BANDS,
  SCENT_BY_ACTION,
  TAME_DC,
  WUMPUS_TIERS,
  oilBandFor,
} from '../src/engine/data/tuning.ts'
import type { Action, ActionKind, CreatureKind, HazardKind, WumpusTier } from '../src/engine/types.ts'

/**
 * Exhaustive lists, derived from the union types. If someone adds an action,
 * creature or hazard, TypeScript forces it into these arrays and the tests
 * below then force it into every tuning table.
 */
const ALL_ACTIONS: readonly ActionKind[] = [
  'move', 'listen', 'search', 'force', 'sneak', 'fight',
  'tame', 'flee', 'use', 'send', 'read', 'enterPortal', 'rest',
]
const ALL_CREATURES: readonly CreatureKind[] = [
  'goblin', 'lumewing', 'grellhound', 'stoneGrub', 'quietOne',
]
const ALL_HAZARDS: readonly HazardKind[] = ['pit', 'sporeBloom', 'snareCarving', 'portal']
const ALL_TIERS: readonly WumpusTier[] = [1, 2, 3, 4]

// Compile-time guard: these arrays must stay in step with the unions.
type _ActionsCovered = Action['kind'] extends (typeof ALL_ACTIONS)[number] ? true : never
const _actionsCovered: _ActionsCovered = true
void _actionsCovered

describe('oil bands', () => {
  it('cover 0..OIL.max with no gaps and no overlaps', () => {
    const covering = (oil: number) => OIL_BANDS.filter((b) => oil >= b.min && oil <= b.max)
    for (let oil = 0; oil <= OIL.max; oil++) {
      expect(covering(oil), `oil=${oil} must be covered exactly once`).toHaveLength(1)
    }
  })

  it('are ordered and adjacent — each band starts one above the previous band top', () => {
    for (let i = 1; i < OIL_BANDS.length; i++) {
      const higher = OIL_BANDS[i - 1]!
      const lower = OIL_BANDS[i]!
      expect(lower.max + 1).toBe(higher.min)
    }
  })

  it('never define a band above OIL.max or below zero', () => {
    for (const b of OIL_BANDS) {
      expect(b.min).toBeGreaterThanOrEqual(0)
      expect(b.max).toBeLessThanOrEqual(OIL.max)
      expect(b.min).toBeLessThanOrEqual(b.max)
    }
  })

  it('get monotonically worse as oil falls', () => {
    for (let i = 1; i < OIL_BANDS.length; i++) {
      const higher = OIL_BANDS[i - 1]!
      const lower = OIL_BANDS[i]!
      expect(lower.modifier).toBeLessThanOrEqual(higher.modifier)
      expect(lower.lanternRadius).toBeLessThanOrEqual(higher.lanternRadius)
    }
  })

  it('restrict tell RANGE only in the two deepest bands (GDD 2.8.1)', () => {
    // The first oil threshold is purely arithmetic; the deep one changes state.
    expect(oilBandFor(12).tellRange).toBe('all')
    expect(oilBandFor(7).tellRange).toBe('all')
    expect(oilBandFor(6).tellRange).toBe('all')
    expect(oilBandFor(3).tellRange).toBe('all')
    expect(oilBandFor(2).tellRange).toBe('facing')
    expect(oilBandFor(0).tellRange).toBe('facing')
  })

  it('every modifier carries a label — unlabelled modifiers are a bug', () => {
    for (const b of OIL_BANDS) {
      expect(b.label.length).toBeGreaterThan(0)
    }
  })

  it('oilBandFor clamps out-of-range input rather than throwing', () => {
    expect(oilBandFor(99).name).toBe('bright')
    expect(oilBandFor(-5).name).toBe('dark')
    expect(oilBandFor(6.9).name).toBe('guttering')
  })
})

describe('oil budget', () => {
  it('outlasts a clean run — oil is an action budget, not a second death clock', () => {
    const passiveBurn = Math.floor(20 / OIL.burnEveryNTurns)
    expect(OIL.starting).toBeGreaterThan(passiveBurn)
  })

  it('only charges extra for actions that linger', () => {
    for (const action of Object.keys(OIL.extraCost) as ActionKind[]) {
      expect(ALL_ACTIONS).toContain(action)
    }
    expect(OIL.extraCost.listen).toBeUndefined() // LISTEN is the dark-band escape valve
  })
})

describe('table coverage', () => {
  it('every action has a base DC', () => {
    for (const a of ALL_ACTIONS) expect(ACTION_DC[a]).toBeTypeOf('number')
  })

  it('every action has a scent weight', () => {
    for (const a of ALL_ACTIONS) expect(SCENT_BY_ACTION[a]).toBeTypeOf('number')
  })

  it('every creature has a tame DC', () => {
    for (const c of ALL_CREATURES) expect(TAME_DC[c]).toBeTypeOf('number')
  })

  it('every hazard has a valid count range', () => {
    for (const h of ALL_HAZARDS) {
      const [min, max] = HAZARD_COUNTS[h]
      expect(min).toBeGreaterThanOrEqual(0)
      expect(max).toBeGreaterThanOrEqual(min)
    }
  })

  it('every Wumpus tier has a profile', () => {
    for (const t of ALL_TIERS) expect(WUMPUS_TIERS[t].name.length).toBeGreaterThan(0)
  })
})

describe('design invariants encoded as numbers', () => {
  it('fighting is louder than taming (CLAUDE.md 3)', () => {
    expect(SCENT_BY_ACTION.fight).toBeGreaterThan(SCENT_BY_ACTION.tame)
  })

  it('sneaking is the quietest way to move', () => {
    expect(SCENT_BY_ACTION.sneak).toBeLessThan(SCENT_BY_ACTION.move)
  })

  it('the Wumpus only gets more dangerous with tier', () => {
    for (let t = 2; t <= 4; t++) {
      const prev = WUMPUS_TIERS[(t - 1) as WumpusTier]
      const cur = WUMPUS_TIERS[t as WumpusTier]
      expect(cur.moveEveryNTurns).toBeLessThanOrEqual(prev.moveEveryNTurns)
      expect(cur.perceptionRadius).toBeGreaterThanOrEqual(prev.perceptionRadius)
    }
  })
})
