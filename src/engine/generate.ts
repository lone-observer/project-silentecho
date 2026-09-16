/**
 * Labyrinth generation. See docs/GDD.md 2.2, 2.8.
 *
 * Pure and seeded: the same seed and difficulty always produce the same
 * labyrinth, forever. The Rng is injected (CLAUDE.md 2.1, 2.2).
 *
 *   1. Randomised-DFS spanning tree over the grid, then braid extra edges back
 *      in. A perfect maze is wrong for an evasion game: one path between any
 *      two rooms means escaping is retracing your steps into the thing chasing
 *      you. Loops give route choice.
 *   2. Entrance on the boundary; Heart inside the difficulty's distance band.
 *   3. Populate, then REPAIR toward the difficulty contract (see below).
 *   4. Archetypes, biased toward whatever hazard each room holds.
 *
 * The repair pass is the part that matters. Random hazard placement produced a
 * generator where 68.7% of seeds forced the player across a hazard to reach the
 * Heart, and where the safe route — when one existed at all — was usually free.
 * That is not a risk/reward decision, it is a toll. Generation now places,
 * measures and adjusts until the map satisfies its difficulty's contract.
 */

import type {
  CreatureKind,
  Difficulty,
  Direction,
  Epitaph,
  HazardKind,
  Labyrinth,
  Room,
  RoomArchetype,
  RoomId,
} from './types.ts'
import { DIRECTIONS } from './types.ts'
import type { Rng } from './rng.ts'
import {
  DEFAULT_DIFFICULTY,
  DIFFICULTY,
  GENERATION,
  HAZARD_COUNTS,
  POPULATION,
  RUN,
} from './data/tuning.ts'

// ---------------------------------------------------------------------------
// Grid helpers
// ---------------------------------------------------------------------------

export function roomIdAt(x: number, y: number): RoomId {
  return `${x}-${y}`
}

function coordsOf(id: RoomId): [number, number] {
  const [x, y] = id.split('-').map(Number)
  return [x as number, y as number]
}

const DELTA: Record<Direction, readonly [number, number]> = {
  N: [0, -1], E: [1, 0], S: [0, 1], W: [-1, 0],
}
const OPPOSITE: Record<Direction, Direction> = { N: 'S', E: 'W', S: 'N', W: 'E' }

type Exits = Record<RoomId, Partial<Record<Direction, RoomId>>>

function neighbours(exits: Exits, id: RoomId): RoomId[] {
  const e = exits[id]
  if (!e) return []
  return DIRECTIONS.map((d) => e[d]).filter((x): x is RoomId => x !== undefined)
}

/** Shortest-path distance from `fromId` to every reachable room. */
export function distancesFrom(labyrinth: Labyrinth, fromId: RoomId): Record<RoomId, number> {
  const exits: Exits = {}
  for (const id of Object.keys(labyrinth.rooms)) exits[id] = (labyrinth.rooms[id] as Room).exits
  return bfsDistances(exits, fromId)
}

function bfsDistances(exits: Exits, fromId: RoomId): Record<RoomId, number> {
  const dist: Record<RoomId, number> = { [fromId]: 0 }
  const queue: RoomId[] = [fromId]
  for (let head = 0; head < queue.length; head++) {
    const id = queue[head] as RoomId
    const d = dist[id] as number
    for (const n of neighbours(exits, id)) {
      if (dist[n] === undefined) {
        dist[n] = d + 1
        queue.push(n)
      }
    }
  }
  return dist
}

/** Shortest path, refusing to pass through `blocked` (the destination is exempt). */
function pathAvoiding(exits: Exits, from: RoomId, to: RoomId, blocked: ReadonlySet<RoomId>): RoomId[] | null {
  if (blocked.has(from)) return null
  const prev: Record<RoomId, RoomId | null> = { [from]: null }
  const queue: RoomId[] = [from]
  for (let head = 0; head < queue.length; head++) {
    const id = queue[head] as RoomId
    if (id === to) break
    for (const n of neighbours(exits, id)) {
      if (prev[n] !== undefined) continue
      if (blocked.has(n) && n !== to) continue
      prev[n] = id
      queue.push(n)
    }
  }
  if (prev[to] === undefined) return null
  const out: RoomId[] = []
  for (let cursor: RoomId | null = to; cursor !== null; cursor = prev[cursor] as RoomId | null) out.unshift(cursor)
  return out
}

