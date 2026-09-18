/**
 * The text renderer, driven end to end.
 *
 * WHAT THIS IS AND IS NOT. It is a renderer-correctness smoke test: a scripted
 * legal-action sequence through `startRun`/`takeAction` — the same two
 * functions the screen calls, deliberately, so this exercises the real action
 * path rather than a parallel one written for the test — asserting a whole run
 * resolves to an ending without throwing and that nothing the engine said got
 * lost or embellished on the way to a line.
 *
 * It is NOT a balance measurement. The policy is a fixed index walk, not a
 * player; no number it produces means anything about the game. `npm run sim`
 * does not exist (1g finding 5) and 1j is the step that builds the thing that
 * measures.
 */

import { describe, it, expect } from 'vitest'

import type { Action, Difficulty, GameEvent, GameState, RunOutcome } from '../src/engine/types.ts'
import { DIRECTIONS } from '../src/engine/types.ts'
import { applyAction, legalActions } from '../src/engine/resolve.ts'
import { rngFromState } from '../src/engine/rng.ts'
import { oilBandFor } from '../src/engine/data/tuning.ts'
import { eventsToLines, toStrings } from '../src/classic/lines.ts'
import { doorways, roomView, statusChunks } from '../src/classic/view.ts'
import { startRun, takeAction } from '../src/state/run.ts'
import type { RunView } from '../src/state/run.ts'

const DIFFICULTIES: readonly Difficulty[] = ['drowsing', 'stirring', 'hunting', 'ravening']

/** No action can cost more turns than the run has; this is only a deadlock net. */
const GUARD = 80

/**
 * A scripted walk, not a random one. The index is a pure function of the seed
 * and the step number, so the same seed produces the same run every time —
 * which is what the determinism assertion below is able to check.
 */
function pick(menuLength: number, seed: number, step: number): number {
  return (seed + step) % menuLength
}

/**
 * Drive a run to its end, calling `onTurn` before each action is taken.
 *
 * Everything below shares this so there is one definition of "play a run" and
 * the assertions differ only in what they look at.
 *
 * `previous` is the action that produced the state being looked at, and it is
 * load-bearing for the doorway assertions: LISTEN buys the full set of tells
 * back for exactly one turn (GDD 2.8.1), so what the doorways report depends on
 * the last action and not only on the oil level.
 */
function drive(
  seed: number,
  difficulty: Difficulty,
  onTurn?: (run: RunView, previous: Action | null) => void,
): { run: RunView; steps: number } {
  let run = startRun(seed, { difficulty })
  let previous: Action | null = null
  let steps = 0

  while (run.state.outcome === 'inProgress' && steps < GUARD) {
    onTurn?.(run, previous)
    expect(
      run.menu.length,
      `seed ${seed} ${difficulty}: an in-progress run with no legal action`,
    ).toBeGreaterThan(0)
    const entry = run.menu[pick(run.menu.length, seed, steps)]
    if (entry === undefined) throw new Error('unreachable: the index is taken modulo the length')
    run = takeAction(run, entry.action)
    previous = entry.action
    steps += 1
  }

  return { run, steps }
}

/** Re-resolve one action against the state it was taken in, for comparison. */
function eventsOf(before: GameState, action: Action): readonly GameEvent[] {
  return applyAction(before, action, rngFromState(before.rng)).events
}

function spokenText(event: GameEvent): string | null {
  if (event.kind === 'narration') return event.text
  if (event.kind === 'oilChanged') return event.text
  if (event.kind === 'companionLost') return event.text
  return null
}

// ---------------------------------------------------------------------------

