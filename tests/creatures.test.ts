/**
 * Creatures, companions, SEND and world drift. GDD 2.9 and 2.9.1.
 *
 * The tests that matter most here are not the ones checking a band maps to a
 * flag. They are the ones that would fail if someone quietly made taming
 * strictly better than fighting, gave a sent companion a way home, let a bloom
 * grow under the player's feet, or made drift depend on object key order.
 * Those are the invariants; the rest is bookkeeping.
 */

import { describe, it, expect } from 'vitest'
import { createRng } from '../src/engine/rng.ts'
import { generateLabyrinth, roomIdAt } from '../src/engine/generate.ts'
import {
  canSend,
  canTame,
  companionRollModifiers,
  companionSenses,
  companionUpkeep,
  driftWorld,
  encounterOptions,
  encounterRollSpec,
  encounterTurnCost,
  ENCOUNTER_ACTIONS,
  resolveEncounter,
  scentMultiplierFor,
  sendCompanion,
  skittishBolts,
} from '../src/engine/creatures.ts'
import type { EncounterAction, EncounterContext } from '../src/engine/creatures.ts'
import { BAND_ORDER, DIRECTIONS } from '../src/engine/types.ts'
import type {
  Companion, CreatureKind, Difficulty, Labyrinth, OutcomeBand, Player, Room, RoomId,
} from '../src/engine/types.ts'
import {
  COMPANION, DRIFT, ENCOUNTER, FIGHT_OUTCOMES, HEART,
  SCENT, SCENT_BY_ACTION, sendDecoyTurnsFor, sendScentFor, TAME_DC, TAME_OUTCOMES,
} from '../src/engine/data/tuning.ts'

const ALL_CREATURES: readonly CreatureKind[] = ['goblin', 'lumewing', 'grellhound', 'quietOne']
const ALL_DIFFICULTIES: readonly Difficulty[] = ['drowsing', 'stirring', 'hunting', 'ravening']

function lab(seed: number, difficulty: Difficulty = 'stirring'): Labyrinth {
  return generateLabyrinth(createRng(seed), { difficulty })
}

function ctx(labyrinth: Labyrinth, over: Partial<EncounterContext> = {}): EncounterContext {
  return {
    labyrinth,
    creature: 'goblin',
    roomId: labyrinth.entranceId,
    companion: null,
    retreatRoomId: null,
    carryingHeart: false,
    ...over,
  }
}

function companion(over: Partial<Companion> = {}): Companion {
  return { kind: 'goblin', brave: false, skittish: false, ...over }
}

function roomsWith(labyrinth: Labyrinth, pred: (r: Room) => boolean): Room[] {
  return Object.keys(labyrinth.rooms)
    .map((id) => labyrinth.rooms[id] as Room)
    .filter(pred)
}

// ===========================================================================
// The asymmetry — this is the reason the creature system exists
// ===========================================================================

describe('fighting is fast and loud; taming is slow and quiet (CLAUDE.md 3)', () => {
  it('taming always costs more turns than fighting', () => {
    expect(encounterTurnCost('tame')).toBeGreaterThan(encounterTurnCost('fight'))
    expect(encounterTurnCost('tame')).toBe(ENCOUNTER.tameTurnCost)
    expect(encounterTurnCost('fight')).toBe(ENCOUNTER.fightTurnCost)
  })

  it('a clean tame is quieter than a clean fight, in every non-failing band', () => {
    const l = lab(1)
    for (const band of ['mixed', 'success', 'strongSuccess', 'criticalSuccess'] as OutcomeBand[]) {
      const fight = resolveEncounter('fight', band, ctx(l), createRng(1))
      const tame = resolveEncounter('tame', band, ctx(l), createRng(1))
      expect(tame.scent, `tame must be quieter than fight at ${band}`).toBeLessThan(fight.scent)
    }
  })

  it('a critically failed tame is as loud as a clean fight — it stopped being a tame', () => {
    const l = lab(1)
    const botched = resolveEncounter('tame', 'criticalFailure', ctx(l), createRng(1))
    const cleanFight = resolveEncounter('fight', 'success', ctx(l), createRng(1))
    expect(botched.scent).toBeGreaterThanOrEqual(cleanFight.scent)
  })

  it('no band makes one option strictly better: fight is always faster, tame is always quieter', () => {
    // If this ever fails, fix the COSTS. Do not remove the choice.
    const l = lab(1)
    for (const band of BAND_ORDER) {
      const fight = resolveEncounter('fight', band, ctx(l), createRng(1))
      const tame = resolveEncounter('tame', band, ctx(l), createRng(1))
      expect(fight.turnCost).toBeLessThan(tame.turnCost)
      expect(tame.scent).toBeLessThanOrEqual(fight.scent)
    }
  })

  it('sneaking past is the quietest way through an encounter that succeeds', () => {
    const l = lab(1)
    const sneak = resolveEncounter('sneak', 'success', ctx(l), createRng(1))
    const tame = resolveEncounter('tame', 'success', ctx(l), createRng(1))
    const fight = resolveEncounter('fight', 'success', ctx(l), createRng(1))
    expect(sneak.scent).toBeLessThan(tame.scent)
    expect(sneak.scent).toBeLessThan(fight.scent)
  })
})

