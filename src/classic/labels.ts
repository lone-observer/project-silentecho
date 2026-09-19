/**
 * Renderer-side vocabulary: the words that are chrome rather than prose.
 *
 * WHERE THE LINE IS. A sentence the player reads as the game's voice lives in
 * `data/outcomes.ts` and nowhere else — that is CLAUDE.md 2.4 and
 * `tests/outcomes.test.ts` fails the build over it. What is here is the other
 * thing: the names of UI furniture and of type-level vocabulary the player sees
 * as a label, never as a sentence. "Turn", "Lamp", "Mixed Success".
 *
 * THIS SPLIT IS NOT CLEAN AND 1h IS NOT PRETENDING IT IS. Three noun
 * dictionaries of the same kind now live in three different files:
 * `ACTION_LABEL` in `resolve.ts` (engine, since 1e), `ARCHETYPE_WORD`,
 * `CREATURE_WORD`, `HAZARD_WORD` and `DIRECTION_WORD` in `data/outcomes.ts`,
 * and `BAND_LABEL` here. A second renderer arrives in Phase 4 and will want all
 * three; that is when consolidating them stops being a preference and starts
 * being a defect. Flagged in PHASE-1-PROGRESS rather than done here, because
 * moving engine tables around is not what a rendering step is for.
 */

import type { OutcomeBand } from '../engine/types.ts'

/**
 * The six bands, as the player reads them. GDD 2.6.
 *
 * Mixed is the signature band (CLAUDE.md 3) and its label says the thing the
 * design is about: you got it, and it cost you.
 */
export const BAND_LABEL: Record<OutcomeBand, string> = {
  criticalFailure: 'Critical Failure',
  failure: 'Failure',
  mixed: 'Mixed Success',
  success: 'Success',
  strongSuccess: 'Strong Success',
  criticalSuccess: 'Critical Success',
}

/** Bands that read as bad news, for the one place tone is applied to a roll. */
export const BAD_BANDS: readonly OutcomeBand[] = ['criticalFailure', 'failure'] as const

/** `+2` / `−1` / `0`, with a real minus sign rather than a hyphen. */
export function signed(n: number): string {
  if (n > 0) return `+${trim(n)}`
  // A real minus sign, not a hyphen-minus. 1h finding 7: the roll breakdown
  // rendered `= -3` beside `Agility −1` — two different characters for the same
  // idea on one line — and it was found by reading a pit death in the log.
  if (n < 0) return `−${trim(Math.abs(n))}`
  return '0'
}

/**
 * At most two decimals, with trailing zeros dropped: `1`, `0.5`, `0.25`.
 *
 * Oil went fractional on 18 Sep (a MOVE costs half a point, a good one hands a
 * quarter back), so these numbers are no longer always integers. Printing them
 * raw put `+0.125 oil` in the log against a status line reading `Lamp 11.5` —
 * two different precisions for one resource, on one screen. The engine now
 * quantizes oil to `OIL_QUANTUM`; this is the presentation half of that.
 */
function trim(n: number): string {
  return Number(n.toFixed(2)).toString()
}

/**
 * A plain number, with the same minus sign as everything around it.
 *
 * Not `signed` — a roll total is a value, not a modifier, so it takes no `+`.
 * It exists because a failed roll at low oil renders a negative TOTAL, and
 * `= -3` next to `Agility −1 · Failing lamp −4` puts two different characters
 * for minus on one line. Caught by reading a real death in the log.
 */
export function num(n: number): string {
  return n < 0 ? `−${Math.abs(n)}` : `${n}`
}
