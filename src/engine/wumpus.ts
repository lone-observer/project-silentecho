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
  DoorwaySense,
  HazardKind,
  Labyrinth,
  Room,
  RoomId,
  ScentField,
  Tell,
  TellKind,
  Wumpus,
  WumpusTier,
} from './types.ts'
import { DIRECTIONS } from './types.ts'
import type { Rng } from './rng.ts'
import { SCENT, WUMPUS, WUMPUS_TIERS } from './data/tuning.ts'

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
  /** Confused suppresses tells entirely for its duration. GDD 2.8.2 */
  readonly confused: boolean
  /**
   * Doorways `FOCUS` has resolved in this room. GDD 2.7 (18 Sep 2026).
   *
   * Everything NOT in this set still reports honestly — it reports PRESENCE.
   * The base lamp says a doorway has something behind it; what it is costs a
   * turn and a small price to learn. That is the whole of the information
   * economy, and it replaced the old oil-band `tellRange` restriction, which
   * gated by how much lamp you had left and which 1g measured as almost never
   * firing.
   */
  readonly resolved: readonly Direction[]
  /** Doorways a FOCUS is still available on this turn. Reported, never used here. */
  readonly focusable?: readonly Direction[]
  /** Once the Heart is off its plinth it stops calling. Default false. */
  readonly heartTaken?: boolean
  /**
   * Hazards a companion names for free, whatever the lamp and whatever FOCUS has
   * been spent (GDD 2.8.1 — the grellhound has no use for your lamp). Listed as
   * directions, and they resolve those doorways the same way a FOCUS does.
   */
  readonly freeDirections?: readonly Direction[]
}

const TELL_FOR_HAZARD: Record<string, TellKind> = {
  pit: 'draft',
  sporeBloom: 'sweetness',
  snareCarving: 'freshChisel',
  portal: 'hum',
}

/**
 * Which doorways the Wumpus's stench comes through, and it is NOT simply the
 * doorway it is standing behind. GDD 2.10, widened 18 Sep 2026.
 *
 * The mandatory tell now reaches `WUMPUS.mandatoryStenchRadius` rooms, so the
 * honest directional reading of "it is two rooms that way" is: the doorways that
 * lie on a SHORTEST path to it. A doorway reports when stepping through it gets
 * you strictly closer.
 *
 * Why not "every doorway whose room is within radius-1 of the Wumpus", which is
 * the easier thing to write: with the Wumpus one room north, a doorway east into
 * a room that also touches it would report a stench too, and the player would
 * read two directions for one monster. Both statements would be TRUE, and the
 * second would still be useless — GDD 2.4 is explicit that a tell points at the
 * doorway its source is through, not merely at a doorway near it.
 *
 * At radius 1 this reduces exactly to the old behaviour, which is what keeps the
 * shape of the fairness guarantee unchanged while the constant moves.
 */
function stenchDirections(
  labyrinth: Labyrinth,
  playerRoomId: RoomId,
  wumpusRoomId: RoomId,
): Direction[] {
  const reach = withinRadius(labyrinth, playerRoomId, WUMPUS.mandatoryStenchRadius)
  const distance = reach[wumpusRoomId]
  if (distance === undefined || distance === 0) return []

  const exits = exitsOf(labyrinth, playerRoomId)
  const out: Direction[] = []
  for (const direction of DIRECTIONS) {
    const neighbourId = exits[direction]
    if (neighbourId === undefined) continue
    // Distance from the far side of this doorway, measured out to the same
    // radius — a neighbour that is one step nearer the Wumpus is on a shortest
    // path to it, and that is the doorway the stench comes through.
    const fromNeighbour = withinRadius(labyrinth, neighbourId, WUMPUS.mandatoryStenchRadius)[wumpusRoomId]
    if (fromNeighbour !== undefined && fromNeighbour === distance - 1) out.push(direction)
  }
  return out
}

