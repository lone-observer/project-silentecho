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
  DoorwaySense,
  CompanionLossReason,
  CreatureKind,
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
import { BAND_ORDER, DIRECTIONS } from './types.ts'
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
  activeHazardOf,
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
  companionWaivesOil,
  DEFAULT_DIFFICULTY,
  DIFFICULTY,
  disarmClears,
  ENTRY_HAZARDS,
  HAZARD_DC,
  HAZARD_OUTCOMES,
  HAZARD_STAT,
  HAZARD_VERB_OUTCOMES,
  HEART,
  isStatAgnostic,
  OIL,
  oilBandFor,
  oilCostFor,
  PLAYER,
  quantizeOil,
  PORTAL,
  SCENT,
  SCENT_BY_ACTION,
  SEARCH_FIND_BAND,
  STATUS,
  VERB_HAZARDS,
  VERBS_FOR_HAZARD,
} from './data/tuning.ts'
import type { GrellhoundWarningBand, HazardVerb } from './data/tuning.ts'
import type { EndingBeat, NoteBeat, Slots } from './data/outcomes.ts'
import {
  companionLossText,
  DIRECTION_WORD,
  endingText,
  HAZARD_WORD,
  hazardText,
  isDarkProse,
  noteText,
  outcomeText,
  presenceText,
} from './data/outcomes.ts'

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

// ---------------------------------------------------------------------------
// Narration — every line comes from data/outcomes.ts, none from here
//
// Step 1f moved the sixteen-line NARRATION table that lived at the top of this
// file, plus every template literal scattered through the switch statements,
// into `data/outcomes.ts`. CLAUDE.md 2.4: prose lives in data, never in code.
// If you are about to type a sentence into this file, don't.
//
// Every narration and oilChanged event now carries a `NarrationBeat` alongside
// its text. That is not decoration: GDD 2.8.1 gives every beat a lit and a dark
// variant, so identifying a line by comparing its text against a constant —
// which is what `scripts/turn.ts` did to tell the two catch checks apart — is
// broken by construction. Match on `beat`.
// ---------------------------------------------------------------------------

/**
 * Which register the prose is in right now.
 *
 * Read from the CURRENT draft oil rather than the oil the turn started with, so
 * a line spoken after the lamp changed is spoken in the register the player is
 * actually in. See `isDarkProse` for why the threshold is Ember and not Dark.
 */
function dark(d: Draft): boolean {
  return isDarkProse(d.oil)
}

function note(d: Draft, beat: NoteBeat, slots: Slots = {}): void {
  d.events.push({ kind: 'narration', text: noteText(beat, dark(d), slots), beat })
}

/**
 * What this action costs THIS player, companion included. GDD 2.9, 1i part 2.
 *
 * `oilCostFor` is the price list and stays the price list — a pure per-band read
 * with no idea who is in the room, called from the visualisers and from the
 * tests that check the curve. The companion discount is a row in
 * `COMPANION_FREE_VERB` and it is applied HERE, in the one place that knows what
 * is following the player around.
 *
 * BOTH CALLERS GO THROUGH THIS, which is the point of it existing at all rather
 * than being two lines at the charge site. The second caller is the spoils beat
 * in `resolveHazardVerb`, which asks "did this hand oil back" to decide whether
 * to say so — and a beat that answered from the price list while the player was
 * charged from this function would narrate a payout nobody received. That is a
 * text-parity failure (CLAUDE.md 2.3) of exactly the kind 1h and 1i keep finding
 * by reading the screen, and it is cheaper to make the two agree by construction.
 */
function oilCostWith(d: Draft, action: ActionKind, band: OutcomeBand): number {
  if (companionWaivesOil(d.companion?.kind ?? null, action)) return 0
  return oilCostFor(action, band)
}

/**
 * Which line the grellhound's warning speaks in, per band. GDD 2.9, 1i part 2.
 *
 * An id-to-id map rather than a table in `data/outcomes.ts`: no prose passes
 * through here, and the same shape already sits a few hundred lines down where
 * the upkeep beat is chosen by whether the goblin scrounged. What it does buy is
 * exhaustiveness — a fourth band added to `GRELLHOUND_WARNING` fails to compile
 * here until someone has written its sentence.
 */
const WARNING_BEAT: Record<GrellhoundWarningBand, NoteBeat> = {
  raisedEars: 'grellhoundEars',
  lowGrowl: 'grellhoundGrowls',
  urgentBark: 'grellhoundBarks',
}

/**
 * The `(archetype x action x band)` line for what just happened.
 *
 * `archetypeRoomId` is the room the sentence is ABOUT, which for MOVE is the
 * room you arrived in and not the one you left. Subject-led verbs ignore it.
 * Returns silently for a verb with no prose. As of 1g there are none —
 * `DEFERRED_ACTIONS` is empty — and `tests/outcomes.test.ts` asserts that the
 * set of verbs this can return null for is exactly the set no player can choose.
 */
function narrateOutcome(
  d: Draft,
  action: ActionKind,
  band: OutcomeBand,
  archetypeRoomId: RoomId,
  slots: Slots = {},
): void {
  const archetype = roomOf(d.labyrinth, archetypeRoomId).archetype
  const text = outcomeText(archetype, action, band, dark(d), slots)
  if (text === null) return
  d.events.push({ kind: 'narration', text, beat: 'actionOutcome' })
}

/**
 * A companion leaves. One helper for all four ways it can happen, so the prose,
 * the typed reason and the cleared slot can never disagree — and one event, so
 * the line cannot end up attributed to a different turn step than the loss it
 * describes. `sent` is the one CLAUDE.md 3 says must land: no chance of return,
 * no rescue, no un-choosing it.
 */
function lostCompanion(
  d: Draft,
  kind: CreatureKind,
  reason: CompanionLossReason,
  slots: Slots = {},
): void {
  d.events.push({
    kind: 'companionLost',
    kind_: kind,
    reason,
    text: companionLossText(reason, dark(d), { companion: kind, ...slots }),
  })
}

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
  focus: 'Focus',
  search: 'Search the room',
  force: 'Force',
  endure: 'Endure',
  avoid: 'Avoid',
  dodge: 'Dodge',
  disarm: 'Disarm',
  sneak: 'Sneak',
  fight: 'Fight',
  tame: 'Tame',
  flee: 'Flee',
  use: 'Use',
  enterPortal: 'Enter the portal',
  rest: 'Rest',
  send: 'Send',
  dropHeart: 'Set down the Heart',
}

/**
 * Directional labels spell the compass out. 1h finding 5: the menu said
 * `Move N` while the doorway list six lines above it said `north`, and
 * `DIRECTION_WORD` exists precisely because — in its own comment — "compass
 * letters read badly in a sentence". Both spellings were on screen at once.
 * Settled in 1i with the screen in front of us, per Gautham.
 */
