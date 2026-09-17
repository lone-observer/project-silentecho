/**
 * Every tunable number in the game, in one place.
 *
 * RULE: no other file in the engine hardcodes a value that belongs here.
 * Balance is tuned by editing this file and re-running `npm run sim` — if a
 * tuning change ever requires editing logic, the design is wrong
 * (CLAUDE.md 2.4).
 *
 * Each value cites the docs/GDD.md section it came from. When you change one,
 * change the GDD too, or the two drift and the GDD stops being the source of truth.
 */

import type { ActionKind, CreatureKind, Difficulty, HazardKind, WumpusTier } from '../types.ts'
import { DC } from '../types.ts'

/**
 * How much of the room's surroundings the player can sense.
 * `all` — tells from every doorway. `facing` — only the doorway last moved through.
 * Darkness restricts RANGE, never reliability: what you receive is always true.
 * GDD 2.8.1
 */
export type TellRange = 'all' | 'facing'

// ---------------------------------------------------------------------------
// The run — GDD 2.2
// ---------------------------------------------------------------------------

export const RUN = {
  /** Hard turn limit. The real antagonist alongside the Wumpus. */
  maxTurns: 20,
  gridWidth: 10,
  gridHeight: 10,

  /**
   * The Heart's distance band is bounded by the TURN BUDGET, not by grid size.
   *
   * A round trip costs at least 2x this distance, so at 20 turns a Heart 7
   * rooms deep already spends 14 of them walking. Growing the grid does not
   * change that arithmetic — which is the point of a 10x10 map: the Heart sits
   * in the near third and the other ~70 rooms are the too-deep region. The
   * player never CHOOSES to go too deep; they end up there by searching the
   * wrong direction, and then the turn count decides whether they get back.
   *
   * Per-difficulty bands narrow this further — see DIFFICULTY.
   */
  minHeartDistance: 5,
  maxHeartDistance: 7,
} as const

// ---------------------------------------------------------------------------
// Generation — GDD 2.2
// ---------------------------------------------------------------------------

export const GENERATION = {
  /**
   * Fraction of the non-tree grid edges braided back in after the spanning tree.
   *
   * A perfect maze (0) has exactly one path between any two rooms, which is
   * wrong for an evasion game: no loops means no route choice, and escaping
   * means retracing your exact steps into whatever is following you. Braiding
   * adds loops so the player can circle around. Too high and it stops reading
   * as a labyrinth and becomes an open field.
   */
  braidRatio: 0.3,
  /**
   * How strongly a room's hazard pulls its archetype toward the thematic match
   * (spore bloom -> fungal grotto, portal -> collapsed shrine, and so on).
   * 1 = always, 0 = archetypes are pure noise. Coherence makes the world feel
   * authored and gives (archetype x action) outcomes real meaning.
   */
  archetypeAffinity: 0.75,
  /** Minimum distance from the entrance at which the Wumpus may start. */
  minWumpusStartDistance: 5,
  /** Whole-labyrinth regenerations before we accept the closest near-miss. */
  maxGenerationAttempts: 60,
  /** Place/measure/repair passes spent trying to hit a difficulty contract. */
  maxRepairPasses: 40,
} as const

// ---------------------------------------------------------------------------
// The player — GDD 2.5
// ---------------------------------------------------------------------------

export const PLAYER = {
  maxHealth: 3,
  /** Every stat starts here. mod = floor((stat - 10) / 2), so 8 is -1. */
  startingStat: 8,
  maxStat: 18,
  /** Awarded after every completed run, win or lose. */
  statPointsPerRun: 3,
  /** Fortune points per run = floor(LCK / fortuneDivisor). GDD 2.5 */
  fortuneDivisor: 4,
} as const

// ---------------------------------------------------------------------------
// Oil — GDD 2.8.1
// ---------------------------------------------------------------------------

