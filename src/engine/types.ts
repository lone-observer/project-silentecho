/**
 * Project Silent Echo — core type model.
 *
 * INVARIANT: every type here must be JSON-serializable.
 * No classes, no Map/Set, no functions, no cyclic references.
 * `structuredClone`/`JSON.parse(JSON.stringify(state))` must round-trip GameState
 * unchanged — replays, saves, the sim harness and agent play all depend on it.
 *
 * See docs/GDD.md for the design these types encode.
 */

// ---------------------------------------------------------------------------
// Primitives
// ---------------------------------------------------------------------------

export type Direction = 'N' | 'E' | 'S' | 'W'
export const DIRECTIONS: readonly Direction[] = ['N', 'E', 'S', 'W'] as const

export type RoomId = string

/** Serializable RNG state. Travels inside GameState — see engine/rng.ts. */
export interface RngState {
  readonly seed: number
  readonly counter: number
}

// ---------------------------------------------------------------------------
// Stats and dice
// ---------------------------------------------------------------------------

export type StatKey = 'str' | 'agi' | 'int' | 'lck'

export interface Stats {
  readonly str: number
  readonly agi: number
  readonly int: number
  readonly lck: number
}

/**
 * Outcome bands, resolved on margin (total - dc). See GDD 2.6.
 * Contiguous and exhaustive: every integer margin falls in exactly one band.
 */
export type OutcomeBand =
  | 'criticalFailure' // margin <= -6
  | 'failure' //         -5 .. -1
  | 'mixed' //            0 .. +3   <- the signature band
  | 'success' //         +4 .. +7
  | 'strongSuccess' //   +8 .. +11
  | 'criticalSuccess' // >= +12

export const BAND_ORDER: readonly OutcomeBand[] = [
  'criticalFailure',
  'failure',
  'mixed',
  'success',
  'strongSuccess',
  'criticalSuccess',
] as const

/** Standard difficulty classes. See GDD 2.6. */
export const DC = {
  trivial: 5,
  easy: 8,
  moderate: 12,
  hard: 16,
  severe: 20,
  nearImpossible: 25,
} as const
export type DcName = keyof typeof DC

/**
 * A single labelled contribution to a roll.
 * INVARIANT: every modifier carries a human-readable source. The UI shows the
 * player exactly why they rolled what they rolled — unlabelled modifiers are a bug.
 */
export interface Modifier {
  readonly source: string
  readonly value: number
}

export interface RollResult {
  /** The raw d20, before any modifier. 1..20 */
  readonly natural: number
  readonly modifiers: readonly Modifier[]
  /** natural + sum(modifiers) */
  readonly total: number
  readonly dc: number
  /** total - dc */
  readonly margin: number
  readonly band: OutcomeBand
  /** True when a natural 1 or 20 forced the band away from its margin value. */
  readonly overridden: boolean
  /** Set when a Fortune point altered this roll. */
  readonly fortuneUsed?: FortuneUse
}

export type FortuneUse = 'reroll' | 'bumpBand'

// ---------------------------------------------------------------------------
// World
// ---------------------------------------------------------------------------

export type RoomArchetype =
  | 'hewnChamber'
  | 'floodedGallery'
  | 'fungalGrotto'
  | 'collapsedShrine'
  | 'carvedHall'
  | 'heartChamber'

export type HazardKind = 'pit' | 'sporeBloom' | 'snareCarving' | 'portal'

/** What leaks through a doorway from the room beyond. See GDD 2.4. */
export type TellKind =
  | 'stench' //      Wumpus adjacent   — pallid violet, reserved
  | 'draft' //       pit
  | 'sweetness' //   spore bloom
  | 'hum' //         portal
  | 'freshChisel' // snare carving
  | 'skittering' //  creature
  | 'metallic' //    the Heart, still on its plinth

export interface Tell {
  readonly direction: Direction
  readonly kind: TellKind
}

