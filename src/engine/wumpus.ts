/**
 * The Wumpus, and the scent it hunts by. See docs/GDD.md 2.4, 2.10.
 *
 * The design goal, from which everything here follows:
 *
 *   The player should ALWAYS be able to tell it is coming, and should still
 *   sometimes get caught.
 *
 * So this is not a chaser. It is a weather system with intent: it navigates
 * toward the strongest scent it can perceive, it never sees through walls, and
 * it never knows where the player is except by smelling where they have been.
 * Everything it does is legible from the tells, and the tells never lie
 * (CLAUDE.md 3).
 *
 * Pure and deterministic — no ambient state, all randomness injected.
 */

import type {
  Direction,
  Labyrinth,
  RoomId,
  ScentField,
  Tell,
  TellKind,
  Wumpus,
  WumpusTier,
} from './types.ts'
import { DIRECTIONS } from './types.ts'
import type { Rng } from './rng.ts'
import type { TellRange } from './data/tuning.ts'
import { SCENT, WUMPUS_TIERS } from './data/tuning.ts'

// ---------------------------------------------------------------------------
// Scent
// ---------------------------------------------------------------------------

export function emptyScent(): ScentField {
  return {}
}

/** Adds to a room's trail. Deposits accumulate: standing still twice is louder. */
export function depositScent(scent: ScentField, roomId: RoomId, amount: number): ScentField {
  if (amount <= 0) return scent
  return { ...scent, [roomId]: (scent[roomId] ?? 0) + amount }
}

/** One turn of decay. Trails below SCENT.epsilon are dropped entirely. */
export function decayScent(scent: ScentField): ScentField {
  const next: Record<RoomId, number> = {}
  for (const [roomId, value] of Object.entries(scent)) {
    const faded = value * SCENT.decayFactor
    if (faded >= SCENT.epsilon) next[roomId] = faded
  }
  return next
}

export function scentAt(scent: ScentField, roomId: RoomId): number {
  return scent[roomId] ?? 0
}

// ---------------------------------------------------------------------------
// Graph helpers
// ---------------------------------------------------------------------------

function exitsOf(labyrinth: Labyrinth, id: RoomId): Partial<Record<Direction, RoomId>> {
  return labyrinth.rooms[id]?.exits ?? {}
}

function neighbours(labyrinth: Labyrinth, id: RoomId): RoomId[] {
  const exits = exitsOf(labyrinth, id)
  return DIRECTIONS.map((d) => exits[d]).filter((x): x is RoomId => x !== undefined)
}

/** Rooms within `radius` of `from`, with their distances. Includes `from` at 0. */
function withinRadius(labyrinth: Labyrinth, from: RoomId, radius: number): Record<RoomId, number> {
  const dist: Record<RoomId, number> = { [from]: 0 }
  const queue: RoomId[] = [from]
  for (let head = 0; head < queue.length; head++) {
    const id = queue[head] as RoomId
    const d = dist[id] as number
    if (d >= radius) continue
    for (const n of neighbours(labyrinth, id)) {
      if (dist[n] === undefined) {
        dist[n] = d + 1
        queue.push(n)
      }
    }
  }
  return dist
}

/**
 * The first step of a shortest path from `from` toward `to`.
 * Ties are broken by the injected Rng, so a symmetric labyrinth does not
 * produce a Wumpus that always favours north.
 */
function stepToward(labyrinth: Labyrinth, from: RoomId, to: RoomId, rng: Rng): RoomId | null {
  if (from === to) return null

  // BFS outward from the destination; every neighbour of `from` whose distance
  // is minimal is an equally good first step.
  const dist: Record<RoomId, number> = { [to]: 0 }
  const queue: RoomId[] = [to]
  for (let head = 0; head < queue.length; head++) {
    const id = queue[head] as RoomId
    const d = dist[id] as number
    for (const n of neighbours(labyrinth, id)) {
      if (dist[n] === undefined) {
        dist[n] = d + 1
        queue.push(n)
      }
    }
  }

  const options = neighbours(labyrinth, from).filter((n) => dist[n] !== undefined)
  if (options.length === 0) return null
  const best = Math.min(...options.map((n) => dist[n] as number))
  if ((dist[from] ?? Infinity) <= best) return null
  return rng.pick(options.filter((n) => dist[n] === best))
}

// ---------------------------------------------------------------------------
// Perception
// ---------------------------------------------------------------------------

export interface Perception {
  /** The strongest trail the Wumpus can currently smell, if any. */
  readonly target: RoomId | null
  readonly strength: number
  readonly distance: number
}

/**
 * What the Wumpus can smell right now. It perceives ONLY scent, ONLY within its
 * tier's radius, and only through actual doorways — never through walls, and
 * never the player's position directly.
 */