/**
 * Oil is an ACTION BUDGET, not a second death clock. A clean 20-turn run
 * finishes with a little left, so it only bites when you dawdle.
 *
 * The penalty is a LABELLED MODIFIER on the roll, never a hidden DC change —
 * `Guttering lamp -2` in the roll breakdown teaches the mechanic for free.
 *
 * Darkness restricts the RANGE of tells, never their honesty. At `facing` you
 * sense only the doorway you came through; LISTEN reveals all four, truthfully,
 * for the price of a turn. Information costs turns; it never lies.
 */
export interface OilBand {
  readonly name: string
  /** Inclusive lower bound. Bands are contiguous and cover 0..OIL.max. */
  readonly min: number
  readonly max: number
  /** Added to every roll. Always surfaced with `label` as its source. */
  readonly modifier: number
  readonly label: string
  /** Rooms visible around the player in the diorama. */
  readonly lanternRadius: number
  readonly tellRange: TellRange
}

export const OIL_BANDS: readonly OilBand[] = [
  { name: 'bright',    min: 7, max: 12, modifier:  0, label: 'Lamp bright',    lanternRadius: 2, tellRange: 'all' },
  { name: 'guttering', min: 3, max:  6, modifier: -2, label: 'Guttering lamp', lanternRadius: 1, tellRange: 'all' },
  { name: 'ember',     min: 1, max:  2, modifier: -4, label: 'Failing lamp',   lanternRadius: 1, tellRange: 'facing' },
  { name: 'dark',      min: 0, max:  0, modifier: -6, label: 'Darkness',       lanternRadius: 0, tellRange: 'facing' },
] as const

export const OIL = {
  max: 12,
  starting: 12,
  /** One point of oil is spent every N turns. */
  burnEveryNTurns: 2,
  /** Extra oil these actions cost on top of the passive burn. */
  extraCost: { search: 1, read: 1, rest: 1 } as Partial<Record<ActionKind, number>>,
  flaskValue: 4,
} as const

// ---------------------------------------------------------------------------
// Status effects — GDD 2.8.2
// ---------------------------------------------------------------------------

export const STATUS = {
  /**
   * Confused SUPPRESSES tells for this many turns — no tells at all.
   * It does not scramble movement (a failed MOVE roll already does that) and it
   * does not scramble tell directions (that would break "tells never lie").
   */
  confusedTurns: 2,
} as const

// ---------------------------------------------------------------------------
// Difficulty — GDD 2.6
// ---------------------------------------------------------------------------

/**
 * Base DC per action. Room archetype and hazard context override these in
 * data/outcomes.ts. Routine actions sit at Trivial/Easy on purpose: a fresh
 * character (mod -1) only reaches Mixed-or-better 40% of the time against a
 * Moderate 12, so Moderate is reserved for genuine risk.
 */
export const ACTION_DC: Record<ActionKind, number> = {
  move: DC.trivial,
  listen: DC.trivial,
  search: DC.easy,
  force: DC.moderate,
  sneak: DC.easy,
  fight: DC.moderate,
  tame: DC.moderate,
  flee: DC.easy,
  use: DC.trivial,
  send: DC.easy,
  read: DC.moderate,
  enterPortal: DC.hard,
  rest: DC.trivial,
}

// ---------------------------------------------------------------------------
// The Wumpus — GDD 2.10
// ---------------------------------------------------------------------------

export interface TierProfile {
  readonly name: string
  /** Moves once every N turns. */
  readonly moveEveryNTurns: number
  /** Rooms out to which it can sense scent. */
  readonly perceptionRadius: number
  /** Turns it remembers the player's last known room after losing the trail. */
  readonly memoryTurns: number
  readonly takesPortals: boolean
  /** Moves toward the entrance while the player carries the Heart. */
  readonly anticipatesExit: boolean
}