export interface Room {
  readonly id: RoomId
  readonly x: number
  readonly y: number
  readonly archetype: RoomArchetype
  /** Doorways to adjacent rooms. A missing direction is a wall. */
  readonly exits: Partial<Record<Direction, RoomId>>
  readonly hazard: HazardKind | null
  readonly creature: CreatureKind | null
  /**
   * The creature in this room has turned on the player — the result of a
   * critically failed TAME (GDD 2.9). A hostile creature can no longer be
   * tamed; only fought, snuck past, or fled from.
   *
   * This belongs to the CREATURE, not the room: world drift carries it along
   * when the creature wanders (GDD 2.9.1). A hostile flag left behind in an
   * empty chamber is a bug. Always false where `creature` is null.
   */
  readonly creatureHostile: boolean
  readonly isEntrance: boolean
  readonly hasHeart: boolean
  readonly oilFlask: boolean
  /** An epitaph from one of the player's own earlier runs. See GDD 2.16. */
  readonly grave: Epitaph | null
  readonly visited: boolean
}

export interface Labyrinth {
  readonly seed: number
  readonly difficulty: Difficulty
  readonly width: number
  readonly height: number
  readonly rooms: Readonly<Record<RoomId, Room>>
  readonly entranceId: RoomId
  readonly heartRoomId: RoomId
}

// ---------------------------------------------------------------------------
// Creatures and companions
// ---------------------------------------------------------------------------

/**
 * v1 bestiary. The stone-grub is deliberately absent: it returns in a late
 * phase as the labyrinth's shuffler (it eats walls, so the geometry drifts),
 * which is a high-difficulty mechanic rather than a tameable companion.
 */
export type CreatureKind =
  | 'goblin'
  | 'lumewing'
  | 'grellhound'
  | 'quietOne'

export interface Companion {
  readonly kind: CreatureKind
  /**
   * Brave enough to be sent as bait (GDD 2.9). Two routes get you one: a tame
   * at strongSuccess or better, or a natural 20 on any successful tame. The
   * second is what keeps SEND reachable on the Quiet One, whose Hard DC rarely
   * clears Strong Success even at INT 18.
   */
  readonly brave: boolean
  /** Mixed-success tames are skittish: they flee if the player takes damage. */
  readonly skittish: boolean
}

// ---------------------------------------------------------------------------
// The Wumpus
// ---------------------------------------------------------------------------

export type WumpusTier = 1 | 2 | 3 | 4

export interface Wumpus {
  readonly roomId: RoomId
  /** Where it came from, so it does not oscillate in corridors. */
  readonly lastRoomId: RoomId | null
  readonly tier: WumpusTier
  /** Turns until it may move again. */
  readonly moveCooldown: number
  /** Last room it knew the player to be in, and how stale that memory is. */
  readonly lastKnownPlayerRoom: RoomId | null
  readonly memoryAge: number
}

/** Scent left by the player, keyed by room. Decays over 3 turns. GDD 2.10 */
export type ScentField = Readonly<Record<RoomId, number>>

// ---------------------------------------------------------------------------
// Player and run
// ---------------------------------------------------------------------------

export type StatusEffect = 'confused'

export interface Player {
  readonly roomId: RoomId
  /**
   * The direction of the player's last MOVE — what they are facing.
   * At low oil only this doorway leaks a tell (GDD 2.8.1); null means they
   * have not committed to a direction yet and sense all four.
   */
  readonly facing: Direction | null
  readonly stats: Stats
  readonly health: number
  readonly maxHealth: number
  readonly oil: number
  readonly maxOil: number
  readonly fortune: number
  readonly carryingHeart: boolean
  readonly companion: Companion | null
  readonly inventory: readonly string[]
  /**
   * Active status effects and the turns each has left, counted down at step 7.
   *
   * A record rather than a list plus a parallel duration table: one source of
   * truth, so a status can never be present with no clock or clocked with no
   * presence. Absent key means not active; `statusTurnsLeft` reads it.
   */
  readonly statuses: Readonly<Partial<Record<StatusEffect, number>>>
}

