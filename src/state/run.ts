/**
 * The run, as the renderers hold it.
 *
 * `startRun` and `takeAction` are PURE and have no React in them, which is the
 * point: the smoke test in `tests/classic.test.ts` drives a whole game through
 * the same two functions the screen calls, so what it exercises is the
 * renderer's real action path and not a parallel one written for testing.
 *
 * Determinism (CLAUDE.md 2.2) survives this layer because nothing here holds
 * RNG of its own: the generator is rebuilt from `state.rng` on every action,
 * exactly the way `replayRun` does it, so `(seed, actionLog)` out of this store
 * replays to the identical run.
 */

import { create } from 'zustand'

import type { Action, Difficulty, DoorwaySense, GameState, Stats } from '../engine/types.ts'
import { rngFromState } from '../engine/rng.ts'
import { applyAction, createRun, legalActions, tellsFor } from '../engine/resolve.ts'
import type { LegalAction } from '../engine/resolve.ts'
import { eventsToLines } from '../classic/lines.ts'
import type { LogLine } from '../classic/lines.ts'
import { rollView } from '../classic/view.ts'
import type { RollView } from '../classic/view.ts'

/** One resolved turn, kept whole so the log can be grouped rather than flat. */
export interface TurnRecord {
  /** The turn number the action was taken ON, not the one it landed in. */
  readonly n: number
  /** Null on the opening record, which is the run starting rather than a turn. */
  readonly action: Action | null
  readonly label: string
  readonly lines: readonly LogLine[]
  /** The action's own roll, for the breakdown panel. Null when it did not roll. */
  readonly roll: RollView | null
}

export interface RunView {
  readonly seed: number
  readonly difficulty: Difficulty
  readonly state: GameState
  readonly menu: readonly LegalAction[]
  readonly turns: readonly TurnRecord[]
  /** What the doorways report right now — the last turn's step-8 emission. */
  /**
   * What each doorway is reporting, straight from the engine.
   *
   * ONE FIELD WHERE THERE WERE TWO. It used to be `tells` plus a `sensed` list
   * of directions the renderer derived for itself, which is the duplication 1h
   * flagged; `DoorwaySense` carries both halves plus the one the old pair could
   * not express at all — whether a doorway has something behind it that nobody
   * has looked at yet (GDD 2.7).
   */
  readonly senses: readonly DoorwaySense[]
}

export interface StartOptions {
  readonly difficulty?: Difficulty
  readonly stats?: Stats
}

export function startRun(seed: number, options: StartOptions = {}): RunView {
  const difficulty = options.difficulty ?? 'stirring'
  const state = createRun(
    seed,
    options.stats === undefined ? { difficulty } : { difficulty, stats: options.stats },
  )
  return {
    seed,
    difficulty,
    state,
    menu: legalActions(state),
    // The opening record carries no lines. The engine says nothing when a run
    // is created — `createRun` emits no events — so inventing an opening line
    // here would be the renderer writing prose. What the player reads on turn 1
    // is the room heading and the doorways, which is what they can actually
    // perceive standing in the entrance.
    turns: [{ n: state.turn, action: null, label: 'The run begins', lines: [], roll: null }],
    senses: tellsFor(state),
  }
}

/**
 * Resolve one action and fold the result into the view.
 *
 * Illegal actions are not filtered out here. `applyAction` answers them with an
 * `actionUnavailable` narration and consumes nothing (1e), and passing them
 * through means the screen and an agent get the identical treatment — the
 * renderer does not get to be the thing that decides what is legal (GDD 2.17).
 */
export function takeAction(run: RunView, action: Action): RunView {
  const before = run.state
  const label = run.menu.find((entry) => sameShape(entry.action, action))?.label ?? action.kind
  const { state, events } = applyAction(before, action, rngFromState(before.rng))

  const lines = eventsToLines(events, state.labyrinth)

  // The action's own roll, not a hazard save taken in the same step. The two
  // are separate rolls (1e) and the breakdown panel is about the choice the
  // player made; the save shows up in the log on its own line.
  const rolls = events.filter((e) => e.kind === 'roll')
  const own = rolls.find((e) => e.kind === 'roll' && e.hazard === undefined)
  const roll =
    own !== undefined && own.kind === 'roll'
      ? rollView(own.action, own.result, null)
      : null

  // The doorway panel is a QUERY against the state the turn produced, not a
  // reassembly of the events it emitted.
  //
  // 1h built it the other way round — collect the `tell` events, fall back to
  // `tellsFor` when none arrived — and that is how the end screen came to
  // explain a bright doorway as a failed lamp (1h finding 7). `tellsFor` now
  // returns the whole per-doorway picture including the doorways that reported
  // NOTHING, which events by their nature cannot: an empty doorway emits no
  // event, so an event-driven panel can never tell "nothing there" from "no
  // events this turn". A finished run gets an empty panel, deliberately —
  // nothing is being sensed by someone who has left.
  const senses = state.outcome === 'inProgress' ? tellsFor(state) : []

  return {
    ...run,
    state,
    menu: legalActions(state),
    turns: [
      ...run.turns,
      { n: before.turn, action, label, lines, roll },
    ],
    senses,
  }
}

/**
 * Structural equality for actions, so a menu entry can be matched to the action
 * it produced. `Action` is a small closed union of plain data; a deep compare
 * would be more machinery than three fields deserve.
 */
function sameShape(a: Action, b: Action): boolean {
  if (a.kind !== b.kind) return false
  const ad = 'direction' in a ? a.direction : null
  const bd = 'direction' in b ? b.direction : null
  if (ad !== bd) return false
  const ai = 'item' in a ? a.item : null
  const bi = 'item' in b ? b.item : null
  return ai === bi
}

// ---------------------------------------------------------------------------
// The React-facing store. Everything above it is pure; this only holds one.
// ---------------------------------------------------------------------------

interface RunStore {
  readonly run: RunView | null
  start: (seed: number, options?: StartOptions) => void
  act: (action: Action) => void
  quit: () => void
}

export const useRun = create<RunStore>((set, get) => ({
  run: null,
  start: (seed, options) => set({ run: startRun(seed, options) }),
  act: (action) => {
    const run = get().run
    if (run === null || run.state.outcome !== 'inProgress') return
    set({ run: takeAction(run, action) })
  },
  quit: () => set({ run: null }),
}))
