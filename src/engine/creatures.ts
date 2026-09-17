/**
 * Creatures, encounters, companions, SEND, and world drift.
 * See docs/GDD.md 2.9 and 2.9.1.
 *
 * The one sentence this whole file exists to serve:
 *
 *   Fighting is fast and loud. Taming is slow and quiet.
 *
 * Everything here is arranged so that asymmetry survives contact with the dice.
 * FIGHT costs one turn and rings a dinner bell; TAME costs two and barely
 * whispers — but a tame that fails badly stops being a tame and becomes the
 * loudest thing you could have done. That is the dilemma, once per encounter,
 * against a twenty-turn limit and a thing that navigates by smell.
 *
 * Pure and deterministic. No ambient state; all randomness injected (CLAUDE.md 2.1).
 *
 * WHAT THIS MODULE DOES NOT DO: it does not own GameState and it does not
 * advance the turn. It returns descriptions of what should happen, and
 * resolve.ts (step 1e) applies them in the order GDD 2.2.2 specifies. Keeping
 * it that way is what lets every function here be tested against a hand-built
 * band rather than through a whole run.
 */

import type {
  Companion,
  CreatureKind,
  Direction,
  HazardKind,
  Labyrinth,
  Modifier,
  OutcomeBand,
  Player,
  Room,
  RoomId,
  StatKey,
} from './types.ts'
import { DIRECTIONS } from './types.ts'
import type { Rng } from './rng.ts'
import {
  ACTION_DC,
  COMPANION,
  DRIFT,
  ENCOUNTER,
  FIGHT_OUTCOMES,
  FLEE_OUTCOMES,
  SCENT_BY_ACTION,
  SNEAK_OUTCOMES,
  sendScentFor,
  TAME_DC,
  TAME_OUTCOMES,
} from './data/tuning.ts'

// ---------------------------------------------------------------------------
// Graph helpers — local, so the engine stays a set of independent modules
// ---------------------------------------------------------------------------

function roomAt(labyrinth: Labyrinth, id: RoomId): Room | undefined {
  return labyrinth.rooms[id]
}

function neighbourIds(labyrinth: Labyrinth, id: RoomId): RoomId[] {
  const exits = roomAt(labyrinth, id)?.exits ?? {}
  return DIRECTIONS.map((d) => exits[d]).filter((x): x is RoomId => x !== undefined)
}

/**
 * Room ids in a fixed total order.
 *
 * CLAUDE.md 2.2 forbids iterating an unordered collection in a way that affects
 * outcomes. Object key order happens to be insertion order for these ids, but
 * relying on that would make determinism an accident of how generate.ts builds
 * its record. Sorting makes it a property of this function instead.
 */
function sortedIds(ids: readonly RoomId[]): RoomId[] {
  return [...ids].sort()
}

// ---------------------------------------------------------------------------
// Encounters — GDD 2.9
// ---------------------------------------------------------------------------

export type EncounterAction = 'fight' | 'tame' | 'sneak' | 'flee'

export const ENCOUNTER_ACTIONS: readonly EncounterAction[] = ['fight', 'tame', 'sneak', 'flee'] as const

/** Which stat each encounter option tests. GDD 2.9. */
export const ENCOUNTER_STAT: Record<EncounterAction, StatKey> = {
  fight: 'str',
  tame: 'int',
  sneak: 'agi',
  flee: 'agi',
}

/**
 * The roll this encounter option calls for.
 *
 * Only the encounter-specific parts. Universal modifiers — the oil band above
 * all — are assembled by resolve.ts, because they apply to every roll in the
 * game and duplicating them here is how the two drift apart.
 */
export interface EncounterRollSpec {
  readonly stat: StatKey
  readonly dc: number
}

/**
 * The options actually available in this room, in a fixed order.
 *
 * GDD 2.17: `legalActions` is computed IN THE ENGINE. No renderer builds its
 * own list, and none shows an unavailable verb greyed out — a menu of four
 * where three apply is a menu of four as far as decision cost is concerned.
 *
 * A creature that has turned on the player cannot be tamed. You had your
 * chance and it went badly; what is left is to fight it, slip past it, or run.
 */
export function encounterOptions(room: Room): EncounterAction[] {
  if (room.creature === null) return []
  return ENCOUNTER_ACTIONS.filter((a) => a !== 'tame' || !room.creatureHostile)
}

/** False once a critically failed tame has turned the creature on you. GDD 2.9 */
export function canTame(room: Room): boolean {
  return room.creature !== null && !room.creatureHostile
}

