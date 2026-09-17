/**
 * The reducer. One action in, one new state and a stream of events out.
 * See docs/GDD.md 2.2.2 for the turn order this file exists to implement.
 *
 *   applyAction(state, action, rng) -> { state, events }
 *
 * The eight steps are numbered in the code exactly as the GDD numbers them, and
 * they run in that order for a reason that cost a defect each:
 *
 *   1  player acts
 *   2  CATCH CHECK — the Wumpus is in the room you just entered. You walked into it.
 *   3  effects: damage, oil, status, Heart pickup and its escalation
 *   4  scent deposited for the action taken
 *   5  Wumpus moves, if it is due
 *   6  CATCH CHECK — it entered your room. It came for you.
 *   7  world drift, THEN companion passives, scent decay, oil burn
 *   8  win/loss evaluation, turn counter
 *
 * TWO CATCH CHECKS, NOT ONE. The hunt visualiser caught a player walking clean
 * through a Wumpus: they moved into its room, it stepped aside the same turn,
 * and a check made only after the Wumpus moved found an empty room. Step 2 also
 * closes the swap case for free — two bodies trading places down a corridor slip
 * past a post-move check, but at step 2 the Wumpus has not moved yet, so it is
 * still there to be found.
 *
 * WHAT THIS FILE OWNS that the other engine modules deliberately do not:
 *   - GameState. creatures.ts and wumpus.ts describe what should happen; this
 *     applies it. That split is what lets them be tested against a hand-built
 *     band instead of through a whole run.
 *   - The encounter flag (GameState.encounterRoomId).
 *   - Writing Room.creatureHostile back after a critically failed tame.
 *   - The natural-20 brave override on a tame, which CANNOT live in creatures.ts:
 *     resolveEncounter only ever receives the already-resolved band, so the
 *     natural die and the band coexist nowhere else. See GDD 2.9.
 *
 * Pure and deterministic. All randomness is injected; nothing here reads a
 * clock, a global, or the DOM (CLAUDE.md 2.1).
 */

import type {
  Action,
  ActionKind,
  Companion,
  Difficulty,
  Direction,
  Epitaph,
  GameEvent,
  GameState,
  HazardKind,
  Labyrinth,
  Modifier,
  OutcomeBand,
  Player,
  Room,
  RoomId,
  RollResult,
  ScentField,
  StatusEffect,
  Stats,
  Tell,
} from './types.ts'
import { DIRECTIONS } from './types.ts'
import type { Rng } from './rng.ts'
import { createRng, rngFromState } from './rng.ts'
import { isSuccess, roll, statModifierOf } from './dice.ts'
import {
  chooseWumpusStart,
  distancesFrom,
  generateLabyrinth,
  roomsAtLeast,
} from './generate.ts'
import {
  createWumpus,
  decayScent,
  depositScent,
  emptyScent,
  escalate,
  getTells,
  hasCaught,
  moveWumpus,
} from './wumpus.ts'
import type { EncounterAction } from './creatures.ts'
import {
  canSend,
  companionRollModifiers,
  companionSenses,
  companionUpkeep,
  driftWorld,
  encounterOptions,
  encounterRollSpec,
  resolveEncounter,
  scentMultiplierFor,
  sendCompanion,
  skittishBolts,
} from './creatures.ts'
import {
  ACTION_DC,
  ACTION_STAT,
  DEFAULT_DIFFICULTY,
  DIFFICULTY,
  ENTRY_HAZARDS,
  HAZARD_DC,
  HAZARD_OUTCOMES,
  HAZARD_STAT,
  HEART,
  OIL,
  oilBandFor,
  PLAYER,
  PORTAL,
  REST,
  SCENT,
  SCENT_BY_ACTION,
  STATUS,
} from './data/tuning.ts'

// ---------------------------------------------------------------------------
// Public shape
// ---------------------------------------------------------------------------

export interface ApplyResult {
  readonly state: GameState
  readonly events: readonly GameEvent[]
}

export interface LegalAction {
  readonly action: Action
  readonly label: string
  readonly dc?: number
}

export interface CreateRunOptions {
  readonly difficulty?: Difficulty
  readonly stats?: Stats
  readonly epitaphs?: readonly Epitaph[]
}

/** GameState schema version. Bump when a field changes meaning, not shape. */
export const STATE_VERSION = 1

/**
 * Every line of prose this reducer emits, in one table.
 *
 * CLAUDE.md 2.4 is explicit that prose lives in data and never inline in code,
 * and step 1f builds the real `(archetype x action x band)` outcomes table that
 * this becomes a small corner of. Until then it lives here rather than scattered
 * through the switch statements, for two reasons beyond tidiness:
 *
 *   - Step 1f can absorb it by moving one object, instead of hunting string
 *     literals through 600 lines of reducer.
 *   - `scripts/turn.ts` keys off these constants to work out which of the two
 *     catch checks fired. A visualiser that matched on a prose literal would
 *     silently stop reporting the moment someone improved the wording, and the
 *     whole point of that panel is to notice when a step stops doing anything.
 */
export const NARRATION = {
  caughtWalkedInto: 'It was already in there. You walked into it.',
  caughtCameForYou: 'It came for you.',
  killedByHazard: 'The dark takes you.',
  killedByDamage: 'You do not get up.',
  outOfTurns: 'The dark closes over the way you came.',
  escaped: 'Daylight, and the weight of it in your arms.',
  // Retreat is the second-best outcome in the game and GDD 2.17 calls it out as
  // needing a real beat rather than the run appearing to simply stop.
  retreated: 'Daylight. You did not get it. You know the way now.',
  lampBurnsDown: 'The lamp burns down.',
  lampBrightens: 'The lamp brightens.',
  lampGutters: 'The lamp gutters.',
  goblinScrounges: 'The goblin turns up a little oil.',
  skittishUpkeep: 'Keeping it calm costs oil.',
  foundFlask: 'An oil flask, half full, wedged under the stone.',
  caughtBreath: 'You catch your breath.',
  grellhoundGrowls: 'The grellhound growls, low and steady.',
  portal: 'The hum swallows you, and lets you out somewhere that is not where you were.',
} as const

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------

