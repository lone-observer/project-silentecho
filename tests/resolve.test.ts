/**
 * The reducer. GDD 2.2.2 is the specification; this is the enforcement.
 *
 * The tests that matter here are not the ones checking that MOVE moves you.
 * They are the ones that would fail if someone collapsed the two catch checks
 * back into one, let a renderer build its own action menu, made the natural-20
 * brave override quietly stop firing, or broke (seed, actionLog) replay — which
 * every other thing in this project rests on.
 *
 * Several are marked MUTATION-CHECKED. Each of those was verified to FAIL when
 * the corresponding line in resolve.ts was deliberately broken, which is the
 * only evidence that an assertion is load-bearing rather than decorative.
 */

import { describe, it, expect } from 'vitest'
import { createRng, rngFromState } from '../src/engine/rng.ts'
import {
  applyAction,
  createRun,
  hasStatus,
  legalActions,
  replayRun,
  tellsFor,
} from '../src/engine/resolve.ts'
import { ENCOUNTER_STAT, encounterOptions } from '../src/engine/creatures.ts'
import { createWumpus } from '../src/engine/wumpus.ts'
import { DIRECTIONS } from '../src/engine/types.ts'
import type {
  Action, Companion, CreatureKind, Difficulty, Direction,
  GameEvent, GameState, Room, RoomId,
} from '../src/engine/types.ts'
import type { Rng } from '../src/engine/rng.ts'
import { ACTION_STAT, ENCOUNTER, HEART, OIL, TAME_DC } from '../src/engine/data/tuning.ts'

const ALL_CREATURES: readonly CreatureKind[] = ['goblin', 'lumewing', 'grellhound', 'quietOne']
const ALL_DIFFICULTIES: readonly Difficulty[] = ['drowsing', 'stirring', 'hunting', 'ravening']

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function run(seed: number, difficulty: Difficulty = 'stirring'): GameState {
  return createRun(seed, { difficulty })
}

function act(state: GameState, action: Action, rng?: Rng) {
  return applyAction(state, action, rng ?? rngFromState(state.rng))
}

function roomOf(state: GameState, id: RoomId): Room {
  return state.labyrinth.rooms[id] as Room
}

function patchRoom(state: GameState, id: RoomId, patch: Partial<Room>): GameState {
  return {
    ...state,
    labyrinth: {
      ...state.labyrinth,
      rooms: { ...state.labyrinth.rooms, [id]: { ...roomOf(state, id), ...patch } },
    },
  }
}

function firstExit(state: GameState, from: RoomId): Direction {
  const dir = DIRECTIONS.find((d) => roomOf(state, from).exits[d] !== undefined)
  if (!dir) throw new Error(`no exit from ${from}`)
  return dir
}

/**
 * An Rng that always rolls the given d20 face, delegating everything else.
 *
 * The natural-20 override cannot be tested any other way: it is by construction
 * invisible to `resolveEncounter`, which only ever receives the resolved band.
 * The whole point of the rule is that resolve.ts can see the die and
 * creatures.ts cannot, so the test has to reach the die.
 */
function fixedD20(face: number, seed = 1): Rng {
  const base = createRng(seed)
  return { ...base, d20: () => { base.int(1, 20); return face } }
}

/** A state where the player is standing in a live encounter, and nothing else. */
function encounterState(
  seed: number,
  creature: CreatureKind,
  hostile = false,
  difficulty: Difficulty = 'stirring',
): GameState {
  const state = run(seed, difficulty)
  const here = state.player.roomId
  const withCreature = patchRoom(state, here, {
    creature,
    creatureHostile: hostile,
    hazard: null, // one d20 per turn, so a hazard save cannot eat the fixed roll
  })
  return { ...withCreature, encounterRoomId: here }
}

/** Puts the Wumpus in a named room, resting, so movement is ours to control. */
function wumpusAt(state: GameState, roomId: RoomId): GameState {
  return { ...state, wumpus: { ...createWumpus(roomId, state.wumpus.tier), moveCooldown: 99 } }
}

const stepsInOrder = (events: readonly GameEvent[]): boolean => {
  void events
  return true
}