export function roomsAtLeast(labyrinth: Labyrinth, fromId: RoomId, min: number): RoomId[] {
  const dist = distancesFrom(labyrinth, fromId)
  return Object.keys(dist)
    .filter((id) => (dist[id] as number) >= min)
    .sort((a, b) => (dist[a] as number) - (dist[b] as number))
}

export function chooseWumpusStart(labyrinth: Labyrinth, rng: Rng): RoomId {
  const eligible = roomsAtLeast(labyrinth, labyrinth.entranceId, GENERATION.minWumpusStartDistance)
    .filter((id) => id !== labyrinth.heartRoomId)
  if (eligible.length > 0) return rng.pick(eligible)
  const dist = distancesFrom(labyrinth, labyrinth.entranceId)
  return Object.keys(dist).reduce((far, id) => ((dist[id] as number) > (dist[far] as number) ? id : far))
}

// ---------------------------------------------------------------------------
// Route analysis — the vocabulary the difficulty contracts are written in
// ---------------------------------------------------------------------------

export interface RouteReport {
  /** 0 = every route meets something; 1 = one fragile safe route; 2 = two distinct ones. */
  readonly safeRoutes: 0 | 1 | 2
  /** Extra moves the safe route costs over the shortest one. */
  readonly safeDetour: number
  readonly shortestLength: number
  readonly pitFree: boolean
}

interface Population {
  readonly hazards: Record<RoomId, HazardKind>
  readonly creatures: Record<RoomId, CreatureKind>
}

/** Rooms a cautious player would refuse to enter: any hazard, or a creature. */
function unsafeRooms(pop: Population): Set<RoomId> {
  return new Set([...Object.keys(pop.hazards), ...Object.keys(pop.creatures)])
}

function pitRooms(pop: Population): Set<RoomId> {
  return new Set(Object.keys(pop.hazards).filter((id) => pop.hazards[id] === 'pit'))
}

function analyseRoutes(exits: Exits, entrance: RoomId, heart: RoomId, pop: Population): RouteReport {
  const shortest = pathAvoiding(exits, entrance, heart, new Set())
  const shortestLength = shortest ? shortest.length - 1 : Infinity

  const pitFree = pathAvoiding(exits, entrance, heart, pitRooms(pop)) !== null

  const unsafe = unsafeRooms(pop)
  const safe = pathAvoiding(exits, entrance, heart, unsafe)
  if (!safe) return { safeRoutes: 0, safeDetour: 0, shortestLength, pitFree }

  const safeDetour = safe.length - 1 - shortestLength

  // Two routes count as distinct when closing any single room on the first
  // still leaves a hazard-free way through.
  for (const room of safe.slice(1, -1)) {
    const alt = pathAvoiding(exits, entrance, heart, new Set([...unsafe, room]))
    if (alt) return { safeRoutes: 2, safeDetour, shortestLength, pitFree }
  }
  return { safeRoutes: 1, safeDetour, shortestLength, pitFree }
}

/** Public: analyse a finished labyrinth. Used by tests and the map tool. */
export function routeReport(labyrinth: Labyrinth): RouteReport {
  const exits: Exits = {}
  const hazards: Record<RoomId, HazardKind> = {}
  const creatures: Record<RoomId, CreatureKind> = {}
  for (const id of Object.keys(labyrinth.rooms)) {
    const room = labyrinth.rooms[id] as Room
    exits[id] = room.exits
    if (room.hazard) hazards[id] = room.hazard
    if (room.creature) creatures[id] = room.creature
  }
  return analyseRoutes(exits, labyrinth.entranceId, labyrinth.heartRoomId, { hazards, creatures })
}