function roomOf(labyrinth: Labyrinth, id: RoomId): Room {
  const room = labyrinth.rooms[id]
  if (!room) throw new Error(`resolve: no room ${id}`)
  return room
}

function withRoom(labyrinth: Labyrinth, id: RoomId, patch: Partial<Room>): Labyrinth {
  return { ...labyrinth, rooms: { ...labyrinth.rooms, [id]: { ...roomOf(labyrinth, id), ...patch } } }
}

function directionTo(labyrinth: Labyrinth, from: RoomId, to: RoomId): Direction | null {
  const exits = roomOf(labyrinth, from).exits
  return DIRECTIONS.find((d) => exits[d] === to) ?? null
}

export function statusTurnsLeft(player: Player, status: StatusEffect): number {
  return player.statuses[status] ?? 0
}

export function hasStatus(player: Player, status: StatusEffect): boolean {
  return statusTurnsLeft(player, status) > 0
}

const ACTION_LABEL: Record<ActionKind, string> = {
  move: 'Move',
  listen: 'Listen',
  search: 'Search the room',
  force: 'Force',
  sneak: 'Sneak',
  fight: 'Fight',
  tame: 'Tame',
  flee: 'Flee',
  use: 'Use',
  read: 'Read the carvings',
  enterPortal: 'Enter the portal',
  rest: 'Rest',
  send: 'Send',
}

// ---------------------------------------------------------------------------
// Starting a run
// ---------------------------------------------------------------------------

export function createRun(seed: number, options: CreateRunOptions = {}): GameState {
  const rng = createRng(seed)
  const difficulty = options.difficulty ?? DEFAULT_DIFFICULTY
  const contract = DIFFICULTY[difficulty]

  const labyrinth = generateLabyrinth(rng, { difficulty, epitaphs: options.epitaphs ?? [] })
  const wumpus = createWumpus(chooseWumpusStart(labyrinth, rng), contract.wumpusTier)

  const stats: Stats = options.stats ?? {
    str: PLAYER.startingStat,
    agi: PLAYER.startingStat,
    int: PLAYER.startingStat,
    lck: PLAYER.startingStat,
  }

  const player: Player = {
    roomId: labyrinth.entranceId,
    facing: null,
    stats,
    health: PLAYER.maxHealth,
    maxHealth: PLAYER.maxHealth,
    oil: OIL.starting,
    maxOil: OIL.max,
    fortune: Math.floor(stats.lck / PLAYER.fortuneDivisor),
    carryingHeart: false,
    companion: null,
    inventory: [],
    statuses: {},
  }

  return {
    version: STATE_VERSION,
    rng: rng.getState(),
    // The entrance is charted the moment you are standing in it.
    labyrinth: withRoom(labyrinth, labyrinth.entranceId, { visited: true }),
    player,
    wumpus,
    scent: emptyScent(),
    turn: 1,
    maxTurns: contract.maxTurns,
    outcome: 'inProgress',
    encounterRoomId: null,
    actionLog: [],
  }
}

/**
 * (seed, actionLog) -> the identical run, every time, forever (CLAUDE.md 2.2).
 * This is the whole reason the engine is pure; telemetry, replays and the agent
 * harness are all this function wearing different hats.
 */
export function replayRun(
  seed: number,
  actionLog: readonly Action[],
  options: CreateRunOptions = {},
): GameState {
  let state = createRun(seed, options)
  for (const action of actionLog) {
    state = applyAction(state, action, rngFromState(state.rng)).state
  }
  return state
}

// ---------------------------------------------------------------------------
// Legal actions — computed IN THE ENGINE, never by a renderer (GDD 2.17)
// ---------------------------------------------------------------------------

/**
 * What is actually available this turn.
 *
 * GDD 2.17 is explicit: no renderer builds its own list, and none shows the full
 * thirteen verbs with the unavailable ones greyed out — a menu of thirteen where
 * three apply is a menu of thirteen as far as the player's decision cost goes.
 *
 * During a live encounter the menu IS the encounter, and its contents come from
 * `encounterOptions(room)` rather than being rebuilt here, so the hostile gate
 * has exactly one implementation.
 */