function directionalLabel(verb: ActionKind, direction: Direction): string {
  return `${ACTION_LABEL[verb]} ${DIRECTION_WORD[direction]}`
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
    hazardRoomId: null,
    focusedByRoom: {},
    heartTaken: false,
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

  // A live hazard takes the menu before anything else, and it takes it whole.
  //
  // The creature encounter offers a way OUT as well as a way through — SNEAK
  // past it, FLEE back the way you came — and a hazard deliberately does not.
  // A bloom fills the chamber and a snare is already under your foot; there is
  // nothing to slip past. The two verbs are the choice. That is also what keeps
  // the coverage matrix honest: if a hazard could be walked away from, the
  // "stat with no option" column would cost nothing.
  const liveHazard = liveHazardKind(state)
  if (liveHazard !== null) {
    for (const verb of VERBS_FOR_HAZARD[liveHazard] ?? []) {
      out.push({
        action: { kind: verb },
        label: `${ACTION_LABEL[verb]} the ${HAZARD_WORD[liveHazard]}`,
        dc: dcOf(verb),
      })
    }
    return out
  }

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
          out.push({ action: { kind: 'sneak', direction }, label: directionalLabel('sneak', direction), dc })
        }
      } else if (retreat !== null) {
        out.push({ action: { kind: 'flee', direction: retreat }, label: directionalLabel('flee', retreat), dc })
      }
    }
    return out
  }

  for (const direction of DIRECTIONS) {
    if (here.exits[direction] === undefined) continue
    out.push({
      action: { kind: 'move', direction },
      label: directionalLabel('move', direction),
      dc: dcOf('move'),
    })
  }

  // FOCUS, one entry per doorway still worth looking through. The filtering is
  // the mechanic (GDD 2.7): a doorway already resolved is not offered, and once
  // the room's difficulty-set allowance is spent none of them are. GDD 2.17
  // forbids showing an unavailable verb greyed out, so a Ravening player who has
  // spent their one look simply has no FOCUS in the menu — which is what makes
  // the remaining doorways a guess rather than a purchase.
  for (const direction of focusableDirections(state)) {
    out.push({
      action: { kind: 'focus', direction },
      label: directionalLabel('focus', direction),
      dc: dcOf('focus'),
    })
  }

  out.push({ action: { kind: 'search' }, label: ACTION_LABEL.search, dc: dcOf('search') })
  out.push({ action: { kind: 'rest' }, label: ACTION_LABEL.rest, dc: dcOf('rest') })

  // Free and unconditional, and offered only while there is a Heart in your
  // hands to set down (GDD 2.9.1). No DC: it does not roll.
  if (player.carryingHeart) {
    out.push({ action: { kind: 'dropHeart' }, label: ACTION_LABEL.dropHeart })
  }

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
      label: `Send the ${player.companion?.kind ?? 'companion'} ${DIRECTION_WORD[direction]}`,
      dc: dcOf('send'),
    })
  }

  // The four hazard verbs are deliberately absent from THIS list. They are not
  // free actions you may take in an empty room — they answer a hazard you are
  // standing in, and the branch at the top of this function is the only place
  // they are ever offered. FORCE in particular is not a door-opener: GDD 2.7.

  return out
}

// ---------------------------------------------------------------------------
// FOCUS — the information economy. GDD 2.7, 2.8.1 (18 Sep 2026)
// ---------------------------------------------------------------------------

/** Doorways FOCUS has already resolved in a room. */
export function focusedIn(state: GameState, roomId: RoomId): readonly Direction[] {
  return state.focusedByRoom[roomId] ?? []
}

/** How many more doorways this room is worth looking through. */
export function focusesLeft(state: GameState): number {
  const cap = DIFFICULTY[state.labyrinth.difficulty].focusesPerRoom
  return Math.max(0, cap - focusedIn(state, state.player.roomId).length)
}

/**
 * Doorways a FOCUS is available on right now.
 *
 * Four things have to be true, and each one is a different rule: you are not
 * Confused, the room's allowance is not spent (difficulty), this doorway is not
 * already resolved (no paying twice for the same answer), and there is a doorway
 * there at all.
 *
 * CONFUSED REMOVES THE VERB rather than letting it fail. Confused suppresses
 * every tell for its duration (GDD 2.8.2), so a FOCUS taken under it would spend
 * a turn and an oil price to learn precisely nothing — and GDD 2.17 says
 * `legalActions` is filtered to what is ACTUALLY available, not padded with
 * options that cannot work. Offering it anyway would be a trap dressed as a
 * choice, which is a different thing from a hard decision.
 *
 * It costs the player nothing they would have wanted: the allowance is per room
 * for the whole run, so the doorway is still there to be bought once the
 * sweetness thins.
 */
export function focusableDirections(state: GameState): Direction[] {
  if (hasStatus(state.player, 'confused')) return []
  if (focusesLeft(state) <= 0) return []
  const here = roomOf(state.labyrinth, state.player.roomId)
  const already = new Set(focusedIn(state, state.player.roomId))
  return DIRECTIONS.filter((d) => here.exits[d] !== undefined && !already.has(d))
}

function isEncounterLive(state: GameState): boolean {
  if (state.encounterRoomId === null) return false
  if (state.encounterRoomId !== state.player.roomId) return false
  return roomOf(state.labyrinth, state.player.roomId).creature !== null
}

/**
 * The unresolved verb-hazard the player is standing in, or null.
 *
 * Three conditions, all of them load-bearing, exactly mirroring
 * `isEncounterLive`: the flag is set, it is set for THIS room, and the room
 * still holds a hazard that takes verbs. The middle one is what stops a stale
 * flag from following the player out of the room; the third is what stops a pit
 * or a portal from ever producing a verb menu.
 */
function liveHazardKind(state: GameState): HazardKind | null {
  if (state.hazardRoomId === null) return null
  if (state.hazardRoomId !== state.player.roomId) return null
  // The LIVE hazard: a DISARM earlier in the run takes the room out of this
  // branch for good, which is the whole point of the verb (GDD 2.7).
  const hazard = activeHazardOf(roomOf(state.labyrinth, state.player.roomId))
  if (hazard === null || !VERB_HAZARDS.includes(hazard)) return null
  return hazard
}

