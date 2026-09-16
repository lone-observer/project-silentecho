/**
 * The roll resolver. See docs/GDD.md 2.6.
 *
 * Every action in the game resolves here: 1d20 + labelled modifiers vs a DC,
 * banded on margin rather than pass/fail.
 *
 *   margin <= -6  criticalFailure   the world escalates
 *    -5 ..  -1    failure           minor cost
 *     0 ..  +3    mixed             you get it, and it costs you  <- signature band
 *    +4 ..  +7    success
 *    +8 .. +11    strongSuccess
 *   >= +12        criticalSuccess
 *
 * A natural 1 always carries misfortune and a natural 20 always carries a gift,
 * regardless of modifiers — so tension survives a maxed character and hope
 * survives a fresh one.
 */

import type { Modifier, OutcomeBand, RollResult, StatKey, Stats } from './types.ts'
import { BAND_ORDER } from './types.ts'
import type { Rng } from './rng.ts'

/** D&D-style: 8 -> -1, 10 -> 0, 18 -> +4. Deliberately tight. */
export function statModifier(score: number): number {
  return Math.floor((score - 10) / 2)
}

const STAT_LABEL: Record<StatKey, string> = {
  str: 'Strength',
  agi: 'Agility',
  int: 'Intellect',
  lck: 'Luck',
}

export function statModifierOf(stats: Stats, key: StatKey): Modifier {
  return { source: STAT_LABEL[key], value: statModifier(stats[key]) }
}

/** Maps a margin to its band. Contiguous and exhaustive. */
export function bandForMargin(margin: number): OutcomeBand {
  if (margin <= -6) return 'criticalFailure'
  if (margin <= -1) return 'failure'
  if (margin <= 3) return 'mixed'
  if (margin <= 7) return 'success'
  if (margin <= 11) return 'strongSuccess'
  return 'criticalSuccess'
}

/** Moves a band up (+1) or down (-1), clamped at the ends. */
export function shiftBand(band: OutcomeBand, steps: number): OutcomeBand {
  const i = BAND_ORDER.indexOf(band)
  const next = Math.min(BAND_ORDER.length - 1, Math.max(0, i + steps))
  return BAND_ORDER[next] as OutcomeBand
}

export function isFailure(band: OutcomeBand): boolean {
  return band === 'criticalFailure' || band === 'failure'
}

/** Mixed counts as success — you got what you wanted, it just cost you. */
export function isSuccess(band: OutcomeBand): boolean {
  return !isFailure(band)
}

export interface RollOptions {
  readonly dc: number
  readonly modifiers?: readonly Modifier[]
  /** Forces the natural die instead of drawing one. Tests and replays only. */
  readonly forceNatural?: number
}

/**
 * Natural-1 and natural-20 overrides.
 *
 * A natural 1 can never land better than `failure`; a natural 20 can never land
 * worse than `success`. This bounds, rather than replaces, the margin result:
 * a natural 1 against a trivial DC is still a failure, and a natural 20 against
 * an impossible DC still succeeds — but neither becomes a critical by accident.
 */
function applyNaturalOverride(
  natural: number,
  band: OutcomeBand,
): { band: OutcomeBand; overridden: boolean } {
  if (natural === 1) {
    const capped: OutcomeBand = BAND_ORDER.indexOf(band) > BAND_ORDER.indexOf('failure') ? 'failure' : band
    return { band: capped, overridden: capped !== band }
  }
  if (natural === 20) {
    const floored: OutcomeBand = BAND_ORDER.indexOf(band) < BAND_ORDER.indexOf('success') ? 'success' : band
    return { band: floored, overridden: floored !== band }
  }
  return { band, overridden: false }
}

export function roll(rng: Rng, options: RollOptions): RollResult {
  const modifiers = options.modifiers ?? []
  const natural = options.forceNatural ?? rng.d20()

  if (natural < 1 || natural > 20 || !Number.isInteger(natural)) {
    throw new Error(`roll: natural must be an integer 1..20, got ${natural}`)
  }
  for (const m of modifiers) {
    if (!m.source) throw new Error('roll: every modifier must carry a source label')
  }

  const total = natural + modifiers.reduce((sum, m) => sum + m.value, 0)
  const margin = total - options.dc
  const { band, overridden } = applyNaturalOverride(natural, bandForMargin(margin))

  return { natural, modifiers, total, dc: options.dc, margin, band, overridden }
}

/**
 * Spends a Fortune point to reroll. Luck never adds to a roll — it buys a second
 * look after you have seen the first. See GDD 2.5.
 */
export function rerollWithFortune(rng: Rng, previous: RollResult): RollResult {
  const fresh = roll(rng, { dc: previous.dc, modifiers: previous.modifiers })
  return { ...fresh, fortuneUsed: 'reroll' }
}

/** Spends a Fortune point to bump the result up one band. */
export function bumpBandWithFortune(previous: RollResult): RollResult {
  return { ...previous, band: shiftBand(previous.band, 1), fortuneUsed: 'bumpBand' }
}
