import { describe, it, expect } from 'vitest'
import { createRng } from '../src/engine/rng.ts'
import { chooseWumpusStart, distancesFrom, generateLabyrinth } from '../src/engine/generate.ts'
import {
  createWumpus, decayScent, depositScent, emptyScent, escalate,
  getTells, hasCaught, moveWumpus, perceive, scentAt, wumpusIsNear,
} from '../src/engine/wumpus.ts'
import { DIRECTIONS } from '../src/engine/types.ts'
import type { Labyrinth, RoomId, ScentField, WumpusTier } from '../src/engine/types.ts'
import { SCENT, WUMPUS_TIERS } from '../src/engine/data/tuning.ts'

const lab = (seed: number): Labyrinth => generateLabyrinth(createRng(seed), { difficulty: 'stirring' })
const L = lab(1)
/** Generation is the slow part; the fairness sweeps share one pool. */
const POOL = Array.from({ length: 120 }, (_, seed) => ({
  seed,
  lab: generateLabyrinth(createRng(seed), { difficulty: 'stirring' }),
}))
const anyRoom = (l: Labyrinth): RoomId => l.entranceId
const neighboursOf = (l: Labyrinth, id: RoomId): RoomId[] =>
  DIRECTIONS.map((d) => l.rooms[id]!.exits[d]).filter((x): x is RoomId => x !== undefined)

describe('scent', () => {
  it('accumulates in a room', () => {
    let s = emptyScent()
    s = depositScent(s, 'a', 1)
    s = depositScent(s, 'a', 2)
    expect(scentAt(s, 'a')).toBe(3)
  })

  it('ignores non-positive deposits and leaves the field untouched', () => {
    const s = emptyScent()
    expect(depositScent(s, 'a', 0)).toBe(s)
  })

  it('decays exponentially and drops below epsilon', () => {
    let s = depositScent(emptyScent(), 'a', 1)
    s = decayScent(s)
    expect(scentAt(s, 'a')).toBeCloseTo(SCENT.decayFactor, 5)
    for (let i = 0; i < 20; i++) s = decayScent(s)
    expect(Object.keys(s)).toEqual([])
  })

  it('a base deposit is essentially gone after SCENT.decayTurns', () => {
    let s = depositScent(emptyScent(), 'a', 1)
    for (let i = 0; i < SCENT.decayTurns; i++) s = decayScent(s)
    expect(scentAt(s, 'a')).toBeLessThan(0.1)
  })

  it('preserves ordering — a fight stays louder than a sneak for as long as both exist', () => {
    // The whole fight/tame asymmetry rests on this. Linear decay would not hold it.
    let s = emptyScent()
    s = depositScent(s, 'loud', 4)
    s = depositScent(s, 'quiet', 0.25)
    for (let i = 0; i < 3; i++) {
      s = decayScent(s)
      if (scentAt(s, 'quiet') > 0) expect(scentAt(s, 'loud')).toBeGreaterThan(scentAt(s, 'quiet'))
    }
  })

  it('does not mutate the field it is given', () => {
    const s = depositScent(emptyScent(), 'a', 1)
    const copy = { ...s }
    decayScent(s)
    depositScent(s, 'b', 1)
    expect(s).toEqual(copy)
  })
})

describe('perception', () => {
  it('smells nothing in an empty labyrinth', () => {
    const w = createWumpus(anyRoom(L), 2)
    expect(perceive(L, w, emptyScent()).target).toBeNull()
  })

  it('never smells beyond its tier radius', () => {
    for (const tier of [1, 2, 3, 4] as WumpusTier[]) {
      const start = anyRoom(L)
      const w = createWumpus(start, tier)
      const dist = distancesFrom(L, start)
      const far = Object.keys(dist).find((id) => (dist[id] as number) === WUMPUS_TIERS[tier].perceptionRadius + 1)
      if (!far) continue
      const s = depositScent(emptyScent(), far, 99)
      expect(perceive(L, w, s).target, `tier ${tier} smelled ${far}`).toBeNull()
    }
  })

  it('smells exactly at the edge of its radius', () => {
    const start = anyRoom(L)
    const w = createWumpus(start, 3)
    const dist = distancesFrom(L, start)
    const edge = Object.keys(dist).find((id) => (dist[id] as number) === WUMPUS_TIERS[3].perceptionRadius)
    if (!edge) return
    const s = depositScent(emptyScent(), edge, 1)
    expect(perceive(L, w, s).target).toBe(edge)
  })

  it('follows the strongest trail, breaking ties toward the nearer room', () => {
    const start = anyRoom(L)
    const near = neighboursOf(L, start)[0]!
    const dist = distancesFrom(L, start)
    const far = Object.keys(dist).find((id) => (dist[id] as number) === 2)
    if (!far) return
    let s = depositScent(emptyScent(), near, 1)
    s = depositScent(s, far, 3)
    expect(perceive(L, createWumpus(start, 3), s).target).toBe(far)

    let tied = depositScent(emptyScent(), near, 2)
    tied = depositScent(tied, far, 2)
    expect(perceive(L, createWumpus(start, 3), tied).target).toBe(near)
  })
})

