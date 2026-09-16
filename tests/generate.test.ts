import { describe, it, expect } from 'vitest'
import { createRng } from '../src/engine/rng.ts'
import {
  chooseWumpusStart,
  distancesFrom,
  generateLabyrinth,
  roomIdAt,
  roomsAtLeast,
  routeReport,
} from '../src/engine/generate.ts'
import { DIRECTIONS } from '../src/engine/types.ts'
import type { Difficulty, Direction, Labyrinth, Room } from '../src/engine/types.ts'
import { DIFFICULTY, GENERATION, HAZARD_COUNTS, POPULATION, RUN } from '../src/engine/data/tuning.ts'

const DIFFICULTIES: readonly Difficulty[] = ['drowsing', 'stirring', 'hunting', 'ravening']

// Generated once and shared — generation does real work per map.
const SEEDS = Array.from({ length: 60 }, (_, i) => i * 13 + 1)
const byDifficulty: Record<Difficulty, Labyrinth[]> = {
  drowsing: [], stirring: [], hunting: [], ravening: [],
}
for (const d of DIFFICULTIES) {
  byDifficulty[d] = SEEDS.map((s) => generateLabyrinth(createRng(s), { difficulty: d }))
}
const labs = Object.values(byDifficulty).flat()

const rooms = (lab: Labyrinth): Room[] => Object.values(lab.rooms)
const degree = (r: Room): number => DIRECTIONS.filter((d) => r.exits[d] !== undefined).length
const OPPOSITE: Record<Direction, Direction> = { N: 'S', E: 'W', S: 'N', W: 'E' }
const DELTA: Record<Direction, readonly [number, number]> = { N: [0, -1], E: [1, 0], S: [0, 1], W: [-1, 0] }

describe('structure', () => {
  it('is a full 10x10 grid', () => {
    for (const lab of labs) {
      expect(lab.width).toBe(RUN.gridWidth)
      expect(rooms(lab)).toHaveLength(RUN.gridWidth * RUN.gridHeight)
      for (let y = 0; y < lab.height; y++) {
        for (let x = 0; x < lab.width; x++) expect(lab.rooms[roomIdAt(x, y)]).toBeDefined()
      }
    }
  })

  it('records its own seed and difficulty', () => {
    for (const d of DIFFICULTIES) {
      byDifficulty[d].forEach((lab, i) => {
        expect(lab.difficulty).toBe(d)
        expect(lab.seed).toBe(SEEDS[i])
      })
    }
  })

  it('every room is reachable from the entrance', () => {
    for (const lab of labs) {
      const dist = distancesFrom(lab, lab.entranceId)
      expect(rooms(lab).filter((r) => dist[r.id] === undefined).map((r) => r.id)).toEqual([])
    }
  })

  it('exits are symmetric and grid-aligned', () => {
    for (const lab of labs) {
      for (const room of rooms(lab)) {
        for (const dir of DIRECTIONS) {
          const n = room.exits[dir]
          if (n === undefined) continue
          const [dx, dy] = DELTA[dir]
          expect(n).toBe(roomIdAt(room.x + dx, room.y + dy))
          expect(lab.rooms[n]!.exits[OPPOSITE[dir]]).toBe(room.id)
        }
      }
    }
  })

  it('is braided, not a perfect maze — evasion needs route choice', () => {
    for (const lab of labs) {
      const doors = rooms(lab).reduce((s, r) => s + degree(r), 0) / 2
      expect(doors).toBeGreaterThan(rooms(lab).length - 1)
      expect(degree(rooms(lab).find((r) => degree(r) === 0) ?? rooms(lab)[0]!)).toBeGreaterThan(0)
    }
  })
})

describe('the too-deep region', () => {
  it('leaves most of the map unreachable inside the turn budget', () => {
    // The point of a 10x10 map: the player never CHOOSES to go too deep, they
    // end up there by searching the wrong way. If everything were reachable in
    // half the turns, the labyrinth would just be a bigger 5x5.
    for (const lab of labs) {
      const dist = distancesFrom(lab, lab.entranceId)
      const half = Math.floor(DIFFICULTY[lab.difficulty].maxTurns / 2)
      const within = Object.values(dist).filter((d) => d <= half).length
      expect(within).toBeLessThan(rooms(lab).length)
    }
  })

  it('keeps the Heart inside the turn budget even so', () => {
    for (const lab of labs) {
      const d = distancesFrom(lab, lab.entranceId)[lab.heartRoomId] as number
      expect(d * 2).toBeLessThan(DIFFICULTY[lab.difficulty].maxTurns)
    }
  })
})