export function legalActions(state: GameState): LegalAction[] {
  if (state.outcome !== 'inProgress') return []

  const { player, labyrinth } = state
  const here = roomOf(labyrinth, player.roomId)
  const out: LegalAction[] = []
  const dcOf = (kind: ActionKind): number => ACTION_DC[kind]

  const creature = here.creature
  if (isEncounterLive(state) && creature !== null) {
    const retreat = retreatDirection(state)
    for (const option of encounterOptions(here)) {
      const dc = encounterRollSpec(option, creature).dc
      if (option === 'fight' || option === 'tame') {
        out.push({ action: { kind: option }, label: `${ACTION_LABEL[option]} the ${creature}`, dc })
      } else if (option === 'sneak') {
        // Slipping past means slipping past INTO somewhere. Every doorway but
        // the one you came in by is a candidate.
        for (const direction of DIRECTIONS) {
          const to = here.exits[direction]
          if (to === undefined || direction === retreat) continue
          out.push({ action: { kind: 'sneak', direction }, label: `Sneak ${direction}`, dc })
        }
      } else if (retreat !== null) {
        out.push({ action: { kind: 'flee', direction: retreat }, label: `Flee ${retreat}`, dc })
      }
    }
    return out
  }

  for (const direction of DIRECTIONS) {
    if (here.exits[direction] === undefined) continue
    out.push({ action: { kind: 'move', direction }, label: `Move ${direction}`, dc: dcOf('move') })
  }

  out.push({ action: { kind: 'listen' }, label: ACTION_LABEL.listen, dc: dcOf('listen') })
  out.push({ action: { kind: 'search' }, label: ACTION_LABEL.search, dc: dcOf('search') })
  out.push({ action: { kind: 'read' }, label: ACTION_LABEL.read, dc: dcOf('read') })
  out.push({ action: { kind: 'rest' }, label: ACTION_LABEL.rest, dc: dcOf('rest') })

  if (here.hazard === 'portal') {
    out.push({ action: { kind: 'enterPortal' }, label: ACTION_LABEL.enterPortal, dc: dcOf('enterPortal') })
  }

  for (const item of player.inventory) {
    out.push({ action: { kind: 'use', item }, label: `Use the ${item}`, dc: dcOf('use') })
  }

  // SEND needs a brave companion and a doorway. canSend owns both questions so
  // the menu and the reducer can never disagree about what is sendable.
  for (const direction of DIRECTIONS) {
    if (!canSend(labyrinth, player, direction)) continue
    out.push({
      action: { kind: 'send', direction },
      label: `Send the ${player.companion?.kind ?? 'companion'} ${direction}`,
      dc: dcOf('send'),
    })
  }

  // FORCE is deliberately absent. It is in GDD 2.7's verb list, but nothing in
  // the world model is forceable yet — `exits` has no closed-door state, and
  // inventing one here would mean geometry that changes mid-run, which is
  // exactly what GDD 2.9.1 forbids. Carried forward rather than faked.

  return out
}

function isEncounterLive(state: GameState): boolean {
  if (state.encounterRoomId === null) return false
  if (state.encounterRoomId !== state.player.roomId) return false
  return roomOf(state.labyrinth, state.player.roomId).creature !== null
}

/** Where FLEE goes: back the way you came. Null if you have not moved yet. */
function retreatDirection(state: GameState): Direction | null {
  const facing = state.player.facing
  if (facing === null) return null
  const back: Record<Direction, Direction> = { N: 'S', E: 'W', S: 'N', W: 'E' }
  const reverse = back[facing]
  return roomOf(state.labyrinth, state.player.roomId).exits[reverse] === undefined ? null : reverse
}

function isLegal(state: GameState, action: Action): boolean {
  return legalActions(state).some((l) => sameAction(l.action, action))
}

function sameAction(a: Action, b: Action): boolean {
  if (a.kind !== b.kind) return false
  if ('direction' in a && 'direction' in b) return a.direction === b.direction
  if ('item' in a && 'item' in b) return a.item === b.item
  return true
}

// ---------------------------------------------------------------------------
// The draft — everything a turn accumulates before it is committed
// ---------------------------------------------------------------------------

interface Draft {
  labyrinth: Labyrinth
  playerRoomId: RoomId
  facing: Direction | null
  stats: Stats
  health: number
  oil: number
  fortune: number
  companion: Companion | null
  carryingHeart: boolean
  inventory: string[]
  statuses: Partial<Record<StatusEffect, number>>
  scent: ScentField
  /** Deposits owed at step 4, keyed by the room they land in. */
  pendingScent: { roomId: RoomId; amount: number; fromPlayer: boolean }[]
  damage: number
  oilDelta: number
  applyStatus: StatusEffect | null
  turnCost: number
  fatal: boolean
  takesHeart: boolean
  encounterRoomId: RoomId | null
  events: GameEvent[]
  /** Carried so every exit path commits the same action and the same RNG position. */
  readonly action: Action
  readonly rng: Rng
}

// ---------------------------------------------------------------------------
// applyAction — the eight steps, in order
// ---------------------------------------------------------------------------

