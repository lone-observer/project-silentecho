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

import type {
  ActionKind, CreatureKind, Difficulty, HazardKind, OutcomeBand, StatKey, StatusEffect, WumpusTier,
} from '../types.ts'
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
  // Wumpus start distance is a BAND, per difficulty — see DifficultyContract.
  // It used to be a lone minimum here, which is how a monster that could never
  // reach the player shipped for three steps. A distance specified at only one
  // end is the same bug that produced arithmetically unwinnable maps in 1b.
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
// Hazards, on entry — GDD 2.8
// ---------------------------------------------------------------------------

/**
 * The saving throw a hazard demands the moment you walk into its room.
 *
 * PORTALS ARE ABSENT ON PURPOSE. Standing in a portal room does nothing to you;
 * ENTER PORTAL is a choice, and its roll is ACTION_DC.enterPortal. A hazard that
 * fires on entry is one you can be forced into, which is why the pit-free-route
 * invariant exists and why a portal — which relocates rather than harms — is not
 * one of these.
 */
export const ENTRY_HAZARDS: readonly HazardKind[] = ['pit', 'sporeBloom', 'snareCarving'] as const

export const HAZARD_DC: Partial<Record<HazardKind, number>> = {
  // Easy, not Moderate. A pit is the only instant-loss check in the game, a
  // pit-free route to the Heart is guaranteed at every difficulty, and the draft
  // tell is honest — so the player who lands in one chose to or explored blind.
  // At starting stats (AGI 8, mod -1) this still kills 40% of the time. Whether
  // that is the right BALANCE number is for 1g's sim; it is a defensible
  // correctness floor until something measures it.
  pit: DC.easy,
  sporeBloom: DC.easy,
  snareCarving: DC.easy,
}

export const HAZARD_STAT: Partial<Record<HazardKind, StatKey>> = {
  pit: 'agi', //          dodging the lip
  sporeBloom: 'agi', //   holding your breath through it
  snareCarving: 'int', // spotting it before it closes
}

/**
 * What a hazard does to you, band by band. Mechanics only — the prose and the
 * per-archetype flavour are data/outcomes.ts (step 1f).
 *
 * `extraTurns` is the snare's currency: it does not hurt you, it EATS THE CLOCK,
 * which against a 20-turn limit is its own kind of damage and keeps the three
 * entry hazards mechanically distinct (pit kills, bloom blinds, snare delays).
 */
export interface HazardOutcome {
  /** Ends the run outright. Pits only — see CLAUDE.md 3. */
  readonly fatal: boolean
  readonly damage: number
  readonly oilLoss: number
  readonly extraTurns: number
  readonly applies: StatusEffect | null
}

export const HAZARD_OUTCOMES: Partial<Record<HazardKind, Record<OutcomeBand, HazardOutcome>>> = {
  pit: {
    criticalFailure: { fatal: true,  damage: 0, oilLoss: 0, extraTurns: 0, applies: null },
    failure:         { fatal: true,  damage: 0, oilLoss: 0, extraTurns: 0, applies: null },
    // The signature band, at its most literal: you caught the lip. It cost you
    // a point of health and the lamp gutters.
    mixed:           { fatal: false, damage: 1, oilLoss: 2, extraTurns: 0, applies: null },
    success:         { fatal: false, damage: 0, oilLoss: 0, extraTurns: 0, applies: null },
    strongSuccess:   { fatal: false, damage: 0, oilLoss: 0, extraTurns: 0, applies: null },
    criticalSuccess: { fatal: false, damage: 0, oilLoss: 0, extraTurns: 0, applies: null },
  },
  sporeBloom: {
    criticalFailure: { fatal: false, damage: 1, oilLoss: 0, extraTurns: 0, applies: 'confused' },
    failure:         { fatal: false, damage: 0, oilLoss: 0, extraTurns: 0, applies: 'confused' },
    mixed:           { fatal: false, damage: 0, oilLoss: 1, extraTurns: 0, applies: null },
    success:         { fatal: false, damage: 0, oilLoss: 0, extraTurns: 0, applies: null },
    strongSuccess:   { fatal: false, damage: 0, oilLoss: 0, extraTurns: 0, applies: null },
    criticalSuccess: { fatal: false, damage: 0, oilLoss: 0, extraTurns: 0, applies: null },
  },
  snareCarving: {
    criticalFailure: { fatal: false, damage: 1, oilLoss: 0, extraTurns: 2, applies: null },
    failure:         { fatal: false, damage: 0, oilLoss: 0, extraTurns: 1, applies: null },
    mixed:           { fatal: false, damage: 0, oilLoss: 1, extraTurns: 0, applies: null },
    success:         { fatal: false, damage: 0, oilLoss: 0, extraTurns: 0, applies: null },
    strongSuccess:   { fatal: false, damage: 0, oilLoss: 0, extraTurns: 0, applies: null },
    criticalSuccess: { fatal: false, damage: 0, oilLoss: 0, extraTurns: 0, applies: null },
  },
}