function isHazardVerb(kind: ActionKind): kind is HazardVerb {
  return (
    kind === 'force' ||
    kind === 'endure' ||
    kind === 'avoid' ||
    kind === 'dodge' ||
    kind === 'disarm'
  )
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
  oil: number
  fortune: number
  companion: Companion | null
  carryingHeart: boolean
  heartTaken: boolean
  inventory: string[]
  statuses: Partial<Record<StatusEffect, number>>
  scent: ScentField
  focusedByRoom: Record<RoomId, readonly Direction[]>
  /** Deposits owed at step 4, keyed by the room they land in. */
  pendingScent: { roomId: RoomId; amount: number; fromPlayer: boolean }[]
  oilDelta: number
  applyStatus: StatusEffect | null
  /** Turns `applyStatus` lasts. Meaningless while `applyStatus` is null. */
  applyStatusTurns: number
  turnCost: number
  fatal: boolean
  takesHeart: boolean
  /**
   * Where the Heart being picked up is coming FROM. Normally the room the player
   * is standing in; a bad ENTER PORTAL makes it the new labyrinth's Heart room,
   * because you surface already holding a Heart you never walked to (GDD 2.8).
   */
  heartFromRoomId: RoomId | null
  encounterRoomId: RoomId | null
  hazardRoomId: RoomId | null
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
      events: [
        {
          kind: 'narration',
          text: noteText('actionUnavailable', isDarkProse(state.player.oil)),
          beat: 'actionUnavailable',
        },
      ],
    }
  }

  const d: Draft = {
    labyrinth: state.labyrinth,
    playerRoomId: state.player.roomId,
    facing: state.player.facing,
    stats: state.player.stats,
    oil: state.player.oil,
    fortune: state.player.fortune,
    companion: state.player.companion,
    carryingHeart: state.player.carryingHeart,
    heartTaken: state.heartTaken,
    inventory: [...state.player.inventory],
    statuses: { ...state.player.statuses },
    scent: state.scent,
    focusedByRoom: { ...state.focusedByRoom },
    pendingScent: [],
    oilDelta: 0,
    applyStatus: null,
    applyStatusTurns: STATUS.confusedTurns,
    turnCost: 1,
    fatal: false,
    takesHeart: false,
    heartFromRoomId: null,
    encounterRoomId: state.encounterRoomId,
    hazardRoomId: state.hazardRoomId,
    events: [],
    action,
    rng,
  }

  let wumpus = state.wumpus
  const outcome = state.outcome

  // =========================================================================
  // 1. Player acts — the action resolves, the roll lands, the outcome applies
  // =========================================================================
  const rollResult = rollForAction(state, d, action, rng)
  if (rollResult) d.events.push({ kind: 'roll', action: action.kind, result: rollResult })

  // THE PRICE OF DOING IT, BEFORE ANYTHING IT DID.
  //
  // GDD 2.6 (18 Sep 2026): cost is margin, not injury. Every action carries an
  // oil price and the band it rolled scales that price — a bad roll spends more
  // of what you were already spending, a good one spends less, and the top two
  // bands hand a little back. This one line replaces the whole of the old model:
  // the passive burn every two turns, `OIL.extraCost` for the quiet verbs, the
  // `oilLoss` column on the hazard tables, and the conditional flask reward.
  //
  // It is charged HERE, uniformly, before `applyActionOutcome` gets to say what
  // the action did — so no verb can quietly acquire a second price further down,
  // which is exactly how the old model grew three of them.
  //
  // An unrolled action (DROP HEART) prices at the `success` band, which for it
  // is zero anyway; `oilCostFor` is what decides that, not this call site.
  //
  // `oilCostWith` is that same price with the companion discount applied — one
  // table row (`COMPANION_FREE_VERB`), one branch, and the price list itself
  // untouched for every other caller (GDD 2.9, 1i part 2).
  d.oilDelta -= oilCostWith(d, action.kind, rollResult?.band ?? 'success')

  applyActionOutcome(state, d, action, rollResult, rng)

  // =========================================================================
  // 2. CATCH CHECK — the Wumpus is in the room you just entered
  // =========================================================================
  if (hasCaught(wumpus, d.playerRoomId)) {
    return finish(state, d, wumpus, 'caught', 'caughtWalkedInto')
  }

  // =========================================================================
  // 3. Effects: damage, oil, status, Heart pickup and its escalation
  // =========================================================================
  if (d.oilDelta !== 0) {
    const beat: NoteBeat = d.oilDelta > 0 ? 'lampBrightens' : 'lampGutters'
    // Quantized on every write, not just on the price: oil accumulates across a
    // whole run, and rounding only the inputs still lets the total drift into
    // binary dust (CLAUDE.md 2.5 — GameState must JSON round-trip unchanged).
    d.oil = quantizeOil(Math.max(0, Math.min(OIL.max, d.oil + d.oilDelta)))
    d.events.push({
      kind: 'oilChanged',
      delta: quantizeOil(d.oilDelta),
      text: noteText(beat, dark(d)),
      beat,
    })
  }

  // Skittish companions bolt on a CRITICAL FAILURE — the band where the world
  // escalates. This replaced "bolts on damage taken" when health was retired;
  // see `skittishBolts`. Fortune could save it, and spending is a renderer
  // decision the reducer does not make for the player.
  if (
    rollResult !== null &&
    skittishBolts(d.companion, rollResult.band, false) &&
    d.companion !== null
  ) {
    lostCompanion(d, d.companion.kind, 'bolted')
    d.companion = null
  }

  if (d.applyStatus !== null) {
    // The duration comes from whatever applied it, not from a constant. ENDURE's
    // entire cost model is that margin shortens Confused rather than the clock
    // (HAZARD_VERB_OUTCOMES), so a fixed `STATUS.confusedTurns` here would have
    // quietly thrown away the variable the verb exists to spend.
    //
    // It REPLACES rather than adds: a second bloom is a second lungful, not a
    // stacking debuff, and the player is told a duration they can count on
    // (GDD 2.8.2 — suppression the player knows the length of).
    const turns = d.applyStatusTurns
    d.statuses = { ...d.statuses, [d.applyStatus]: turns }
    note(d, 'confusedSettles')
    d.events.push({ kind: 'statusChanged', status: d.applyStatus, turns })
  }

  let revealedPlayerRoom: RoomId | null = null
  if (d.takesHeart) {
    d.carryingHeart = true
    d.labyrinth = withRoom(d.labyrinth, d.heartFromRoomId ?? d.playerRoomId, { hasHeart: false })

    // THE ESCALATION FIRES ONCE PER RUN, not once per pickup.
    //
    // `DROP HEART` (GDD 2.9.1) means the Heart can leave your hands and come
    // back, and the tier jump plus the one-turn position reveal are what the
    // labyrinth does when it NOTICES — "the labyrinth having noticed doesn't
    // un-notice just because the Heart is back on the ground", and by the same
    // token it does not notice twice. Without this gate, setting the Heart down
    // and picking it up again would walk a Stirring Wumpus to Ravening for the
    // price of two turns.
    if (!d.heartTaken) {
      d.heartTaken = true
      const before = wumpus.tier
      wumpus = escalate(wumpus, HEART.tierEscalation)
      // The loudest thing in the game, and the only moment it learns a position
      // it did not smell for itself.
      d.pendingScent.push({ roomId: d.playerRoomId, amount: SCENT.heartTaken, fromPlayer: false })
      revealedPlayerRoom = d.playerRoomId
      note(d, d.heartFromRoomId === null ? 'heartTaken' : 'heartThrustUpon')
      d.events.push({ kind: 'heartTaken' })
      if (wumpus.tier !== before) {
        note(d, 'wumpusEscalates')
        d.events.push({ kind: 'wumpusTierChanged', tier: wumpus.tier })
      }
    } else {
      // Picking it back up after a DROP. Quiet by comparison — the trail goes
      // hot again (step 4's multiplier), and nothing else changes.
      note(d, 'heartTaken')
      d.events.push({ kind: 'heartTaken' })
    }
  }

  // Only two things end a run in death, and this is one of them (GDD 2.6). The
  // `killedByDamage` branch that stood here is gone with health itself.
  if (d.fatal) return finish(state, d, wumpus, 'killed', 'killedByHazard')

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
    return finish(state, d, wumpus, 'caught', 'caughtCameForYou')
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
        note(d, 'creatureWanders', { creature: m.kind })
      }
    }
  }

  const senses = companionSenses(d.labyrinth, d.companion, d.playerRoomId, wumpus.roomId)
  if (senses.wumpusWarning !== null) {
    // ONE LINE PER DOORWAY, the same shape `revealedHazards` has had since 1d,
    // and for the same reason: `Slots` is a closed set of five nouns with no
    // list in it (GDD 2.8.1's note on RUN_INTRO), so a warning naming two
    // doorways is two sentences rather than a sentence with a comma in it that
    // something would have to assemble. Assembling is the procedural-prose line
    // CLAUDE.md 6 rules out. Two doorways toward one Wumpus is uncommon and
    // honest when it happens — both of them do lead that way.
    for (const direction of senses.wumpusWarning.directions) {
      note(d, WARNING_BEAT[senses.wumpusWarning.band], { direction })
    }
  }
  for (const hazard of senses.revealedHazards) {
    note(d, 'grellhoundReveals', { hazard: hazard.hazard, direction: hazard.direction })
  }

  // The only companion passives that are genuine step-7 EFFECTS: they change
  // state rather than describe it (GDD 2.9.1). Everything else is a query.
  for (let step = 0; step < d.turnCost; step++) {
    const upkeep = companionUpkeep(d.companion, d.oil, rng)
    if (upkeep.oilDelta !== 0) {
      const beat: NoteBeat = upkeep.scrounged ? 'goblinScrounges' : 'skittishUpkeep'
      d.oil = quantizeOil(Math.max(0, Math.min(OIL.max, d.oil + upkeep.oilDelta)))
      d.events.push({
        kind: 'oilChanged',
        delta: upkeep.oilDelta,
        text: noteText(beat, dark(d)),
        beat,
      })
    }
    if (upkeep.starved && d.companion !== null) {
      lostCompanion(d, d.companion.kind, 'starved')
      d.companion = null
    }
  }

  for (let step = 0; step < d.turnCost; step++) d.scent = decayScent(d.scent)

  // THE PASSIVE BURN IS GONE. It stood here and took one oil every two turns
  // whatever the player did (GDD 2.8.1, retired 18 Sep 2026). Oil is spent per
  // ACTION now, at step 1, and the reason is the turn cap: a burn that was an
  // anti-dawdling tax against 20 turns would be a second death clock against 50,
  // which the oil design has rejected since 16 Sep and GDD 2.8.1 still forbids.
  // `lampBurnsDown` survives as a beat because a flask spilling and a lamp
  // guttering still need words; nothing in the reducer emits it on a timer.

  // Statuses tick here, at the end of the turn, so a status applied this turn
  // is still in force for the tells the player reads before choosing next.
  d.statuses = tickStatuses(d, d.statuses, d.turnCost, d.events, d.applyStatus)

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
      d.carryingHeart ? 'escaped' : 'retreated',
      nextTurn,
    )
  }

  if (nextTurn > state.maxTurns) {
    return finish(state, d, wumpus, 'outOfTurns', 'outOfTurns', nextTurn)
  }

  return commit(state, d, wumpus, outcome, nextTurn, action, rng)
}