describe('classic renderer — a whole run', () => {
  it('plays start to finish and reaches an ending, at every difficulty', () => {
    const outcomes = new Set<RunOutcome>()

    for (const difficulty of DIFFICULTIES) {
      for (let seed = 1; seed <= 25; seed++) {
        const { run, steps } = drive(seed, difficulty)
        expect(steps, `seed ${seed} ${difficulty} hit the deadlock guard`).toBeLessThan(GUARD)
        expect(run.state.outcome, `seed ${seed} ${difficulty} stopped without an ending`).not.toBe(
          'inProgress',
        )
        outcomes.add(run.state.outcome)
      }
    }

    // Not a balance claim — a check that the sweep is not all one ending, which
    // would make every assertion in this file true of a single code path.
    expect(outcomes.size).toBeGreaterThan(1)
  })

  /**
   * The renderer's half of text parity (CLAUDE.md 2.3).
   *
   * `tests/outcomes.test.ts` asserts the ENGINE never speaks a line that is not
   * in the table. This asserts the other direction: the renderer never alters
   * one that is. Every narration reaches the screen as the exact string the
   * engine emitted — no prefix, no rewrite, no renderer-authored sentence.
   */
  it('reproduces every narration verbatim and never writes one of its own', () => {
    let checked = 0

    for (const difficulty of DIFFICULTIES) {
      for (let seed = 1; seed <= 15; seed++) {
        let run = startRun(seed, { difficulty })
        let steps = 0
        while (run.state.outcome === 'inProgress' && steps < GUARD) {
          const entry = run.menu[pick(run.menu.length, seed, steps)]
          if (entry === undefined) break
          const before = run.state
          const engineSaid = new Set(
            eventsOf(before, entry.action)
              .map(spokenText)
              .filter((t): t is string => t !== null),
          )

          run = takeAction(run, entry.action)
          const turn = run.turns[run.turns.length - 1]
          if (turn === undefined) break

          for (const line of turn.lines) {
            if (line.tone !== 'narration') continue
            expect(engineSaid.has(line.text), `renderer-authored line: ${line.text}`).toBe(true)
            checked += 1
          }
          steps += 1
        }
      }
    }

    expect(checked, 'the sweep never read a narration').toBeGreaterThan(200)
  })

  /**
   * MUTATION-CHECKED against the `wumpusMoved` case in `lines.ts`: make that
   * case push a line containing `event.to` and this fails on the first seed.
   *
   * The event stream carries the Wumpus's true room id (`wumpusMoved.to`). A
   * renderer that prints it is seeing through walls, which is exactly what
   * `docs/EVALS.md` makes 1j write a leakage test about — and 1j's
   * `AgentView.log` is going to be built from this same projection, so the
   * guard belongs here as well as there.
   */
  it('never puts the Wumpus position on the screen', () => {
    for (const difficulty of DIFFICULTIES) {
      for (let seed = 1; seed <= 20; seed++) {
        const { run } = drive(seed, difficulty)
        const hidden = run.state.wumpus.roomId
        // Only meaningful while the two are apart; once they share a room the
        // run has ended and the player has certainly been told.
        if (hidden === run.state.player.roomId) continue
        for (const turn of run.turns) {
          for (const line of turn.lines) {
            expect(line.text.includes(hidden), `leaked ${hidden}: ${line.text}`).toBe(false)
          }
        }
      }
    }
  })

  /**
   * Determinism, all the way up through the renderer (CLAUDE.md 2.2).
   *
   * The engine's own tests assert `(seed, actionLog)` replays. This asserts the
   * layer above it added nothing of its own — no `Math.random`, no clock, no
   * iteration order that varies — so what the player SEES replays too, which is
   * what a shareable run recording depends on.
   */
  it('renders the identical screen twice for the same seed', () => {
    for (let seed = 1; seed <= 10; seed++) {
      const a = drive(seed, 'stirring').run
      const b = drive(seed, 'stirring').run
      const shape = (run: RunView): string[][] =>
        run.turns.map((t) => t.lines.map((l) => `${l.tone}|${l.text}`))

      expect(shape(a)).toEqual(shape(b))
      expect(a.state.actionLog).toEqual(b.state.actionLog)
      expect(a.state.outcome).toBe(b.state.outcome)
    }
  })

  /**
   * The menu is the engine's, verbatim (GDD 2.17).
   *
   * No renderer may build its own list, and none may show the full verb set
   * with the unavailable ones greyed out. The cheapest way to keep that true is
   * to assert the rendered menu IS `legalActions(state)` rather than anything
   * derived from it.
   */
  it('renders legalActions unchanged, with nothing added or filtered', () => {
    for (const difficulty of DIFFICULTIES) {
      for (let seed = 1; seed <= 12; seed++) {
        drive(seed, difficulty, (run) => {
          expect(run.menu).toEqual(legalActions(run.state))
        })
      }
    }
  })
})