export function applyAction(state: GameState, action: Action, rng: Rng): ApplyResult {
  if (state.outcome !== 'inProgress') return { state, events: [] }

  if (!isLegal(state, action)) {
    // Not an exception. An agent that asks for something unavailable is told so
    // and loses nothing — a throw here would end an LLM run on a typo, and a
    // silently-consumed turn would corrupt the replay. GDD 2.17.
    return {
      state,
      events: [{ kind: 'narration', text: `${describe(action)} is not available right now.` }],
    }
  }

  const d: Draft = {
    labyrinth: state.labyrinth,
    playerRoomId: state.player.roomId,
    facing: state.player.facing,
    stats: state.player.stats,
    health: state.player.health,
    oil: state.player.oil,
    fortune: state.player.fortune,
    companion: state.player.companion,
    carryingHeart: state.player.carryingHeart,
    inventory: [...state.player.inventory],
    statuses: { ...state.player.statuses },
    scent: state.scent,
    pendingScent: [],
    damage: 0,
    oilDelta: 0,
    applyStatus: null,
    turnCost: 1,
    fatal: false,
    takesHeart: false,
    encounterRoomId: state.encounterRoomId,
    events: [],
    action,
    rng,
  }

  let wumpus = state.wumpus
  const outcome = state.outcome
  let listening = false

  // =========================================================================
  // 1. Player acts — the action resolves, the roll lands, the outcome applies
  // =========================================================================
  const rollResult = rollForAction(state, d, action, rng)
  if (rollResult) d.events.push({ kind: 'roll', action: action.kind, result: rollResult })

  listening = action.kind === 'listen'
  applyActionOutcome(state, d, action, rollResult, rng)

  // =========================================================================
  // 2. CATCH CHECK — the Wumpus is in the room you just entered
  // =========================================================================
  if (hasCaught(wumpus, d.playerRoomId)) {
    return finish(state, d, wumpus, 'caught', NARRATION.caughtWalkedInto)
  }

  // =========================================================================
  // 3. Effects: damage, oil, status, Heart pickup and its escalation
  // =========================================================================
  if (d.oilDelta !== 0) {
    d.oil = Math.max(0, Math.min(OIL.max, d.oil + d.oilDelta))
    d.events.push({
      kind: 'oilChanged',
      delta: d.oilDelta,
      text: d.oilDelta > 0 ? NARRATION.lampBrightens : NARRATION.lampGutters,
    })
  }

  if (d.damage > 0) {
    d.health -= d.damage
    d.events.push({ kind: 'damage', amount: d.damage, cause: action.kind })
    // Skittish companions bolt on DAMAGE TAKEN, never on a failed roll — failed
    // rolls are over 40% at starting stats, which would make a mixed tame
    // worthless (GDD 2.9). Fortune could save it; spending is a renderer
    // decision the reducer does not make for the player.
    if (skittishBolts(d.companion, d.damage, false) && d.companion !== null) {
      d.events.push({ kind: 'companionLost', kind_: d.companion.kind, reason: 'bolted' })
      d.companion = null
    }
  }

  if (d.applyStatus !== null) {
    const turns = STATUS.confusedTurns
    d.statuses = { ...d.statuses, [d.applyStatus]: turns }
    d.events.push({ kind: 'statusChanged', status: d.applyStatus, turns })
  }

  let revealedPlayerRoom: RoomId | null = null
  if (d.takesHeart) {
    d.carryingHeart = true
    d.labyrinth = withRoom(d.labyrinth, d.playerRoomId, { hasHeart: false })
    const before = wumpus.tier
    wumpus = escalate(wumpus, HEART.tierEscalation)
    // The loudest thing in the game, and the only moment it learns a position it
    // did not smell for itself.
    d.pendingScent.push({ roomId: d.playerRoomId, amount: SCENT.heartTaken, fromPlayer: false })
    revealedPlayerRoom = d.playerRoomId
    d.events.push({ kind: 'heartTaken' })
    if (wumpus.tier !== before) d.events.push({ kind: 'wumpusTierChanged', tier: wumpus.tier })
  }

  if (d.fatal) return finish(state, d, wumpus, 'killed', NARRATION.killedByHazard)
  if (d.health <= 0) return finish(state, d, wumpus, 'killed', NARRATION.killedByDamage)

  // =========================================================================
  // 4. Scent deposited for the action taken
  //
  // The Heart multiplier lands HERE, not in the drift pass. It is the third
  // thing that changes mid-run (GDD 2.9.1) — the one that changes you rather
  // than the map — and it is the answer to "why not just retrace my steps":
  // the way out crosses the same rooms but you are laying a hot trail down a
  // corridor the Wumpus is already moving toward.
  // =========================================================================
  for (const deposit of d.pendingScent) {
    const amount = deposit.fromPlayer && d.carryingHeart
      ? deposit.amount * HEART.carryScentMultiplier
      : deposit.amount
    d.scent = depositScent(d.scent, deposit.roomId, amount)
  }

  // =========================================================================
  // 5. Wumpus moves, if it is due — once per turn the action consumed.
  //    A tame costs two turns, so the thing gets two steps at you, with a
  //    decay between them. That is the other half of "taming is slow".
  // =========================================================================
  for (let step = 0; step < d.turnCost; step++) {
    const moved = moveWumpus(
      d.labyrinth,
      wumpus,
      d.scent,
      {
        carryingHeart: d.carryingHeart,
        entranceId: d.labyrinth.entranceId,
        // The revealed position is worth exactly one turn (HEART.revealTurns).
        revealedPlayerRoom: step === 0 ? revealedPlayerRoom : null,
      },
      rng,
    )
    wumpus = moved.wumpus
    if (moved.moved) d.events.push({ kind: 'wumpusMoved', to: wumpus.roomId })
    if (step < d.turnCost - 1) d.scent = decayScent(d.scent)
  }

  // =========================================================================
  // 6. CATCH CHECK — it entered your room
  // =========================================================================
  if (hasCaught(wumpus, d.playerRoomId)) {
    return finish(state, d, wumpus, 'caught', NARRATION.caughtCameForYou)
  }

  // =========================================================================
  // 7. World drift, THEN companion passives, scent decay, oil burn
  //
  // Drift precedes passives because a grellhound that reported the adjacent
  // rooms BEFORE a creature wandered in would be describing a labyrinth that no
  // longer exists — a companion whose entire job is honest information, lying.
  // =========================================================================
  for (let step = 0; step < d.turnCost; step++) {
    const drift = driftWorld(
      d.labyrinth,
      { playerRoomId: d.playerRoomId, wumpusRoomId: wumpus.roomId },
      rng,
    )
    d.labyrinth = drift.labyrinth
    for (const m of drift.movedCreatures) {
      if (m.to === d.playerRoomId) {
        // It walked in on you. GDD 2.9.1: an intrusion, not an ambush — the
        // encounter flag is NOT set, because your turn has already resolved and
        // a forced choice here would spend a turn you never took.
        d.events.push({ kind: 'narration', text: `A ${m.kind} wanders into the room.` })
      }
    }
  }

  const senses = companionSenses(d.labyrinth, d.companion, d.playerRoomId, wumpus.roomId)
  if (senses.wumpusGrowl) {
    d.events.push({ kind: 'narration', text: NARRATION.grellhoundGrowls })
  }
  for (const hazard of senses.revealedHazards) {
    d.events.push({
      kind: 'narration',
      text: `The grellhound smells a ${hazard.hazard} to the ${hazard.direction}.`,
    })
  }

  // The only companion passives that are genuine step-7 EFFECTS: they change
  // state rather than describe it (GDD 2.9.1). Everything else is a query.
  for (let step = 0; step < d.turnCost; step++) {
    const upkeep = companionUpkeep(d.companion, d.oil, rng)
    if (upkeep.oilDelta !== 0) {
      d.oil = Math.max(0, Math.min(OIL.max, d.oil + upkeep.oilDelta))
      d.events.push({
        kind: 'oilChanged',
        delta: upkeep.oilDelta,
        text: upkeep.scrounged ? NARRATION.goblinScrounges : NARRATION.skittishUpkeep,
      })
    }
    if (upkeep.starved && d.companion !== null) {
      d.events.push({ kind: 'companionLost', kind_: d.companion.kind, reason: 'the lamp ran dry' })
      d.companion = null
    }
  }

  for (let step = 0; step < d.turnCost; step++) d.scent = decayScent(d.scent)

  // Oil burns once every OIL.burnEveryNTurns turns, counted over the turns this
  // action actually consumed — so a two-turn tame can cross a burn boundary.
  let burned = 0
  for (let t = state.turn; t < state.turn + d.turnCost; t++) {
    if (t % OIL.burnEveryNTurns === 0) burned += 1
  }
  if (burned > 0) {
    const before = d.oil
    d.oil = Math.max(0, d.oil - burned)
    if (d.oil !== before) d.events.push({ kind: 'oilChanged', delta: d.oil - before, text: NARRATION.lampBurnsDown })
  }

  // Statuses tick here, at the end of the turn, so a status applied this turn
  // is still in force for the tells the player reads before choosing next.
  d.statuses = tickStatuses(d.statuses, d.turnCost, d.events)

  // An encounter survives only while the creature is still standing in the room
  // you are standing in. Drift moving it away ends it; so does leaving.
  if (
    d.encounterRoomId !== null &&
    (d.encounterRoomId !== d.playerRoomId || roomOf(d.labyrinth, d.playerRoomId).creature === null)
  ) {
    d.encounterRoomId = null
  }

  // =========================================================================
  // 8. Win/loss evaluation, turn counter
  //
  // Order matters here. Leaving by the entrance is evaluated BEFORE the turn
  // limit, so a run that walks out on its last turn escapes rather than timing
  // out on the doorstep.
  // =========================================================================
  const nextTurn = state.turn + d.turnCost

  // Leaving by the entrance ends the run, and WHICH ending depends only on
  // whether the Heart is in your hands. Retreat is not a loss: the map is the
  // prize (GDD 2.2, 2.11), and it needs its beat as much as the escape does.
  const leftByTheDoor =
    d.playerRoomId === d.labyrinth.entranceId && d.playerRoomId !== state.player.roomId
  if (leftByTheDoor) {
    return finish(
      state,
      d,
      wumpus,
      d.carryingHeart ? 'escaped' : 'retreated',
      d.carryingHeart
        ? NARRATION.escaped
        : NARRATION.retreated,
      nextTurn,
    )
  }

  if (nextTurn > state.maxTurns) {
    return finish(state, d, wumpus, 'outOfTurns', NARRATION.outOfTurns, nextTurn)
  }

  return commit(state, d, wumpus, outcome, nextTurn, listening, action, rng)
}