export function encounterRollSpec(action: EncounterAction, creature: CreatureKind): EncounterRollSpec {
  return {
    stat: ENCOUNTER_STAT[action],
    // Taming is the only option whose difficulty depends on WHAT you met. The
    // Quiet One is Hard for a reason; a goblin is Easy for a reason.
    dc: action === 'tame' ? TAME_DC[creature] : ACTION_DC[action],
  }
}

/**
 * Turns the option consumes. This IS the asymmetry, in its other currency:
 * taming costs a turn more than fighting, every time, before the dice are
 * touched (CLAUDE.md 3).
 */
export function encounterTurnCost(action: EncounterAction): number {
  return action === 'tame' ? ENCOUNTER.tameTurnCost : ENCOUNTER.fightTurnCost
}

export interface EncounterContext {
  readonly labyrinth: Labyrinth
  readonly creature: CreatureKind
  /** Where the encounter is happening. */
  readonly roomId: RoomId
  /** The companion the player already has, if any. One slot only. */
  readonly companion: Companion | null
  /** Where FLEE retreats to, and where SNEAK was headed. Null if neither applies. */
  readonly retreatRoomId?: RoomId | null
  readonly carryingHeart: boolean
}

export interface EncounterResult {
  readonly action: EncounterAction
  readonly band: OutcomeBand
  readonly creature: CreatureKind
  readonly turnCost: number
  /** Total scent to deposit in the player's room: base action weight + band extra. */
  readonly scent: number
  readonly damage: number
  /** False when the creature has been driven off, bolted, or tamed away. */
  readonly creatureRemains: boolean
  /** It turned on you. It is still in the room and it is not friendly. */
  readonly hostile: boolean
  /** The companion gained, if any. Null on every non-taming outcome. */
  readonly companionGained: Companion | null
  /** The companion this displaced — one slot, so taming releases what you had. */
  readonly companionReleased: CreatureKind | null
  /** Rooms a strong-success tame revealed, because the creature knows this place. */
  readonly revealedRooms: readonly RoomId[]
  /** SNEAK: you slipped past. FLEE: you got out. Where to, if so. */
  readonly movedTo: RoomId | null
}

/**
 * Resolve an encounter option against an already-rolled band.
 *
 * The roll happens in resolve.ts so that Fortune — which is spent AFTER seeing
 * a roll (GDD 2.5) — has somewhere to sit. By the time we get here the band is
 * final, and this function only says what the world does about it.
 */
export function resolveEncounter(
  action: EncounterAction,
  band: OutcomeBand,
  context: EncounterContext,
  rng: Rng,
): EncounterResult {
  const base = {
    action,
    band,
    creature: context.creature,
    turnCost: encounterTurnCost(action),
    damage: 0,
    creatureRemains: true,
    hostile: false,
    companionGained: null,
    companionReleased: null,
    revealedRooms: [] as readonly RoomId[],
    movedTo: null,
  }

  // The Quiet One dampens everything you do, including how loudly you fail.
  const quiet = scentMultiplierFor(context.companion)

  switch (action) {
    case 'tame': {
      const out = TAME_OUTCOMES[band]
      const companionGained: Companion | null = out.tamed
        ? { kind: context.creature, brave: out.brave, skittish: out.skittish }
        : null

      // One companion slot. Taming a new creature releases the current one, and
      // that is meant to sting — GDD 2.9 asks for a line in the log for it.
      const released =
        companionGained !== null && context.companion !== null ? context.companion.kind : null

      return {
        ...base,
        scent: (SCENT_BY_ACTION.tame + out.extraScent) * quiet,
        damage: out.damage,
        // Tamed creatures leave the room with you; bolted ones are gone.
        creatureRemains: !out.tamed && !out.bolts,
        hostile: out.hostile,
        companionGained,
        companionReleased: released,
        revealedRooms: out.revealsRooms > 0 ? revealAdjacent(context, out.revealsRooms, rng) : [],
      }
    }

    case 'fight': {
      const out = FIGHT_OUTCOMES[band]
      return {
        ...base,
        scent: (SCENT_BY_ACTION.fight + out.extraScent) * quiet,
        damage: out.damage,
        creatureRemains: !out.driven,
      }
    }

    case 'sneak': {
      const out = SNEAK_OUTCOMES[band]
      return {
        ...base,
        scent: (SCENT_BY_ACTION.sneak + out.extraScent) * quiet,
        damage: out.damage,
        movedTo: out.passed ? (context.retreatRoomId ?? null) : null,
      }
    }

    case 'flee': {
      const out = FLEE_OUTCOMES[band]
      return {
        ...base,
        scent: (SCENT_BY_ACTION.flee + out.extraScent) * quiet,
        damage: out.damage,
        movedTo: out.fled ? (context.retreatRoomId ?? null) : null,
      }
    }
  }
}

