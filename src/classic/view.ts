/**
 * The screen, as data. No React in this file, so it can be asserted against.
 *
 * Every function here formats something the engine already decided. None of
 * them chooses what the player may know — `legalActions`, `tellsFor` and the
 * event stream do that, in the engine, for all three renderers (GDD 2.17).
 */

import type {
  Action,
  Difficulty,
  Direction,
  GameState,
  HazardKind,
  OutcomeBand,
  RollResult,
  Room,
  RunOutcome,
  DoorwaySense,
  TellKind,
} from '../engine/types.ts'
import { DIRECTIONS } from '../engine/types.ts'
import { oilBandFor } from '../engine/data/tuning.ts'
import { ARCHETYPE_WORD, CREATURE_WORD, DIRECTION_WORD } from '../engine/data/outcomes.ts'
import { hasStatus, statusTurnsLeft, TELL_TEXT } from '../engine/resolve.ts'
import type { LegalAction } from '../engine/resolve.ts'
import { BAD_BANDS, BAND_LABEL, signed } from './labels.ts'

// ---------------------------------------------------------------------------
// The room
// ---------------------------------------------------------------------------

export interface RoomView {
  readonly heading: string
  readonly isEntrance: boolean
}

/**
 * What the room is called, and whether it is the way out.
 *
 * That is all there is. THE ENGINE HAS NO ROOM DESCRIPTION — see the note on
 * `ARCHETYPE_WORD` — and everything else about a room announces itself through
 * the event stream on the turn it becomes relevant: the Heart is taken on entry
 * and says so, a grave emits its epitaph, a flask is found by SEARCH, a hazard
 * takes the menu, a creature takes the menu. So a standing "what is in here"
 * line would have nothing to put in it that the player has not just read.
 *
 * `isEntrance` is shown because moving into the entrance ENDS THE RUN (1e) and
 * there is no explicit leave verb — the doorway is the decision, so the player
 * has to be able to see which room it is.
 */
export function roomView(state: GameState): RoomView {
  const room = state.labyrinth.rooms[state.player.roomId]
  if (room === undefined) throw new Error(`classic/view: no room ${state.player.roomId}`)
  return { heading: ARCHETYPE_WORD[room.archetype], isEntrance: room.isEntrance }
}

// ---------------------------------------------------------------------------
// Doorways — where the tells live (GDD 2.17)
// ---------------------------------------------------------------------------

export interface DoorwayTell {
  readonly kind: TellKind
  readonly text: string
}

/**
 * Why a doorway said nothing, when it was not simply empty.
 *
 * The two are different mechanics with different counterplay and GDD 2.7 and
 * 2.8.2 keep them apart on purpose — `unresolved` is a doorway you have not paid
 * to look through, and FOCUS is the lever; `confused` is suppression that runs
 * out on its own clock and that the player is explicitly told about. Rendering
 * both as one shrug throws away the only thing that tells the player which lever
 * to pull, and in the FOCUS economy it also hides the price list.
 *
 * WHAT CHANGED IN 1i: this used to distinguish `range` (the lamp could not reach)
 * from `confused`. The oil-band tell-range mechanism is retired, so `range` has
 * no referent; `unresolved` took its place and means something the player can
 * act on rather than something they have to wait out.
 */
export type UnsensedReason = 'unresolved' | 'confused'

export interface DoorwayView {
  readonly direction: Direction
  readonly word: string
  readonly tells: readonly DoorwayTell[]
  /**
   * Whether this doorway's contents are known.
   *
   * THIS IS NOT COSMETIC, AND IT MATTERS MORE NOW THAN IT DID. A doorway you
   * have not FOCUSed and a doorway that reported nothing are completely
   * different facts — one is "there is something and I have not looked", the
   * other is "there is nothing there" — and rendering them the same way lets the
   * player read an unlooked-at doorway as safety. It is also the entire
   * interface to the information economy: if these look alike, there is no way
   * to tell which doorway is worth the turn.
   *
   * The engine now supplies this rather than the renderer deriving it
   * (`DoorwaySense`), which is 1h finding 1 closed.
   */
  readonly sensed: boolean
  /** Set only when `sensed` is false. */
  readonly unsensed: UnsensedReason | null
  /** A FOCUS on this doorway is on the menu this turn. */
  readonly focusable: boolean
  /** Reserved for the Wumpus alone. GDD 2.17, "exactly one alarming signal". */
  readonly alarming: boolean
  /** The doorway you came in by. A label, never a different action. */
  readonly wayBack: boolean
}