// ===========================================================================
// Taming bands
// ===========================================================================

describe('taming', () => {
  it('tests INT, and its DC depends on WHAT you met', () => {
    for (const creature of ALL_CREATURES) {
      const spec = encounterRollSpec('tame', creature)
      expect(spec.stat).toBe('int')
      expect(spec.dc).toBe(TAME_DC[creature])
    }
    // The other three options do not care which creature it is.
    for (const action of ['fight', 'sneak', 'flee'] as EncounterAction[]) {
      const a = encounterRollSpec(action, 'goblin')
      const b = encounterRollSpec(action, 'quietOne')
      expect(a.dc).toBe(b.dc)
    }
  })

  it('a STRONG success or better yields a BRAVE companion — SEND is gated on this band', () => {
    // MUTATION-CHECKED. This is the band gate SEND hangs off, and it moved on
    // 17 Sep 2026: criticalSuccess-only needed margin >= +12, which at starting
    // stats (INT 8, mod -1, max total 19) was 0% on every creature in the
    // bestiary — SEND did not fire once in 150 sweep runs. Widening to
    // strongSuccess is what puts a progression curve under it.
    //
    // The OTHER half of that fix — a natural 20 always brave — is not testable
    // here and deliberately so: resolveEncounter only ever receives the resolved
    // band, never the natural die, so it cannot be the thing under test. That
    // case lives in tests/resolve.test.ts.
    const l = lab(1)
    const braveBands: OutcomeBand[] = ['strongSuccess', 'criticalSuccess']
    for (const band of BAND_ORDER) {
      const r = resolveEncounter('tame', band, ctx(l), createRng(1))
      expect(r.companionGained?.brave ?? false, `${band} brave gate`).toBe(braveBands.includes(band))
    }
  })

  it('only a mixed success yields a SKITTISH companion', () => {
    const l = lab(1)
    for (const band of BAND_ORDER) {
      const r = resolveEncounter('tame', band, ctx(l), createRng(1))
      expect(r.companionGained?.skittish ?? false).toBe(band === 'mixed')
    }
  })

  it('mixed success still TAMES — it is the widest good band, not a booby prize', () => {
    const l = lab(1)
    const r = resolveEncounter('tame', 'mixed', ctx(l), createRng(1))
    expect(r.companionGained).not.toBeNull()
    expect(r.companionGained?.skittish).toBe(true)
  })

  it('a critical failure turns it hostile and leaves it in the room', () => {
    const l = lab(1)
    const r = resolveEncounter('tame', 'criticalFailure', ctx(l), createRng(1))
    expect(r.hostile).toBe(true)
    expect(r.creatureRemains).toBe(true)
    expect(r.damage).toBeGreaterThan(0)
    expect(r.companionGained).toBeNull()
  })

  it('a plain failure bolts it — the turn is wasted and the creature is gone', () => {
    const l = lab(1)
    const r = resolveEncounter('tame', 'failure', ctx(l), createRng(1))
    expect(r.hostile).toBe(false)
    expect(r.creatureRemains).toBe(false)
    expect(r.companionGained).toBeNull()
  })

  it('one companion slot: taming a new creature releases the one you had', () => {
    const l = lab(1)
    const had = companion({ kind: 'grellhound' })
    const r = resolveEncounter('tame', 'success', ctx(l, { companion: had, creature: 'lumewing' }), createRng(1))
    expect(r.companionGained?.kind).toBe('lumewing')
    expect(r.companionReleased).toBe('grellhound')
    expect(ENCOUNTER.companionSlots).toBe(1)
  })

  it('releases nothing when the tame fails — a failed tame does not cost you your companion', () => {
    const l = lab(1)
    for (const band of ['criticalFailure', 'failure'] as OutcomeBand[]) {
      const r = resolveEncounter('tame', band, ctx(l, { companion: companion() }), createRng(1))
      expect(r.companionReleased).toBeNull()
    }
  })

  it('a strong success reveals an adjacent room the player has not seen', () => {
    const l = lab(1)
    const r = resolveEncounter('tame', 'strongSuccess', ctx(l), createRng(1))
    expect(r.revealedRooms.length).toBe(TAME_OUTCOMES.strongSuccess.revealsRooms)
    for (const id of r.revealedRooms) {
      expect((l.rooms[l.entranceId] as Room).exits).toBeDefined()
      expect((l.rooms[id] as Room).visited).toBe(false)
    }
  })

  it('every band has a tame outcome and a fight outcome', () => {
    for (const band of BAND_ORDER) {
      expect(TAME_OUTCOMES[band]).toBeDefined()
      expect(FIGHT_OUTCOMES[band]).toBeDefined()
    }
  })

  it('is deterministic — the same band, context and rng state give the same result', () => {
    const l = lab(9)
    const a = resolveEncounter('tame', 'strongSuccess', ctx(l), createRng(42))
    const b = resolveEncounter('tame', 'strongSuccess', ctx(l), createRng(42))
    expect(a).toEqual(b)
  })
})