/** A strong-success tame: the creature knows this place and shows you some of it. */
function revealAdjacent(context: EncounterContext, count: number, rng: Rng): RoomId[] {
  const unseen = sortedIds(neighbourIds(context.labyrinth, context.roomId)).filter(
    (id) => roomAt(context.labyrinth, id)?.visited === false,
  )
  if (unseen.length === 0) return []
  return rng.shuffle(unseen).slice(0, count)
}

// ---------------------------------------------------------------------------
// Companion passives — GDD 2.9, refined in 2.9.1
// ---------------------------------------------------------------------------

/**
 * Informational passives are QUERIES, not stored effects.
 *
 * GDD 2.9 requires the grellhound's reveal to land before the player chooses
 * fight-or-tame, or it is flavour rather than a decision input. Computing it at
 * read time satisfies that by construction and removes a whole class of bug:
 * a stored reveal written before world drift would describe a labyrinth that no
 * longer exists, which is a companion whose entire job is honest information,
 * lying (GDD 2.9.1).
 */
export interface CompanionSenses {
  /** Added to the oil band's lantern radius. Lumewing only. */
  readonly lanternRadiusBonus: number
  /**
   * Hazards in adjacent rooms, named rather than merely hinted, and — this is
   * the part that makes a grellhound worth a companion slot — reported
   * regardless of the oil band. Darkness restricts which doorways leak a tell;
   * the hound has no use for your lamp.
   */
  readonly revealedHazards: readonly { readonly direction: Direction; readonly hazard: HazardKind }[]
  /**
   * The grellhound growls when the Wumpus reaches radius 2.
   *
   * This is not a nicety. The fairness guarantee (GDD 2.10) is only that a
   * player who HOLDS STILL is warned; moving into a room adjacent to the Wumpus
   * gets no warning at all. The growl buys back exactly the turn that movement
   * costs you, which is why the grellhound is load-bearing and why it is on the
   * do-not-cut list in the roadmap.
   */
  readonly wumpusGrowl: boolean
}

export function companionSenses(
  labyrinth: Labyrinth,
  companion: Companion | null,
  playerRoomId: RoomId,
  wumpusRoomId: RoomId,
): CompanionSenses {
  const none: CompanionSenses = { lanternRadiusBonus: 0, revealedHazards: [], wumpusGrowl: false }
  if (companion === null) return none

  if (companion.kind === 'lumewing') {
    return { ...none, lanternRadiusBonus: COMPANION.lumewingLanternBonus }
  }

  if (companion.kind === 'grellhound') {
    const exits = roomAt(labyrinth, playerRoomId)?.exits ?? {}
    const revealed: { direction: Direction; hazard: HazardKind }[] = []
    for (const direction of DIRECTIONS) {
      const id = exits[direction]
      if (id === undefined) continue
      const hazard = roomAt(labyrinth, id)?.hazard
      if (hazard) revealed.push({ direction, hazard })
    }
    return {
      ...none,
      revealedHazards: revealed,
      wumpusGrowl: withinRadius(labyrinth, playerRoomId, COMPANION.grellhoundWarningRadius).includes(wumpusRoomId),
    }
  }

  return none
}

function withinRadius(labyrinth: Labyrinth, from: RoomId, radius: number): RoomId[] {
  const seen: Record<RoomId, number> = { [from]: 0 }
  const queue: RoomId[] = [from]
  for (let head = 0; head < queue.length; head++) {
    const id = queue[head] as RoomId
    const d = seen[id] as number
    if (d >= radius) continue
    for (const n of neighbourIds(labyrinth, id)) {
      if (seen[n] === undefined) {
        seen[n] = d + 1
        queue.push(n)
      }
    }
  }
  return Object.keys(seen)
}

/**
 * Modifier passives, as labelled contributions to a roll.
 * Never return an unlabelled modifier — the UI shows the player exactly why
 * they rolled what they rolled (CLAUDE.md 4).
 */
export function companionRollModifiers(companion: Companion | null, action: string): Modifier[] {
  if (companion === null) return []
  if (companion.kind === 'goblin' && action === 'search') {
    return [{ source: 'Goblin scrounging', value: COMPANION.goblinSearchBonus }]
  }
  return []
}