/**
 * Count the turn's cost off every active status, at step 7.
 *
 * `appliedThisTurn` IS NOT AN OPTIMISATION — it is the whole correctness of the
 * status system, and it was missing until 1g.
 *
 * A status lands at step 3 and this runs at step 7 of the SAME turn, once per
 * turn the action consumed (1e's rule). So a Confused applied by a two-turn
 * action was immediately decremented twice and expired before the player ever
 * read a suppressed tell: `scripts/hazard.ts` Panel C showed
 *
 *     status   confused for 2 turn(s)
 *     status   confused for 0 turn(s)
 *
 * inside one turn. FORCE's defining cost is that Confused applies whatever you
 * roll (GDD 2.8), and it was applying for zero turns at every band that costs
 * two. ENDURE always costs two, so its entire margin-scales-the-duration
 * mechanic — the thing that stops INT being the free pass through the coverage
 * matrix — delivered nothing at any band. Worse, a two-turn FORCE came out
 * clean while a one-turn FORCE left you blind: a better roll was punished.
 *
 * The off-by-one predates 1g in miniature. A bloom used to resolve on the MOVE
 * that entered it, turn cost 1, so `STATUS.confusedTurns = 2` bought one turn
 * of suppression rather than the two GDD 2.8.2 specifies. Nobody noticed,
 * because one is not obviously wrong the way zero is.
 *
 * The rule now: the turns an action spent APPLYING a status are not turns the
 * player spent under it. You are in the bloom while it is happening; the
 * counting starts when you come out. Found by reading a transcript, not by any
 * test — every test passed before and after.
 */