describe('classic renderer — the doorways', () => {
  /**
   * The distinction darkness depends on.
   *
   * CLAUDE.md 3: darkness restricts the RANGE of tells, never their honesty. A
   * renderer that shows an out-of-range doorway the same way it shows a silent
   * one has broken that at the presentation layer without touching the engine —
   * the player reads "nothing" and takes it for safety. So: at Ember or below,
   * with a direction committed and no LISTEN just spent, exactly the facing
   * doorway is sensed; while Confused, none is.
   *
   * THE `listened` TERM IS NOT A TEST DETAIL. Writing this assertion without it
   * failed, and the renderer was right: LISTEN buys the full set back for one
   * turn (GDD 2.8.1), so the four doorways stay reported while the player is
   * choosing what to do with what they just paid a turn to learn. Drop the term
   * and the assertion asks the screen to throw that away one beat early.
   */
  it('separates "nothing is there" from "you cannot sense that far"', () => {
    let sawRestricted = 0
    let sawConfused = 0

    for (const difficulty of DIFFICULTIES) {
      for (let seed = 1; seed <= 30; seed++) {
        drive(seed, difficulty, (run, previous) => {
          const { player } = run.state
          const confused = (player.statuses.confused ?? 0) > 0
          const listened = previous?.kind === 'listen'
          const restricted =
            oilBandFor(player.oil).tellRange === 'facing' &&
            player.facing !== null &&
            !confused &&
            !listened
          const doors = doorways(run.state, run.tells, run.sensed)

          if (confused) {
            sawConfused += 1
            expect(doors.every((d) => !d.sensed)).toBe(true)
            // And it says WHICH silence this is. Confused is suppression on its
            // own clock (GDD 2.8.2); the lamp is range, bought back by LISTEN
            // (GDD 2.8.1). Reporting a Confused doorway as a lamp problem
            // points the player at the wrong lever.
            expect(doors.every((d) => d.unsensed === 'confused')).toBe(true)
          } else if (restricted) {
            sawRestricted += 1
            for (const door of doors) {
              expect(door.sensed).toBe(door.direction === player.facing)
              expect(door.unsensed).toBe(door.sensed ? null : 'range')
            }
          }

          // A tell may never appear on a doorway the player could not sense,
          // and `unsensed` is set on exactly the doorways that were not.
          for (const door of doors) {
            expect(door.unsensed === null).toBe(door.sensed)
            if (!door.sensed) expect(door.tells).toEqual([])
          }
        })
      }
    }

    // A vacuous pass is the failure mode here: both branches must be reached or
    // the assertions above proved nothing. This is the same lesson as 1f
    // finding 3 — a mutation that passes because the sweep never got there.
    expect(sawRestricted, 'the sweep never got the lamp down to Ember').toBeGreaterThan(0)
    expect(sawConfused, 'the sweep was never Confused').toBeGreaterThan(0)
  })

  /**
   * The other side of the carve-out above, asserted rather than assumed.
   *
   * GDD 2.8.1: "LISTEN reveals all four, truthfully, for the price of a turn.
   * Information costs turns; it never lies." That promise is only kept if the
   * four doorways are still reported on the screen where the player spends what
   * they learned — a panel that reverts the instant the turn resolves sells
   * them a line of scrollback instead of a decision.
   */
  it('shows all four doorways on the turn after a LISTEN, however low the lamp', () => {
    let checked = 0

    for (const difficulty of DIFFICULTIES) {
      for (let seed = 1; seed <= 30; seed++) {
        drive(seed, difficulty, (run, previous) => {
          if (previous?.kind !== 'listen') return
          if ((run.state.player.statuses.confused ?? 0) > 0) return
          const doors = doorways(run.state, run.tells, run.sensed)
          for (const door of doors) expect(door.sensed).toBe(true)
          if (oilBandFor(run.state.player.oil).tellRange === 'facing') checked += 1
        })
      }
    }

    expect(checked, 'the sweep never listened with the lamp at Ember or below').toBeGreaterThan(0)
  })

  it('lists a doorway for every exit and none for a wall', () => {
    for (let seed = 1; seed <= 20; seed++) {
      drive(seed, 'stirring', (run) => {
        const room = run.state.labyrinth.rooms[run.state.player.roomId]
        if (room === undefined) throw new Error(`no room ${run.state.player.roomId}`)
        const expected = DIRECTIONS.filter((d) => room.exits[d] !== undefined)
        expect(doorways(run.state, run.tells, run.sensed).map((d) => d.direction)).toEqual(expected)
      })
    }
  })

  /**
   * GDD 2.17: pallid violet and the stench it renders belong to the Wumpus
   * alone, and no second signal may compete for that register. `alarming` is
   * the renderer's one hook for that colour, so nothing else may set it.
   */
  it('marks a doorway alarming for the stench and for nothing else', () => {
    for (const difficulty of DIFFICULTIES) {
      for (let seed = 1; seed <= 20; seed++) {
        drive(seed, difficulty, (run) => {
          for (const door of doorways(run.state, run.tells, run.sensed)) {
            expect(door.alarming).toBe(door.tells.some((t) => t.kind === 'stench'))
          }
        })
      }
    }
  })
})