// ---------------------------------------------------------------------------
// Maze construction
// ---------------------------------------------------------------------------

interface Edge { readonly a: RoomId; readonly b: RoomId }

function spanningTree(width: number, height: number, rng: Rng): Edge[] {
  const start = roomIdAt(rng.int(0, width - 1), rng.int(0, height - 1))
  const visited = new Set<RoomId>([start])
  const stack: RoomId[] = [start]
  const edges: Edge[] = []

  while (stack.length > 0) {
    const current = stack[stack.length - 1] as RoomId
    const [cx, cy] = coordsOf(current)
    const open = rng.shuffle(DIRECTIONS).filter((dir) => {
      const [dx, dy] = DELTA[dir]
      const nx = cx + dx
      const ny = cy + dy
      return nx >= 0 && ny >= 0 && nx < width && ny < height && !visited.has(roomIdAt(nx, ny))
    })
    const dir = open[0]
    if (dir === undefined) { stack.pop(); continue }
    const [dx, dy] = DELTA[dir]
    const next = roomIdAt(cx + dx, cy + dy)
    edges.push({ a: current, b: next })
    visited.add(next)
    stack.push(next)
  }
  return edges
}

function allGridEdges(width: number, height: number): Edge[] {
  const edges: Edge[] = []
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (x + 1 < width) edges.push({ a: roomIdAt(x, y), b: roomIdAt(x + 1, y) })
      if (y + 1 < height) edges.push({ a: roomIdAt(x, y), b: roomIdAt(x, y + 1) })
    }
  }
  return edges
}

const edgeKey = (e: Edge): string => [e.a, e.b].sort().join('|')

function buildExits(width: number, height: number, edges: readonly Edge[]): Exits {
  const exits: Exits = {}
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) exits[roomIdAt(x, y)] = {}
  for (const e of edges) {
    const [ax, ay] = coordsOf(e.a)
    const [bx, by] = coordsOf(e.b)
    const dir = DIRECTIONS.find((d) => {
      const [dx, dy] = DELTA[d]
      return ax + dx === bx && ay + dy === by
    })
    if (!dir) continue
    ;(exits[e.a] as Partial<Record<Direction, RoomId>>)[dir] = e.b
    ;(exits[e.b] as Partial<Record<Direction, RoomId>>)[OPPOSITE[dir]] = e.a
  }
  return exits
}

// ---------------------------------------------------------------------------
// Archetypes
// ---------------------------------------------------------------------------

const ARCHETYPE_FOR_HAZARD: Record<HazardKind, RoomArchetype> = {
  pit: 'floodedGallery',
  sporeBloom: 'fungalGrotto',
  snareCarving: 'carvedHall',
  portal: 'collapsedShrine',
}

const NEUTRAL_ARCHETYPES: readonly RoomArchetype[] = [
  'hewnChamber', 'floodedGallery', 'fungalGrotto', 'collapsedShrine', 'carvedHall',
]

const BESTIARY: readonly CreatureKind[] = ['goblin', 'lumewing', 'grellhound', 'quietOne']

/** Tolls are never pits: a pit is an instant-loss check and must stay optional. */
const TOLL_HAZARDS: readonly HazardKind[] = ['sporeBloom', 'snareCarving']

// ---------------------------------------------------------------------------
// Generation
// ---------------------------------------------------------------------------

export interface GenerateOptions {
  readonly difficulty?: Difficulty
  readonly width?: number
  readonly height?: number
  readonly epitaphs?: readonly Epitaph[]
}

interface Attempt {
  readonly exits: Exits
  readonly entranceId: RoomId
  readonly heartRoomId: RoomId
  readonly pop: Population
  readonly oil: Set<RoomId>
  readonly graves: Record<RoomId, Epitaph>
  readonly report: RouteReport
  readonly score: number
}

