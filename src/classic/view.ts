/**
 * The screen, as data. No React in this file, so it can be asserted against.
 *
 * Every function here formats something the engine already decided. None of
 * them chooses what the player may know — `legalActions`, `tellsFor` and the
 * event stream do that, in the engine, for all three renderers (GDD 2.17).
 */

import type {
  Direction,
  GameState,
  OutcomeBand,
  RollResult,
  RunOutcome,
  Tell,
  TellKind,
} from '../engine/types.ts'
import { DIRECTIONS } from '../engine/types.ts'
import { oilBandFor } from '../engine/data/tuning.ts'
import { ARCHETYPE_WORD, CREATURE_WORD, DIRECTION_WORD } from '../engine/data/outcomes.ts'
import { hasStatus, statusTurnsLeft, TELL_TEXT } from '../engine/resolve.ts'
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
 * The two are different mechanics with different counterplay and GDD 2.8.1 and
 * 2.8.2 keep them apart on purpose — `range` is the lamp and LISTEN buys it
 * back for a turn; `confused` is suppression that runs out on its own clock and
 * that the player is explicitly told about. Rendering both as one shrug throws
 * away the only thing that tells the player which lever to pull.
 */
export type UnsensedReason = 'range' | 'confused'

export interface DoorwayView {
  readonly direction: Direction
  readonly word: string
  readonly tells: readonly DoorwayTell[]
  /**
   * Whether the player's senses reached this doorway at all this turn.
   *
   * THIS IS NOT COSMETIC. At Ember and below only the facing doorway reports,
   * and Confused suppresses all four. A doorway that was not sensed and a
   * doorway that reported nothing are completely different facts — one is "I do
   * not know", the other is "there is nothing there" — and rendering them the
   * same way lets the player read darkness as safety. CLAUDE.md 3 says darkness
   * restricts the RANGE of tells and never their honesty; collapsing this
   * distinction in the renderer is how you break that without touching the
   * engine.
   */
  readonly sensed: boolean
  /** Set only when `sensed` is false. */
  readonly unsensed: UnsensedReason | null
  /** Reserved for the Wumpus alone. GDD 2.17, "exactly one alarming signal". */
  readonly alarming: boolean
}

/**
 * Which doorways reported this turn.
 *
 * DUPLICATED FROM `getTells`, KNOWINGLY, AND FLAGGED. The engine computes this
 * set and then throws it away: `tellsFor` returns only the tells it found, so
 * "no tell through the north door" and "the north door was out of range" arrive
 * at every renderer as the same absence. The diorama and `AgentView` will each
 * have to re-derive it exactly like this. The fix is for the engine to emit the
 * sensed set — a `GameEvent` or a second return from `tellsFor` — and that is an
 * engine change, so it is written up in PHASE-1-PROGRESS instead of made here.
 *
 * `listening` is the action the player just took, not a state flag: LISTEN buys
 * the full set back for exactly one turn (GDD 2.8.1).
 */
export function sensedDirections(state: GameState, listening: boolean): Direction[] {
  if (hasStatus(state.player, 'confused')) return []
  const restricted =
    oilBandFor(state.player.oil).tellRange === 'facing' && !listening && state.player.facing !== null
  return restricted && state.player.facing !== null ? [state.player.facing] : [...DIRECTIONS]
}

export function doorways(
  state: GameState,
  tells: readonly Tell[],
  sensed: readonly Direction[],
): DoorwayView[] {
  const room = state.labyrinth.rooms[state.player.roomId]
  if (room === undefined) throw new Error(`classic/view: no room ${state.player.roomId}`)

  const confused = hasStatus(state.player, 'confused')
  const out: DoorwayView[] = []
  for (const direction of DIRECTIONS) {
    if (room.exits[direction] === undefined) continue
    const here = tells.filter((t) => t.direction === direction)
    const isSensed = sensed.includes(direction)
    out.push({
      direction,
      word: DIRECTION_WORD[direction],
      tells: here.map((t) => ({ kind: t.kind, text: TELL_TEXT[t.kind] })),
      sensed: isSensed,
      unsensed: isSensed ? null : confused ? 'confused' : 'range',
      alarming: here.some((t) => t.kind === 'stench'),
    })
  }
  return out
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
export function statusChunks(state: GameState): StatusChunk[] {
  const { player, turn, maxTurns } = state
  const band = oilBandFor(player.oil)
  const out: StatusChunk[] = [
    { label: 'Turn', value: `${turn} / ${maxTurns}`, tone: turn > maxTurns - 4 ? 'warn' : 'plain' },
    {
      label: 'Lamp',
      value: `${player.oil} · ${band.name}`,
      tone: band.tellRange === 'facing' ? 'warn' : 'plain',
    },
    {
      label: 'Health',
      value: `${player.health} / ${player.maxHealth}`,
      tone: player.health <= 1 ? 'warn' : 'plain',
    },
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

export interface RollView {
  readonly action: string
  readonly hazard: string | null
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