export const WUMPUS_TIERS: Record<WumpusTier, TierProfile> = {
  1: { name: 'Drowsing', moveEveryNTurns: 3, perceptionRadius: 1, memoryTurns: 0, takesPortals: false, anticipatesExit: false },
  2: { name: 'Stirring', moveEveryNTurns: 2, perceptionRadius: 2, memoryTurns: 0, takesPortals: false, anticipatesExit: false },
  3: { name: 'Hunting',  moveEveryNTurns: 1, perceptionRadius: 3, memoryTurns: 3, takesPortals: false, anticipatesExit: false },
  4: { name: 'Ravening', moveEveryNTurns: 1, perceptionRadius: 4, memoryTurns: 3, takesPortals: true,  anticipatesExit: true },
}

// ---------------------------------------------------------------------------
// Scent — GDD 2.10
// ---------------------------------------------------------------------------

/**
 * Scent the player leaves in the room they acted in. The Wumpus navigates
 * toward the strongest trail within its perception radius.
 *
 * This table IS the fight/tame asymmetry: FIGHT rings a dinner bell, TAME
 * barely whispers. If one option ever becomes strictly better, fix these
 * weights and the turn costs below — do not remove the choice (CLAUDE.md 3).
 */
export const SCENT_BY_ACTION: Record<ActionKind, number> = {
  move: 1,
  listen: 0.5,
  search: 1.5,
  force: 3,
  sneak: 0.25,
  fight: 4,
  tame: 0.5,
  flee: 2,
  use: 1,
  send: 0, // the marker lands in the TARGET room — see COMPANION.sendScent
  read: 1,
  enterPortal: 0, // the trail does not follow you through
  rest: 0.5,
}

export const SCENT = {
  /** Nominal lifetime of a trail, in turns. Documentation for decayFactor. */
  decayTurns: 3,
  /**
   * Multiplied into every room's scent each turn. 0.37 (~1/e) leaves about 5%
   * of a deposit after `decayTurns`.
   *
   * Exponential rather than linear on purpose: it preserves the ORDERING of
   * trails, so a fight stays louder than a sneak for as long as both exist.
   * A linear rate would make loud actions linger absurdly (a 4-weight fight
   * outlasting the whole run) or quiet ones vanish instantly.
   */
  decayFactor: 0.37,
  /** Below this a trail is deleted outright, keeping the field sparse and JSON small. */
  epsilon: 0.02,
  /** Added on top of the action's weight when the roll is a critical failure. */
  criticalFailureBonus: 2,
  /** Taking the Heart is the loudest thing in the game. */
  heartTaken: 6,
} as const

// ---------------------------------------------------------------------------
// Creatures and companions — GDD 2.9
// ---------------------------------------------------------------------------

export const ENCOUNTER = {
  /** Fighting is FAST and loud. */
  fightTurnCost: 1,
  /** Taming is SLOW and quiet. The whole tension lives in this difference. */
  tameTurnCost: 2,
  companionSlots: 1,
} as const

export const TAME_DC: Record<CreatureKind, number> = {
  goblin: DC.easy,
  lumewing: DC.moderate,
  grellhound: DC.moderate,
  quietOne: DC.hard,
}

export const COMPANION = {
  /** Skittish companions bolt when the player TAKES DAMAGE, not on a failed roll. */
  skittishFleesOnDamage: true,
  /** Fortune points spent to keep a bolting skittish companion. GDD 2.9 */
  skittishFortuneSave: 1,
  /** A sent companion drops this much scent in the target room. */
  sendScent: 5,
  /** Turns the Wumpus stays drawn to the decoy. */
  sendDecoyTurns: 3,
  /** A sent companion NEVER returns. Not a tunable — see CLAUDE.md 3. */
  sendIsPermanent: true,
  /** Oil per turn to keep a skittish companion fed and calm. */
  skittishUpkeepOil: 1,
  lumewingLanternBonus: 1,
  goblinSearchBonus: 2,
  /** Radius at which the grellhound growls — one extra turn of warning. */
  grellhoundWarningRadius: 2,
  /** Multiplier on the player's scent output while the Quiet One follows. */
  quietOneScentMultiplier: 0.5,
} as const

// ---------------------------------------------------------------------------
// World population — GDD 2.8
// ---------------------------------------------------------------------------