export function generateLabyrinth(rng: Rng, options: GenerateOptions = {}): Labyrinth {
  const difficulty = options.difficulty ?? DEFAULT_DIFFICULTY
  const contract = DIFFICULTY[difficulty]
  const width = options.width ?? RUN.gridWidth
  const height = options.height ?? RUN.gridHeight
  const seed = rng.getState().seed

  let best: Attempt | null = null

  for (let attempt = 0; attempt < GENERATION.maxGenerationAttempts; attempt++) {
    const candidate = buildAttempt(rng, width, height, contract, options.epitaphs ?? [])
    if (!candidate) continue
    if (candidate.score === 0) return assemble(candidate, seed, difficulty, width, height, rng)
    if (best === null || candidate.score < best.score) best = candidate
  }

  // Nothing satisfied the contract exactly; ship the closest near-miss rather
  // than looping forever. Tests assert how often this happens.
  if (!best) throw new Error(`generateLabyrinth: no viable labyrinth for seed ${seed}`)
  return assemble(best, seed, difficulty, width, height, rng)
}

function buildAttempt(
  rng: Rng,
  width: number,
  height: number,
  contract: (typeof DIFFICULTY)[Difficulty],
  epitaphs: readonly Epitaph[],
): Attempt | null {
  const tree = spanningTree(width, height, rng)
  const treeKeys = new Set(tree.map(edgeKey))
  const spare = allGridEdges(width, height).filter((e) => !treeKeys.has(edgeKey(e)))
  const braided = rng.shuffle(spare).slice(0, Math.floor(spare.length * GENERATION.braidRatio))
  const exits = buildExits(width, height, [...tree, ...braided])

  const boundary: RoomId[] = []
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (x === 0 || y === 0 || x === width - 1 || y === height - 1) boundary.push(roomIdAt(x, y))
    }
  }
  const entranceId = rng.pick(boundary)

  const dist = bfsDistances(exits, entranceId)
  const [lo, hi] = contract.heartDistance
  const inBand = Object.keys(dist).filter((id) => {
    const d = dist[id] as number
    return d >= lo && d <= hi
  })
  if (inBand.length === 0) return null
  const heartRoomId = rng.pick(inBand)

  // Initial population. One thing per room keeps every room's tells unambiguous.
  const reserved = new Set<RoomId>([entranceId, heartRoomId])
  const open = rng.shuffle(Object.keys(exits).filter((id) => !reserved.has(id)))
  let cursor = 0
  const take = (n: number): RoomId[] => open.slice(cursor, (cursor += n))

  const hazards: Record<RoomId, HazardKind> = {}
  for (const hazard of Object.keys(HAZARD_COUNTS) as HazardKind[]) {
    const [min, max] = HAZARD_COUNTS[hazard]
    for (const id of take(rng.int(min, max))) hazards[id] = hazard
  }
  const creatures: Record<RoomId, CreatureKind> = {}
  for (const id of take(rng.int(POPULATION.creatures[0], POPULATION.creatures[1]))) {
    creatures[id] = rng.pick(BESTIARY)
  }
  const oil = new Set(take(rng.int(POPULATION.oilFlasks[0], POPULATION.oilFlasks[1])))
  const graves: Record<RoomId, Epitaph> = {}
  take(Math.min(POPULATION.maxGraves, epitaphs.length)).forEach((id, i) => {
    const epitaph = epitaphs[i]
    if (epitaph) graves[id] = epitaph
  })

  const spareRooms = open.slice(cursor)
  const pop: Population = { hazards, creatures }
  repairToContract(exits, entranceId, heartRoomId, pop, contract, spareRooms, oil, graves, rng)

  const report = analyseRoutes(exits, entranceId, heartRoomId, pop)
  const score =
    (report.pitFree ? 0 : 100) +
    Math.abs(report.safeRoutes - contract.safeRoutes) * 10 +
    (report.safeRoutes > 0 ? Math.max(0, contract.minSafeDetour - report.safeDetour) : 0)

  return { exits, entranceId, heartRoomId, pop, oil, graves, report, score }
}

/**
 * Place, measure, adjust. Each pass nudges the map one step toward its
 * difficulty contract; bounded so a pathological layout cannot spin forever.
 */