describe('the other three options', () => {
  it('map to the stats GDD 2.9 assigns them', () => {
    expect(encounterRollSpec('fight', 'goblin').stat).toBe('str')
    expect(encounterRollSpec('sneak', 'goblin').stat).toBe('agi')
    expect(encounterRollSpec('flee', 'goblin').stat).toBe('agi')
  })

  it('SNEAK and FLEE move the player only when they succeed', () => {
    const l = lab(1)
    const retreat = roomIdAt(0, 0)
    for (const action of ['sneak', 'flee'] as EncounterAction[]) {
      for (const band of BAND_ORDER) {
        const r = resolveEncounter(action, band, ctx(l, { retreatRoomId: retreat }), createRng(1))
        const failed = band === 'criticalFailure' || band === 'failure'
        expect(r.movedTo, `${action} at ${band}`).toBe(failed ? null : retreat)
      }
    }
  })

  it('FIGHT drives the creature off on mixed or better, never on a failure', () => {
    const l = lab(1)
    for (const band of BAND_ORDER) {
      const r = resolveEncounter('fight', band, ctx(l), createRng(1))
      const failed = band === 'criticalFailure' || band === 'failure'
      expect(r.creatureRemains).toBe(failed)
    }
  })

  it('every encounter action is covered by the tuning tables', () => {
    for (const action of ENCOUNTER_ACTIONS) {
      const spec = encounterRollSpec(action, 'goblin')
      expect(spec.dc).toBeTypeOf('number')
      expect(spec.stat).toBeTypeOf('string')
    }
  })
})

// ===========================================================================
// Companions
// ===========================================================================