/** The Quiet One dampens your scent output. Everything else leaves it alone. */
export function scentMultiplierFor(companion: Companion | null): number {
  return companion?.kind === 'quietOne' ? COMPANION.quietOneScentMultiplier : 1
}

/**
 * The only companion passives that are genuine step-7 EFFECTS: they change
 * state rather than describe it. Resolve at step 7, after world drift.
 */
export interface CompanionUpkeep {
  readonly oilDelta: number
  readonly scrounged: boolean
  /** Skittish upkeep went unpaid because the lamp is already dry. */
  readonly starved: boolean
}

export function companionUpkeep(companion: Companion | null, oil: number, rng: Rng): CompanionUpkeep {
  const idle: CompanionUpkeep = { oilDelta: 0, scrounged: false, starved: false }
  if (companion === null) return idle

  let oilDelta = 0
  let starved = false
  if (companion.skittish) {
    const cost = COMPANION.skittishUpkeepOil
    if (oil >= cost) oilDelta -= cost
    else starved = true
  }

  // Draw unconditionally for a goblin so the RNG stream does not depend on how
  // much oil happens to be left — that would make replays sensitive to state
  // this decision has nothing to do with.
  const scrounged = companion.kind === 'goblin' && rng.chance(COMPANION.goblinScroungeChance)
  if (scrounged) oilDelta += COMPANION.goblinScroungeOil

  return { oilDelta, scrounged, starved }
}

/**
 * Skittish companions bolt when the player TAKES DAMAGE, not on a failed roll.
 *
 * Failed rolls are over 40% at starting stats, so tying flight to them would
 * make a Mixed Success tame worthless — and Mixed is meant to be the widest
 * good band, not a booby prize (GDD 2.9).
 *
 * The player may spend a Fortune point to keep it. That purchase is emotional
 * rather than mechanical, which is the point: it gives Luck a use outside
 * treasure and traps, and turns a mixed tame into something you can defend.
 */
export function skittishBolts(companion: Companion | null, damageTaken: number, fortuneSpent: boolean): boolean {
  if (companion === null || !companion.skittish) return false
  if (!COMPANION.skittishFleesOnDamage) return false
  if (damageTaken <= 0) return false
  return !fortuneSpent
}

// ---------------------------------------------------------------------------
// SEND — baiting the Wumpus. GDD 2.9.
// ---------------------------------------------------------------------------

export interface SendResult {
  readonly sent: CreatureKind
  readonly targetRoomId: RoomId
  /** Deposited in the TARGET room, not the player's. */
  readonly scent: number
}

/**
 * Legality is a question, not an exception: renderers compute `legalActions` in
 * the engine (GDD 2.17) and need to ask before offering the verb.
 */
export function canSend(labyrinth: Labyrinth, player: Player, direction: Direction): boolean {
  const companion = player.companion
  if (companion === null || !companion.brave) return false
  return (roomAt(labyrinth, player.roomId)?.exits ?? {})[direction] !== undefined
}

/**
 * Send a brave companion into an adjacent room to make noise.
 *
 * THE COMPANION DOES NOT COME BACK. There is no return path in this function,
 * no chance, no rescue, and there must never be one (CLAUDE.md 3). The caller
 * clears `player.companion` unconditionally.
 *
 * The bait is pure scent. There is no "distracted" flag on the Wumpus and there
 * must not be one: the decoy works by out-smelling the player's own trail
 * inside the perception model that already exists, which keeps SEND legible in
 * the visualisers and tunable by a single number. The Wumpus never learns
 * anything about SEND by name.
 *
 * Note it is deliberately NOT multiplied by the Quiet One's damping — a
 * sent companion makes its own noise, not yours.
 *
 * How loud that noise is depends on WHICH creature you are giving up: the
 * decoy's strength is keyed to the tame DC (sendScentFor). That is not a
 * per-creature special case bolted on, it is the only way to hold the GDD's
 * "1 turn while carrying the Heart" fixed for a Hard-DC creature while still
 * giving the Easy/Moderate ones the promised 3 — see COMPANION.sendScent.
 */
export function sendCompanion(labyrinth: Labyrinth, player: Player, direction: Direction): SendResult | null {
  if (!canSend(labyrinth, player, direction)) return null
  const companion = player.companion
  if (companion === null) return null
  const targetRoomId = (roomAt(labyrinth, player.roomId)?.exits ?? {})[direction]
  if (targetRoomId === undefined) return null

  return { sent: companion.kind, targetRoomId, scent: sendScentFor(companion.kind) }
}