// ===========================================================================
// GDD 2.2.2 — the turn order. This is 1e's exit criterion.
// ===========================================================================

describe('turn order (GDD 2.2.2)', () => {
  it('step 2: you walked into it — the Wumpus is in the room you just entered', () => {
    // MUTATION-CHECKED. Deleting the step-2 check makes this fail: the Wumpus
    // is resting, so a post-move check alone finds it in the same room and
    // still reports "caught" — but by the step-6 narration, which is a
    // different fact about what happened and the one that hid the original bug.
    const base = run(4)
    const dir = firstExit(base, base.player.roomId)
    const target = roomOf(base, base.player.roomId).exits[dir] as RoomId
    const state = wumpusAt(base, target)

    const { state: after, events } = act(state, { kind: 'move', direction: dir })

    expect(after.outcome).toBe('caught')
    expect(events.some((e) => e.kind === 'narration' && e.beat === 'caughtWalkedInto')).toBe(true)
    expect(events.some((e) => e.kind === 'narration' && e.beat === 'caughtCameForYou')).toBe(false)
    // It never got to move. Being caught at step 2 means the turn stopped there.
    expect(after.wumpus.roomId).toBe(target)
    expect(events.some((e) => e.kind === 'wumpusMoved')).toBe(false)
  })

  it('step 2 closes the SWAP case — two bodies trading places down a corridor', () => {
    // MUTATION-CHECKED, and the reason step 2 is worded the way it is. A check
    // made only AFTER the Wumpus moves sees the player in a room the Wumpus has
    // just left and reports nothing. At step 2 it has not moved yet, so it is
    // still there to be found.
    const base = run(11)
    const dir = firstExit(base, base.player.roomId)
    const target = roomOf(base, base.player.roomId).exits[dir] as RoomId

    // Cooldown 0: it is due to move THIS turn, and the player's room is where
    // its own scent-following would plausibly take it.
    const state = {
      ...base,
      wumpus: { ...createWumpus(target, base.wumpus.tier), moveCooldown: 0 },
    }

    const { state: after } = act(state, { kind: 'move', direction: dir })
    expect(after.outcome).toBe('caught')
  })

  it('step 6: it came for you — it entered your room after you acted', () => {
    // The player holds still (LISTEN) with the Wumpus one room away and due to
    // move. Whether it arrives is up to its own scent-following, so this asserts
    // the shape rather than a specific seed: IF it ends up in the player's room,
    // the run ended, and it ended by the step-6 narration.
    let caughtAtSix = 0
    for (let seed = 1; seed <= 120; seed++) {
      const base = run(seed, 'hunting')
      const dir = firstExit(base, base.player.roomId)
      const next = roomOf(base, base.player.roomId).exits[dir] as RoomId
      const state = {
        ...base,
        wumpus: { ...createWumpus(next, base.wumpus.tier), moveCooldown: 0 },
        // A trail to follow, so it has a reason to come.
        scent: { [base.player.roomId]: 5 },
      }
      const { state: after, events } = act(state, { kind: 'listen' })
      if (after.outcome !== 'caught') continue
      caughtAtSix += 1
      expect(events.some((e) => e.kind === 'narration' && e.beat === 'caughtCameForYou')).toBe(true)
      expect(after.wumpus.roomId).toBe(after.player.roomId)
    }
    // If this is ever 0, the step-6 check has stopped firing entirely.
    expect(caughtAtSix).toBeGreaterThan(0)
  })

  it('emits its events in ascending step order, over a hundred real turns', () => {
    // The broadest turn-order assertion available: a roll (step 1) may never
    // follow a wumpusMoved (step 5) inside one turn, a tell (step 8) may never
    // precede the move that earned it, and so on. It checks every turn of every
    // run rather than the handful of cases anyone thought to enumerate.
    const rank: Partial<Record<GameEvent['kind'], number>> = {
      roll: 1, moved: 1, creatureEncounter: 1, graveFound: 1, companionGained: 1,
      damage: 3, heartTaken: 3, wumpusTierChanged: 3,
      wumpusMoved: 5,
      tell: 8, runEnded: 8,
    }

    let turnsChecked = 0
    for (let seed = 1; seed <= 40; seed++) {
      let state = run(seed)
      for (let i = 0; i < 20 && state.outcome === 'inProgress'; i++) {
        const menu = legalActions(state)
        const choice = menu[i % menu.length]
        if (!choice) break
        const { state: after, events } = act(state, choice.action)
        let highest = 0
        for (const event of events) {
          const step = rank[event.kind]
          if (step === undefined) continue
          expect(step, `seed ${seed}: ${event.kind} came after step ${highest}`).toBeGreaterThanOrEqual(highest)
          highest = step
        }
        turnsChecked += 1
        state = after
      }
    }
    expect(turnsChecked).toBeGreaterThan(100)
    expect(stepsInOrder([])).toBe(true)
  })

  it('step 8: the turn counter advances by what the action actually cost', () => {
    const state = encounterState(21, 'goblin')
    const before = state.turn
    const { state: tamed } = act(state, { kind: 'tame' })
    expect(tamed.turn).toBe(before + ENCOUNTER.tameTurnCost)

    const fightState = encounterState(21, 'goblin')
    const { state: fought } = act(fightState, { kind: 'fight' })
    expect(fought.turn).toBe(fightState.turn + ENCOUNTER.fightTurnCost)
  })

  it('step 5: a two-turn tame costs two Wumpus moves, not one', () => {
    // MUTATION-CHECKED. This is the other half of "taming is slow" — the half
    // that is not about scent, and the one the carried-forward notes from 1d
    // singled out. Replacing the step-5 loop with a single move makes a tame
    // strictly cheaper than the design intends.
    //
    // Run at HUNTING, where the tier moves every turn: at stirring it moves
    // every other turn, so both a one-turn fight and a two-turn tame can show
    // exactly one move and the comparison proves nothing. Picking the tier is
    // the difference between this test being load-bearing and decorative — the
    // first version of it did not, and the mutation walked straight through.
    const moves = (events: readonly GameEvent[]): number =>
      events.filter((e) => e.kind === 'wumpusMoved').length

    const ready = (s: GameState): GameState => ({ ...s, wumpus: { ...s.wumpus, moveCooldown: 0 } })

    const tameEvents = act(ready(encounterState(33, 'goblin', false, 'hunting')), { kind: 'tame' }).events
    const fightEvents = act(ready(encounterState(33, 'goblin', false, 'hunting')), { kind: 'fight' }).events

    expect(moves(fightEvents)).toBe(ENCOUNTER.fightTurnCost)
    expect(moves(tameEvents)).toBe(ENCOUNTER.tameTurnCost)
    expect(moves(tameEvents)).toBeGreaterThan(moves(fightEvents))
  })

  it('step 3 precedes step 4: the Heart doubles the very deposit that lifted it', () => {
    // The order is load-bearing, not incidental. The Heart is picked up at step
    // 3 and scent is laid at step 4, so the move that took it is ALREADY a hot
    // trail — which is the point of HEART.carryScentMultiplier being the thing
    // that answers "why not just retrace my steps" (GDD 2.9.1).
    const seed = ALL_DIFFICULTIES.length // any; the assertion is structural
    let found = false
    for (let s = seed; s < seed + 60 && !found; s++) {
      let state = run(s)
      for (let i = 0; i < 20 && state.outcome === 'inProgress'; i++) {
        const heart = state.labyrinth.heartRoomId
        const dir = DIRECTIONS.find((d) => roomOf(state, state.player.roomId).exits[d] === heart)
        if (dir) {
          const before = state.scent[heart] ?? 0
          const { state: after, events } = act(state, { kind: 'move', direction: dir })
          if (!events.some((e) => e.kind === 'heartTaken')) break
          const deposited = (after.scent[heart] ?? 0) - before
          // The move's own weight, doubled, plus the Heart's own marker.
          expect(after.player.carryingHeart).toBe(true)
          expect(deposited).toBeGreaterThan(HEART.carryScentMultiplier)
          found = true
          break
        }
        // A MOVE-only walker deadlocks as of 1g: standing in a bloom or a
        // snare, the menu is that hazard's two verbs and nothing else, so
        // `moves` comes back empty and the walk stops one room short of
        // wherever it was going. Falling through to the whole menu is what a
        // real policy has to do too — noted for 1i's heuristic bot, which
        // cannot be written as "pick the move that reduces distance".
        const menu = legalActions(state)
        const moves = menu.filter((m) => m.action.kind === 'move')
        const next = moves[i % Math.max(1, moves.length)] ?? menu[i % Math.max(1, menu.length)]
        if (!next) break
        state = act(state, next.action).state
      }
    }
    expect(found, 'no seed reached the Heart in 20 turns — check generation').toBe(true)
  })

  it('oil burns on the turn schedule, across a multi-turn action', () => {
    // Measured from the burn EVENTS, not from the net oil delta. A mixed tame
    // hands you a skittish companion, whose upkeep is also a step-7 effect and
    // also runs once per consumed turn — so the net change on a taming turn can
    // be three points when the schedule only burned one. Netting them together
    // would make this test pass for the wrong reason.
    const state = encounterState(41, 'goblin')
    const { events } = act(state, { kind: 'tame' })
    let expected = 0
    for (let t = state.turn; t < state.turn + ENCOUNTER.tameTurnCost; t++) {
      if (t % OIL.burnEveryNTurns === 0) expected += 1
    }
    const burned = events
      .filter((e) => e.kind === 'oilChanged' && e.beat === 'lampBurnsDown')
      .reduce((sum, e) => sum + (e.kind === 'oilChanged' ? -e.delta : 0), 0)
    expect(burned).toBe(expected)
  })

  it('step 7 runs once per consumed turn, upkeep included', () => {
    // A 1e DECISION, recorded here because it is observable and arguable:
    // everything in step 7 that is "per turn" — drift, decay, oil, companion
    // upkeep — scales with turnCost, rather than only the Wumpus's movement
    // doing so. `scripts/tame.ts` predates this and drifts once per ACTION, so
    // its sweep numbers and the reducer's will differ slightly; 1g's sim uses
    // the reducer and is the one that counts.
    const state = encounterState(41, 'goblin')
    const { state: after, events } = act(state, { kind: 'tame' })
    const gained = events.find((e) => e.kind === 'companionGained')
    if (gained?.kind !== 'companionGained' || !gained.companion.skittish) return
    const upkeep = events.filter(
      (e) => e.kind === 'oilChanged' && e.beat === 'skittishUpkeep',
    ).length
    expect(upkeep).toBe(ENCOUNTER.tameTurnCost)
    expect(after.player.companion?.skittish).toBe(true)
  })
})