function tickStatuses(
  d: Draft,
  statuses: Partial<Record<StatusEffect, number>>,
  turns: number,
  events: GameEvent[],
  appliedThisTurn: StatusEffect | null,
): Partial<Record<StatusEffect, number>> {
  const next: Partial<Record<StatusEffect, number>> = {}
  for (const key of Object.keys(statuses).sort() as StatusEffect[]) {
    if (key === appliedThisTurn) {
      next[key] = statuses[key] ?? 0
      continue
    }
    const left = (statuses[key] ?? 0) - turns
    if (left > 0) next[key] = left
    else {
      // GDD 2.8.2: the player knows they are Confused and knows when it ends.
      // A status that expired in silence would leave them unable to tell "the
      // doorways said nothing" from "I still cannot hear the doorways".
      note(d, 'confusedLifts')
      events.push({ kind: 'statusChanged', status: key, turns: 0 })
    }
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
  // GDD 2.7: "Every action is a roll except DROP HEART, which is free and
  // unconditional." Returning null before touching the rng matters as much as
  // the rule does — a drawn-and-discarded d20 would move the generator, and
  // (seed, actionLog) has to replay identically forever (CLAUDE.md 2.2).
  if (action.kind === 'dropHeart') return null

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
  // the mechanic teaches itself (GDD 2.8.1, CLAUDE.md 4). At the new starting
  // stat of 10 that zero is what a fresh character sees on every line, which is
  // the point of moving it off 8.
  //
  // DISARM IS THE ONE ACTION WITH NO STAT LINE AT ALL. That is not an unlabelled
  // modifier sneaking in (CLAUDE.md 4 forbids those) — it is the absence of one,
  // and it is the mechanic: DISARM is stat-agnostic so that no build gets a
  // universal answer to both verb hazards (see STAT_AGNOSTIC_ACTIONS). Its
  // breakdown reads as the die against a Moderate DC, plus the lamp, and that
  // emptiness is itself legible: this one is the same for everybody.
  const modifiers: Modifier[] = isStatAgnostic(action.kind) ? [] : [statModifierOf(d.stats, stat)]
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

  const liveHazard = liveHazardKind(state)
  if (liveHazard !== null && isHazardVerb(action.kind)) {
    resolveHazardVerb(d, action.kind, liveHazard, band)
    return
  }

  switch (action.kind) {
    case 'move':
    case 'sneak': {
      const to = here.exits[action.direction]
      if (to === undefined) return
      // MOVE is room-led and the room it is about is the one you ARRIVE in, so
      // the line is emitted inside enterRoom — after `moved`, before the hazard
      // save. "You come through the doorway badly" then "there is no floor" is
      // the order those two things happen in.
      //
      // A bare SNEAK outside an encounter has no creature to be about, so it
      // narrates as a MOVE. Inside an encounter it never reaches here:
      // resolveEncounterAction owns it.
      enterRoom(d, action.direction, to, rng, band)
      // A critical failure is loud whatever you were doing (SCENT.criticalFailureBonus).
      // Movement itself is never gated on the roll: a failed MOVE stumbles you
      // noisily into the room, it does not pin you in place. Pinning would make
      // the turn limit punish a die roll the player cannot influence, and GDD
      // 2.7 asks for "stumble loudly OR take a wrong turn", not "stand still".
      pushPlayerScent(d, action.kind, band)
      return
    }

    case 'search':
    case 'rest': {
      // Room-led, and the room is the one you are standing in. The line comes
      // first; anything the action turned up (a flask, a breath) is its own beat
      // after it.
      narrateOutcome(d, action.kind, band, d.playerRoomId)
      applyQuietAction(d, action.kind, band)
      pushPlayerScent(d, action.kind, band)
      return
    }

    case 'focus': {
      resolveFocus(d, action.direction, band)
      return
    }

    case 'dropHeart': {
      // Free, unconditional, unrolled (GDD 2.9.1). What it cancels is the
      // carrying multiplier at step 4 and nothing else — the tier jump and the
      // position reveal already happened and are not taken back.
      d.carryingHeart = false
      d.labyrinth = withRoom(d.labyrinth, d.playerRoomId, { hasHeart: true })
      note(d, 'heartDropped')
      pushPlayerScent(d, 'dropHeart', band)
      return
    }

    case 'use': {
      const at = d.inventory.indexOf(action.item)
      narrateOutcome(d, 'use', band, d.playerRoomId, { item: action.item })
      if (at >= 0) {
        d.inventory = [...d.inventory.slice(0, at), ...d.inventory.slice(at + 1)]
        // ROLLED, NOT FLAT, as of 18 Sep 2026 (GDD 2.8.1). A good pour restores
        // the whole flask; a bad one spills half of it. The flask is spent
        // either way — that is what makes it a roll worth caring about rather
        // than a button that always gives you four oil.
        if (action.item === 'oilFlask') {
          d.oilDelta += isSuccess(band)
            ? OIL.flaskValue
            : OIL.flaskValue * OIL.botchedFlaskFraction
        }
      }
      pushPlayerScent(d, 'use', band)
      return
    }

    case 'send': {
      resolveSend(d, action.direction, band)
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
    case 'endure':
    case 'avoid':
    case 'dodge':
    case 'disarm':
      // Only reachable with no live hazard, which legalActions forbids — the
      // exact mirror of the fight/tame/flee case above.
      return
  }
}

/**
 * FOCUS — buying one doorway's identity. GDD 2.7 (18 Sep 2026).
 *
 * IT ALWAYS RESOLVES. The band scales what the looking COST (step 1 already
 * charged it) and never what came back, and that is not a softness — GDD 2.8.1
 * rejects probabilistic tells outright, and a FOCUS that sometimes returned
 * nothing would be exactly that with extra steps. The old `LISTEN` was
 * one-valued for the same reason and it is the right shape.
 *
 * The doorway is recorded as resolved for the rest of the run. What is stored is
 * the PERMISSION, never the answer: `tellsFor` recomputes what is actually
 * through there every turn, so a creature that wanders off does not leave behind
 * a remembered skittering that has become a lie.
 */
function resolveFocus(d: Draft, direction: Direction, band: OutcomeBand): void {
  narrateOutcome(d, 'focus', band, d.playerRoomId, { direction })

  const already = d.focusedByRoom[d.playerRoomId] ?? []
  if (!already.includes(direction)) {
    d.focusedByRoom = {
      ...d.focusedByRoom,
      // Sorted, so the same run replays to a byte-identical state whatever order
      // the doorways were bought in. CLAUDE.md 2.2.
      [d.playerRoomId]: [...already, direction].sort(),
    }
  }

  pushPlayerScent(d, 'focus', band)
}

/**
 * FORCE / ENDURE / AVOID / DODGE — answering a hazard. GDD 2.8, step 1g.
 *
 * NOTHING HAZARD-SPECIFIC HAPPENS TO THE ROLL. The band arriving here came out
 * of `rollForAction` exactly the way a MOVE's or a FIGHT's does: `ACTION_DC`,
 * `ACTION_STAT`, the oil band, companion modifiers, one `RollResult`. That is
 * deliberate and it is worth defending — GDD 2.5 spends Fortune *after seeing a
 * roll*, and 1i's `Policy.spendFortune` hook will be handed whatever the
 * reducer produced. A hazard roll assembled by hand down here would have been
 * invisible to it, and retrofitting that later is a cost nobody budgeted for.
 *
 * The verb, not the hazard, keys the outcome table: FORCE and ENDURE answer the
 * same bloom and cost completely different things, which is the entire point of
 * the redesign.
 */
function resolveHazardVerb(
  d: Draft,
  verb: HazardVerb,
  hazard: HazardKind,
  band: OutcomeBand,
): void {
  const out = HAZARD_VERB_OUTCOMES[verb][band]

  // Subject-led: the hazard is what the sentence is about, so the archetype is
  // ignored by the lookup and the room id is passed only to satisfy it.
  narrateOutcome(d, verb, band, d.playerRoomId, { hazard })

  // The verb's oil was charged at step 1 with every other action's, and the
  // `damage`, `oilLoss` and `rewardFlasks` columns that used to be read here no
  // longer exist (GDD 2.6). What a hazard row still owns is the clock and the
  // status, which are the two things oil cannot say.
  d.turnCost += out.extraTurns
  if (out.applies !== null && hazardCanApply(hazard, out.applies)) {
    d.applyStatus = out.applies
    d.applyStatusTurns = out.statusTurns
  }

  // The beat for a clear that went WELL — the diegetic partner to the oil the
  // band hands back. It used to announce a flask; the flask is gone and the
  // line was rewritten to describe the thing that is still true at these bands,
  // so it is gated on the same test: did this actually return oil?
  //
  // Wired rather than deleted because a `NoteBeat` nothing emits is dead content
  // (the standard 1g applied to `HAZARD_NARRATION`'s bloom and snare rows), and
  // `tests/outcomes.test.ts`'s beat ledger is what noticed it had come loose.
  //
  // Through `oilCostWith`, not the price list: a goblin makes DISARM free
  // (GDD 2.9), and free means zero at every band including the two that would
  // have paid. Asking the price list here would announce spoils the player was
  // never handed.
  if (oilCostWith(d, verb, band) < 0) note(d, 'hazardCleared', { hazard })

  if (verb === 'disarm' && disarmClears(band)) {
    // GONE, not answered. This is the ONLY thing in the game that changes the
    // terrain mid-run, and it is deliberate rather than an erosion of "terrain
    // never drifts" (GDD 2.9.1): drift is what the labyrinth does on its own,
    // and this is a turn and a roll the player spent on purpose. It is recorded
    // as a flag so generation's contracts stay checkable — see `activeHazardOf`.
    d.labyrinth = withRoom(d.labyrinth, d.playerRoomId, { hazardCleared: true })
    note(d, 'hazardDisarmed', { hazard })
  }

  // Otherwise the hazard is ANSWERED, not removed. `Room.hazard` stays exactly
  // where generation put it, and a bloom you walked through is still a bloom to
  // whoever comes back this way, including you. What clears is the encounter.
  d.hazardRoomId = null

  pushPlayerScent(d, verb, band)
}

/**
 * Whether a hazard can produce a status at all.
 *
 * DISARM has ONE row shape for both hazards, because it does the same job to
 * each — but a bloom Confuses and a snare does not, and a player who took a
 * snare apart badly must not come out of it blind. The table says what the verb
 * costs; this says what the hazard is capable of doing to you.
 */
function hazardCanApply(hazard: HazardKind, status: StatusEffect): boolean {
  if (status === 'confused') return hazard === 'sporeBloom'
  return true
}

/**
 * Moving into a room: the arrival line, the hazard save, the Heart, the grave,
 * the encounter flag.
 *
 * `arrivalBand` is the MOVE band to narrate the arrival with, or null when the
 * caller has already said how the player got here in its own words — SNEAK and
 * FLEE out of an encounter, and coming up out of a portal. Those are
 * subject-led beats and a MOVE line on top of them would narrate the same step
 * twice.
 */
function enterRoom(
  d: Draft,
  direction: Direction,
  to: RoomId,
  rng: Rng,
  arrivalBand: OutcomeBand | null,
): void {
  const from = d.playerRoomId
  d.playerRoomId = to
  d.facing = direction
  d.events.push({ kind: 'moved', from, to, direction })

  d.labyrinth = withRoom(d.labyrinth, to, { visited: true })
  const arrived = roomOf(d.labyrinth, to)

  if (arrivalBand !== null) narrateOutcome(d, 'move', arrivalBand, to)

  if (arrived.grave) d.events.push({ kind: 'graveFound', epitaph: arrived.grave })
  if (arrived.hasHeart && !d.carryingHeart) d.takesHeart = true

  // The encounter is bound to ENTERING the room. This is the only place it is
  // ever set (GDD 2.9.1) — drift moving a creature onto the player must not.
  d.encounterRoomId = arrived.creature !== null ? to : null
  if (arrived.creature !== null) {
    note(d, 'creatureFound', { creature: arrived.creature })
    d.events.push({ kind: 'creatureEncounter', creature: arrived.creature })
  }

  meetHazard(d, arrived.hazard, rng)
}

/**
 * What happens when you cross a threshold into something dangerous.
 *
 * Two shapes, and which one a hazard gets is the whole of the 1g redesign:
 *
 *   ENTRY_HAZARDS  resolve themselves, right now, on a stat you did not pick.
 *                  The pit, and only the pit. It is absolute by design.
 *   VERB_HAZARDS   open a choice. The flag goes up, the turn ends, and next
 *                  turn the menu is that hazard's two verbs and nothing else.
 *
 * The flag rather than an immediate resolution is what makes it a decision: a
 * choice offered and resolved inside one call is not a choice the player ever
 * saw. It costs a turn to answer a bloom, and it should.
 */
function meetHazard(d: Draft, hazard: HazardKind | null, rng: Rng): void {
  if (hazard === null) return
  if (ENTRY_HAZARDS.includes(hazard)) {
    resolveHazard(d, hazard, rng)
    return
  }
  if (VERB_HAZARDS.includes(hazard)) {
    d.hazardRoomId = d.playerRoomId
    note(d, 'hazardBlocks', { hazard })
  }
  // Anything else — a portal — does nothing to you for standing in it.
}

/**
 * The saving throw an ENTRY hazard demands on entry. Pits, now, and only pits.
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

  // The hazard's own beat, keyed by the hazard's own band — NOT the move's.
  // 1e made these separate rolls precisely so the move's band says how loudly
  // you arrived and the hazard's says whether you survived it; narrating them
  // from one band would undo that.
  const text = hazardText(hazard, result.band, dark(d))
  if (text !== null) d.events.push({ kind: 'narration', text, beat: 'hazardOutcome' })

  // BINARY, since 18 Sep 2026: `fatal` or nothing at all. The pit's Mixed
  // Success survive-band went with health (GDD 2.8) — there is no honest
  // currency left for catching the lip to be paid in, and "instant loss" is what
  // a pit has always been in play anyway.
  const out = table[result.band]
  if (out.fatal) {
    d.fatal = true
    return
  }
  d.turnCost += out.extraTurns
  if (out.applies !== null) {
    d.applyStatus = out.applies
    d.applyStatusTurns = out.statusTurns
  }
}

function applyQuietAction(d: Draft, kind: ActionKind, band: OutcomeBand): void {
  // `OIL.extraCost` is gone: SEARCH and REST are priced in `OIL_PRICE` with
  // every other verb, and the surcharge that used to be applied here was the
  // second of the old model's three separate places for "what this costs you".

  // SEARCH pays at SUCCESS-or-better, a band later than everything else in the
  // game. That is GDD 2.7's "finds loot at lower reliability" — the price of
  // being FOCUS's cheap sibling is a worse find rate, and this is where it is
  // charged rather than in the oil.
  if (kind === 'search' && bandAtLeast(band, SEARCH_FIND_BAND)) {
    const here = roomOf(d.labyrinth, d.playerRoomId)
    if (here.oilFlask) {
      d.labyrinth = withRoom(d.labyrinth, d.playerRoomId, { oilFlask: false })
      d.inventory = [...d.inventory, 'oilFlask']
      note(d, 'foundFlask')
    }
  }

  // REST has nothing to heal any more (GDD 2.6). What a good one buys is its own
  // price back — `OIL_PRICE_OVERRIDE.rest` makes a mixed-or-better REST cost
  // nothing and a bad one cost 0.5 — so the beat is the refund, not a recovery.
  // The world still turns through it: the Wumpus moves, creatures drift, and
  // nothing in this game pauses.
  if (kind === 'rest' && isSuccess(band)) note(d, 'caughtBreath')
}

/** True when `band` is at or above `floor` in BAND_ORDER. */
function bandAtLeast(band: OutcomeBand, floor: OutcomeBand): boolean {
  return BAND_ORDER.indexOf(band) >= BAND_ORDER.indexOf(floor)
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
  d.pendingScent.push({ roomId, amount: result.scent, fromPlayer: true })

  // What you drove off was carrying something — and as of 18 Sep it pays in the
  // same currency as everything else, through the band's own oil delta charged
  // at step 1. There is no separate flask reward to hand out here, which is what
  // closes 1g's open question about whether FIGHT should pay a band later than
  // TAME: both are now paid on one curve.
  if (result.creatureRemains === false && isSuccess(band) && action.kind === 'fight') {
    note(d, 'spoilsTaken', { creature })
  }

  // Subject-led: the creature is what the sentence is about, so the archetype
  // is ignored by the lookup and `roomId` is passed only to satisfy it. The
  // line goes here, before the world is written back, so the player reads what
  // happened before they read its consequences.
  narrateOutcome(d, kind, band, roomId, { creature })

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
    note(d, 'braveOverride', { creature })
  }

  if (companionGained !== null) {
    if (result.companionReleased !== null) {
      lostCompanion(d, result.companionReleased, 'released')
    }
    d.companion = companionGained
    d.events.push({ kind: 'companionGained', companion: companionGained })
  }

  for (const revealed of result.revealedRooms) {
    d.labyrinth = withRoom(d.labyrinth, revealed, { visited: true })
    const direction = directionTo(d.labyrinth, d.playerRoomId, revealed)
    // A reveal the player cannot be told the DIRECTION of is not a reveal — GDD
    // 2.4 keys every piece of spatial information to a doorway. creatures.ts
    // only ever reveals adjacent rooms, so this is a guard, not a branch.
    if (direction !== null) note(d, 'companionReveals', { direction })
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
      // a new encounter. No arrival band — the SNEAK or FLEE line above has
      // already said how the player left, and a MOVE line here would narrate
      // one step twice.
      enterRoom(d, direction, result.movedTo, rng, null)
      return
    }
  }

  // Still here. The encounter stays live for as long as the creature does —
  // a critically failed tame leaves it standing in front of you, un-tameable.
  d.encounterRoomId = roomOf(d.labyrinth, roomId).creature !== null ? roomId : null
}

