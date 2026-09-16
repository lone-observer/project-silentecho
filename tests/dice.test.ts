import { describe, it, expect } from 'vitest'
import { createRng } from '../src/engine/rng.ts'
import {
  bandForMargin,
  bumpBandWithFortune,
  isFailure,
  isSuccess,
  rerollWithFortune,
  roll,
  shiftBand,
  statModifier,
} from '../src/engine/dice.ts'
import type { OutcomeBand } from '../src/engine/types.ts'
import { BAND_ORDER } from '../src/engine/types.ts'

describe('statModifier', () => {
  it('matches the GDD table', () => {
    expect(statModifier(8)).toBe(-1)
    expect(statModifier(10)).toBe(0)
    expect(statModifier(12)).toBe(1)
    expect(statModifier(18)).toBe(4)
  })
})

describe('bandForMargin — boundaries', () => {
  const cases: readonly [number, OutcomeBand][] = [
    [-100, 'criticalFailure'],
    [-7, 'criticalFailure'],
    [-6, 'criticalFailure'],
    [-5, 'failure'],
    [-1, 'failure'],
    [0, 'mixed'],
    [3, 'mixed'],
    [4, 'success'],
    [7, 'success'],
    [8, 'strongSuccess'],
    [11, 'strongSuccess'],
    [12, 'criticalSuccess'],
    [100, 'criticalSuccess'],
  ]

  for (const [margin, expected] of cases) {
    it(`margin ${margin} -> ${expected}`, () => {
      expect(bandForMargin(margin)).toBe(expected)
    })
  }

  it('is exhaustive and contiguous across a wide range', () => {
    for (let m = -60; m <= 60; m++) {
      expect(BAND_ORDER).toContain(bandForMargin(m))
    }
  })

  it('is monotonic — a better margin never yields a worse band', () => {
    for (let m = -60; m < 60; m++) {
      const a = BAND_ORDER.indexOf(bandForMargin(m))
      const b = BAND_ORDER.indexOf(bandForMargin(m + 1))
      expect(b).toBeGreaterThanOrEqual(a)
    }
  })

  it('mixed is the widest of the good bands (GDD 2.6)', () => {
    const width = (band: OutcomeBand) => {
      let n = 0
      for (let m = -40; m <= 40; m++) if (bandForMargin(m) === band) n++
      return n
    }
    expect(width('mixed')).toBe(4)
    expect(width('mixed')).toBeGreaterThanOrEqual(width('success'))
    expect(width('mixed')).toBeGreaterThanOrEqual(width('strongSuccess'))
  })
})

describe('natural 1 and 20 overrides', () => {
  const rng = createRng(1)

  it('a natural 1 can never beat "failure", even with a huge bonus', () => {
    const r = roll(rng, {
      dc: 5,
      modifiers: [{ source: 'Absurd blessing', value: 50 }],
      forceNatural: 1,
    })
    expect(r.margin).toBeGreaterThan(11) // margin alone would be criticalSuccess
    expect(r.band).toBe('failure')
    expect(r.overridden).toBe(true)
  })

  it('a natural 20 can never fall below "success", even with a huge penalty', () => {
    const r = roll(rng, {
      dc: 25,
      modifiers: [{ source: 'Crushing curse', value: -50 }],
      forceNatural: 20,
    })
    expect(r.margin).toBeLessThan(-6) // margin alone would be criticalFailure
    expect(r.band).toBe('success')
    expect(r.overridden).toBe(true)
  })

  it('a natural 1 against a trivial DC is still a failure, not a critical failure', () => {
    const r = roll(rng, { dc: 2, forceNatural: 1 })
    expect(r.band).toBe('failure')
  })

  it('a natural 20 that earns a critical keeps it', () => {
    const r = roll(rng, { dc: 5, forceNatural: 20 })
    expect(r.band).toBe('criticalSuccess')
    expect(r.overridden).toBe(false)
  })

  it('does not flag an override when none was applied', () => {
    const r = roll(rng, { dc: 12, forceNatural: 12 })
    expect(r.overridden).toBe(false)
  })
})

describe('roll bookkeeping', () => {
  const rng = createRng(42)

  it('sums labelled modifiers into the total and margin', () => {
    const r = roll(rng, {
      dc: 12,
      modifiers: [
        { source: 'Agility', value: 2 },
        { source: 'Low oil', value: -1 },
      ],
      forceNatural: 10,
    })
    expect(r.total).toBe(11)
    expect(r.margin).toBe(-1)
    expect(r.band).toBe('failure')
    expect(r.modifiers).toHaveLength(2)
  })

  it('rejects an unlabelled modifier', () => {
    expect(() =>
      roll(rng, { dc: 10, modifiers: [{ source: '', value: 3 }], forceNatural: 10 }),
    ).toThrow(/source label/)
  })

  it('rejects an out-of-range natural', () => {
    expect(() => roll(rng, { dc: 10, forceNatural: 21 })).toThrow()
    expect(() => roll(rng, { dc: 10, forceNatural: 0 })).toThrow()
  })

  it('only ever draws naturals in 1..20', () => {
    const r = createRng(7)
    for (let i = 0; i < 5000; i++) {
      const n = roll(r, { dc: 10 }).natural
      expect(n).toBeGreaterThanOrEqual(1)
      expect(n).toBeLessThanOrEqual(20)
      expect(Number.isInteger(n)).toBe(true)
    }
  })
})

describe('determinism', () => {
  it('same seed, same sequence, 1000 iterations', () => {
    const a = createRng(20260916)
    const b = createRng(20260916)
    for (let i = 0; i < 1000; i++) {
      const ra = roll(a, { dc: 12, modifiers: [{ source: 'Strength', value: 1 }] })
      const rb = roll(b, { dc: 12, modifiers: [{ source: 'Strength', value: 1 }] })
      expect(ra).toEqual(rb)
    }
  })

  it('different seeds diverge', () => {
    const a = createRng(1)
    const b = createRng(2)
    const seqA = Array.from({ length: 50 }, () => a.d20())
    const seqB = Array.from({ length: 50 }, () => b.d20())
    expect(seqA).not.toEqual(seqB)
  })
})

describe('fortune', () => {
  it('reroll produces a fresh result flagged as a reroll', () => {
    const rng = createRng(99)
    const first = roll(rng, { dc: 12, forceNatural: 3 })
    const second = rerollWithFortune(rng, first)
    expect(second.fortuneUsed).toBe('reroll')
    expect(second.dc).toBe(first.dc)
    expect(second.modifiers).toEqual(first.modifiers)
  })

  it('bump moves the result up exactly one band', () => {
    const rng = createRng(5)
    const base = roll(rng, { dc: 12, forceNatural: 12 })
    const bumped = bumpBandWithFortune(base)
    expect(BAND_ORDER.indexOf(bumped.band)).toBe(BAND_ORDER.indexOf(base.band) + 1)
    expect(bumped.fortuneUsed).toBe('bumpBand')
  })

  it('bump clamps at the top band', () => {
    expect(shiftBand('criticalSuccess', 1)).toBe('criticalSuccess')
    expect(shiftBand('criticalFailure', -1)).toBe('criticalFailure')
  })
})

describe('band predicates', () => {
  it('treats mixed as a success — you got it, it just cost you', () => {
    expect(isSuccess('mixed')).toBe(true)
    expect(isFailure('mixed')).toBe(false)
    expect(isFailure('failure')).toBe(true)
    expect(isFailure('criticalFailure')).toBe(true)
  })
})