describe('companion passives', () => {
  it('the Quiet One dampens scent output, and nothing else does', () => {
    expect(scentMultiplierFor(companion({ kind: 'quietOne' }))).toBe(COMPANION.quietOneScentMultiplier)
    expect(scentMultiplierFor(null)).toBe(1)
    for (const kind of ['goblin', 'lumewing', 'grellhound'] as CreatureKind[]) {
      expect(scentMultiplierFor(companion({ kind }))).toBe(1)
    }
  })

  it('the Quiet One quietens an encounter too — every band, every action', () => {
    const l = lab(1)
    const quiet = companion({ kind: 'quietOne' })
    for (const action of ENCOUNTER_ACTIONS) {
      for (const band of BAND_ORDER) {
        const loud = resolveEncounter(action, band, ctx(l), createRng(1))
        const hushed = resolveEncounter(action, band, ctx(l, { companion: quiet }), createRng(1))
        expect(hushed.scent).toBeLessThanOrEqual(loud.scent)
      }
    }
  })

  it('the goblin bonus is a LABELLED modifier, and only on SEARCH (CLAUDE.md 4)', () => {
    const mods = companionRollModifiers(companion({ kind: 'goblin' }), 'search')
    expect(mods).toHaveLength(1)
    expect(mods[0]?.value).toBe(COMPANION.goblinSearchBonus)
    expect(mods[0]?.source.length).toBeGreaterThan(0)
    expect(companionRollModifiers(companion({ kind: 'goblin' }), 'fight')).toHaveLength(0)
    expect(companionRollModifiers(companion({ kind: 'lumewing' }), 'search')).toHaveLength(0)
    expect(companionRollModifiers(null, 'search')).toHaveLength(0)
  })

  it('the lumewing widens the lantern and nothing else', () => {
    const l = lab(1)
    const s = companionSenses(l, companion({ kind: 'lumewing' }), l.entranceId, l.heartRoomId)
    expect(s.lanternRadiusBonus).toBe(COMPANION.lumewingLanternBonus)
    expect(s.revealedHazards).toHaveLength(0)
    expect(s.wumpusGrowl).toBe(false)
  })

  it('the grellhound reveals every adjacent hazard, honestly and exhaustively', () => {
    const l = lab(4)
    // Find a room with at least one hazardous neighbour.
    const subject = roomsWith(l, (r) =>
      DIRECTIONS.some((d) => {
        const n = r.exits[d]
        return n !== undefined && (l.rooms[n] as Room).hazard !== null
      }),
    )[0]
    expect(subject, 'seed 4 should contain a room adjacent to a hazard').toBeDefined()
    if (!subject) return

    const s = companionSenses(l, companion({ kind: 'grellhound' }), subject.id, roomIdAt(0, 0))
    const truth = DIRECTIONS.flatMap((d) => {
      const n = subject.exits[d]
      const hazard = n === undefined ? null : (l.rooms[n] as Room).hazard
      return hazard ? [{ direction: d, hazard }] : []
    })
    // Exhaustive and honest: exactly the adjacent hazards, no more and no fewer.
    expect(s.revealedHazards).toEqual(truth)
  })

  it('the grellhound growls at radius 2 — the turn of warning that movement costs you', () => {
    const l = lab(4)
    const here = l.entranceId
    const neighbour = DIRECTIONS.map((d) => (l.rooms[here] as Room).exits[d]).find((x) => x !== undefined)
    expect(neighbour).toBeDefined()
    if (!neighbour) return

    const hound = companion({ kind: 'grellhound' })
    expect(companionSenses(l, hound, here, neighbour).wumpusGrowl).toBe(true)
    expect(COMPANION.grellhoundWarningRadius).toBe(2)

    // A companion that is not a grellhound never growls.
    expect(companionSenses(l, companion({ kind: 'goblin' }), here, neighbour).wumpusGrowl).toBe(false)
    expect(companionSenses(l, null, here, neighbour).wumpusGrowl).toBe(false)
  })

  it('no companion means no senses at all', () => {
    const l = lab(1)
    const s = companionSenses(l, null, l.entranceId, l.heartRoomId)
    expect(s).toEqual({ lanternRadiusBonus: 0, revealedHazards: [], wumpusGrowl: false })
  })
})

describe('skittish companions', () => {
  it('bolt on DAMAGE, never on a failed roll (GDD 2.9)', () => {
    const skittish = companion({ skittish: true })
    expect(skittishBolts(skittish, 1, false)).toBe(true)
    expect(skittishBolts(skittish, 0, false)).toBe(false)
  })

  it('can be kept by spending a Fortune point', () => {
    const skittish = companion({ skittish: true })
    expect(skittishBolts(skittish, 2, true)).toBe(false)
    expect(COMPANION.skittishFortuneSave).toBeGreaterThan(0)
  })

  it('a calm companion never bolts, whatever the damage', () => {
    expect(skittishBolts(companion({ skittish: false }), 3, false)).toBe(false)
    expect(skittishBolts(null, 3, false)).toBe(false)
  })

  it('cost oil to keep, and starve rather than push the lamp negative', () => {
    const skittish = companion({ kind: 'lumewing', skittish: true })
    const fed = companionUpkeep(skittish, 10, createRng(1))
    expect(fed.oilDelta).toBe(-COMPANION.skittishUpkeepOil)
    expect(fed.starved).toBe(false)

    const dry = companionUpkeep(skittish, 0, createRng(1))
    expect(dry.oilDelta).toBe(0)
    expect(dry.starved).toBe(true)
  })

  it('a calm companion costs no upkeep', () => {
    const u = companionUpkeep(companion({ kind: 'lumewing' }), 10, createRng(1))
    expect(u.oilDelta).toBe(0)
    expect(u.starved).toBe(false)
  })

  it('goblin upkeep draws the same amount of randomness regardless of oil level', () => {
    // Replay safety: if the draw were conditional on oil, a state the decision
    // has nothing to do with would shift the whole RNG stream.
    const g = companion({ kind: 'goblin' })
    const a = createRng(77)
    const b = createRng(77)
    companionUpkeep(g, 12, a)
    companionUpkeep(g, 0, b)
    expect(a.getState()).toEqual(b.getState())
  })

  it('a goblin scrounges oil at roughly its stated rate', () => {
    const rng = createRng(5)
    const g = companion({ kind: 'goblin' })
    let hits = 0
    const trials = 4000
    for (let i = 0; i < trials; i++) if (companionUpkeep(g, 12, rng).scrounged) hits += 1
    const rate = hits / trials
    expect(rate).toBeGreaterThan(COMPANION.goblinScroungeChance - 0.03)
    expect(rate).toBeLessThan(COMPANION.goblinScroungeChance + 0.03)
  })
})