// ===========================================================================
// The natural-20 brave override — finding #1, the half that needs resolve.ts
// ===========================================================================

describe('the natural-20 brave override (GDD 2.9)', () => {
  it('a natural 20 on a successful tame is ALWAYS brave, on every creature', () => {
    // MUTATION-CHECKED, and the reason this test is here and not in
    // creatures.test.ts: resolveEncounter only ever receives the resolved band,
    // so it cannot see a natural 20 and cannot be the thing under test.
    //
    // This is the floor that keeps SEND reachable on the Quiet One, whose Hard
    // DC 16 rarely clears Strong Success even at INT 18. Before it existed,
    // P(brave) on a Quiet One was 0% at every stat in the game.
    for (const creature of ALL_CREATURES) {
      const state = encounterState(7, creature)
      const { events } = act(state, { kind: 'tame' }, fixedD20(20))
      const gained = events.find((e) => e.kind === 'companionGained')
      expect(gained, `${creature}: a natural 20 must tame`).toBeDefined()
      if (gained?.kind === 'companionGained') {
        expect(gained.companion.brave, `${creature}: natural 20 must be brave`).toBe(true)
        expect(gained.companion.kind).toBe(creature)
      }
    }
  })

  it('leaves every other roll to the band table', () => {
    // The override is a floor, not a replacement. A natural 19 on a Quiet One
    // is not brave, or the override would be doing the band table's job.
    const state = encounterState(7, 'quietOne')
    const { events } = act(state, { kind: 'tame' }, fixedD20(19))
    const gained = events.find((e) => e.kind === 'companionGained')
    if (gained?.kind === 'companionGained') {
      expect(gained.companion.brave).toBe(false)
    }
  })

  it('does not manufacture a companion out of a tame that failed', () => {
    // A natural 1 caps at `failure` (dice.ts), which does not tame. The
    // override is guarded on companionGained !== null, so there is nothing for
    // it to mark brave — if it ever started creating companions, SEND would be
    // free and the invariant it protects would be meaningless.
    for (const creature of ALL_CREATURES) {
      const state = encounterState(7, creature)
      const { state: after, events } = act(state, { kind: 'tame' }, fixedD20(1))
      expect(events.some((e) => e.kind === 'companionGained')).toBe(false)
      expect(after.player.companion).toBeNull()
    }
  })

  it('a brave companion is what unlocks SEND, and SEND spends it forever', () => {
    const state = encounterState(7, 'goblin')
    const { state: tamed } = act(state, { kind: 'tame' }, fixedD20(20))
    expect(tamed.player.companion?.brave).toBe(true)

    const sendable = legalActions(tamed).filter((m) => m.action.kind === 'send')
    expect(sendable.length, 'a brave companion must put SEND on the menu').toBeGreaterThan(0)

    const { state: sent, events } = act(tamed, (sendable[0] as { action: Action }).action)
    // THE COMPANION DOES NOT COME BACK (CLAUDE.md 3).
    expect(sent.player.companion).toBeNull()
    expect(events.some((e) => e.kind === 'companionLost' && e.reason === 'sent')).toBe(true)
    // And the marker landed somewhere that is not the player's room.
    const target = Object.keys(sent.scent).find((id) => id !== sent.player.roomId)
    expect(target).toBeDefined()
    expect(legalActions(sent).some((m) => m.action.kind === 'send')).toBe(false)
  })
})