export type Action =
  | { readonly kind: 'move'; readonly direction: Direction }
  | { readonly kind: 'listen' }
  | { readonly kind: 'search' }
  | { readonly kind: 'force'; readonly direction: Direction }
  | { readonly kind: 'sneak'; readonly direction: Direction }
  | { readonly kind: 'fight' }
  | { readonly kind: 'tame' }
  | { readonly kind: 'flee'; readonly direction: Direction }
  | { readonly kind: 'use'; readonly item: string }
  | { readonly kind: 'send'; readonly direction: Direction }
  | { readonly kind: 'read' }
  | { readonly kind: 'enterPortal' }
  | { readonly kind: 'rest' }

export type ActionKind = Action['kind']

export type RunOutcome =
  | 'inProgress'
  | 'escaped' //      win: left carrying the Heart
  | 'retreated' //    left alive WITHOUT the Heart — a partial success; the map is the prize
  | 'caught' //       the Wumpus
  | 'killed' //       a hazard
  | 'outOfTurns'

/** Difficulty is a contract on GENERATION, not just a Wumpus tier. See data/tuning.ts. */
export type Difficulty = 'drowsing' | 'stirring' | 'hunting' | 'ravening'

export interface GameState {
  readonly version: number
  readonly rng: RngState
  readonly labyrinth: Labyrinth
  readonly player: Player
  readonly wumpus: Wumpus
  readonly scent: ScentField
  readonly turn: number
  readonly maxTurns: number
  readonly outcome: RunOutcome
  /**
   * The room a live encounter is bound to, or null.
   *
   * resolve.ts owns this flag; creatures.ts deliberately never touches GameState
   * (GDD 2.9.1). It is set when the player ENTERS a room holding a creature and
   * cleared when the encounter resolves or the player leaves. A creature that
   * merely wanders onto the player during drift does NOT set it: by step 7 the
   * player's turn has already resolved, so a forced encounter would spend a turn
   * they never took. It is an intrusion, not an ambush.
   */
  readonly encounterRoomId: RoomId | null
  /** Every action taken, in order. With the seed, this replays the run exactly. */
  readonly actionLog: readonly Action[]
}

// ---------------------------------------------------------------------------
// Events — the engine's output channel and the source of truth for all renderers
// ---------------------------------------------------------------------------

/**
 * A stable identifier for a line of prose, carried alongside the prose itself.
 *
 * WHY THIS EXISTS. Until step 1f every beat had exactly one string, so a
 * consumer could identify it by comparing text against a constant — which is
 * what `scripts/turn.ts` did to work out which of the two catch checks fired.
 * GDD 2.8.1 requires a dark variant of every outcome, so every beat now has
 * TWO strings and text comparison is broken by construction: matching one
 * variant silently stops reporting the moment the player's lamp goes out.
 *
 * So identity moved off the prose and onto this union. Renderers, the agent
 * view and the visualisers key off `beat`; only humans read `text`. Adding a
 * beat means adding a member here, which is a compile error everywhere the
 * tables are declared — the same shape as `GameEvent.roll.hazard` in 1e.
 */
export type NarrationBeat =
  // Endings — GDD 2.17. Every one of these is the last line of a run.
  | 'caughtWalkedInto'
  | 'caughtCameForYou'
  | 'killedByHazard'
  | 'killedByDamage'
  | 'outOfTurns'
  | 'escaped'
  | 'retreated'
  // The (archetype x action x band) and (hazard x band) tables.
  | 'actionOutcome'
  | 'hazardOutcome'
  // Everything else the reducer says.
  | 'lampBurnsDown'
  | 'lampBrightens'
  | 'lampGutters'
  | 'goblinScrounges'
  | 'skittishUpkeep'
  | 'foundFlask'
  | 'caughtBreath'
  | 'grellhoundGrowls'
  | 'grellhoundReveals'
  | 'carvingsWarn'
  | 'companionReveals'
  | 'braveOverride'
  | 'creatureWanders'
  | 'creatureFound'
  | 'heartTaken'
  | 'wumpusEscalates'
  | 'confusedSettles'
  | 'confusedLifts'
  | 'portalCrossed'
  | 'actionUnavailable'