describe('movement', () => {
  const ctx = (l: Labyrinth) => ({ carryingHeart: false, entranceId: l.entranceId, revealedPlayerRoom: null })

  it('respects each tier\'s move rate', () => {
    for (const tier of [1, 2, 3, 4] as WumpusTier[]) {
      const rng = createRng(5)
      let w = createWumpus(anyRoom(L), tier)
      let moves = 0
      for (let t = 0; t < 12; t++) {
        const r = moveWumpus(L, w, emptyScent(), ctx(L), rng)
        w = r.wumpus
        if (r.moved) moves++
      }
      expect(moves, `tier ${tier}`).toBeCloseTo(12 / WUMPUS_TIERS[tier].moveEveryNTurns, -0.5)
    }
  })

  it('only ever steps to an adjacent room', () => {
    const rng = createRng(11)
    let w = createWumpus(anyRoom(L), 4)
    for (let t = 0; t < 60; t++) {
      const before = w.roomId
      const r = moveWumpus(L, w, emptyScent(), ctx(L), rng)
      w = r.wumpus
      if (r.moved) expect(neighboursOf(L, before)).toContain(w.roomId)
    }
  })

  it('closes on a trail it can smell', () => {
    const rng = createRng(3)
    const start = anyRoom(L)
    const dist = distancesFrom(L, start)
    const prey = Object.keys(dist).find((id) => (dist[id] as number) === 3)!
    let w = createWumpus(start, 4) // radius 4, moves every turn
    const scent = depositScent(emptyScent(), prey, 5)
    for (let t = 0; t < 3; t++) w = moveWumpus(L, w, scent, ctx(L), rng).wumpus
    expect(distancesFrom(L, prey)[w.roomId]).toBe(0)
  })

  it('Tier 1 shies AWAY from noise — it is the teaching tier', () => {
    const rng = createRng(9)
    const start = anyRoom(L)
    const loud = neighboursOf(L, start)[0]!
    const scent = depositScent(emptyScent(), loud, 10)
    let w = { ...createWumpus(start, 1), moveCooldown: 0 }
    const r = moveWumpus(L, w, scent, ctx(L), rng)
    expect(r.reason).toBe('avoiding')
    expect(r.wumpus.roomId).not.toBe(loud)
  })

  it('guards the exit only when it has LOST the player', () => {
    const rng = createRng(13)
    const start = Object.keys(distancesFrom(L, L.entranceId)).find((id) => (distancesFrom(L, L.entranceId)[id] as number) === 6)!
    const w = { ...createWumpus(start, 4), moveCooldown: 0 }

    const blind = moveWumpus(L, w, emptyScent(), { carryingHeart: true, entranceId: L.entranceId, revealedPlayerRoom: null }, rng)
    expect(blind.reason).toBe('guarding')

    // With a live trail it hunts instead — a Tier 4 that walks past prey it can
    // smell in order to stand by the door looks stupid and feels unfair.
    const smelt = depositScent(emptyScent(), neighboursOf(L, start)[0]!, 5)
    const hunting = moveWumpus(L, w, smelt, { carryingHeart: true, entranceId: L.entranceId, revealedPlayerRoom: null }, rng)
    expect(hunting.reason).toBe('hunting')
  })

  it('forgets a stale trail after memoryTurns', () => {
    const rng = createRng(21)
    const start = anyRoom(L)
    const prey = neighboursOf(L, start)[0]!
    let w = createWumpus(start, 3) // memoryTurns 3
    w = moveWumpus(L, w, depositScent(emptyScent(), prey, 5), ctx(L), rng).wumpus
    expect(w.lastKnownPlayerRoom).toBe(prey)
    for (let t = 0; t < WUMPUS_TIERS[3].memoryTurns + 1; t++) {
      w = moveWumpus(L, w, emptyScent(), ctx(L), rng).wumpus
    }
    expect(w.lastKnownPlayerRoom).toBeNull()
  })

  it('never learns a position it did not smell, unless one is revealed', () => {
    const rng = createRng(31)
    let w = createWumpus(anyRoom(L), 2)
    for (let t = 0; t < 10; t++) w = moveWumpus(L, w, emptyScent(), ctx(L), rng).wumpus
    expect(w.lastKnownPlayerRoom).toBeNull()

    const revealed = L.heartRoomId
    w = moveWumpus(L, w, emptyScent(), { ...ctx(L), revealedPlayerRoom: revealed }, rng).wumpus
    expect(w.lastKnownPlayerRoom).toBe(revealed)
  })

  it('escalates by a tier, capped at 4', () => {
    expect(escalate(createWumpus('a', 2)).tier).toBe(3)
    expect(escalate(createWumpus('a', 4)).tier).toBe(4)
    expect(escalate(createWumpus('a', 1), 5).tier).toBe(4)
  })

  it('is deterministic for a given seed', () => {
    const run = () => {
      const rng = createRng(77)
      let w = createWumpus(anyRoom(L), 3)
      const trail: RoomId[] = []
      for (let t = 0; t < 30; t++) { w = moveWumpus(L, w, emptyScent(), ctx(L), rng).wumpus; trail.push(w.roomId) }
      return trail
    }
    expect(run()).toEqual(run())
  })
})