// ===========================================================================
// SEND — the escape valve, and the thing that must never be softened
// ===========================================================================

describe('SEND', () => {
  const player = (l: Labyrinth, c: Companion | null): Player => ({
    roomId: l.entranceId, facing: null,
    stats: { str: 8, agi: 8, int: 8, lck: 8 },
    health: 3, maxHealth: 3, oil: 12, maxOil: 12, fortune: 2,
    carryingHeart: false, companion: c, inventory: [], statuses: {},
  })

  it('needs a BRAVE companion — a plain or skittish one cannot be sent', () => {
    const l = lab(1)
    const dir = DIRECTIONS.find((d) => (l.rooms[l.entranceId] as Room).exits[d] !== undefined)
    expect(dir).toBeDefined()
    if (!dir) return

    expect(canSend(l, player(l, null), dir)).toBe(false)
    expect(canSend(l, player(l, companion()), dir)).toBe(false)
    expect(canSend(l, player(l, companion({ skittish: true })), dir)).toBe(false)
    expect(canSend(l, player(l, companion({ brave: true })), dir)).toBe(true)
  })

  it('needs a doorway in that direction', () => {
    const l = lab(1)
    const exits = (l.rooms[l.entranceId] as Room).exits
    const wall = DIRECTIONS.find((d) => exits[d] === undefined)
    if (!wall) return // fully connected entrance; nothing to assert
    expect(canSend(l, player(l, companion({ brave: true })), wall)).toBe(false)
    expect(sendCompanion(l, player(l, companion({ brave: true })), wall)).toBeNull()
  })

  it('drops its marker in the TARGET room, not the player’s', () => {
    const l = lab(1)
    const dir = DIRECTIONS.find((d) => (l.rooms[l.entranceId] as Room).exits[d] !== undefined)
    if (!dir) return
    const result = sendCompanion(l, player(l, companion({ brave: true })), dir)
    expect(result).not.toBeNull()
    expect(result?.targetRoomId).toBe((l.rooms[l.entranceId] as Room).exits[dir])
    expect(result?.targetRoomId).not.toBe(l.entranceId)
    expect(result?.scent).toBe(sendScentFor('goblin'))
  })

  it('scales the decoy with the tame DC — the Quiet One is the quiet one', () => {
    const l = lab(1)
    const dir = DIRECTIONS.find((d) => (l.rooms[l.entranceId] as Room).exits[d] !== undefined)
    if (!dir) return
    for (const kind of ALL_CREATURES) {
      const result = sendCompanion(l, player(l, companion({ kind, brave: true })), dir)
      expect(result?.scent, `${kind} decoy strength`).toBe(sendScentFor(kind))
    }
    // The split is keyed off TAME_DC, not off a hand-written creature list, so
    // a fifth creature inherits a decoy strength instead of forgetting one.
    expect(sendScentFor('goblin')).toBe(sendScentFor('grellhound'))
    expect(sendScentFor('quietOne')).toBeLessThan(sendScentFor('goblin'))
  })

  it('returns no path home — the companion does not come back (CLAUDE.md 3)', () => {
    const l = lab(1)
    const dir = DIRECTIONS.find((d) => (l.rooms[l.entranceId] as Room).exits[d] !== undefined)
    if (!dir) return
    const result = sendCompanion(l, player(l, companion({ brave: true })), dir)
    expect(COMPANION.sendIsPermanent).toBe(true)
    // The result describes a departure and nothing else. If a `returns` or
    // `returnChance` field ever appears here, the invariant has been softened.
    expect(Object.keys(result ?? {}).sort()).toEqual(['scent', 'sent', 'targetRoomId'])
  })

  it('is louder than anything the player can do short of taking the Heart', () => {
    const loudestPlayerAction = Math.max(...Object.values(SCENT_BY_ACTION))
    for (const kind of ALL_CREATURES) {
      expect(sendScentFor(kind), `${kind} decoy vs loudest player action`).toBeGreaterThan(
        loudestPlayerAction,
      )
      expect(sendScentFor(kind)).toBeLessThan(SCENT.heartTaken + sendScentFor(kind))
    }
  })

  it('out-smells the player for exactly sendDecoyTurns turns — both tiers, both Heart states', () => {
    // sendDecoyTurns is DERIVED from sendScent and the decay factor, not a free
    // setting. Changing sendScent without changing it fails here rather than
    // quietly making the GDD's promise a lie.
    //
    // Four cases now, not one. The flat sendScent = 5 made the decoy weakest
    // exactly when it was needed — one turn against a Heart-carrying player,
    // against a GDD promising 2-3 — so the strength is keyed to the tame DC.
    // A shared decayFactor makes 3-without / 1-with arithmetically impossible,
    // which is why the two tiers land on 3/2 and 2/1 rather than both on 3/1.
    const walking = SCENT_BY_ACTION.move
    const carrying = SCENT_BY_ACTION.move * HEART.carryScentMultiplier

    const dominatesFor = (decoy: number, deposit: number): number => {
      let turns = 0
      for (let k = 0; k < 30; k++) {
        if (decoy * SCENT.decayFactor ** k <= deposit) break
        turns = k + 1
      }
      return turns
    }

    for (const kind of ALL_CREATURES) {
      const decoy = sendScentFor(kind)
      expect(dominatesFor(decoy, walking), `${kind}, walking`).toBe(
        sendDecoyTurnsFor(kind, false),
      )
      expect(dominatesFor(decoy, carrying), `${kind}, carrying the Heart`).toBe(
        sendDecoyTurnsFor(kind, true),
      )
    }

    // And the shape the design asked for: carrying the Heart always costs you a
    // turn of cover, never more and never none.
    for (const kind of ALL_CREATURES) {
      expect(sendDecoyTurnsFor(kind, true)).toBe(sendDecoyTurnsFor(kind, false) - 1)
    }
  })
})