function resolveSend(d: Draft, direction: Direction, band: OutcomeBand): void {
  const player: Player = {
    roomId: d.playerRoomId,
    facing: d.facing,
    stats: { str: 0, agi: 0, int: 0, lck: 0 },
    oil: d.oil,
    maxOil: OIL.max,
    fortune: d.fortune,
    carryingHeart: d.carryingHeart,
    companion: d.companion,
    inventory: d.inventory,
    statuses: d.statuses,
  }
  // THE BAND IS NO LONGER INERT. Through 1h the decoy's strength came from which
  // creature you had tamed; as of 18 Sep it comes from this roll — 3 turns of
  // decoy on a good send, 2 on a bad one, halved either way while you carry the
  // Heart (GDD 2.9). So the prose below now describes something that actually
  // differs band to band.
  const sent = sendCompanion(d.labyrinth, player, direction, band)
  if (sent === null) return

  d.pendingScent.push({ roomId: sent.targetRoomId, amount: sent.scent, fromPlayer: false })

  narrateOutcome(d, 'send', band, d.playerRoomId, { companion: sent.sent, direction })

  // THE COMPANION DOES NOT COME BACK. No chance, no rescue, no un-choosing it
  // (CLAUDE.md 3). The slot is cleared unconditionally, here, and there is
  // nowhere else in the codebase that could put it back.
  d.companion = null
  lostCompanion(d, sent.sent, 'sent', { direction })
}