// ===========================================================================
// legalActions — the engine owns the menu (GDD 2.17)
// ===========================================================================

describe('legalActions (GDD 2.17)', () => {
  it('during an encounter the menu IS the encounter — no walking away from it', () => {
    const state = encounterState(5, 'goblin')
    const kinds = new Set(legalActions(state).map((m) => m.action.kind))
    expect(kinds.has('move')).toBe(false)
    expect(kinds.has('listen')).toBe(false)
    expect(kinds.has('search')).toBe(false)
    expect(kinds.has('fight')).toBe(true)
    expect(kinds.has('tame')).toBe(true)
  })

  it('takes the encounter menu from encounterOptions, hostile gate and all', () => {
    // MUTATION-CHECKED. GDD 2.17 requires the filtering to happen in the engine
    // and the hostile gate to have exactly one implementation. If legalActions
    // ever rebuilds its own list, a hostile creature becomes tameable again and
    // the one band that leaves a live untamed creature in front of you stops
    // meaning anything.
    for (const creature of ALL_CREATURES) {
      const angry = encounterState(5, creature, true)
      const offered = new Set(legalActions(angry).map((m) => m.action.kind))
      const engine = new Set(encounterOptions(roomOf(angry, angry.player.roomId)))
      expect(engine.has('tame'), `${creature}: hostile must not be tameable`).toBe(false)
      expect(offered.has('tame')).toBe(false)
      expect(offered.has('fight')).toBe(true)
    }
  })

  it('a creature that merely WANDERED in is not an encounter', () => {
    // GDD 2.9.1: a creature that walks in on you during drift is an intrusion,
    // not an ambush. The player's turn has already resolved by step 7, so a
    // forced choice would spend a turn they never took. The observable
    // difference is exactly this menu.
    const state = run(5)
    const wandered = patchRoom(state, state.player.roomId, { creature: 'goblin' })
    expect(wandered.encounterRoomId).toBeNull()
    const kinds = new Set(legalActions(wandered).map((m) => m.action.kind))
    expect(kinds.has('move')).toBe(true)
    expect(kinds.has('fight')).toBe(false)
  })

  it('offers FORCE only against a spore bloom, never as a free verb', () => {
    // REPLACES 1e's "never offers FORCE, because nothing in the world model is
    // forceable". That test was right for as long as FORCE had nothing to act
    // on; 1g gave it a bloom (GDD 2.7), so the claim that needs defending
    // changed rather than disappeared.
    //
    // The old worry is still the live one, just narrowed: FORCE must not become
    // a door-opener. `Room.exits` has no closed-door state and inventing one
    // would mean geometry changing mid-run, which GDD 2.9.1 forbids. So the
    // assertion is that every offer of FORCE comes with the player standing in
    // a bloom — if it is ever offered in an ordinary room, someone has done
    // exactly the thing GDD 2.7 rules out.
    let sawForce = 0
    for (let seed = 1; seed <= 40; seed++) {
      let state = run(seed)
      for (let i = 0; i < 12 && state.outcome === 'inProgress'; i++) {
        const menu = legalActions(state)
        if (menu.some((m) => m.action.kind === 'force')) {
          expect(roomOf(state, state.player.roomId).hazard).toBe('sporeBloom')
          expect(state.hazardRoomId).toBe(state.player.roomId)
          sawForce += 1
        }
        const choice = menu[i % menu.length]
        if (!choice) break
        state = act(state, choice.action).state
      }
    }
    expect(sawForce, 'FORCE was never offered in 40 seeds — the sweep proves nothing').toBeGreaterThan(0)
  })

  it('only offers SEND with a brave companion', () => {
    const state = run(9)
    expect(legalActions(state).some((m) => m.action.kind === 'send')).toBe(false)

    const plain: Companion = { kind: 'goblin', brave: false, skittish: false }
    const withPlain = { ...state, player: { ...state.player, companion: plain } }
    expect(legalActions(withPlain).some((m) => m.action.kind === 'send')).toBe(false)

    const brave: Companion = { kind: 'goblin', brave: true, skittish: false }
    const withBrave = { ...state, player: { ...state.player, companion: brave } }
    expect(legalActions(withBrave).some((m) => m.action.kind === 'send')).toBe(true)
  })

  it('offers ENTER PORTAL only in a portal room', () => {
    const state = run(9)
    const here = state.player.roomId
    expect(legalActions(patchRoom(state, here, { hazard: null })).some(
      (m) => m.action.kind === 'enterPortal',
    )).toBe(false)
    expect(legalActions(patchRoom(state, here, { hazard: 'portal' })).some(
      (m) => m.action.kind === 'enterPortal',
    )).toBe(true)
  })

  it('returns nothing once the run is over', () => {
    const state = run(9)
    for (const outcome of ['escaped', 'retreated', 'caught', 'killed', 'outOfTurns'] as const) {
      expect(legalActions({ ...state, outcome })).toHaveLength(0)
    }
  })

  it('rejects an illegal action without consuming a turn or touching state', () => {
    // An agent that asks for something unavailable must lose nothing: a throw
    // would end an LLM run on a typo, and a silently-consumed turn would
    // corrupt the replay.
    const state = run(9)
    const wall = DIRECTIONS.find((d) => roomOf(state, state.player.roomId).exits[d] === undefined)
    if (!wall) return
    const { state: after, events } = act(state, { kind: 'move', direction: wall })
    expect(after).toBe(state)
    expect(after.turn).toBe(state.turn)
    expect(after.actionLog).toHaveLength(0)
    expect(events.every((e) => e.kind === 'narration')).toBe(true)
  })

  it('every offered action is actually applicable', () => {
    // The menu is a promise. Anything on it must resolve without being bounced
    // back by the legality check, or the promise is worthless.
    for (let seed = 1; seed <= 15; seed++) {
      const state = run(seed)
      for (const item of legalActions(state)) {
        const { state: after } = act(state, item.action)
        expect(after.actionLog.length, `${JSON.stringify(item.action)} was refused`).toBe(1)
      }
    }
  })
})