/**
 * The doorway panel, straight off the engine's own sensing query.
 *
 * `sensedDirections` USED TO LIVE HERE and it was a knowing duplicate of a
 * branch inside `getTells` — 1h flagged it as the one engine gap it would fix
 * first, because the diorama and `AgentView` were each going to re-derive it
 * again and the darkness invariant would only ever be as safe as the least
 * careful renderer. `tellsFor` returns `DoorwaySense[]` now, so this function
 * arranges facts rather than recomputing them, and there is nothing left here
 * for a third renderer to get wrong.
 */
export function doorways(state: GameState, senses: readonly DoorwaySense[]): DoorwayView[] {
  const room = state.labyrinth.rooms[state.player.roomId]
  if (room === undefined) throw new Error(`classic/view: no room ${state.player.roomId}`)

  const back = wayBack(state)
  const out: DoorwayView[] = []
  for (const sense of senses) {
    // Silence is a FACT now, not an absence: a doorway with no tells and nothing
    // unresolved is the engine saying there is nothing through there. That is
    // what makes the panel worth reading and what makes FOCUS worth paying for.
    const known = !sense.suppressed && !sense.unresolved
    out.push({
      direction: sense.direction,
      word: DIRECTION_WORD[sense.direction],
      tells: sense.tells.map((t) => ({ kind: t.kind, text: TELL_TEXT[t.kind] })),
      sensed: known,
      unsensed: known ? null : sense.suppressed ? 'confused' : 'unresolved',
      focusable: sense.focusable,
      alarming: sense.tells.some((t) => t.kind === 'stench'),
      wayBack: sense.direction === back,
    })
  }
  return out
}

/**
 * The doorway you came in by, or null on the first turn.
 *
 * `player.facing` is the direction of the last MOVE, so the way back is its
 * opposite — mirroring `retreatDirection` inside `resolve.ts`, which is private
 * and computes the same thing for FLEE. Both check the door actually exists,
 * because a portal lands you somewhere your facing has nothing to do with.
 *
 * Purely a label. It changes no action and adds no option: "Move W" and
 * "Move W (go back)" resolve identically, and the menu is still exactly what
 * `legalActions` returned, in its order (GDD 2.17). What it fixes is that the
 * compass is absolute and the player's memory is relative — you walk east and
 * the way home is now called west, which takes a beat to invert on every single
 * turn and is a beat spent on bookkeeping rather than on the decision.
 */
export function wayBack(state: GameState): Direction | null {
  const facing = state.player.facing
  if (facing === null) return null
  const opposite: Record<Direction, Direction> = { N: 'S', E: 'W', S: 'N', W: 'E' }
  const reverse = opposite[facing]
  const room = state.labyrinth.rooms[state.player.roomId]
  if (room === undefined || room.exits[reverse] === undefined) return null
  return reverse
}

/**
 * The one action in the menu that goes this way, for the WASD/arrow bindings.
 *
 * NOT A MENU. It looks up an entry `legalActions` already returned and hands
 * back that entry's action unchanged; a direction with nothing behind it
 * resolves to null and the key does nothing (GDD 2.17).
 *
 * MOVE wins when offered, because that is what the key means to a player.
 * Otherwise the direction resolves to the single directional entry pointing
 * that way — SNEAK past a creature, FLEE back out — so the keys keep working
 * inside an encounter, where they matter most.
 *
 * SEND IS DELIBERATELY EXCLUDED. It carries a direction like the others, but a
 * sent companion never comes back (CLAUDE.md 3), and binding "throw your friend
 * that way" to the same key as "walk that way" is how someone loses a companion
 * to a keystroke. SEND keeps its number and has to be chosen on purpose.
 */
export function actionForDirection(
  menu: readonly LegalAction[],
  direction: Direction,
): Action | null {
  const move = menu.find((e) => e.action.kind === 'move' && e.action.direction === direction)
  if (move !== undefined) return move.action
  const directional = menu.filter(
    (e) => 'direction' in e.action && e.action.direction === direction && e.action.kind !== 'send',
  )
  return directional.length === 1 && directional[0] !== undefined ? directional[0].action : null
}

// ---------------------------------------------------------------------------
// The charted map
// ---------------------------------------------------------------------------