export function perceive(labyrinth: Labyrinth, wumpus: Wumpus, scent: ScentField): Perception {
  const profile = WUMPUS_TIERS[wumpus.tier]
  const reach = withinRadius(labyrinth, wumpus.roomId, profile.perceptionRadius)

  let target: RoomId | null = null
  let strength = 0
  let distance = Infinity

  for (const [roomId, d] of Object.entries(reach)) {
    const value = scentAt(scent, roomId)
    if (value <= 0) continue
    // Strongest wins; ties go to the nearer room, which reads as "it follows
    // the freshest thing it can actually get to".
    if (value > strength || (value === strength && d < distance)) {
      target = roomId
      strength = value
      distance = d
    }
  }

  return { target, strength, distance: target === null ? Infinity : distance }
}

// ---------------------------------------------------------------------------
// Movement
// ---------------------------------------------------------------------------

export interface MoveContext {
  /** True once the Heart has left its plinth. Tier 4 then guards the way out. */
  readonly carryingHeart: boolean
  readonly entranceId: RoomId
  /**
   * The player's exact room, granted for a single turn when the Heart is taken
   * (GDD 2.10). This is the ONLY way the Wumpus ever learns a position it did
   * not smell for itself — pass null on every other turn.
   */
  readonly revealedPlayerRoom?: RoomId | null
}

export type MoveReason =
  | 'resting' //    not due to move yet
  | 'hunting' //    following a trail it can smell
  | 'remembering' // trail lost; heading for where the trail last was
  | 'guarding' //   tier 4, player has the Heart: moving to cut off the exit
  | 'avoiding' //   tier 1: shying away from noise
  | 'wandering' //  nothing to go on

export interface MoveResult {
  readonly wumpus: Wumpus
  readonly moved: boolean
  readonly reason: MoveReason
}

/**
 * Advance the Wumpus by one turn.
 *
 * Order of intent:
 *   1. Not due to move yet -> rest (but still update what it knows).
 *   2. Tier 1 is DROWSING: it shies away from noise. That is the teaching tier —
 *      the player learns the stench means danger while danger is still avoidable.
 *   3. A revealed position (Heart just taken) overrides everything.
 *   4. Tier 4 carrying-Heart: head for the entrance and wait there. The escape,
 *      not the approach, is meant to be the hard part.
 *   5. Smell something -> move toward it.
 *   6. Smelled something recently -> move toward where it was, until memory rots.
 *   7. Otherwise wander, preferring not to double back.
 */
export function moveWumpus(
  labyrinth: Labyrinth,
  wumpus: Wumpus,
  scent: ScentField,
  context: MoveContext,
  rng: Rng,
): MoveResult {
  const profile = WUMPUS_TIERS[wumpus.tier]
  const sensed = perceive(labyrinth, wumpus, scent)

  // Memory updates whether or not it is due to move.
  let lastKnown = wumpus.lastKnownPlayerRoom
  let memoryAge = wumpus.memoryAge
  if (context.revealedPlayerRoom) {
    lastKnown = context.revealedPlayerRoom
    memoryAge = 0
  } else if (sensed.target) {
    lastKnown = sensed.target
    memoryAge = 0
  } else if (lastKnown !== null) {
    memoryAge += 1
    if (memoryAge > profile.memoryTurns) {
      lastKnown = null
      memoryAge = 0
    }
  }

  const remembered = { ...wumpus, lastKnownPlayerRoom: lastKnown, memoryAge }

  if (wumpus.moveCooldown > 0) {
    return {
      wumpus: { ...remembered, moveCooldown: wumpus.moveCooldown - 1 },
      moved: false,
      reason: 'resting',
    }
  }

  const options = neighbours(labyrinth, wumpus.roomId)
  if (options.length === 0) {
    return { wumpus: remembered, moved: false, reason: 'resting' }
  }

  let destination: RoomId | null = null
  let reason: MoveReason = 'wandering'

  if (wumpus.tier === 1 && sensed.target !== null) {
    // Drowsing: actively avoids loud rooms.
    const quietest = Math.min(...options.map((n) => scentAt(scent, n)))
    destination = rng.pick(options.filter((n) => scentAt(scent, n) === quietest))
    reason = 'avoiding'
  } else if (context.revealedPlayerRoom) {
    destination = stepToward(labyrinth, wumpus.roomId, context.revealedPlayerRoom, rng)
    reason = 'hunting'
  } else if (sensed.target !== null) {
    // A live trail always beats guarding the door. The hunt visualiser caught
    // the inverse of this: a Tier 4 Wumpus standing one room from a player it
    // could plainly smell, walking off to the entrance instead. Guarding is
    // what it does when it has LOST you, and that is scarier anyway.
    destination = stepToward(labyrinth, wumpus.roomId, sensed.target, rng)
    reason = 'hunting'
  } else if (profile.anticipatesExit && context.carryingHeart) {
    destination = stepToward(labyrinth, wumpus.roomId, context.entranceId, rng)
    reason = 'guarding'
  } else if (lastKnown !== null) {
    destination = stepToward(labyrinth, wumpus.roomId, lastKnown, rng)
    reason = 'remembering'
  }

  if (destination === null) {
    // Prefer not to double straight back — otherwise it oscillates in corridors
    // and stops reading as a thing with intent.
    const forward = options.filter((n) => n !== wumpus.lastRoomId)
    destination = rng.pick(forward.length > 0 ? forward : options)
    reason = reason === 'wandering' ? 'wandering' : reason
  }

  return {
    wumpus: {
      ...remembered,
      roomId: destination,
      lastRoomId: wumpus.roomId,
      moveCooldown: profile.moveEveryNTurns - 1,
    },
    moved: true,
    reason,
  }
}