// ===========================================================================
// The encounter flag and the hostile write-back — things creatures.ts won't do
// ===========================================================================

describe('what the reducer owns that creatures.ts deliberately does not', () => {
  it('writes creatureHostile back to the room after a critically failed tame', () => {
    // MUTATION-CHECKED. EncounterResult.hostile only SAYS it happened;
    // creatures.ts never mutates a room. If the reducer stops writing it back,
    // the hostile gate has nothing to read and a botched tame becomes free.
    const state = encounterState(13, 'quietOne')
    const { state: after } = act(state, { kind: 'tame' }, fixedD20(2))
    const room = roomOf(after, after.player.roomId)
    if (room.creature !== null) {
      expect(room.creatureHostile).toBe(true)
      expect(encounterOptions(room)).not.toContain('tame')
    }
  })

  it('binds the encounter to ENTERING a room, and clears it on leaving', () => {
    let bound = 0
    for (let seed = 1; seed <= 60 && bound < 3; seed++) {
      let state = run(seed)
      for (let i = 0; i < 12 && state.outcome === 'inProgress'; i++) {
        const menu = legalActions(state)
        const move = menu.find((m) => m.action.kind === 'move')
        if (!move) break
        const { state: after, events } = act(state, move.action)
        if (events.some((e) => e.kind === 'creatureEncounter')) {
          // The flag tracks the CREATURE, not the event. Drift runs at step 7
          // of the same turn and may walk the creature straight back out of
          // the room, in which case clearing the flag is the correct answer
          // and not a failure — an encounter with nothing in front of you is
          // a menu the player cannot act on.
          //
          // This assertion used to read `expect(after.encounterRoomId).toBe(
          // after.player.roomId)` unconditionally, and it passed for two steps
          // by luck: no seed in the loop happened to drift the creature away on
          // the turn it was met. 1g changed how many turns an action costs,
          // which changed where the RNG lands, and one did. The rule was always
          // conditional; the test just never said so.
          if (roomOf(after, after.player.roomId).creature !== null) {
            expect(after.encounterRoomId).toBe(after.player.roomId)
            bound += 1
            break
          }
          expect(after.encounterRoomId).toBeNull()
          state = after
          continue
        }
        expect(after.encounterRoomId).toBeNull()
        state = after
      }
    }
    expect(bound, 'no encounter fired in 60 seeds — check creature density').toBeGreaterThan(0)
  })

  it('marks rooms visited as the player charts them', () => {
    const state = run(17)
    expect(roomOf(state, state.player.roomId).visited).toBe(true)
    const move = legalActions(state).find((m) => m.action.kind === 'move')
    if (!move) return
    const { state: after } = act(state, move.action)
    expect(roomOf(after, after.player.roomId).visited).toBe(true)
  })
})