function tickStatuses(
  statuses: Partial<Record<StatusEffect, number>>,
  turns: number,
  events: GameEvent[],
): Partial<Record<StatusEffect, number>> {
  const next: Partial<Record<StatusEffect, number>> = {}
  for (const key of Object.keys(statuses).sort() as StatusEffect[]) {
    const left = (statuses[key] ?? 0) - turns
    if (left > 0) next[key] = left
    else events.push({ kind: 'statusChanged', status: key, turns: 0 })
  }
  return next
}

// ---------------------------------------------------------------------------
// Step 1 — the roll
// ---------------------------------------------------------------------------

/**
 * Every action is a roll, including MOVE (GDD 2.7).
 *
 * The universal modifiers are assembled HERE and nowhere else: the oil band
 * above all, because it applies to every roll in the game and duplicating it
 * into creatures.ts is how the two drift apart. Every modifier carries a
 * human-readable source — the UI shows the player exactly why they rolled what
 * they rolled, and an unlabelled modifier is a bug (CLAUDE.md 4).
 */
function rollForAction(state: GameState, d: Draft, action: Action, rng: Rng): RollResult | null {
  const here = roomOf(d.labyrinth, d.playerRoomId)
  const encounter = isEncounterLive(state)

  let dc = ACTION_DC[action.kind]
  let stat = ACTION_STAT[action.kind]

  if (encounter && isEncounterAction(action.kind) && here.creature) {
    const spec = encounterRollSpec(action.kind, here.creature)
    dc = spec.dc
    stat = spec.stat
  }

  const band = oilBandFor(d.oil)
  // Every contribution is listed, including a zero one. A stat modifier of 0 is
  // a fact the player should see, not an omission — the roll breakdown is how
  // the mechanic teaches itself (GDD 2.8.1, CLAUDE.md 4).
  const modifiers: Modifier[] = [statModifierOf(d.stats, stat)]
  if (band.modifier !== 0) modifiers.push({ source: band.label, value: band.modifier })
  modifiers.push(...companionRollModifiers(d.companion, action.kind))

  return roll(rng, { dc, modifiers })
}

function isEncounterAction(kind: ActionKind): kind is EncounterAction {
  return kind === 'fight' || kind === 'tame' || kind === 'sneak' || kind === 'flee'
}

// ---------------------------------------------------------------------------
// Step 1 — what the action does
// ---------------------------------------------------------------------------