export function createWumpus(startRoomId: RoomId, tier: WumpusTier): Wumpus {
  return {
    roomId: startRoomId,
    lastRoomId: null,
    tier,
    moveCooldown: WUMPUS_TIERS[tier].moveEveryNTurns - 1,
    lastKnownPlayerRoom: null,
    memoryAge: 0,
  }
}

/** Taking the Heart escalates the hunt by one tier, capped at 4. GDD 2.10 */
export function escalate(wumpus: Wumpus, steps = 1): Wumpus {
  const tier = Math.min(4, wumpus.tier + steps) as WumpusTier
  if (tier === wumpus.tier) return wumpus
  return { ...wumpus, tier, moveCooldown: Math.min(wumpus.moveCooldown, WUMPUS_TIERS[tier].moveEveryNTurns - 1) }
}

export function hasCaught(wumpus: Wumpus, playerRoomId: RoomId): boolean {
  return wumpus.roomId === playerRoomId
}

// ---------------------------------------------------------------------------
// Tells — the honest half of the contract
// ---------------------------------------------------------------------------

export interface TellOptions {
  /** From the oil band. `facing` restricts WHICH doorways report, never whether they tell the truth. */
  readonly tellRange: TellRange
  /** Confused suppresses tells entirely for its duration. GDD 2.8.2 */
  readonly confused: boolean
  /** Direction of the player's last move; null means they sense all four. */
  readonly facing: Direction | null
  /** LISTEN buys the full set back for a turn, whatever the oil level. */
  readonly listening?: boolean
  /** Once the Heart is off its plinth it stops calling. Default false. */
  readonly heartTaken?: boolean
}

const TELL_FOR_HAZARD: Record<string, TellKind> = {
  pit: 'draft',
  sporeBloom: 'sweetness',
  snareCarving: 'freshChisel',
  portal: 'hum',
}

/**
 * Everything leaking into the player's room, keyed by the doorway it comes through.
 *
 * INVARIANT: this is exhaustive and honest. A tell appears whenever its source
 * is adjacent and never when it is not. Darkness and Confused may reduce HOW
 * MANY doorways report; nothing may make a reported tell false.
 */
export function getTells(
  labyrinth: Labyrinth,
  playerRoomId: RoomId,
  wumpusRoomId: RoomId,
  options: TellOptions,
): Tell[] {
  if (options.confused) return []

  const exits = exitsOf(labyrinth, playerRoomId)
  // LISTEN buys back the full set for a turn; otherwise a dark lamp reports
  // only the doorway the player is facing. Range, never honesty.
  const listening = options.listening ?? false
  const restricted = options.tellRange === 'facing' && !listening && options.facing !== null

  const doorways = restricted
    ? ([options.facing] as Direction[])
    : DIRECTIONS

  const tells: Tell[] = []
  for (const direction of doorways) {
    const neighbourId = exits[direction]
    if (neighbourId === undefined) continue
    const room = labyrinth.rooms[neighbourId]
    if (!room) continue

    // Violet is reserved for the Wumpus and nothing else. GDD 2.4
    if (neighbourId === wumpusRoomId) tells.push({ direction, kind: 'stench' })
    if (room.hazard) {
      const kind = TELL_FOR_HAZARD[room.hazard]
      if (kind) tells.push({ direction, kind })
    }
    if (room.creature) tells.push({ direction, kind: 'skittering' })
    // The Heart calls only while it sits on the plinth — once carried, it is
    // in your hands, not through a doorway.
    if (room.hasHeart && !options.heartTaken) tells.push({ direction, kind: 'metallic' })
  }
  return tells
}

/** True when the Wumpus is close enough that ambience should drop out. GDD 2.13 */
export function wumpusIsNear(labyrinth: Labyrinth, playerRoomId: RoomId, wumpusRoomId: RoomId, radius = 2): boolean {
  return withinRadius(labyrinth, playerRoomId, radius)[wumpusRoomId] !== undefined
}