// ---------------------------------------------------------------------------
// Assorted action effects — GDD 2.7, 2.8.1
// ---------------------------------------------------------------------------

export const REST = {
  /** Health recovered by a REST that lands mixed-or-better. */
  healOnSuccess: 1,
} as const

export const SEARCH = {
  /** Rooms READ names the hazards of, on a mixed-or-better roll. Radius 1. */
  readRevealRadius: 1,
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

/**
 * Which stat each action tests.
 *
 * The four encounter options MUST agree with ENCOUNTER_STAT in creatures.ts;
 * tests/resolve.test.ts asserts they do, because two tables describing one fact
 * is exactly the drift CLAUDE.md 2.4 warns about — this one exists only because
 * resolve.ts needs the other nine verbs as well.
 */
export const ACTION_STAT: Record<ActionKind, StatKey> = {
  move: 'agi',
  listen: 'int',
  search: 'int',
  force: 'str',
  sneak: 'agi',
  fight: 'str',
  tame: 'int',
  flee: 'agi',
  use: 'agi',
  send: 'agi',
  read: 'int',
  enterPortal: 'int',
  rest: 'str',
}

export const PORTAL = {
  /**
   * How deep into the NEW labyrinth a portal drops you, at minimum.
   *
   * Never the entrance. A portal that could land you on the way out would make
   * it a free escape rather than a gamble, and the whole point is that you trade
   * everything you have charted for a fresh, unknown position and a Wumpus that
   * has lost your scent entirely.
   */
  minLandingDistance: 3,
} as const

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

/**
 * Which decoy tier a creature falls in. Keyed off TAME_DC rather than listing
 * creatures, so adding a creature to the bestiary cannot forget to give it a
 * decoy strength — it inherits one from how hard it is to tame.
 */
export type SendTier = 'easyModerate' | 'hard'

export function sendTierFor(creature: CreatureKind): SendTier {
  return (TAME_DC[creature] as number) <= DC.moderate ? 'easyModerate' : 'hard'
}

/** Scent a sent companion of this kind drops in the target room. GDD 2.9 */
export function sendScentFor(creature: CreatureKind): number {
  return COMPANION.sendScent[sendTierFor(creature)]
}

/** Turns that decoy is expected to out-smell the player. Derived; see COMPANION. */
export function sendDecoyTurnsFor(creature: CreatureKind, carryingHeart: boolean): number {
  const pair = COMPANION.sendDecoyTurns[sendTierFor(creature)]
  return carryingHeart ? pair.carryingHeart : pair.alone
}

export const COMPANION = {
  /** Skittish companions bolt when the player TAKES DAMAGE, not on a failed roll. */
  skittishFleesOnDamage: true,
  /** Fortune points spent to keep a bolting skittish companion. GDD 2.9 */
  skittishFortuneSave: 1,
  /**
   * A sent companion drops this much scent in the target room, keyed by how hard
   * the creature was to tame (see sendTierFor). Read it with sendScentFor().
   *
   * The decoy is PURE SCENT — there is no "the Wumpus is distracted" flag, and
   * there must not be one. The bait works by out-smelling the player's own trail
   * inside the existing perception model, which keeps SEND legible in the
   * hunt/tame visualisers. A special-case lock would make SEND the only thing in
   * the game the Wumpus AI knows about by name.
   *
   * WHY TWO VALUES AND NOT ONE. The flat 5 made the decoy weakest exactly when
   * it was needed: against a Heart-carrying player (deposit 2, via
   * HEART.carryScentMultiplier) it dominated for a single turn, against a GDD
   * that promises 2-3. Solving `sendScent * decayFactor^n > deposit` shows the
   * achievable pairs do not overlap — 3-turns-without-Heart forces
   * sendScent in (7.3, 14.6], which forces 2-turns-with-Heart; 1-turn-with-Heart
   * forces (2.7, 5.4], which caps at 2-turns-without. 3-without / 1-with is
   * ARITHMETICALLY IMPOSSIBLE under one shared decayFactor, and the factor must
   * stay shared or the Wumpus would perceive different creatures' trails fading
   * at different physical rates.
   *
   * So the decoy's strength scales with the tame DC instead: the Easy/Moderate
   * creatures land exactly on the GDD's 3/2, and the Quiet One keeps 5 and its
   * 2/1. That is not the Quiet One being a worse decoy by design — it is what
   * the shared decay math produces once "1 turn while carrying" is held fixed.
   * Decided 17 Sep 2026; GDD 2.9 updated to match.
   *
   * Its duration is arithmetic, not a setting: see sendDecoyTurns.
   */
  sendScent: { easyModerate: 10, hard: 5 } as Record<SendTier, number>,
  /**
   * Turns the decoy is expected to out-smell the player. DERIVED, not free —
   * two pairs now, one per tier, each split by whether the player is carrying
   * the Heart (which doubles their own deposit).
   *
   * A decoy dominates for as long as `sendScent * decayFactor^n` exceeds the
   * player's freshest deposit. tests/creatures.test.ts asserts all four cases,
   * so changing sendScent without changing this fails the build rather than
   * quietly making the GDD's "3 turns for a goblin" a lie.
   */
  sendDecoyTurns: {
    easyModerate: { alone: 3, carryingHeart: 2 },
    hard: { alone: 2, carryingHeart: 1 },
  } as Record<SendTier, { readonly alone: number; readonly carryingHeart: number }>,
  /** A sent companion NEVER returns. Not a tunable — see CLAUDE.md 3. */
  sendIsPermanent: true,
  /** Oil per turn to keep a skittish companion fed and calm. */
  skittishUpkeepOil: 1,
  lumewingLanternBonus: 1,
  goblinSearchBonus: 2,
  /** Chance per turn a goblin companion turns up a point of oil. GDD 2.9 */
  goblinScroungeChance: 0.1,
  goblinScroungeOil: 1,
  /** Radius at which the grellhound growls — one extra turn of warning. */
  grellhoundWarningRadius: 2,
  /** Multiplier on the player's scent output while the Quiet One follows. */
  quietOneScentMultiplier: 0.5,
} as const

// ---------------------------------------------------------------------------
// Encounter outcome bands — GDD 2.9
// ---------------------------------------------------------------------------

/**
 * The MECHANICAL consequence of each band. Prose and per-archetype flavour are
 * data/outcomes.ts (step 1f); these tables say only what changes in the world.
 *
 * `extraScent` is added ON TOP of SCENT_BY_ACTION for the action taken, so the
 * fight/tame asymmetry survives every band: a clean tame is still quieter than
 * a clean fight, and a botched tame is loud precisely because it stopped being
 * a tame. Nothing here may invert that ordering (CLAUDE.md 3).
 */
export interface TameOutcome {
  readonly tamed: boolean
  /**
   * A companion brave enough to be sent as bait. Strong success or better.
   *
   * This was criticalSuccess-only until 17 Sep 2026, which made SEND
   * unreachable: a critical needs margin >= +12, so at starting stats (INT 8,
   * mod -1) the maximum possible total is 19 and P(brave) was 0% on every
   * creature — SEND did not fire once in 150 sweep runs, for the beat the GDD
   * calls "the single most important design beat in the game".
   *
   * Widening to strongSuccess gives a progression curve (20% on a goblin at
   * INT 8, 5% on the Quiet One at INT 18). It is only half the fix: the Quiet
   * One's Hard DC still rarely clears Strong Success, so resolve.ts also floors
   * a natural 20 on a successful tame to brave. That half cannot live here —
   * resolveEncounter only ever receives the resolved band, never the natural
   * roll. See GDD 2.9.
   */
  readonly brave: boolean
  /** Mixed success: costs oil to keep, and bolts on damage. */
  readonly skittish: boolean
  /** It turns on you and stays in the room. */
  readonly hostile: boolean
  /** It leaves the room entirely — the creature is gone from the labyrinth. */
  readonly bolts: boolean
  readonly extraScent: number
  readonly damage: number
  /** A strong success knows this place: adjacent rooms revealed. */
  readonly revealsRooms: number
}

export const TAME_OUTCOMES: Record<OutcomeBand, TameOutcome> = {
  // It shrieks. 0.5 + 3.5 = 4 — exactly a FIGHT's worth of noise, which is the
  // point: a tame that fails this badly has become the thing you were avoiding.
  criticalFailure: { tamed: false, brave: false, skittish: false, hostile: true,  bolts: false, extraScent: 3.5, damage: 1, revealsRooms: 0 },
  // Bolts noisily. 0.5 + 1.5 = 2, a FLEE's worth. Turn wasted, creature gone.
  failure:         { tamed: false, brave: false, skittish: false, hostile: false, bolts: true,  extraScent: 1.5, damage: 0, revealsRooms: 0 },
  mixed:           { tamed: true,  brave: false, skittish: true,  hostile: false, bolts: false, extraScent: 0,   damage: 0, revealsRooms: 0 },
  success:         { tamed: true,  brave: false, skittish: false, hostile: false, bolts: false, extraScent: 0,   damage: 0, revealsRooms: 0 },
  strongSuccess:   { tamed: true,  brave: true,  skittish: false, hostile: false, bolts: false, extraScent: 0,   damage: 0, revealsRooms: 1 },
  criticalSuccess: { tamed: true,  brave: true,  skittish: false, hostile: false, bolts: false, extraScent: 0,   damage: 0, revealsRooms: 0 },
}

export interface FightOutcome {
  /** The creature is driven off and removed from the labyrinth. */
  readonly driven: boolean
  readonly damage: number
  readonly extraScent: number
}

export const FIGHT_OUTCOMES: Record<OutcomeBand, FightOutcome> = {
  // 4 + 2 = 6 — a botched fight is the loudest thing short of taking the Heart.
  criticalFailure: { driven: false, damage: 2, extraScent: 2 },
  failure:         { driven: false, damage: 1, extraScent: 0 },
  // The signature band: you won, and it cost you a point of health.
  mixed:           { driven: true,  damage: 1, extraScent: 0 },
  success:         { driven: true,  damage: 0, extraScent: 0 },
  strongSuccess:   { driven: true,  damage: 0, extraScent: 0 },
  criticalSuccess: { driven: true,  damage: 0, extraScent: 0 },
}

export interface SneakOutcome {
  /** True if the player slips past into the room they were headed for. */
  readonly passed: boolean
  readonly damage: number
  readonly extraScent: number
}

export const SNEAK_OUTCOMES: Record<OutcomeBand, SneakOutcome> = {
  criticalFailure: { passed: false, damage: 1, extraScent: 2 },
  failure:         { passed: false, damage: 0, extraScent: 0.75 },
  // Through, but not silently — 0.25 + 0.75 = 1, no quieter than walking.
  mixed:           { passed: true,  damage: 0, extraScent: 0.75 },
  success:         { passed: true,  damage: 0, extraScent: 0 },
  strongSuccess:   { passed: true,  damage: 0, extraScent: 0 },
  criticalSuccess: { passed: true,  damage: 0, extraScent: 0 },
}

export interface FleeOutcome {
  /** True if the player retreats to the room they came from. */
  readonly fled: boolean
  readonly damage: number
  readonly extraScent: number
}

export const FLEE_OUTCOMES: Record<OutcomeBand, FleeOutcome> = {
  criticalFailure: { fled: false, damage: 1, extraScent: 1 },
  failure:         { fled: false, damage: 0, extraScent: 1 },
  mixed:           { fled: true,  damage: 1, extraScent: 0 },
  success:         { fled: true,  damage: 0, extraScent: 0 },
  strongSuccess:   { fled: true,  damage: 0, extraScent: 0 },
  criticalSuccess: { fled: true,  damage: 0, extraScent: 0 },
}

// ---------------------------------------------------------------------------
// World drift — GDD 2.9.1
// ---------------------------------------------------------------------------

/**
 * WITHIN A RUN, exactly two things move: the creatures, and the Wumpus.
 *
 * The terrain does not. Hazards are fixed at generation and stay where they
 * were put, so a map the player charts stays accurate about the dangerous
 * rooms for the whole run. That is what makes "return to a labyrinth you
 * mapped" (GDD 2.11) reward the right thing: you keep the hazards, and what
 * you lose is the living half — the Wumpus has moved and the creatures have
 * wandered. Blooms spreading is a BETWEEN-RUNS change, not a per-turn one.
 *
 * Drift resolves at step 7 of the turn order — the last thing before the next
 * turn's tells are read — so a tell can never describe a pre-drift world.
 *
 * One placement rule is load-bearing rather than tuning: nothing drifts into
 * an occupied room. One thing per room is what keeps a doorway's tells
 * unambiguous, and drift must not undo what generation promises.
 */
export const DRIFT = {
  /**
   * Chance per untamed creature per turn to step to an adjacent empty room.
   *
   * Deliberately low. At a high rate the skittering tell degenerates into
   * noise — knowing a creature is east is worthless if it will not be east
   * when you arrive. A quarter means a tell acted on immediately is usually
   * still true, while a map charted ten turns ago is not.
   */
  creatureMoveChance: 0.25,
  /**
   * Multiplier on the rate, per difficulty.
   *
   * Drowsing is ZERO on purpose. It is the teaching tier (GDD 2.10) and a
   * player learning what `skittering` means cannot learn it in a world where
   * the thing has moved by the time they arrive — the tells would read as
   * arbitrary, which is exactly what "tells never lie" exists to prevent.
   * A static first difficulty is the tutorial, not a missing feature.
   */
  byDifficulty: { drowsing: 0, stirring: 1, hunting: 1, ravening: 1.5 } as Record<Difficulty, number>,
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
   * This is the answer to "why not just retrace my steps" (GDD 2.9.1 — it is
   * the third world drift, the one that changes you rather than the map): the way
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
  /**
   * Where the Wumpus starts, as a distance band from the entrance — a
   * GUARANTEE, exactly like heartDistance, not a preference.
   *
   * The floor keeps it off the player at turn one. The CEILING is the part that
   * was missing: with only a floor, a 10x10 grid placed it a mean of 11 rooms
   * away, and a tier-1 Wumpus covers 6 rooms in 20 turns. It was unreachable in
   * 83% of Drowsing seeds and 63% of Stirring ones — the teaching tier could not
   * teach the tell it exists to teach. tests/generate.test.ts now asserts every
   * ceiling sits inside its tier's reach, so this cannot regress silently.
   *
   * The band compensates for tier SPEED so the thing arrives at all; the tier
   * then decides how bad that is. Drowsing is tighter because tier 1 moves once
   * every three turns; the other three share a band and escalate purely through
   * perception and move rate.
   */
  readonly wumpusStartDistance: readonly [number, number]
  readonly maxTurns: number
}

export const DIFFICULTY: Record<Difficulty, DifficultyContract> = {
  drowsing: { wumpusTier: 1, safeRoutes: 2, minSafeDetour: 2, heartDistance: [5, 6], wumpusStartDistance: [4, 6], maxTurns: 20 },
  stirring: { wumpusTier: 2, safeRoutes: 1, minSafeDetour: 3, heartDistance: [6, 7], wumpusStartDistance: [5, 8], maxTurns: 20 },
  hunting:  { wumpusTier: 3, safeRoutes: 0, minSafeDetour: 0, heartDistance: [7, 7], wumpusStartDistance: [5, 8], maxTurns: 20 },
  // Harder through pressure, not distance: a deeper Heart only adds corridors,
  // whereas fewer turns bites on every decision in the run at once. The start
  // band is shared with stirring and hunting on purpose — a tier-4 Wumpus
  // placed identically is a far worse problem than a tier-2 one.
  ravening: { wumpusTier: 4, safeRoutes: 0, minSafeDetour: 0, heartDistance: [7, 7], wumpusStartDistance: [5, 8], maxTurns: 18 },
}

/**
 * How far the Wumpus can travel inside the turn budget at a given difficulty.
 * A start band whose ceiling exceeds this places a monster that cannot arrive.
 */
export function wumpusReach(difficulty: Difficulty): number {
  const contract = DIFFICULTY[difficulty]
  return Math.floor(contract.maxTurns / WUMPUS_TIERS[contract.wumpusTier].moveEveryNTurns)
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