describe('difficulty contracts', () => {
  it('ALWAYS leaves a pit-free route — no exceptions, at any difficulty', () => {
    // A pit is an instant-loss check. Forcing one means a run can end to a die
    // roll the player had no way to avoid. See CLAUDE.md 3.
    const failures = labs.filter((lab) => !routeReport(lab).pitFree)
    expect(failures.map((l) => `${l.difficulty}:${l.seed}`)).toEqual([])
  })

  it('places the Heart inside each difficulty band', () => {
    for (const lab of labs) {
      const [lo, hi] = DIFFICULTY[lab.difficulty].heartDistance
      const d = distancesFrom(lab, lab.entranceId)[lab.heartRoomId] as number
      expect(d).toBeGreaterThanOrEqual(lo)
      expect(d).toBeLessThanOrEqual(hi)
    }
  })

  it('hits the target safe-route count on at least 95% of maps', () => {
    for (const d of DIFFICULTIES) {
      const target = DIFFICULTY[d].safeRoutes
      const hit = byDifficulty[d].filter((lab) => routeReport(lab).safeRoutes === target).length
      expect(hit / SEEDS.length, `${d} safe-route count`).toBeGreaterThanOrEqual(0.95)
    }
  })

  it('makes safety cost turns on at least 85% of maps that offer it', () => {
    // If the safe route is free, everyone takes it and hazards stop being a
    // decision — which is exactly what the first generator produced.
    for (const d of DIFFICULTIES) {
      const contract = DIFFICULTY[d]
      if (contract.safeRoutes === 0) continue
      const reports = byDifficulty[d].map(routeReport).filter((r) => r.safeRoutes > 0)
      const paid = reports.filter((r) => r.safeDetour >= contract.minSafeDetour).length
      expect(paid / reports.length, `${d} safe detour`).toBeGreaterThanOrEqual(0.85)
    }
  })

  it('forces an encounter at the top difficulties', () => {
    for (const d of ['hunting', 'ravening'] as Difficulty[]) {
      for (const lab of byDifficulty[d]) {
        expect(routeReport(lab).safeRoutes, `${d}:${lab.seed}`).toBe(0)
      }
    }
  })

  it('gives the gentlest difficulty genuine alternatives', () => {
    const reports = byDifficulty.drowsing.map(routeReport)
    expect(reports.filter((r) => r.safeRoutes === 2).length / reports.length).toBeGreaterThanOrEqual(0.95)
  })
})

describe('placement', () => {
  it('puts the entrance on the boundary', () => {
    for (const lab of labs) {
      const e = lab.rooms[lab.entranceId]!
      expect(e.x === 0 || e.y === 0 || e.x === lab.width - 1 || e.y === lab.height - 1).toBe(true)
      expect(e.isEntrance).toBe(true)
    }
  })

  it('marks exactly one Heart room, and it is the heartChamber', () => {
    for (const lab of labs) {
      const hearts = rooms(lab).filter((r) => r.hasHeart)
      expect(hearts).toHaveLength(1)
      expect(hearts[0]!.id).toBe(lab.heartRoomId)
      expect(hearts[0]!.archetype).toBe('heartChamber')
    }
  })

  it('keeps the entrance and Heart rooms clear', () => {
    for (const lab of labs) {
      for (const id of [lab.entranceId, lab.heartRoomId]) {
        const r = lab.rooms[id]!
        expect(r.hazard).toBeNull()
        expect(r.creature).toBeNull()
        expect(r.oilFlask).toBe(false)
      }
    }
  })

  it('never puts two things in one room', () => {
    for (const lab of labs) {
      for (const r of rooms(lab)) {
        const things = [r.hazard !== null, r.creature !== null, r.oilFlask, r.grave !== null]
        expect(things.filter(Boolean).length, `${r.id}`).toBeLessThanOrEqual(1)
      }
    }
  })

  it('stays within the configured population bounds, allowing for repair', () => {
    for (const lab of labs) {
      // The repair pass adds tolls and clears blockers, so counts move around
      // their configured range rather than sitting exactly inside it.
      const pits = rooms(lab).filter((r) => r.hazard === 'pit').length
      expect(pits).toBeGreaterThanOrEqual(0)
      expect(pits).toBeLessThanOrEqual(HAZARD_COUNTS.pit[1] + 2)

      const creatures = rooms(lab).filter((r) => r.creature !== null).length
      expect(creatures).toBeGreaterThanOrEqual(POPULATION.creatures[0])
      expect(creatures).toBeLessThanOrEqual(POPULATION.creatures[1])

      const oil = rooms(lab).filter((r) => r.oilFlask).length
      expect(oil).toBeGreaterThanOrEqual(POPULATION.oilFlasks[0])
      expect(oil).toBeLessThanOrEqual(POPULATION.oilFlasks[1])
    }
  })

  it('has retired the stone-grub from the v1 bestiary', () => {
    for (const lab of labs) {
      for (const r of rooms(lab)) expect(r.creature).not.toBe('stoneGrub')
    }
  })

  it('places graves only when the player has a history', () => {
    for (const lab of labs.slice(0, 40)) {
      expect(rooms(lab).filter((r) => r.grave !== null)).toHaveLength(0)
    }
    const epitaphs = Array.from({ length: 6 }, (_, i) => ({
      name: `LANTERNBEARER ${i}`, turn: 10 + i, outcome: 'caught' as const,
      carriedHeart: false, text: 'Taken on the tenth turn.',
    }))
    for (const seed of SEEDS.slice(0, 15)) {
      const lab = generateLabyrinth(createRng(seed), { epitaphs })
      const graves = rooms(lab).filter((r) => r.grave !== null)
      expect(graves.length).toBeGreaterThan(0)
      expect(graves.length).toBeLessThanOrEqual(POPULATION.maxGraves)
    }
  })
})