describe('tells', () => {
  it('reports a stench when, and only when, the Wumpus is adjacent', () => {
    for (const seed of [1, 2, 3, 4, 5]) {
      const l = lab(seed)
      const here = l.entranceId
      const adj = neighboursOf(l, here)
      const opts = { tellRange: 'all' as const, confused: false, facing: null }

      for (const w of adj) {
        const tells = getTells(l, here, w, opts)
        expect(tells.filter((t) => t.kind === 'stench')).toHaveLength(1)
      }
      const far = Object.keys(distancesFrom(l, here)).find((id) => (distancesFrom(l, here)[id] as number) > 1)!
      expect(getTells(l, here, far, opts).some((t) => t.kind === 'stench')).toBe(false)
    }
  })

  it('is exhaustive — every adjacent hazard and creature reports through its own doorway', () => {
    for (const seed of [1, 2, 3, 4, 5, 6]) {
      const l = lab(seed)
      for (const room of Object.values(l.rooms)) {
        const tells = getTells(l, room.id, 'nowhere', { tellRange: 'all', confused: false, facing: null })
        for (const dir of DIRECTIONS) {
          const n = room.exits[dir]
          if (n === undefined) continue
          const neighbour = l.rooms[n]!
          const here = tells.filter((t) => t.direction === dir)
          if (neighbour.hazard) expect(here.length, `${room.id} ${dir}`).toBeGreaterThan(0)
          if (neighbour.creature) expect(here.some((t) => t.kind === 'skittering')).toBe(true)
          if (neighbour.hasHeart) expect(here.some((t) => t.kind === 'metallic')).toBe(true)
        }
      }
    }
  })

  it('never invents a tell with no source behind it', () => {
    const l = lab(2)
    for (const room of Object.values(l.rooms)) {
      const tells = getTells(l, room.id, 'nowhere', { tellRange: 'all', confused: false, facing: null })
      for (const tell of tells) {
        const n = room.exits[tell.direction]
        expect(n, `${room.id} reported ${tell.kind} through a wall`).toBeDefined()
        const neighbour = l.rooms[n!]!
        expect(neighbour.hazard !== null || neighbour.creature !== null || neighbour.hasHeart).toBe(true)
      }
    }
  })

  it('the Heart calls from one room away, and stops once it is lifted', () => {
    for (const seed of [1, 2, 3, 4, 5, 6]) {
      const l = lab(seed)
      for (const adj of neighboursOf(l, l.heartRoomId)) {
        const onPlinth = getTells(l, adj, 'nowhere', { tellRange: 'all', confused: false, facing: null })
        expect(onPlinth.some((t) => t.kind === 'metallic'), `${seed}: no call from ${adj}`).toBe(true)

        const carried = getTells(l, adj, 'nowhere', { tellRange: 'all', confused: false, facing: null, heartTaken: true })
        expect(carried.some((t) => t.kind === 'metallic'), `${seed}: still calling after being lifted`).toBe(false)
      }
    }
  })

  it('only the Heart room calls — nothing else sounds metallic', () => {
    const l = lab(3)
    for (const room of Object.values(l.rooms)) {
      const tells = getTells(l, room.id, 'nowhere', { tellRange: 'all', confused: false, facing: null })
      for (const t of tells.filter((x) => x.kind === 'metallic')) {
        expect(l.rooms[room.exits[t.direction]!]!.hasHeart).toBe(true)
      }
    }
  })

  it('Confused suppresses everything — absence, never falsehood', () => {
    const l = lab(1)
    const w = neighboursOf(l, l.entranceId)[0]!
    expect(getTells(l, l.entranceId, w, { tellRange: 'all', confused: true, facing: null })).toEqual([])
  })

  it('darkness restricts WHICH doorways report, and LISTEN buys them back', () => {
    const l = lab(1)
    const here = l.entranceId
    const facing = DIRECTIONS.find((d) => l.rooms[here]!.exits[d] !== undefined)!
    const all = getTells(l, here, 'nowhere', { tellRange: 'all', confused: false, facing })
    const dark = getTells(l, here, 'nowhere', { tellRange: 'facing', confused: false, facing })
    const listened = getTells(l, here, 'nowhere', { tellRange: 'facing', confused: false, facing, listening: true })

    expect(dark.every((t) => t.direction === facing)).toBe(true)
    expect(dark.length).toBeLessThanOrEqual(all.length)
    expect(listened).toEqual(all)
    // Whatever darkness DOES report is identical to what full light reported.
    for (const t of dark) expect(all).toContainEqual(t)
  })
})