export type MapCellKind =
  | 'player'
  | 'entrance'
  | 'heart'
  | 'hazard'
  | 'creature'
  | 'flask'
  | 'grave'
  | 'empty' //   charted, nothing in it
  | 'lead' //    a doorway you have seen, into a room you have not entered
  | 'door'
  | 'blank'

export interface MapCell {
  readonly ch: string
  readonly kind: MapCellKind
}

/**
 * Which difficulties give the player a charted map.
 *
 * THIS IS A DESIGN CHANGE AND IT IS BIGGER THAN IT LOOKS. GDD 2.2.1 says
 * "difficulty is a contract on GENERATION, not just a Wumpus tier" — it decides
 * how the labyrinth is BUILT. This adds a second axis: difficulty now also
 * decides how much of what you have seen you are allowed to keep. Whether that
 * belongs in the difficulty contract at all, or belongs in `tuning.ts` where the
 * diorama and `AgentView` would read the same rule, is Gautham's call. It sits
 * here, in the renderer, until it is made — because a renderer capability that
 * turns out to be a game rule is cheaper to move than to unpick.
 *
 * `docs/ROADMAP.md` parked the map render pending "telemetry showing players
 * actually get lost". That gate is met: Gautham mapped seed 730339 on paper,
 * mis-mapped it, took the pit route and died carrying the Heart.
 */
export const MAP_DIFFICULTIES: readonly Difficulty[] = ['drowsing', 'stirring'] as const

/**
 * What the player has charted, and nothing else.
 *
 * TEXT PARITY CUTS BOTH WAYS HERE (CLAUDE.md 2.3). Every renderer must be able
 * to express every fact the player can learn — and must not express one they
 * cannot. So this draws:
 *
 *  - rooms with `visited` set, and what is in them, because they walked in (or
 *    a grellhound charted it for them, which `resolve.ts` also marks visited);
 *  - doorways leading OUT of a charted room, including into rooms they have not
 *    entered, because standing in a room the menu offered them that exit;
 *  - nothing else. An unvisited room's CONTENTS never appear, the Wumpus never
 *    appears, and `heartRoomId` is only ever drawn once they have stood on it.
 *
 * A door into the dark renders as a connector to a `lead` cell, which is the
 * single most useful thing on the map: it is the list of places you have not
 * been yet, and it is information the player already had and was tracking on
 * paper.
 */
export function chartedMap(state: GameState): MapCell[][] | null {
  if (!MAP_DIFFICULTIES.includes(state.labyrinth.difficulty)) return null

  const { labyrinth, player } = state
  const at = (x: number, y: number): Room | undefined =>
    labyrinth.rooms[`${x},${y}`] ?? Object.values(labyrinth.rooms).find((r) => r.x === x && r.y === y)

  const known = (r: Room | undefined): boolean => r !== undefined && r.visited
  /** A room you have never entered but have seen a doorway into. */
  const isLead = (r: Room | undefined): boolean => {
    if (r === undefined || r.visited) return false
    for (const d of DIRECTIONS) {
      const neighbourId = r.exits[d]
      if (neighbourId === undefined) continue
      if (labyrinth.rooms[neighbourId]?.visited === true) return true
    }
    return false
  }

  const cellFor = (r: Room | undefined): MapCell => {
    if (r === undefined) return { ch: ' ', kind: 'blank' }
    if (r.id === player.roomId) return { ch: '@', kind: 'player' }
    if (!r.visited) return isLead(r) ? { ch: '?', kind: 'lead' } : { ch: ' ', kind: 'blank' }
    if (r.isEntrance) return { ch: 'E', kind: 'entrance' }
    if (r.id === labyrinth.heartRoomId) return { ch: 'H', kind: 'heart' }
    if (r.hazard !== null) return { ch: HAZARD_CHAR[r.hazard], kind: 'hazard' }
    if (r.creature !== null) return { ch: 'c', kind: 'creature' }
    if (r.oilFlask) return { ch: 'o', kind: 'flask' }
    if (r.grave !== null) return { ch: '+', kind: 'grave' }
    return { ch: '·', kind: 'empty' }
  }

  /** A doorway is drawn once either side of it has been stood in. */
  const seenDoor = (a: Room | undefined, b: Room | undefined, d: Direction): boolean => {
    if (a === undefined || b === undefined) return false
    if (a.exits[d] !== b.id) return false
    return known(a) || known(b)
  }

  const rows: MapCell[][] = []
  for (let y = 0; y < labyrinth.height; y++) {
    const roomRow: MapCell[] = []
    const linkRow: MapCell[] = []
    for (let x = 0; x < labyrinth.width; x++) {
      const here = at(x, y)
      roomRow.push(cellFor(here))
      if (x < labyrinth.width - 1) {
        roomRow.push(
          seenDoor(here, at(x + 1, y), 'E')
            ? { ch: '─', kind: 'door' }
            : { ch: ' ', kind: 'blank' },
        )
      }
      linkRow.push(
        seenDoor(here, at(x, y + 1), 'S') ? { ch: '│', kind: 'door' } : { ch: ' ', kind: 'blank' },
      )
      if (x < labyrinth.width - 1) linkRow.push({ ch: ' ', kind: 'blank' })
    }
    rows.push(roomRow)
    if (y < labyrinth.height - 1) rows.push(linkRow)
  }
  return rows
}