/**
 * Why a companion is no longer with you.
 *
 * A typed reason rather than the free prose string this field carried through
 * 1e, for the same reason `NarrationBeat` exists: the engine reports what
 * happened and the renderer chooses the words. `sent` is the one that matters —
 * `CLAUDE.md` 3 forbids a sent companion ever returning, and a reason the
 * renderer can switch on is what lets the text layer give that its own weight.
 */
export type CompanionLossReason = 'bolted' | 'released' | 'sent' | 'starved'

export type GameEvent =
  | { readonly kind: 'narration'; readonly text: string; readonly beat: NarrationBeat }
  /**
   * A roll happened. `hazard` is set when this is a hazard's saving throw
   * rather than the action's own roll — the two are separate rolls in the same
   * step, and a snare save reported as a MOVE roll is the renderer telling the
   * player something untrue about why they just lost a point of health.
   */
  | {
      readonly kind: 'roll'
      readonly action: ActionKind
      readonly result: RollResult
      readonly hazard?: HazardKind
    }
  | { readonly kind: 'moved'; readonly from: RoomId; readonly to: RoomId; readonly direction: Direction }
  | { readonly kind: 'tell'; readonly tell: Tell; readonly text: string }
  | { readonly kind: 'damage'; readonly amount: number; readonly cause: string }
  | {
      readonly kind: 'oilChanged'
      readonly delta: number
      readonly text: string
      readonly beat: NarrationBeat
    }
  | { readonly kind: 'wumpusMoved'; readonly to: RoomId }
  | { readonly kind: 'wumpusTierChanged'; readonly tier: WumpusTier }
  | { readonly kind: 'creatureEncounter'; readonly creature: CreatureKind }
  | { readonly kind: 'companionGained'; readonly companion: Companion }
  /**
   * A companion is gone. Carries its own prose rather than being paired with a
   * separate narration event, because the four reasons resolve at three
   * DIFFERENT steps of the turn order — released and sent at step 1, bolted at
   * step 3, starved at step 7 — and a narration emitted alongside would have to
   * be attributed to whichever step its partner landed in. One event, one
   * reason, one line.
   */
  | {
      readonly kind: 'companionLost'
      readonly kind_: CreatureKind
      readonly reason: CompanionLossReason
      readonly text: string
    }
  | { readonly kind: 'statusChanged'; readonly status: StatusEffect; readonly turns: number }
  | { readonly kind: 'heartTaken' }
  | { readonly kind: 'graveFound'; readonly epitaph: Epitaph }
  | { readonly kind: 'runEnded'; readonly outcome: RunOutcome }

// ---------------------------------------------------------------------------
// Run records, epitaphs, telemetry
// ---------------------------------------------------------------------------

/** A complete run, compressed to what replays it. See docs/OBSERVABILITY.md. */
export interface RunRecord {
  readonly runId: string
  readonly seed: number
  readonly gameVersion: string
  readonly actionLog: readonly Action[]
  readonly outcome: RunOutcome
  readonly turnsTaken: number
  readonly startedAt: number
  readonly endedAt: number
}

export interface Epitaph {
  readonly name: string
  readonly turn: number
  readonly outcome: RunOutcome
  readonly carriedHeart: boolean
  readonly text: string
}

// ---------------------------------------------------------------------------
// Agent interface — the sim harness, LLM players and the replay viewer all use this
// ---------------------------------------------------------------------------

/**
 * Exactly what a human player can see. Nothing more.
 * INVARIANT: no true map, no Wumpus position, no hidden-hazard leakage.
 * An agent that can see through walls tells us nothing about whether the game is fair.
 */
export interface AgentView {
  readonly runId: string
  readonly turn: number
  readonly maxTurns: number
  readonly room: string
  readonly tells: readonly { direction: Direction; kind: TellKind; text: string }[]
  readonly legalActions: readonly { action: Action; label: string; dc?: number }[]
  readonly status: {
    readonly health: number
    readonly oil: number
    readonly fortune: number
    readonly companion: CreatureKind | null
    readonly carryingHeart: boolean
  }
  readonly log: readonly string[]
  readonly outcome: RunOutcome
}