describe('THE FAIRNESS INVARIANT', () => {
  it('never crosses more than one room to reach you — no teleporting', () => {
    for (const { seed, lab: l } of POOL) {
      const rng = createRng(seed + 9000)
      let w = createWumpus(chooseWumpusStart(l, rng), 4)
      let player = l.entranceId
      let scent: ScentField = emptyScent()

      for (let turn = 0; turn < 40; turn++) {
        player = rng.pick(neighboursOf(l, player))
        scent = depositScent(scent, player, 1)
        if (hasCaught(w, player)) break

        const before = w.roomId
        w = moveWumpus(l, w, scent, { carryingHeart: false, entranceId: l.entranceId, revealedPlayerRoom: null }, rng).wumpus
        if (hasCaught(w, player)) {
          // It reached you from a room that was adjacent to you. Always.
          expect(neighboursOf(l, player), `seed ${seed} turn ${turn}`).toContain(before)
          break
        }
        scent = decayScent(scent)
      }
    }
  })

  it('always warns a player who holds still', () => {
    // The guarantee is: if you do not walk toward it, you get a stench first.
    //
    // It is deliberately NOT "you can never be caught unwarned". A player who
    // moves into a room adjacent to the Wumpus gets no warning, because at
    // their previous room it was two away and nothing leaked. That is the cost
    // of exploring blind, it is what makes a moving threat different from a
    // static hazard, and it is precisely the hole the grellhound companion
    // exists to close (it growls at radius 2 — GDD 2.9).
    let catches = 0
    for (const { seed, lab: l } of POOL) {
      const rng = createRng(seed + 4000)
      let w = createWumpus(chooseWumpusStart(l, rng), 4)
      const player = l.entranceId
      let scent: ScentField = emptyScent()
      let warned = false

      for (let turn = 0; turn < 40; turn++) {
        scent = depositScent(scent, player, 1) // standing still, still smelling
        w = moveWumpus(l, w, scent, { carryingHeart: false, entranceId: l.entranceId, revealedPlayerRoom: null }, rng).wumpus

        if (hasCaught(w, player)) {
          catches++
          expect(warned, `seed ${seed} turn ${turn}: caught a stationary player with no warning`).toBe(true)
          break
        }

        warned = getTells(l, player, w.roomId, { tellRange: 'all', confused: false, facing: null })
          .some((t) => t.kind === 'stench')
        scent = decayScent(scent)
      }
    }
    expect(catches, 'no catches at all — the test proved nothing').toBeGreaterThan(30)
  })

  it('wumpusIsNear marks exactly the silence radius', () => {
    const l = lab(1)
    const dist = distancesFrom(l, l.entranceId)
    for (const id of Object.keys(dist)) {
      expect(wumpusIsNear(l, l.entranceId, id, 2)).toBe((dist[id] as number) <= 2)
    }
  })
})