const HAZARD_CHAR: Record<HazardKind, string> = {
  pit: 'p',
  sporeBloom: 'b',
  snareCarving: 'n',
  portal: '¤',
}

// ---------------------------------------------------------------------------
// Status — GDD 2.17's budget, chunked
// ---------------------------------------------------------------------------

export type ChunkTone = 'plain' | 'warn'

export interface StatusChunk {
  readonly label: string
  readonly value: string
  readonly tone: ChunkTone
}

/**
 * The status line, already over budget before 1h touched it (GDD 2.17).
 *
 * Two rules from that section are applied literally here:
 *
 *  - **Oil level and oil band are ONE fact**, never two lines. `9 · bright`.
 *  - **Anything conditional is absent, not empty.** A "Companion: none" row
 *    spends a slot of working memory to say nothing. Four chunks are always
 *    there; three appear only when they are true.
 *
 * Nothing here is tinted alarming. Pallid violet and the stench belong to the
 * Wumpus alone (GDD 2.17), so the only alarming thing on the screen is a
 * doorway. A lamp about to go out is a warning, which is a different register.
 */
/**
 * Oil, as a number a person reads.
 *
 * Oil went fractional on 18 Sep — `OIL_PRICE.move` is 0.5 and a strong roll
 * hands quarters back — so the raw value can arrive as 7.749999999999999. One
 * decimal, and the `.0` trimmed, because "Lamp 8.0" reads like a precision the
 * game is not offering and "Lamp 7.75" is three characters of noise in a status
 * line GDD 2.17 already calls over budget.
 */
export function formatOil(oil: number): string {
  const rounded = Math.round(oil * 10) / 10
  return Number.isInteger(rounded) ? `${rounded}` : rounded.toFixed(1)
}

export function statusChunks(state: GameState): StatusChunk[] {
  const { player, turn, maxTurns } = state
  const band = oilBandFor(player.oil)
  const out: StatusChunk[] = [
    { label: 'Turn', value: `${turn} / ${maxTurns}`, tone: turn > maxTurns - 4 ? 'warn' : 'plain' },
    {
      label: 'Lamp',
      // Oil is fractional now — a MOVE costs half a point and a good one a
      // quarter — so it is rounded for the line rather than printed raw. One
      // decimal, and no trailing `.0`: `Lamp 8.5 · bright`, `Lamp 8 · bright`.
      value: `${formatOil(player.oil)} · ${band.name}`,
      tone: band.name === 'ember' || band.name === 'dark' ? 'warn' : 'plain',
    },
    // HEALTH IS GONE FROM THE STATUS LINE, and GDD 2.17 counts that as a win
    // rather than a hole: the run already asks the player to hold turn, oil, oil
    // band, Fortune, companion, carrying-Heart and statuses before the four
    // doorways, which the budget section calls over budget. A fact removed is a
    // slot returned, and nothing was put in its place.
    { label: 'Fortune', value: `${player.fortune}`, tone: 'plain' },
  ]

  if (player.companion !== null) {
    const traits = [
      player.companion.brave ? 'brave' : null,
      player.companion.skittish ? 'skittish' : null,
    ].filter((t): t is string => t !== null)
    out.push({
      label: 'Companion',
      value: [CREATURE_WORD[player.companion.kind], ...traits].join(' · '),
      tone: 'plain',
    })
  }

  if (player.carryingHeart) out.push({ label: 'Carrying', value: 'the Heart', tone: 'plain' })

  if (hasStatus(player, 'confused')) {
    const turns = statusTurnsLeft(player, 'confused')
    out.push({ label: 'Confused', value: `${turns} turn${turns === 1 ? '' : 's'}`, tone: 'warn' })
  }

  return out
}