/** Inclusive [min, max] counts per generated labyrinth. */
export const HAZARD_COUNTS: Record<HazardKind, readonly [number, number]> = {
  pit: [6, 9],
  sporeBloom: [4, 6],
  snareCarving: [4, 6],
  portal: [3, 4],
}

export const POPULATION = {
  oilFlasks: [8, 12] as const,
  creatures: [8, 12] as const,
  /** Graves from the player's own earlier runs. GDD 2.16 */
  maxGraves: 4,
} as const

// ---------------------------------------------------------------------------
// The Heart — GDD 2.10
// ---------------------------------------------------------------------------

export const HEART = {
  /**
   * The Heart is LOUD. Carrying it multiplies every scent deposit.
   *
   * This is the answer to "why not just retrace my steps" (GDD 2.9.1): the way
   * out crosses the same rooms but poses a different problem, because you are
   * now laying a hot trail down a corridor the Wumpus is already moving toward.
   */
  carryScentMultiplier: 2,
  /** Tiers the Wumpus jumps when the Heart leaves its plinth (capped at 4). */
  tierEscalation: 1,
  /** Turns the Wumpus knows the player's exact position after the Heart is taken. */
  revealTurns: 1,
} as const

// ---------------------------------------------------------------------------
// Lookups
// ---------------------------------------------------------------------------

/** The oil band containing `oil`. Throws if the band table has a gap. */
export function oilBandFor(oil: number): OilBand {
  const clamped = Math.max(0, Math.min(OIL.max, Math.floor(oil)))
  const band = OIL_BANDS.find((b) => clamped >= b.min && clamped <= b.max)
  if (!band) throw new Error(`oilBandFor: no band covers oil=${clamped} — OIL_BANDS has a gap`)
  return band
}

// ---------------------------------------------------------------------------
// Difficulty — a contract on GENERATION, not merely a Wumpus tier
// ---------------------------------------------------------------------------

/**
 * `safeRoutes` counts hazard-free routes from the entrance to the Heart:
 *   0 — no route avoids every hazard; a bloom, snare or creature is unavoidable
 *   1 — one such route exists, but blocking a single room on it closes them all
 *   2 — at least two meaningfully distinct hazard-free routes
 *
 * `minSafeDetour` is how many EXTRA moves the safe route costs. Without it the
 * safe route is usually free, everyone takes it, and hazards stop being a
 * decision — which is what the first 5x5 generator actually produced.
 */
export interface DifficultyContract {
  readonly wumpusTier: WumpusTier
  readonly safeRoutes: 0 | 1 | 2
  readonly minSafeDetour: number
  readonly heartDistance: readonly [number, number]
  readonly maxTurns: number
}

export const DIFFICULTY: Record<Difficulty, DifficultyContract> = {
  drowsing: { wumpusTier: 1, safeRoutes: 2, minSafeDetour: 2, heartDistance: [5, 6], maxTurns: 20 },
  stirring: { wumpusTier: 2, safeRoutes: 1, minSafeDetour: 3, heartDistance: [6, 7], maxTurns: 20 },
  hunting:  { wumpusTier: 3, safeRoutes: 0, minSafeDetour: 0, heartDistance: [7, 7], maxTurns: 20 },
  // Harder through pressure, not distance: a deeper Heart only adds corridors,
  // whereas fewer turns bites on every decision in the run at once.
  ravening: { wumpusTier: 4, safeRoutes: 0, minSafeDetour: 0, heartDistance: [7, 7], maxTurns: 18 },
}

export const DEFAULT_DIFFICULTY: Difficulty = 'stirring'

/**
 * INVARIANT, not a tunable — see CLAUDE.md 3.
 * A pit-free route to the Heart must exist at EVERY difficulty. A pit is an
 * instant-loss check, so forcing one means a run can end to a die roll the
 * player had no way to avoid. Blooms, snares and creatures may be forced
 * because failing them costs you without ending you.
 */
export const PIT_FREE_ROUTE_REQUIRED = true