// ===========================================================================
// World drift — GDD 2.9.1
// ===========================================================================

describe('world drift', () => {
  const noOne = { playerRoomId: roomIdAt(0, 0), wumpusRoomId: roomIdAt(9, 9) }

  it('does not drift at Drowsing, and draws no randomness doing it', () => {
    // The teaching tier must hold still, or the tells it exists to teach
    // cannot be learned (GDD 2.9.1).
    const l = lab(3, 'drowsing')
    const rng = createRng(1)
    const before = rng.getState()
    const result = driftWorld(l, noOne, rng)
    expect(result.movedCreatures).toHaveLength(0)
    expect(result.labyrinth).toBe(l)
    expect(rng.getState()).toEqual(before)
    expect(DRIFT.byDifficulty.drowsing).toBe(0)
  })

  it('does drift at every other difficulty', () => {
    for (const difficulty of ALL_DIFFICULTIES) {
      if (difficulty === 'drowsing') continue
      expect(DRIFT.byDifficulty[difficulty]).toBeGreaterThan(0)
    }
  })

  it('is deterministic — same labyrinth, same rng state, same drift', () => {
    const l = lab(11)
    const a = driftWorld(l, noOne, createRng(5))
    const b = driftWorld(l, noOne, createRng(5))
    expect(a.movedCreatures).toEqual(b.movedCreatures)
  })

  it('does not depend on the insertion order of the rooms record', () => {
    // CLAUDE.md 2.2: no iteration over an unordered collection in a way that
    // affects outcomes. Rebuilding the record backwards must change nothing.
    const l = lab(11)
    const reversed: Record<RoomId, Room> = {}
    for (const id of Object.keys(l.rooms).reverse()) reversed[id] = l.rooms[id] as Room
    const shuffledLab: Labyrinth = { ...l, rooms: reversed }

    const a = driftWorld(l, noOne, createRng(5))
    const b = driftWorld(shuffledLab, noOne, createRng(5))
    expect(a.movedCreatures).toEqual(b.movedCreatures)
  })

  it('never drifts anything into the entrance, the Heart’s chamber, or the Wumpus', () => {
    const rng = createRng(7)
    for (let seed = 1; seed <= 15; seed++) {
      let l = lab(seed, 'ravening')
      const wumpusRoomId = roomsWith(l, (r) => r.hazard === null && r.creature === null)[0]?.id
      if (!wumpusRoomId) continue

      for (let turn = 0; turn < 30; turn++) {
        const result = driftWorld(l, { playerRoomId: l.entranceId, wumpusRoomId }, rng)
        for (const m of result.movedCreatures) {
          expect(m.to).not.toBe(l.entranceId)
          expect(m.to).not.toBe(l.heartRoomId)
          expect(m.to).not.toBe(wumpusRoomId)
        }
        l = result.labyrinth
      }
      // The Heart's chamber and the entrance must be exactly as generated.
      expect((l.rooms[l.heartRoomId] as Room).hazard).toBeNull()
      expect((l.rooms[l.heartRoomId] as Room).creature).toBeNull()
      expect((l.rooms[l.entranceId] as Room).hazard).toBeNull()
      expect((l.rooms[l.entranceId] as Room).creature).toBeNull()
    }
  })

  it('never puts two things in one room — one thing per room keeps tells unambiguous', () => {
    const rng = createRng(13)
    for (let seed = 1; seed <= 15; seed++) {
      let l = lab(seed, 'ravening')
      for (let turn = 0; turn < 30; turn++) {
        l = driftWorld(l, { playerRoomId: l.entranceId, wumpusRoomId: roomIdAt(0, 0) }, rng).labyrinth
        for (const room of Object.values(l.rooms)) {
          expect(
            room.hazard !== null && room.creature !== null,
            `${room.id} holds both a ${room.hazard} and a ${room.creature}`,
          ).toBe(false)
        }
      }
    }
  })

  it('conserves creatures — drift moves them, it does not breed or eat them', () => {
    let l = lab(21, 'ravening')
    const before = roomsWith(l, (r) => r.creature !== null).length
    const rng = createRng(3)
    for (let turn = 0; turn < 40; turn++) {
      l = driftWorld(l, { playerRoomId: l.entranceId, wumpusRoomId: roomIdAt(0, 0) }, rng).labyrinth
    }
    expect(roomsWith(l, (r) => r.creature !== null).length).toBe(before)
  })

  it('NEVER changes the terrain — within a run, only creatures move', () => {
    // The map a player charts stays accurate about which rooms are dangerous
    // for the whole run. Blooms spreading is a BETWEEN-RUNS change (GDD 2.11).
    // This also subsumes the pit-free invariant: drift cannot create a pit
    // because drift cannot create any hazard.
    for (const difficulty of ALL_DIFFICULTIES) {
      const rng = createRng(3)
      for (let seed = 1; seed <= 10; seed++) {
        let l = lab(seed, difficulty)
        const before = Object.keys(l.rooms).map((id) => (l.rooms[id] as Room).hazard)
        for (let turn = 0; turn < 60; turn++) {
          l = driftWorld(l, { playerRoomId: l.entranceId, wumpusRoomId: roomIdAt(0, 0) }, rng).labyrinth
        }
        const after = Object.keys(l.rooms).map((id) => (l.rooms[id] as Room).hazard)
        expect(after, `terrain drifted at ${difficulty}/seed ${seed}`).toEqual(before)
      }
    }
  })

  it('leaves untouched rooms referentially identical — drift is a patch, not a rebuild', () => {
    const l = lab(11, 'ravening')
    const result = driftWorld(l, noOne, createRng(5))
    const changed = new Set<RoomId>()
    for (const m of result.movedCreatures) { changed.add(m.from); changed.add(m.to) }

    let shared = 0
    for (const id of Object.keys(l.rooms)) {
      if (changed.has(id)) continue
      expect(result.labyrinth.rooms[id]).toBe(l.rooms[id])
      shared += 1
    }
    expect(shared).toBeGreaterThan(80)
  })

  it('a creature MAY wander into the player’s room — it is an intrusion, not an ambush', () => {
    // The encounter stays bound to the player ENTERING a room (GDD 2.9.1), so
    // drift must be allowed to put one where the player is standing.
    let found = false
    outer: for (let seed = 1; seed <= 40 && !found; seed++) {
      let l = lab(seed, 'ravening')
      const rng = createRng(seed)
      // Stand next to a creature and wait.
      const spot = roomsWith(l, (r) =>
        r.hazard === null && r.creature === null &&
        DIRECTIONS.some((d) => {
          const n = r.exits[d]
          return n !== undefined && (l.rooms[n] as Room).creature !== null
        }),
      )[0]
      if (!spot) continue
      for (let turn = 0; turn < 40; turn++) {
        const result = driftWorld(l, { playerRoomId: spot.id, wumpusRoomId: roomIdAt(0, 0) }, rng)
        l = result.labyrinth
        if (result.movedCreatures.some((m) => m.to === spot.id)) { found = true; break outer }
      }
    }
    expect(found, 'no creature ever wandered onto the player in 40 seeds').toBe(true)
  })

  it('the Heart-carrying multiplier is the other drift, and it makes the way out louder', () => {
    expect(HEART.carryScentMultiplier).toBeGreaterThan(1)
    expect(SCENT_BY_ACTION.move * HEART.carryScentMultiplier).toBeGreaterThan(SCENT_BY_ACTION.move)
  })

  it('carries hostility WITH the creature — anger does not stay behind in an empty room', () => {
    // If the flag lived on the room rather than travelling with the creature,
    // a goblin that turned on you and wandered off would leave its anger in the
    // chamber it vacated, and arrive next door as friendly. Both are bugs.
    // Exactly ONE angry creature, followed room to room. With several, a second
    // hostile creature can move into the room the first just vacated, which
    // looks like anger staying behind but is not.
    let followed = 0
    for (let seed = 1; seed <= 40 && followed < 5; seed++) {
      const fresh = lab(seed, 'ravening')
      const start = roomsWith(fresh, (r) => r.creature !== null)[0]
      if (!start) continue

      let l: Labyrinth = {
        ...fresh,
        rooms: { ...fresh.rooms, [start.id]: { ...start, creatureHostile: true } },
      }
      let angryAt: RoomId = start.id
      let itMoved = false

      const rng = createRng(seed)
      for (let turn = 0; turn < 25; turn++) {
        const result = driftWorld(l, { playerRoomId: l.entranceId, wumpusRoomId: roomIdAt(0, 0) }, rng)
        l = result.labyrinth

        const mine = result.movedCreatures.find((m) => m.from === angryAt)
        if (mine) {
          itMoved = true
          expect(mine.hostile, 'it must report itself as hostile when it moves').toBe(true)
          expect((l.rooms[mine.to] as Room).creatureHostile, 'anger must arrive with it').toBe(true)
          angryAt = mine.to
        }

        // Exactly one room on the whole map is angry, and it is the one the
        // creature is standing in.
        const angry = roomsWith(l, (r) => r.creatureHostile).map((r) => r.id)
        expect(angry, `turn ${turn}, seed ${seed}`).toEqual([angryAt])
        expect((l.rooms[angryAt] as Room).creature).not.toBeNull()
      }
      if (itMoved) followed += 1
    }
    expect(followed, 'no hostile creature ever moved in 40 seeds').toBeGreaterThan(0)
  })

  it('leaves a calm creature calm — drift does not anger anything', () => {
    let l = lab(21, 'ravening')
    const rng = createRng(3)
    for (let turn = 0; turn < 40; turn++) {
      l = driftWorld(l, { playerRoomId: l.entranceId, wumpusRoomId: roomIdAt(0, 0) }, rng).labyrinth
    }
    expect(roomsWith(l, (r) => r.creatureHostile).length).toBe(0)
  })
})