// ---------------------------------------------------------------------------
// The roll, broken out
// ---------------------------------------------------------------------------

export interface RollPart {
  readonly source: string
  readonly value: string
}

/**
 * Verbs whose band changes nothing except at the very bottom.
 *
 * Measured against `resolve.ts`, not assumed — this is 1f finding 2, which
 * `PHASE-1-PROGRESS.md` still carries as open: MOVE and FOCUS have no banded
 * consequence beyond the price of the turn and `SCENT.criticalFailureBonus`, so
 * five of their six bands change what the action COST and nothing about what it
 * produced. A FOCUS always resolves its doorway (GDD 2.8.1 — one that sometimes
 * came back with nothing would be the probabilistic tell that section rejects),
 * so its band has no more to say about the outcome than a MOVE's does. SEARCH
 * and REST are NOT here: they are two-valued, and a roll that decides whether
 * you find the flask is a roll worth reading.
 *
 * IT NAMED `listen` UNTIL 1i PART 2. `LISTEN` was retired by the economy
 * rewrite in part 1 and this list did not move with it — which fails in the
 * quiet direction: the entry matches no action any renderer can be handed, so
 * every FOCUS got a full breakdown panel for a roll that only moved its price.
 *
 * This drives display only. The roll still happens, a critical failure is still
 * loud, and the line is still in the log. What it stops is a full breakdown
 * panel for walking through a door, which is the fastest way to teach a player
 * that the breakdown panel is noise — on the one screen whose job is to explain
 * why they rolled what they rolled (CLAUDE.md 4).
 *
 * If the roll itself is ever cut for these two verbs, this constant is the list
 * to cut, and this comment is the reasoning to re-read first.
 */
const INERT_ABOVE_CRIT_FAIL: readonly string[] = ['move', 'focus'] as const

export interface RollView {
  readonly action: string
  readonly hazard: string | null
  /**
   * Whether this roll's band actually did anything. False for a MOVE or LISTEN
   * that landed anywhere above a critical failure.
   */
  readonly consequential: boolean
  readonly natural: number
  readonly parts: readonly RollPart[]
  readonly total: number
  readonly dc: number
  readonly margin: number
  readonly band: OutcomeBand
  readonly bandLabel: string
  readonly bad: boolean
  readonly overridden: boolean
  readonly fortuneUsed: string | null
}

/**
 * Every modifier kept as its own chip.
 *
 * CLAUDE.md 4 requires every modifier to carry a human-readable source, and the
 * stated reason is this panel: "the UI shows the player exactly why they rolled
 * what they rolled". Summing them into one number would throw that away at the
 * last step, which is the only step where it is visible.
 */
export function rollView(action: string, result: RollResult, hazard: string | null): RollView {
  return {
    action,
    hazard,
    consequential:
      !INERT_ABOVE_CRIT_FAIL.includes(action) || result.band === 'criticalFailure',
    natural: result.natural,
    parts: result.modifiers.map((m) => ({ source: m.source, value: signed(m.value) })),
    total: result.total,
    dc: result.dc,
    margin: result.margin,
    band: result.band,
    bandLabel: BAND_LABEL[result.band],
    bad: BAD_BANDS.includes(result.band),
    overridden: result.overridden,
    fortuneUsed: result.fortuneUsed ?? null,
  }
}

// ---------------------------------------------------------------------------
// Endings
// ---------------------------------------------------------------------------

/**
 * How a finished run is titled.
 *
 * These are outcome NAMES, not the run's last line — the last line is an ending
 * beat the engine already emitted into the log, and GDD 2.17 is explicit that
 * it carries more weight than anything inside the run. The end panel shows that
 * beat; this is just the header above it.
 *
 * Endings are not archetype-aware and there is no epitaph yet. Both are real
 * gaps (GDD 2.16, 2.17) scoped together as one future piece of work in
 * PHASE-1-PROGRESS; 1h renders exactly what the engine emits and adds nothing.
 */
export const OUTCOME_LABEL: Record<RunOutcome, string> = {
  inProgress: 'In progress',
  escaped: 'Escaped, with the Heart',
  retreated: 'Retreated, empty-handed',
  caught: 'Caught',
  killed: 'Killed',
  outOfTurns: 'The lamp outlasted you',
}

/** Won, in the full sense. Retreat is the second-best outcome, not a win. */
export function isWin(outcome: RunOutcome): boolean {
  return outcome === 'escaped'
}