describe('the Wumpus start', () => {
  it('is far from the entrance and never on the Heart or entrance', () => {
    for (const seed of SEEDS.slice(0, 25)) {
      const rng = createRng(seed)
      const lab = generateLabyrinth(rng)
      const start = chooseWumpusStart(lab, rng)
      expect(distancesFrom(lab, lab.entranceId)[start]).toBeGreaterThanOrEqual(GENERATION.minWumpusStartDistance)
      expect(start).not.toBe(lab.heartRoomId)
      expect(start).not.toBe(lab.entranceId)
    }
  })
})

describe('determinism', () => {
  it('same seed and difficulty, identical labyrinth', () => {
    for (const d of DIFFICULTIES) {
      for (const seed of SEEDS.slice(0, 20)) {
        expect(generateLabyrinth(createRng(seed), { difficulty: d }))
          .toEqual(generateLabyrinth(createRng(seed), { difficulty: d }))
      }
    }
  })

  it('same seed, different difficulty, different labyrinth', () => {
    const seed = SEEDS[3]!
    const a = generateLabyrinth(createRng(seed), { difficulty: 'drowsing' })
    const b = generateLabyrinth(createRng(seed), { difficulty: 'ravening' })
    expect(a).not.toEqual(b)
  })

  it('is fully JSON-serializable', () => {
    for (const lab of labs.slice(0, 30)) {
      expect(JSON.parse(JSON.stringify(lab))).toEqual(lab)
    }
  })
})

describe('bfs helpers', () => {
  it('distancesFrom gives 0 for the origin and 1 for each neighbour', () => {
    const lab = labs[0]!
    const dist = distancesFrom(lab, lab.entranceId)
    expect(dist[lab.entranceId]).toBe(0)
    for (const dir of DIRECTIONS) {
      const n = lab.rooms[lab.entranceId]!.exits[dir]
      if (n !== undefined) expect(dist[n]).toBe(1)
    }
  })

  it('roomsAtLeast returns rooms beyond the threshold, nearest first', () => {
    const lab = labs[0]!
    const dist = distancesFrom(lab, lab.entranceId)
    const got = roomsAtLeast(lab, lab.entranceId, 4)
    for (const id of got) expect(dist[id]).toBeGreaterThanOrEqual(4)
    const ds = got.map((id) => dist[id] as number)
    expect(ds).toEqual([...ds].sort((a, b) => a - b))
  })
})

describe('archetypes', () => {
  it('reserves heartChamber for the Heart room alone', () => {
    for (const lab of labs) {
      expect(rooms(lab).filter((r) => r.archetype === 'heartChamber')).toHaveLength(1)
    }
  })

  it('biases hazard rooms toward their thematic archetype', () => {
    let blooms = 0, grottos = 0
    for (const lab of labs) {
      for (const r of rooms(lab)) {
        if (r.hazard === 'sporeBloom') { blooms++; if (r.archetype === 'fungalGrotto') grottos++ }
      }
    }
    expect(blooms).toBeGreaterThan(200)
    expect(grottos / blooms).toBeGreaterThan(0.6)
  })
})
