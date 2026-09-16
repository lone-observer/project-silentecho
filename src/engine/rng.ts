/**
 * Seeded, serializable PRNG (mulberry32).
 *
 * INVARIANT: no ambient randomness anywhere in the engine. Every random draw
 * comes from here, and the generator's state travels inside GameState so that
 * (seed, actionLog) replays a run identically, forever.
 *
 * The state is (seed, counter): restoring means replaying `counter` steps of a
 * pure integer sequence, so it round-trips through JSON with no loss.
 */

import type { RngState } from './types.ts'

export interface Rng {
  /** Uniform float in [0, 1). */
  next(): number
  /** Integer in [1, 20]. */
  d20(): number
  /** Integer in [min, max], inclusive. */
  int(min: number, max: number): number
  /** Uniformly picks one element. Throws on an empty array. */
  pick<T>(items: readonly T[]): T
  /** Returns a new array; does not mutate the input. */
  shuffle<T>(items: readonly T[]): T[]
  /** True with probability p. */
  chance(p: number): boolean
  getState(): RngState
  setState(state: RngState): void
}

/** One step of mulberry32. Pure: same input, same output. */
function mulberry32Step(a: number): number {
  let t = (a + 0x6d2b79f5) | 0
  t = Math.imul(t ^ (t >>> 15), t | 1)
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296
}

export function createRng(seed: number, counter = 0): Rng {
  let s = seed | 0
  let c = counter | 0

  // Advance to the recorded position. Cheap: a few integer ops per step.
  let cursor = s
  for (let i = 0; i < c; i++) cursor = (cursor + 0x6d2b79f5) | 0

  const next = (): number => {
    const value = mulberry32Step(cursor)
    cursor = (cursor + 0x6d2b79f5) | 0
    c += 1
    return value
  }

  const int = (min: number, max: number): number => {
    if (max < min) throw new Error(`rng.int: max (${max}) < min (${min})`)
    return min + Math.floor(next() * (max - min + 1))
  }

  return {
    next,
    d20: () => int(1, 20),
    int,
    pick<T>(items: readonly T[]): T {
      if (items.length === 0) throw new Error('rng.pick: empty array')
      // noUncheckedIndexedAccess: the bounds check above guarantees this.
      return items[int(0, items.length - 1)] as T
    },
    shuffle<T>(items: readonly T[]): T[] {
      const out = [...items]
      for (let i = out.length - 1; i > 0; i--) {
        const j = int(0, i)
        const a = out[i] as T
        const b = out[j] as T
        out[i] = b
        out[j] = a
      }
      return out
    },
    chance: (p: number) => next() < p,
    getState: () => ({ seed: s, counter: c }),
    setState: (state: RngState) => {
      s = state.seed | 0
      c = state.counter | 0
      cursor = s
      for (let i = 0; i < c; i++) cursor = (cursor + 0x6d2b79f5) | 0
    },
  }
}

/** Rebuilds a generator positioned exactly where a saved state left off. */
export function rngFromState(state: RngState): Rng {
  return createRng(state.seed, state.counter)
}