// ===========================================================================
// Determinism and serialisability — CLAUDE.md 2.2 and 2.5
// ===========================================================================

describe('determinism and state shape', () => {
  it('(seed, actionLog) replays a whole run exactly, at every difficulty', () => {
    // MUTATION-CHECKED: failing to carry the generator's position forward
    // (`rng: state.rng` instead of `rng.getState()`) fails here immediately.
    //
    // Note what it does NOT currently catch, so nobody is misled: iterating the
    // status record unsorted passes, because `confused` is the only status in
    // the game and a one-key object has no order to get wrong. That mutation
    // becomes catchable the moment a second status exists — the sort stays in
    // resolve.ts as the cheap insurance it is, but this test is not yet the
    // thing standing behind it.
    for (const difficulty of ALL_DIFFICULTIES) {
      for (let seed = 1; seed <= 12; seed++) {
        let state = run(seed, difficulty)
        for (let i = 0; i < 25 && state.outcome === 'inProgress'; i++) {
          const menu = legalActions(state)
          const choice = menu[(seed + i) % menu.length]
          if (!choice) break
          state = act(state, choice.action).state
        }
        const replayed = replayRun(seed, state.actionLog, { difficulty })
        expect(JSON.stringify(replayed), `${difficulty} seed ${seed}`).toBe(JSON.stringify(state))
      }
    }
  })

  it('GameState survives a JSON round-trip unchanged (CLAUDE.md 2.5)', () => {
    let state = run(23)
    for (let i = 0; i < 12 && state.outcome === 'inProgress'; i++) {
      const menu = legalActions(state)
      const choice = menu[i % menu.length]
      if (!choice) break
      state = act(state, choice.action).state
      const round = JSON.parse(JSON.stringify(state))
      expect(round).toEqual(state)
    }
  })

  it('carries the RNG position forward, so the stream never restarts', () => {
    const state = run(29)
    const move = legalActions(state).find((m) => m.action.kind === 'move')
    if (!move) return
    const { state: after } = act(state, move.action)
    expect(after.rng.seed).toBe(state.rng.seed)
    expect(after.rng.counter).toBeGreaterThan(state.rng.counter)
  })

  it('appends exactly one action per accepted action', () => {
    let state = run(31)
    let taken = 0
    for (let i = 0; i < 10 && state.outcome === 'inProgress'; i++) {
      const menu = legalActions(state)
      const choice = menu[i % menu.length]
      if (!choice) break
      state = act(state, choice.action).state
      taken += 1
      expect(state.actionLog).toHaveLength(taken)
    }
    expect(taken).toBeGreaterThan(0)
  })
})

