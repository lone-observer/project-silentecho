import { describe, it, expect } from 'vitest'
import {
  ACTION_DC,
  BAND_OIL_MULTIPLIER,
  DIFFICULTY,
  HAZARD_COUNTS,
  OIL,
  OIL_BANDS,
  OIL_PRICE,
  oilCostFor,
  RUN,
  SCENT_BY_ACTION,
  TAME_DC,
  wumpusReach,
  WUMPUS_TIERS,
  oilBandFor,
} from '../src/engine/data/tuning.ts'
import type { Action, ActionKind, CreatureKind, HazardKind, WumpusTier } from '../src/engine/types.ts'
import { BAND_ORDER } from '../src/engine/types.ts'

/**
 * Exhaustive lists, derived from the union types. If someone adds an action,
 * creature or hazard, TypeScript forces it into these arrays and the tests
 * below then force it into every tuning table.
 */
const ALL_ACTIONS = [
  'move', 'focus', 'search', 'force', 'endure', 'avoid', 'dodge', 'disarm',
  'sneak', 'fight', 'tame', 'flee', 'use', 'send', 'enterPortal', 'rest',
  'dropHeart',
] as const
const ALL_CREATURES: readonly CreatureKind[] = [
  'goblin', 'lumewing', 'grellhound', 'quietOne',
]
const ALL_HAZARDS: readonly HazardKind[] = ['pit', 'sporeBloom', 'snareCarving', 'portal']
const ALL_TIERS: readonly WumpusTier[] = [1, 2, 3, 4]

// Compile-time guard: these arrays must stay in step with the unions.
//
// `ALL_ACTIONS` IS `as const` AND NOT `readonly ActionKind[]`, AND THAT IS THE
// WHOLE POINT. Annotating it as `readonly ActionKind[]` makes
// `(typeof ALL_ACTIONS)[number]` evaluate to `ActionKind` itself, so the
// assertion below reads `ActionKind extends ActionKind` and holds no matter
// what the array contains. This file shipped that way from 1a: the array named
// thirteen verbs, 1g added `endure`, `avoid` and `dodge` to the union, and this
// compiled clean against a list naming none of them — which meant the three
// coverage tests below silently stopped checking the three newest verbs against
// `ACTION_DC` and `SCENT_BY_ACTION`.
//
// Same defect, same fix, as `tests/outcomes.test.ts` (1g). The second assertion
// is what makes it bite in both directions: the first says every `ActionKind`
// is listed, the second says nothing is listed that is not an `ActionKind`, so
// neither a missing verb nor a typo'd one compiles.
type _ActionsCovered = Action['kind'] extends (typeof ALL_ACTIONS)[number] ? true : never
const _actionsCovered: _ActionsCovered = true
void _actionsCovered