/**
 * ENTER PORTAL — a different labyrinth entirely (GDD 2.8).
 *
 * Everything you charted is gone, and so is every trail you laid: the Wumpus
 * loses your scent completely, which is the whole reason to take the gamble.
 *
 * THE TWO OUTCOMES ARE DELIBERATELY FAR APART, and GDD 2.8 marks this
 * non-negotiable. A good read reseeds you into a fresh labyrinth with your oil
 * intact and a clean scent field — the gamble paying off. A bad one surfaces you
 * ALREADY HOLDING the new labyrinth's Heart: no exploration phase, no map, the
 * Wumpus escalated and briefly certain of where you are, and nothing ahead but
 * the escape problem. It still never strands you — a portal that could kill
 * would be a second instant-loss check and the design has room for one.
 *
 * `DROP HEART` is what makes the bad half survivable rather than merely brutal
 * (GDD 2.9.1): set it down, walk out clean, and the only thing it cost you is
 * the run you were having. The escalation does not come back off, which is why
 * it is a real decision and not an undo.
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
  const good = isSuccess(band)
  const half = Math.max(1, Math.ceil(candidates.length / 2))
  const pool = good ? candidates.slice(0, half) : candidates.slice(half)
  const landing = rng.pick(pool.length > 0 ? pool : candidates)

  let next = withRoom(fresh, landing, { visited: true })
  // You are still holding it. The new labyrinth does not get to hand you a second.
  if (d.carryingHeart) next = withRoom(next, next.heartRoomId, { hasHeart: false })
  else if (!good) {
    // A BAD READ PUTS IT IN YOUR HANDS. Routed through the ordinary Heart-pickup
    // path at step 3 rather than escalating here, so a Heart taken through a
    // portal and a Heart lifted off a plinth cannot diverge — same tier jump,
    // same one-turn reveal, same once-per-run gate. `heartFromRoomId` is what
    // tells step 3 to clear the plinth you never stood at.
    d.takesHeart = true
    d.heartFromRoomId = next.heartRoomId
  }

  d.labyrinth = next
  d.playerRoomId = landing
  d.facing = null
  d.scent = emptyScent()
  d.pendingScent = []
  d.encounterRoomId = null
  // The band line says how well you read it and therefore how deep you
  // surfaced; the note says what a portal is. Both, in that order, because the
  // reading happened before the arriving.
  narrateOutcome(d, 'enterPortal', band, landing)
  note(d, 'portalCrossed')

  const arrived = roomOf(next, landing)
  if (arrived.creature !== null) {
    // A new room is a new arrival, and arriving on a creature is an encounter
    // wherever you arrived from.
    d.encounterRoomId = landing
    note(d, 'creatureFound', { creature: arrived.creature })
    d.events.push({ kind: 'creatureEncounter', creature: arrived.creature })
  }
  // Same helper as `enterRoom`, so surfacing into a bloom raises the choice
  // rather than silently skipping it — the two arrival paths must not disagree
  // about what a hazard does to you.
  meetHazard(d, arrived.hazard, rng)
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
  beat: EndingBeat,
  turn = state.turn + d.turnCost,
): ApplyResult {
  // GDD 2.17: every ending needs a beat, including the quiet ones. The ending
  // line is the last thing the player reads, so it is the last thing pushed
  // before `runEnded` and there is no path out of a run that skips it.
  d.events.push({ kind: 'narration', text: endingText(beat, dark(d)), beat })
  d.events.push({ kind: 'runEnded', outcome })
  return commit(state, d, wumpus, outcome, turn, d.action, d.rng)
}

function commit(
  state: GameState,
  d: Draft,
  wumpus: GameState['wumpus'],
  outcome: GameState['outcome'],
  turn: number,
  action: Action,
  rng: Rng,
): ApplyResult {
  const finalOutcome = outcome

  const player: Player = {
    roomId: d.playerRoomId,
    facing: d.facing,
    stats: state.player.stats,
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
    hazardRoomId: d.hazardRoomId,
    focusedByRoom: d.focusedByRoom,
    heartTaken: d.heartTaken,
    actionLog: [...state.actionLog, action],
  }

  // Senses are a QUERY, computed against the world as it stands at the end of
  // the turn — which is after drift, so nothing reported here can describe a
  // pre-drift labyrinth.
  //
  // Both registers reach the event stream, because both are facts the player
  // learns and CLAUDE.md 2.3 requires every such fact to be expressible as text:
  // a resolved doorway emits its `tell`s, an unresolved one emits a `presence`.
  // A doorway with nothing behind it emits neither, and that silence is now
  // load-bearing information rather than an absence of it.
  if (finalOutcome === 'inProgress') {
    for (const sense of tellsFor(next)) {
      for (const tell of sense.tells) {
        d.events.push({ kind: 'tell', tell, text: tellText(tell) })
      }
      if (sense.unresolved) {
        d.events.push({
          kind: 'presence',
          direction: sense.direction,
          text: presenceText(sense.direction, isDarkProse(next.player.oil)),
        })
      }
    }
  }

  return { state: next, events: d.events }
}

// ---------------------------------------------------------------------------
// Tells, for renderers and the agent view
// ---------------------------------------------------------------------------

/**
 * What the player knows about each doorway, right now.
 *
 * THE ONE PLACE THE ANSWER IS ASSEMBLED, for three renderers. Through 1h this
 * returned only the tells that fired, so `src/classic/view.ts` had to re-derive
 * which doorways had even been looked at by duplicating a branch out of
 * `getTells` — and the diorama and `AgentView` were each going to duplicate it
 * again (1h finding 1). With `FOCUS` that stops being untidy and becomes unsafe:
 * a renderer that shows an unresolved doorway the way it shows an empty one
 * hands the player silence and lets them read it as safety.
 *
 * The free channels are gathered here too, for the same reason. A grellhound
 * names adjacent hazards whatever the lamp and whatever FOCUS has been spent
 * (GDD 2.8.1), so its doorways arrive resolved — and a renderer that forgot to
 * ask would show a hound-owning player an unresolved doorway the hound is
 * currently barking at.
 */