function applyActionOutcome(
  state: GameState,
  d: Draft,
  action: Action,
  rollResult: RollResult | null,
  rng: Rng,
): void {
  const band: OutcomeBand = rollResult?.band ?? 'success'
  const here = roomOf(d.labyrinth, d.playerRoomId)

  if (isEncounterLive(state) && isEncounterAction(action.kind) && here.creature) {
    resolveEncounterAction(d, action, band, rollResult, rng)
    return
  }

  switch (action.kind) {
    case 'move':
    case 'sneak': {
      const to = here.exits[action.direction]
      if (to === undefined) return
      enterRoom(d, action.direction, to, rng)
      // A critical failure is loud whatever you were doing (SCENT.criticalFailureBonus).
      // Movement itself is never gated on the roll: a failed MOVE stumbles you
      // noisily into the room, it does not pin you in place. Pinning would make
      // the turn limit punish a die roll the player cannot influence, and GDD
      // 2.7 asks for "stumble loudly OR take a wrong turn", not "stand still".
      pushPlayerScent(d, action.kind, band)
      return
    }

    case 'listen':
    case 'search':
    case 'read':
    case 'rest': {
      applyQuietAction(d, action.kind, band)
      pushPlayerScent(d, action.kind, band)
      return
    }

    case 'use': {
      const at = d.inventory.indexOf(action.item)
      if (at >= 0) {
        d.inventory = [...d.inventory.slice(0, at), ...d.inventory.slice(at + 1)]
        if (action.item === 'oilFlask') d.oilDelta += OIL.flaskValue
      }
      pushPlayerScent(d, 'use', band)
      return
    }

    case 'send': {
      resolveSend(d, action.direction)
      // SCENT_BY_ACTION.send is 0: the marker lands in the TARGET room, and it
      // is the companion's noise, not yours — so neither the Quiet One's damping
      // nor the Heart multiplier touches it.
      return
    }

    case 'enterPortal': {
      resolvePortal(d, band, rng)
      return
    }

    case 'fight':
    case 'tame':
    case 'flee':
      // Only reachable with no live encounter, which legalActions forbids.
      return

    case 'force':
      // Not offered; see the note in legalActions.
      return
  }
}

/** Moving into a room: the hazard save, the Heart, the grave, the encounter flag. */
function enterRoom(d: Draft, direction: Direction, to: RoomId, rng: Rng): void {
  const from = d.playerRoomId
  d.playerRoomId = to
  d.facing = direction
  d.events.push({ kind: 'moved', from, to, direction })

  d.labyrinth = withRoom(d.labyrinth, to, { visited: true })
  const arrived = roomOf(d.labyrinth, to)

  if (arrived.grave) d.events.push({ kind: 'graveFound', epitaph: arrived.grave })
  if (arrived.hasHeart && !d.carryingHeart) d.takesHeart = true

  // The encounter is bound to ENTERING the room. This is the only place it is
  // ever set (GDD 2.9.1) — drift moving a creature onto the player must not.
  d.encounterRoomId = arrived.creature !== null ? to : null
  if (arrived.creature !== null) {
    d.events.push({ kind: 'creatureEncounter', creature: arrived.creature })
  }

  if (arrived.hazard !== null && ENTRY_HAZARDS.includes(arrived.hazard)) {
    resolveHazard(d, arrived.hazard, rng)
  }
}

/**
 * The saving throw a hazard demands on entry.
 *
 * Rolled separately from the MOVE that brought you here: the move's band says
 * how loudly you arrived, the hazard's says whether you survive it. Folding the
 * two would make a clean move into a free pass over a pit.
 */
function resolveHazard(d: Draft, hazard: HazardKind, rng: Rng): void {
  const dc = HAZARD_DC[hazard]
  const stat = HAZARD_STAT[hazard]
  const table = HAZARD_OUTCOMES[hazard]
  if (dc === undefined || stat === undefined || table === undefined) return

  const oil = oilBandFor(d.oil)
  const modifiers: Modifier[] = [statModifierOf(d.stats, stat)]
  if (oil.modifier !== 0) modifiers.push({ source: oil.label, value: oil.modifier })

  const result = roll(rng, { dc, modifiers })
  d.events.push({ kind: 'roll', action: 'move', result, hazard })

  const out = table[result.band]
  if (out.fatal) {
    d.fatal = true
    return
  }
  d.damage += out.damage
  d.oilDelta -= out.oilLoss
  d.turnCost += out.extraTurns
  if (out.applies !== null) d.applyStatus = out.applies
}

function applyQuietAction(d: Draft, kind: ActionKind, band: OutcomeBand): void {
  const extra = OIL.extraCost[kind] ?? 0
  if (extra > 0) d.oilDelta -= extra

  if (kind === 'search' && isSuccess(band)) {
    const here = roomOf(d.labyrinth, d.playerRoomId)
    if (here.oilFlask) {
      d.labyrinth = withRoom(d.labyrinth, d.playerRoomId, { oilFlask: false })
      d.inventory = [...d.inventory, 'oilFlask']
      d.events.push({ kind: 'narration', text: NARRATION.foundFlask })
    }
  }

  if (kind === 'read' && isSuccess(band)) {
    // READ is the poor cousin of a grellhound: one turn and one point of oil
    // buys, once, what the hound gives you every turn for free.
    const here = roomOf(d.labyrinth, d.playerRoomId)
    for (const direction of DIRECTIONS) {
      const id = here.exits[direction]
      if (id === undefined) continue
      const hazard = roomOf(d.labyrinth, id).hazard
      if (hazard) {
        d.events.push({ kind: 'narration', text: `The carvings warn of a ${hazard} to the ${direction}.` })
      }
    }
  }

  if (kind === 'rest' && isSuccess(band)) {
    const healed = Math.min(REST.healOnSuccess, PLAYER.maxHealth - d.health)
    if (healed > 0) {
      d.health += healed
      d.events.push({ kind: 'narration', text: NARRATION.caughtBreath })
    }
  }
}