const _actionsReal: readonly ActionKind[] = ALL_ACTIONS
void _actionsReal

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

  // The tell-range test that stood here is gone with the mechanism it guarded:
  // `OilBand.tellRange` restricted Ember and Dark to the facing doorway, and
  // FOCUS replaced it outright on 18 Sep 2026 (GDD 2.8.1). What replaces the
  // test is the FOCUS-cap coverage further down, which checks the thing that
  // now gates information.

  it('never gate INFORMATION on oil — only the roll and the lantern (GDD 2.8.1)', () => {
    // The surviving half of the darkness decision, as an assertion rather than a
    // comment. Oil may make you worse at things and may shrink what you can see
    // in the diorama; it may not decide what a doorway is willing to tell you.
    // If a band ever grows a field that gates a tell, this fails.
    for (const b of OIL_BANDS) {
      expect(Object.keys(b).sort()).toEqual(
        ['label', 'lanternRadius', 'max', 'min', 'modifier', 'name'],
      )
    }
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

describe('the oil price model (GDD 2.6, 2.8.1)', () => {
  it('prices every action', () => {
    for (const a of ALL_ACTIONS) expect(OIL_PRICE[a]).toBeTypeOf('number')
  })

  it('charges more for a worse roll, all the way down', () => {
    // The shape of "cost is margin, not injury". Monotone, with no flat spot in
    // the middle where a worse roll stopped costing more.
    for (let i = 1; i < BAND_ORDER.length; i++) {
      const worse = BAND_ORDER[i - 1]!
      const better = BAND_ORDER[i]!
      expect(BAND_OIL_MULTIPLIER[worse]).toBeGreaterThan(BAND_OIL_MULTIPLIER[better])
    }
  })

  it('pays a little back at the top two bands and nowhere else', () => {
    expect(BAND_OIL_MULTIPLIER.strongSuccess).toBeLessThan(0)
    expect(BAND_OIL_MULTIPLIER.criticalSuccess).toBeLessThan(0)
    for (const band of ['criticalFailure', 'failure', 'mixed', 'success'] as const) {
      expect(BAND_OIL_MULTIPLIER[band]).toBeGreaterThan(0)
    }
  })

  /**
   * THE ANTI-FARMING INVARIANT, and the one test in this file worth breaking on
   * purpose to check.
   *
   * 1g's first reward model paid a whole flask at mixed-or-better, measured at
   * +1.75 oil per bloom — every hazard in the labyrinth an oil farm. That was
   * fixed by moving the gate to a rarer band, which works until someone widens
   * the band again. This fixes it by SHAPE: the best possible outcome of an
   * action returns strictly less than that action's own price, so no sequence of
   * good rolls on any verb is ever a net source of oil.
   */
  it('never lets a perfect roll return more than the action costs to attempt', () => {
    for (const a of ALL_ACTIONS) {
      const best = -oilCostFor(a, 'criticalSuccess')
      expect(best, `${a} pays out more than it costs — that is an oil farm`)
        .toBeLessThan(OIL_PRICE[a] + 1e-9)
    }
  })

  it('never lets REST profit — sitting down is not how you fill a lamp', () => {
    for (const band of BAND_ORDER) {
      expect(oilCostFor('rest', band)).toBeGreaterThanOrEqual(0)
    }
  })

  it('leaves DROP HEART free at every band (GDD 2.9.1)', () => {
    for (const band of BAND_ORDER) expect(oilCostFor('dropHeart', band)).toBe(0)
  })

  /**
   * OIL IS ALLOWED TO BIND NOW, AND THAT IS THE POINT — but it must not be a
   * death clock, and the difference is what this asserts.
   *
   * GDD 2.2.1 deliberately makes Drowsing and Stirring oil-constrained rather
   * than turn-constrained, so a player who spends all 50 turns walking SHOULD
   * run out of lamp; the old "starting oil outlasts a clean run" claim is from
   * the 20-turn game and would now be asserting the opposite of the design.
   *
   * What has to stay true is that running dry is survivable and reachable-back:
   * a lamp at zero is a -6 and a dark lantern (GDD 2.8.1, "0 oil is not a third
   * death"), and a single flask has to buy back a meaningful stretch of walking
   * or the ambient flask count is decoration.
   */
  it('lets oil bind without becoming a death clock', () => {
    const perMove = oilCostFor('move', 'mixed')
    expect(perMove).toBeGreaterThan(0)
    // A flask buys at least six clean moves back — enough that finding one
    // changes a route decision rather than merely deferring the inevitable.
    expect(OIL.flaskValue / perMove).toBeGreaterThanOrEqual(6)
    // And the starting lamp alone covers a real expedition: at least as many
    // moves as the deepest Heart is rooms away, there and back, twice over.
    expect(OIL.starting / perMove).toBeGreaterThanOrEqual(RUN.maxHeartDistance * 2)
  })
})

describe('the FOCUS cap (GDD 2.7)', () => {
  it('gives every difficulty a cap, and tightens it as difficulty rises', () => {
    const caps = (['drowsing', 'stirring', 'hunting', 'ravening'] as const).map(
      (d) => DIFFICULTY[d].focusesPerRoom,
    )
    for (const c of caps) expect(c).toBeGreaterThan(0)
    for (let i = 1; i < caps.length; i++) {
      expect(caps[i]!).toBeLessThanOrEqual(caps[i - 1]!)
    }
  })

  it('lets the two teaching difficulties resolve a whole room', () => {
    expect(DIFFICULTY.drowsing.focusesPerRoom).toBeGreaterThanOrEqual(4)
    expect(DIFFICULTY.stirring.focusesPerRoom).toBeGreaterThanOrEqual(4)
  })

  it('forces a guess at the top two (GDD 2.2.1)', () => {
    expect(DIFFICULTY.hunting.focusesPerRoom).toBeLessThan(4)
    expect(DIFFICULTY.ravening.focusesPerRoom).toBeLessThan(4)
  })
})

describe('turn caps (GDD 2.2.1)', () => {
  it('give the easy difficulties room to explore and tighten toward the top', () => {
    const turns = (['drowsing', 'stirring', 'hunting', 'ravening'] as const).map(
      (d) => DIFFICULTY[d].maxTurns,
    )
    for (let i = 1; i < turns.length; i++) {
      expect(turns[i]!).toBeLessThan(turns[i - 1]!)
    }
  })

  it('never place the Wumpus further than it can travel in the budget', () => {
    // The 1b defect, re-asserted against the NEW caps: a start band whose
    // ceiling exceeds the tier's reach places a monster that cannot arrive.
    for (const d of ['drowsing', 'stirring', 'hunting', 'ravening'] as const) {
      expect(DIFFICULTY[d].wumpusStartDistance[1]).toBeLessThanOrEqual(wumpusReach(d))
    }
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