describe('classic renderer — the status line', () => {
  /**
   * GDD 2.17's chunking rules, as assertions rather than as a comment.
   *
   * Oil level and oil band are ONE fact. Conditional facts are absent rather
   * than present-and-empty, because a "Companion: none" row spends a slot of
   * the player's working memory to say nothing.
   */
  it('keeps oil to one chunk and omits what is not true', () => {
    for (let seed = 1; seed <= 20; seed++) {
      drive(seed, 'stirring', (run) => {
        const chunks = statusChunks(run.state)
        const labels = chunks.map((c) => c.label)

        expect(labels.filter((l) => l === 'Lamp')).toHaveLength(1)
        expect(labels).not.toContain('Oil band')
        expect(labels.slice(0, 4)).toEqual(['Turn', 'Lamp', 'Health', 'Fortune'])

        expect(labels.includes('Companion')).toBe(run.state.player.companion !== null)
        expect(labels.includes('Carrying')).toBe(run.state.player.carryingHeart)
        expect(labels.includes('Confused')).toBe((run.state.player.statuses.confused ?? 0) > 0)

        for (const chunk of chunks) expect(chunk.value.trim().length).toBeGreaterThan(0)
      })
    }
  })

  it('names every room it can put the player in, with no unfilled slot', () => {
    for (const difficulty of DIFFICULTIES) {
      for (let seed = 1; seed <= 20; seed++) {
        drive(seed, difficulty, (run) => {
          const view = roomView(run.state)
          expect(view.heading.trim().length).toBeGreaterThan(0)
          expect(view.heading).not.toMatch(/[{}]/)
        })
      }
    }
  })
})

describe('eventsToLines', () => {
  it('drops the senses from the string projection AgentView.log wants', () => {
    const { run } = drive(7, 'stirring')
    for (const turn of run.turns) {
      const strings = toStrings(turn.lines)
      for (const line of turn.lines) {
        if (line.tone === 'tell') expect(strings).not.toContain(line.text)
      }
    }
  })

  /**
   * The projection is exhaustive over `GameEvent` and ends in a `never` check,
   * so a new event kind is a compile error rather than a fact that silently
   * stops reaching the player — the direction of text-parity failure 1f found
   * three of. This asserts the runtime half: an unknown kind throws rather than
   * being quietly skipped.
   */
  it('throws on an event kind it does not know', () => {
    const run = startRun(1, { difficulty: 'stirring' })
    const bogus = { kind: 'somethingNew' } as unknown as GameEvent
    expect(() => eventsToLines([bogus], run.state.labyrinth)).toThrow(/unhandled event/)
  })

  it('never ships an unfilled prose slot to the screen', () => {
    for (const difficulty of DIFFICULTIES) {
      for (let seed = 1; seed <= 15; seed++) {
        const { run } = drive(seed, difficulty)
        for (const turn of run.turns) {
          for (const line of turn.lines) {
            expect(line.text, `slot leaked: ${line.text}`).not.toMatch(/\{[a-zA-Z]+\}/)
          }
        }
      }
    }
  })
})