/** Resolve one of the four encounter options against its band. */
function resolveEncounterAction(
  d: Draft,
  action: Action,
  band: OutcomeBand,
  rollResult: RollResult | null,
  rng: Rng,
): void {
  const roomId = d.playerRoomId
  const here = roomOf(d.labyrinth, roomId)
  const creature = here.creature
  if (creature === null) return
  const kind = action.kind as EncounterAction

  const retreatRoomId =
    'direction' in action ? (here.exits[action.direction] ?? null) : null

  const result = resolveEncounter(
    kind,
    band,
    {
      labyrinth: d.labyrinth,
      creature,
      roomId,
      companion: d.companion,
      retreatRoomId,
      carryingHeart: d.carryingHeart,
    },
    rng,
  )

  d.turnCost = result.turnCost
  d.damage += result.damage
  d.pendingScent.push({ roomId, amount: result.scent, fromPlayer: true })

  // ---- the natural-20 brave override -------------------------------------
  //
  // THIS CANNOT LIVE IN creatures.ts. resolveEncounter only ever receives the
  // already-resolved band — deliberately, so that Fortune has a settled roll to
  // react to before the band is final — which means the natural die and the band
  // coexist in this function and nowhere else.
  //
  // Why it exists: widening brave to strongSuccess (TAME_OUTCOMES) gives a
  // progression curve but leaves the Quiet One permanently un-brave even at INT
  // 18, because its Hard DC rarely clears Strong Success. That is backwards —
  // SEND is billed as mattering most in exactly the runs where you did not get
  // to pick your creature. A natural 20 always carries a gift (GDD 2.6); this
  // extends that one step so no creature's difficulty can make the escape valve
  // permanently unreachable. GDD 2.9, decided 17 Sep 2026.
  let companionGained = result.companionGained
  if (rollResult?.natural === 20 && companionGained !== null && !companionGained.brave) {
    companionGained = { ...companionGained, brave: true }
    d.events.push({ kind: 'narration', text: `The ${creature} looks at you and does not flinch.` })
  }

  if (companionGained !== null) {
    if (result.companionReleased !== null) {
      d.events.push({ kind: 'companionLost', kind_: result.companionReleased, reason: 'released' })
    }
    d.companion = companionGained
    d.events.push({ kind: 'companionGained', companion: companionGained })
  }

  for (const revealed of result.revealedRooms) {
    d.labyrinth = withRoom(d.labyrinth, revealed, { visited: true })
    d.events.push({ kind: 'narration', text: `It shows you the room to the ${describeRoom(d, revealed)}.` })
  }

  // ---- writing the world back --------------------------------------------
  // creatures.ts describes; the reducer applies. EncounterResult.hostile says it
  // happened, and nothing in creatures.ts mutates the room.
  if (!result.creatureRemains) {
    d.labyrinth = withRoom(d.labyrinth, roomId, { creature: null, creatureHostile: false })
  } else if (result.hostile) {
    d.labyrinth = withRoom(d.labyrinth, roomId, { creatureHostile: true })
  }

  if (result.movedTo !== null) {
    const direction = directionTo(d.labyrinth, roomId, result.movedTo)
    if (direction !== null) {
      // SNEAK and FLEE both end in a different room, and arriving there is a
      // real arrival: the hazard fires, the Heart lifts, a new creature starts
      // a new encounter.
      enterRoom(d, direction, result.movedTo, rng)
      return
    }
  }

  // Still here. The encounter stays live for as long as the creature does —
  // a critically failed tame leaves it standing in front of you, un-tameable.
  d.encounterRoomId = roomOf(d.labyrinth, roomId).creature !== null ? roomId : null
}

function describeRoom(d: Draft, id: RoomId): string {
  const direction = directionTo(d.labyrinth, d.playerRoomId, id)
  return direction ?? id
}

function resolveSend(d: Draft, direction: Direction): void {
  const player: Player = {
    roomId: d.playerRoomId,
    facing: d.facing,
    stats: { str: 0, agi: 0, int: 0, lck: 0 },
    health: d.health,
    maxHealth: PLAYER.maxHealth,
    oil: d.oil,
    maxOil: OIL.max,
    fortune: d.fortune,
    carryingHeart: d.carryingHeart,
    companion: d.companion,
    inventory: d.inventory,
    statuses: d.statuses,
  }
  const sent = sendCompanion(d.labyrinth, player, direction)
  if (sent === null) return

  d.pendingScent.push({ roomId: sent.targetRoomId, amount: sent.scent, fromPlayer: false })

  // THE COMPANION DOES NOT COME BACK. No chance, no rescue, no un-choosing it
  // (CLAUDE.md 3). The slot is cleared unconditionally, here, and there is
  // nowhere else in the codebase that could put it back.
  d.companion = null
  d.events.push({ kind: 'companionLost', kind_: sent.sent, reason: 'sent' })
  d.events.push({
    kind: 'narration',
    text: `The ${sent.sent} goes ${direction} because you asked it to, and makes a great deal of noise.`,
  })
}

/**
 * ENTER PORTAL — a different labyrinth entirely (GDD 2.8).
 *
 * Everything you charted is gone, and so is every trail you laid: the Wumpus
 * loses your scent completely, which is the whole reason to take the gamble.
 * The INT band decides how deep you surface, never whether you arrive — a
 * portal that could strand you would be a second instant-loss check, and the
 * design only has room for one of those.
 */