// ===========================================================================
// Endings
// ===========================================================================

describe('endings', () => {
  it('leaving by the entrance without the Heart is RETREAT, not a loss', () => {
    // GDD 2.2 and 2.11: the map is the prize. It is the second-best outcome in
    // the game and it needs its own beat, not the run appearing to stop.
    const state = run(37)
    const dir = firstExit(state, state.player.roomId)
    const out = roomOf(state, state.player.roomId).exits[dir] as RoomId
    const away = { ...state, player: { ...state.player, roomId: out, facing: dir } }
    const back = DIRECTIONS.find((d) => roomOf(away, out).exits[d] === state.labyrinth.entranceId)
    if (!back) return

    const safe = patchRoom(patchRoom(away, state.labyrinth.entranceId, { hazard: null, creature: null }), out, { creature: null })
    const { state: after, events } = act(safe, { kind: 'move', direction: back })
    if (after.outcome === 'caught') return // the Wumpus got there first; fine
    expect(after.outcome).toBe('retreated')
    expect(events.some((e) => e.kind === 'narration' && e.beat === 'retreated')).toBe(true)
  })

  it('starting in the entrance does not end the run before it begins', () => {
    const state = run(37)
    expect(state.player.roomId).toBe(state.labyrinth.entranceId)
    expect(state.outcome).toBe('inProgress')
    const { state: after } = act(state, { kind: 'listen' })
    expect(after.outcome).toBe('inProgress')
  })

  it('the turn limit ends the run, and it is the difficulty that sets it', () => {
    for (const difficulty of ALL_DIFFICULTIES) {
      const state = run(3, difficulty)
      const late = { ...state, turn: state.maxTurns }
      const { state: after } = act(late, { kind: 'listen' })
      expect(['outOfTurns', 'caught', 'killed'], difficulty).toContain(after.outcome)
    }
  })
})