/**
 * Everything the player knows about each doorway this turn.
 *
 * INVARIANT, and it is the one this whole file exists to hold: nothing here is
 * ever false. What changed on 18 Sep 2026 is that a doorway now answers in two
 * registers rather than one — PRESENCE, which the lamp gives away for nothing,
 * and IDENTITY, which `FOCUS` buys one doorway at a time. Neither register can
 * lie. A doorway with `unresolved: true` is the engine saying "there is
 * something here and you have not looked", which is a fact; a doorway with
 * neither tells nor `unresolved` is the engine saying "there is nothing here",
 * which is also a fact, and the reason silence is worth something again.
 *
 * TWO CHANNELS ARE EXEMPT AND ALWAYS RESOLVED, per GDD 2.8.1: the Wumpus's own
 * stench, and any hazard a companion names (`freeDirections`). They are never
 * gated by oil, by FOCUS or by difficulty — that exemption is what keeps
 * CLAUDE.md 3's mandatory-adjacency guarantee intact underneath a real
 * information economy, and it is why a doorway can carry a resolved stench and
 * an unresolved remainder at the same time.
 */
export function getTells(
  labyrinth: Labyrinth,
  playerRoomId: RoomId,
  wumpusRoomId: RoomId,
  options: TellOptions,
): DoorwaySense[] {
  const exits = exitsOf(labyrinth, playerRoomId)
  const stench = new Set(stenchDirections(labyrinth, playerRoomId, wumpusRoomId))
  const resolved = new Set(options.resolved)
  const free = new Set(options.freeDirections ?? [])
  const focusable = new Set(options.focusable ?? [])

  const senses: DoorwaySense[] = []
  for (const direction of DIRECTIONS) {
    const neighbourId = exits[direction]
    if (neighbourId === undefined) continue
    const room = labyrinth.rooms[neighbourId]
    if (!room) continue

    // GDD 2.8.2: Confused is suppression, not misdirection — no tells at all,
    // and the player is told plainly that is why. It is reported per doorway
    // rather than as an empty list so a renderer cannot mistake it for safety.
    if (options.confused) {
      senses.push({ direction, tells: [], unresolved: false, suppressed: true, focusable: false })
      continue
    }

    const tells: Tell[] = []
    let unresolved = false
    const known = resolved.has(direction) || free.has(direction)

    // Violet is reserved for the Wumpus and nothing else (GDD 2.4), and it is
    // never hidden (CLAUDE.md 3) — it lands whether or not this doorway was
    // focused, so it is added outside the `known` branches entirely.
    if (stench.has(direction)) tells.push({ direction, kind: 'stench' })

    const hazard = activeHazardOf(room)
    if (hazard !== null) {
      const kind = TELL_FOR_HAZARD[hazard]
      if (kind) {
        if (known) tells.push({ direction, kind })
        else unresolved = true
      }
    }
    if (room.creature) {
      if (known) tells.push({ direction, kind: 'skittering' })
      else unresolved = true
    }
    // The Heart calls only while it sits on the plinth — once carried, it is
    // in your hands, not through a doorway.
    if (room.hasHeart && !options.heartTaken) {
      if (known) tells.push({ direction, kind: 'metallic' })
      else unresolved = true
    }

    senses.push({
      direction,
      tells,
      unresolved,
      suppressed: false,
      focusable: focusable.has(direction),
    })
  }
  return senses
}

/**
 * The hazard actually in a room, as opposed to the one generation put there.
 *
 * `DISARM` clears a bloom or a snare permanently (GDD 2.7) and records it as a
 * flag rather than by erasing `Room.hazard`, because generation's contracts —
 * the pit-free route, the hazard-free route counts, the minimum safe detour —
 * are claims about what was BUILT and have to stay checkable after a player has
 * been through. So every question about what is dangerous NOW comes through
 * here, and `Room.hazard` answers only "what was here to begin with".
 *
 * It lives in this module because `getTells` is the caller that must never get
 * it wrong: a disarmed bloom that went on leaking sweetness would be a tell
 * without a source, which is the exact half of CLAUDE.md 3 that says a tell
 * never appears for something that is not there.
 */
export function activeHazardOf(room: Pick<Room, 'hazard' | 'hazardCleared'>): HazardKind | null {
  return room.hazardCleared ? null : room.hazard
}

/** Every resolved tell across the doorways, for consumers that want them flat. */
export function tellsOf(senses: readonly DoorwaySense[]): Tell[] {
  return senses.flatMap((s) => s.tells)
}

/** True when the Wumpus is close enough that ambience should drop out. GDD 2.13 */
export function wumpusIsNear(
  labyrinth: Labyrinth,
  playerRoomId: RoomId,
  wumpusRoomId: RoomId,
  radius = WUMPUS.mandatoryStenchRadius,
): boolean {
  return withinRadius(labyrinth, playerRoomId, radius)[wumpusRoomId] !== undefined
}