// ===========================================================================
// Hostility — the one band that leaves a live, untamed creature in the room
// ===========================================================================

describe('a creature that has turned on you', () => {
  const withCreature = (hostile: boolean): Room => ({
    id: roomIdAt(1, 1), x: 1, y: 1, archetype: 'hewnChamber', exits: {},
    hazard: null, creature: 'goblin', creatureHostile: hostile,
    isEntrance: false, hasHeart: false, oilFlask: false, grave: null, visited: true,
  })

  it('is the outcome of a critically failed TAME, and of nothing else', () => {
    const l = lab(1)
    for (const action of ENCOUNTER_ACTIONS) {
      for (const band of BAND_ORDER) {
        const r = resolveEncounter(action, band, ctx(l), createRng(1))
        expect(r.hostile, `${action}/${band}`).toBe(action === 'tame' && band === 'criticalFailure')
      }
    }
  })

  it('is the only band that leaves a live, untamed creature standing there', () => {
    const l = lab(1)
    for (const band of BAND_ORDER) {
      const r = resolveEncounter('tame', band, ctx(l), createRng(1))
      const stillThereAndWild = r.creatureRemains && r.companionGained === null
      expect(stillThereAndWild, `tame/${band}`).toBe(band === 'criticalFailure')
    }
  })

  it('cannot be tamed again — you had your chance', () => {
    expect(canTame(withCreature(false))).toBe(true)
    expect(canTame(withCreature(true))).toBe(false)
  })

  it('still leaves you three options: fight it, slip past it, or run', () => {
    expect(encounterOptions(withCreature(true))).toEqual(['fight', 'sneak', 'flee'])
    expect(encounterOptions(withCreature(false))).toEqual(['fight', 'tame', 'sneak', 'flee'])
  })

  it('offers nothing in an empty room, and cannot be tamed there', () => {
    const empty: Room = { ...withCreature(false), creature: null }
    expect(encounterOptions(empty)).toEqual([])
    expect(canTame(empty)).toBe(false)
  })

  it('generation never starts anything angry', () => {
    for (const difficulty of ALL_DIFFICULTIES) {
      for (let seed = 1; seed <= 8; seed++) {
        const l = lab(seed, difficulty)
        expect(roomsWith(l, (r) => r.creatureHostile).length).toBe(0)
      }
    }
  })
})