// ---------------------------------------------------------------------------
// World drift — GDD 2.9.1
// ---------------------------------------------------------------------------

export interface DriftContext {
  readonly playerRoomId: RoomId
  readonly wumpusRoomId: RoomId
}

export interface DriftResult {
  readonly labyrinth: Labyrinth
  readonly movedCreatures: readonly {
    readonly kind: CreatureKind
    readonly from: RoomId
    readonly to: RoomId
    /** True when the thing that wandered had already turned on the player. */
    readonly hostile: boolean
  }[]
}

/**
 * One turn of world drift. Resolves at step 7, BEFORE companion passives and
 * before the next turn's tells are read — so no tell ever describes a
 * pre-drift world and the honesty invariant is untouched.
 *
 * WITHIN A RUN, only creatures move. The terrain is fixed at generation and
 * stays fixed, so a map the player charts stays accurate about which rooms are
 * dangerous for the whole run — blooms spreading is a between-runs change
 * (GDD 2.11), not a per-turn one.
 *
 * One placement rule is an invariant rather than tuning: nothing drifts into an
 * occupied room. One thing per room is what keeps a doorway's tells unambiguous.
 *
 * A creature MAY wander into the player's room. It does not trigger an
 * encounter: the player's turn has already resolved by step 7, so there is
 * nothing left to choose with, and a forced encounter would spend a turn the
 * player never took. It is simply there, and they decide next turn.
 *
 * Hostility travels WITH the creature. A goblin that turned on you and then
 * wandered next door is still angry; a hostile flag left behind in the room it
 * vacated would be a bug.
 */
export function driftWorld(labyrinth: Labyrinth, context: DriftContext, rng: Rng): DriftResult {
  const rate = DRIFT.byDifficulty[labyrinth.difficulty]

  // Drowsing does not drift, and draws no randomness doing it. A player
  // learning what `skittering` means cannot learn it in a world that has moved
  // by the time they arrive (GDD 2.9.1).
  if (rate <= 0) return { labyrinth, movedCreatures: [] }

  const creatureP = Math.min(1, DRIFT.creatureMoveChance * rate)

  // Working copies. Only rooms that actually change get rebuilt, so the
  // untouched ~95 rooms stay referentially identical to the ones passed in.
  const creatures: Record<RoomId, CreatureKind | null> = {}
  const hostile: Record<RoomId, boolean> = {}
  for (const id of Object.keys(labyrinth.rooms)) {
    const room = labyrinth.rooms[id] as Room
    creatures[id] = room.creature
    hostile[id] = room.creatureHostile
  }

  /** Rooms nothing may drift into. The player's room is deliberately NOT one. */
  const blocked = (id: RoomId): boolean => {
    if (id === labyrinth.entranceId) return true
    if (id === labyrinth.heartRoomId) return true
    if (id === context.wumpusRoomId) return true
    if (creatures[id] != null) return true
    if ((labyrinth.rooms[id] as Room | undefined)?.hazard != null) return true
    return false
  }

  // Iterate a SNAPSHOT of starting positions so nothing moves twice, but test
  // occupancy against the working state so two creatures cannot collide.
  const movedCreatures: { kind: CreatureKind; from: RoomId; to: RoomId; hostile: boolean }[] = []
  const startingCreatureRooms = sortedIds(
    Object.keys(labyrinth.rooms).filter((id) => (labyrinth.rooms[id] as Room).creature !== null),
  )

  for (const from of startingCreatureRooms) {
    const kind = creatures[from]
    if (!kind) continue
    if (!rng.chance(creatureP)) continue

    const options = sortedIds(neighbourIds(labyrinth, from)).filter((id) => !blocked(id))
    if (options.length === 0) continue

    const to = rng.pick(options)
    const angry = hostile[from] ?? false
    creatures[from] = null
    hostile[from] = false
    creatures[to] = kind
    hostile[to] = angry
    movedCreatures.push({ kind, from, to, hostile: angry })
  }

  if (movedCreatures.length === 0) return { labyrinth, movedCreatures: [] }

  // Rebuild only what changed.
  const rooms: Record<RoomId, Room> = { ...labyrinth.rooms }
  const touched = new Set<RoomId>()
  for (const m of movedCreatures) {
    touched.add(m.from)
    touched.add(m.to)
  }
  for (const id of touched) {
    const room = labyrinth.rooms[id] as Room
    rooms[id] = { ...room, creature: creatures[id] ?? null, creatureHostile: hostile[id] ?? false }
  }

  return { labyrinth: { ...labyrinth, rooms }, movedCreatures }
}
