import { describe, it, expect } from 'vitest'
import { createRng, rngFromState } from '../src/engine/rng.ts'

describe('rng', () => {
  it('is uniform enough on d20 over 100k draws', () => {
    const rng = createRng(1234)
    const counts = new Array<number>(21).fill(0)
    const n = 100_000
    for (let i = 0; i < n; i++) counts[rng.d20()]! += 1

    for (let face = 1; face <= 20; face++) {
      const share = counts[face]! / n
      expect(share).toBeGreaterThan(0.04) // expected 0.05
      expect(share).toBeLessThan(0.06)
    }
    expect(counts[0]).toBe(0)
  })

  it('round-trips its state through JSON and resumes identically', () => {
    const rng = createRng(777)
    for (let i = 0; i < 37; i++) rng.d20()

    const saved = JSON.parse(JSON.stringify(rng.getState()))
    const expected = Array.from({ length: 25 }, () => rng.d20())

    const restored = rngFromState(saved)
    const actual = Array.from({ length: 25 }, () => restored.d20())

    expect(actual).toEqual(expected)
  })

  it('setState repositions an existing generator', () => {
    const rng = createRng(2026)
    const checkpoint = rng.getState()
    const first = Array.from({ length: 10 }, () => rng.d20())
    rng.setState(checkpoint)
    const second = Array.from({ length: 10 }, () => rng.d20())
    expect(second).toEqual(first)
  })

  it('advances the counter by exactly one per draw', () => {
    const rng = createRng(3)
    expect(rng.getState().counter).toBe(0)
    rng.d20()
    rng.next()
    rng.int(1, 6)
    expect(rng.getState().counter).toBe(3)
  })

  it('int respects inclusive bounds', () => {
    const rng = createRng(11)
    const seen = new Set<number>()
    for (let i = 0; i < 2000; i++) {
      const v = rng.int(3, 7)
      expect(v).toBeGreaterThanOrEqual(3)
      expect(v).toBeLessThanOrEqual(7)
      seen.add(v)
    }
    expect([...seen].sort()).toEqual([3, 4, 5, 6, 7])
  })

  it('int rejects an inverted range', () => {
    expect(() => createRng(1).int(5, 2)).toThrow()
  })

  it('pick throws on an empty array', () => {
    expect(() => createRng(1).pick([])).toThrow(/empty/)
  })

  it('shuffle permutes without mutating the input', () => {
    const rng = createRng(8)
    const input = Object.freeze([1, 2, 3, 4, 5, 6, 7, 8])
    const out = rng.shuffle(input)
    expect(out).not.toBe(input)
    expect([...out].sort((a, b) => a - b)).toEqual([...input])
    expect(input).toEqual([1, 2, 3, 4, 5, 6, 7, 8])
  })

  it('chance(0) is never true and chance(1) is always true', () => {
    const rng = createRng(4)
    for (let i = 0; i < 500; i++) {
      expect(rng.chance(0)).toBe(false)
      expect(rng.chance(1)).toBe(true)
    }
  })
})