export function tellsFor(state: GameState): DoorwaySense[] {
  const free = companionSenses(
    state.labyrinth,
    state.player.companion,
    state.player.roomId,
    state.wumpus.roomId,
  ).revealedHazards.map((h) => h.direction)

  return getTells(state.labyrinth, state.player.roomId, state.wumpus.roomId, {
    confused: hasStatus(state.player, 'confused'),
    resolved: focusedIn(state, state.player.roomId),
    focusable: focusableDirections(state),
    freeDirections: free,
    heartTaken: state.player.carryingHeart,
  })
}

/**
 * What each tell smells, sounds or feels like.
 *
 * THIS IS THE ONE PIECE OF PROSE STILL LIVING IN CODE, and 1h is flagging it
 * rather than moving it. CLAUDE.md 2.4 puts prose in `data/`, and
 * `tests/outcomes.test.ts`'s source-of-truth sweep is what enforces that — but
 * that sweep reads `narration`, `oilChanged` and `companionLost` events only,
 * so a `tell` event's text has never been checked against any table. Two
 * consequences, both noted in PHASE-1-PROGRESS for a content step to settle:
 * these seven strings have no lit/dark variants, and `stench`'s "pallid" and
 * `freshChisel`'s "marks" describe an APPEARANCE that GDD 2.8.1's dark register
 * should not be able to offer. Moving the table is a content change; 1h only
 * made it reachable.
 *
 * Exported because a renderer needs the standing tells on the very first turn,
 * before any action has produced a `tell` event, and because `AgentView.tells`
 * is already declared as `{ direction, kind, text }` — so 1j needs exactly this
 * and a second copy in a renderer would be two tables to drift apart.
 */
export const TELL_TEXT: Record<Tell['kind'], string> = {
  stench: 'a pallid, heavy stench',
  draft: 'a cold draft',
  sweetness: 'something sweet',
  hum: 'a faint hum',
  freshChisel: 'fresh chisel marks',
  skittering: 'a small, quick skittering',
  metallic: 'iron and old coin',
}

export function tellText(tell: Tell): string {
  return `${tell.direction}: ${TELL_TEXT[tell.kind]}.`
}

/** Distance from the player to a room, for renderers and the sim. */
export function distanceToPlayer(state: GameState, id: RoomId): number {
  return distancesFrom(state.labyrinth, state.player.roomId)[id] ?? -1
}