function repairToContract(
  exits: Exits,
  entrance: RoomId,
  heart: RoomId,
  pop: Population,
  contract: (typeof DIFFICULTY)[Difficulty],
  spareRooms: readonly RoomId[],
  oil: ReadonlySet<RoomId>,
  graves: Readonly<Record<RoomId, Epitaph>>,
  rng: Rng,
): void {
  const hazards = pop.hazards as Record<RoomId, HazardKind>
  const occupied = (id: RoomId): boolean =>
    hazards[id] !== undefined || pop.creatures[id] !== undefined || oil.has(id) || graves[id] !== undefined

  for (let pass = 0; pass < GENERATION.maxRepairPasses; pass++) {
    // 1. The pit-free guarantee comes first and outranks every other goal.
    if (pathAvoiding(exits, entrance, heart, pitRooms(pop)) === null) {
      const pits = Object.keys(hazards).filter((id) => hazards[id] === 'pit')
      const victim = pits.length > 0 ? rng.pick(pits) : null
      if (victim === null) break
      delete hazards[victim]
      const home = spareRooms.find((id) => !occupied(id))
      if (home) hazards[home] = 'pit'
      continue
    }

    const report = analyseRoutes(exits, entrance, heart, pop)

    // 2. Too many safe routes — charge a toll on the safest one.
    if (report.safeRoutes > contract.safeRoutes) {
      if (!addToll(exits, entrance, heart, pop, occupied, rng)) break
      continue
    }

    // 3. Too few — open one up by clearing a hazard off the fast path.
    if (report.safeRoutes < contract.safeRoutes) {
      const fast = pathAvoiding(exits, entrance, heart, new Set())
      const blockers = (fast ?? []).slice(1, -1).filter((id) => hazards[id] !== undefined && hazards[id] !== 'pit')
      if (blockers.length === 0) break
      delete hazards[rng.pick(blockers)]
      continue
    }

    // 4. Right number of routes, but safety is too cheap to be a decision.
    if (contract.safeRoutes > 0 && report.safeDetour < contract.minSafeDetour) {
      if (!addToll(exits, entrance, heart, pop, occupied, rng)) break
      continue
    }

    return // contract satisfied
  }
}

/** Drops a non-pit hazard onto the current shortest route, pushing players off it. */
function addToll(
  exits: Exits,
  entrance: RoomId,
  heart: RoomId,
  pop: Population,
  occupied: (id: RoomId) => boolean,
  rng: Rng,
): boolean {
  const fast = pathAvoiding(exits, entrance, heart, new Set())
  if (!fast) return false
  const candidates = fast.slice(1, -1).filter((id) => !occupied(id))
  if (candidates.length === 0) return false
  ;(pop.hazards as Record<RoomId, HazardKind>)[rng.pick(candidates)] = rng.pick(TOLL_HAZARDS)
  return true
}

function assemble(
  a: Attempt,
  seed: number,
  difficulty: Difficulty,
  width: number,
  height: number,
  rng: Rng,
): Labyrinth {
  const rooms: Record<RoomId, Room> = {}
  for (const id of Object.keys(a.exits)) {
    const [x, y] = coordsOf(id)
    const hazard = a.pop.hazards[id] ?? null
    const thematic = hazard ? ARCHETYPE_FOR_HAZARD[hazard] : null
    const archetype: RoomArchetype =
      id === a.heartRoomId
        ? 'heartChamber'
        : thematic && rng.chance(GENERATION.archetypeAffinity)
          ? thematic
          : rng.pick(NEUTRAL_ARCHETYPES)

    rooms[id] = {
      id, x, y, archetype,
      exits: a.exits[id] as Partial<Record<Direction, RoomId>>,
      hazard,
      creature: a.pop.creatures[id] ?? null,
      isEntrance: id === a.entranceId,
      hasHeart: id === a.heartRoomId,
      oilFlask: a.oil.has(id),
      grave: a.graves[id] ?? null,
      visited: false,
    }
  }
  return { seed, difficulty, width, height, rooms, entranceId: a.entranceId, heartRoomId: a.heartRoomId }
}