function resolvePortal(d: Draft, band: OutcomeBand, rng: Rng): void {
  const old = d.labyrinth
  const fresh = generateLabyrinth(rng, {
    difficulty: old.difficulty,
    width: old.width,
    height: old.height,
  })

  const candidates = roomsAtLeast(fresh, fresh.entranceId, PORTAL.minLandingDistance)
    .filter((id) => id !== fresh.heartRoomId)
  if (candidates.length === 0) return

  // roomsAtLeast returns them sorted by distance, so the near half is literally
  // the front of the list. A good read puts you nearer the way out.
  const half = Math.max(1, Math.ceil(candidates.length / 2))
  const pool = isSuccess(band) ? candidates.slice(0, half) : candidates.slice(half)
  const landing = rng.pick(pool.length > 0 ? pool : candidates)

  let next = withRoom(fresh, landing, { visited: true })
  // You are still holding it. The new labyrinth does not get to hand you a second.
  if (d.carryingHeart) next = withRoom(next, next.heartRoomId, { hasHeart: false })

  d.labyrinth = next
  d.playerRoomId = landing
  d.facing = null
  d.scent = emptyScent()
  d.pendingScent = []
  d.encounterRoomId = null
  d.events.push({
    kind: 'narration',
    text: NARRATION.portal,
  })

  const arrived = roomOf(next, landing)
  if (arrived.creature !== null) {
    // A new room is a new arrival, and arriving on a creature is an encounter
    // wherever you arrived from.
    d.encounterRoomId = landing
    d.events.push({ kind: 'creatureEncounter', creature: arrived.creature })
  }
  if (arrived.hazard !== null && ENTRY_HAZARDS.includes(arrived.hazard)) {
    resolveHazard(d, arrived.hazard, rng)
  }
}

function pushPlayerScent(d: Draft, kind: ActionKind, band: OutcomeBand): void {
  const base = SCENT_BY_ACTION[kind]
  const bonus = band === 'criticalFailure' ? SCENT.criticalFailureBonus : 0
  const amount = (base + bonus) * scentMultiplierFor(d.companion)
  if (amount <= 0) return
  d.pendingScent.push({ roomId: d.playerRoomId, amount, fromPlayer: true })
}

// ---------------------------------------------------------------------------
// Committing
// ---------------------------------------------------------------------------

function finish(
  state: GameState,
  d: Draft,
  wumpus: GameState['wumpus'],
  outcome: GameState['outcome'],
  text: string,
  turn = state.turn + d.turnCost,
): ApplyResult {
  d.events.push({ kind: 'narration', text })
  d.events.push({ kind: 'runEnded', outcome })
  return commit(state, d, wumpus, outcome, turn, false, d.action, d.rng)
}

function commit(
  state: GameState,
  d: Draft,
  wumpus: GameState['wumpus'],
  outcome: GameState['outcome'],
  turn: number,
  listening: boolean,
  action: Action,
  rng: Rng,
): ApplyResult {
  const finalOutcome = outcome

  const player: Player = {
    roomId: d.playerRoomId,
    facing: d.facing,
    stats: state.player.stats,
    health: d.health,
    maxHealth: state.player.maxHealth,
    oil: d.oil,
    maxOil: state.player.maxOil,
    fortune: d.fortune,
    carryingHeart: d.carryingHeart,
    companion: d.companion,
    inventory: d.inventory,
    statuses: d.statuses,
  }

  const next: GameState = {
    ...state,
    // The generator's position travels inside GameState, which is what makes
    // (seed, actionLog) replay a run exactly, forever (CLAUDE.md 2.2).
    rng: rng.getState(),
    labyrinth: d.labyrinth,
    player,
    wumpus,
    scent: d.scent,
    turn,
    outcome: finalOutcome,
    encounterRoomId: d.encounterRoomId,
    actionLog: [...state.actionLog, action],
  }

  // Tells are a QUERY, computed against the world as it stands at the end of
  // the turn — which is after drift, so a tell can never describe a pre-drift
  // labyrinth. LISTEN buys back all four doorways for a turn, whatever the oil.
  if (finalOutcome === 'inProgress') {
    for (const tell of tellsFor(next, listening)) {
      d.events.push({ kind: 'tell', tell, text: tellText(tell) })
    }
  }

  return { state: next, events: d.events }
}

// ---------------------------------------------------------------------------
// Tells, for renderers and the agent view
// ---------------------------------------------------------------------------

export function tellsFor(state: GameState, listening = false): Tell[] {
  const band = oilBandFor(state.player.oil)
  return getTells(state.labyrinth, state.player.roomId, state.wumpus.roomId, {
    tellRange: band.tellRange,
    confused: hasStatus(state.player, 'confused'),
    facing: state.player.facing,
    listening,
    heartTaken: state.player.carryingHeart,
  })
}

const TELL_TEXT: Record<Tell['kind'], string> = {
  stench: 'a pallid, heavy stench',
  draft: 'a cold draft',
  sweetness: 'something sweet',
  hum: 'a faint hum',
  freshChisel: 'fresh chisel marks',
  skittering: 'a small, quick skittering',
  metallic: 'iron and old coin',
}

function tellText(tell: Tell): string {
  return `${tell.direction}: ${TELL_TEXT[tell.kind]}.`
}

function describe(action: Action): string {
  if ('direction' in action) return `${ACTION_LABEL[action.kind]} ${action.direction}`
  if ('item' in action) return `${ACTION_LABEL[action.kind]} ${action.item}`
  return ACTION_LABEL[action.kind]
}

/** Distance from the player to a room, for renderers and the sim. */
export function distanceToPlayer(state: GameState, id: RoomId): number {
  return distancesFrom(state.labyrinth, state.player.roomId)[id] ?? -1
}