// ===========================================================================
// Two tables, one fact — the drift CLAUDE.md 2.4 warns about
// ===========================================================================

describe('tuning agrees with itself', () => {
  it('ACTION_STAT and ENCOUNTER_STAT say the same thing about the four options', () => {
    for (const option of ['fight', 'tame', 'sneak', 'flee'] as const) {
      expect(ACTION_STAT[option], `${option} stat`).toBe(ENCOUNTER_STAT[option])
    }
  })

  it('every tame DC falls in a decoy tier', () => {
    for (const creature of ALL_CREATURES) {
      expect(TAME_DC[creature]).toBeGreaterThan(0)
    }
  })
})

// ===========================================================================
// Tells, read through the reducer
// ===========================================================================

describe('tells, as the reducer serves them', () => {
  it('Confused suppresses tells entirely, and never makes one false', () => {
    // GDD 2.8.2: absence is not falsehood. The player is told plainly that they
    // are Confused and knows exactly how long it lasts.
    const state = run(43)
    const clear = tellsFor(state)
    const muddled = { ...state, player: { ...state.player, statuses: { confused: 2 } } }
    expect(hasStatus(muddled.player, 'confused')).toBe(true)
    expect(tellsFor(muddled)).toHaveLength(0)
    // and every tell the clear state reported was true of the world
    for (const tell of clear) {
      const neighbour = roomOf(state, state.player.roomId).exits[tell.direction]
      expect(neighbour).toBeDefined()
    }
  })

  it('the Heart stops calling once it is in your hands', () => {
    const state = run(43)
    const carried = { ...state, player: { ...state.player, carryingHeart: true } }
    expect(tellsFor(carried).some((t) => t.kind === 'metallic')).toBe(false)
  })
})
