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

import type {
  Action,
  ActionKind,
  CreatureKind,
  Difficulty,
  Direction,
  GameEvent,
  GameState,
  RunOutcome,
} from '../src/engine/types.ts'
import { BAND_ORDER, DIRECTIONS } from '../src/engine/types.ts'
import { ACTION_LABEL, applyAction, legalActions } from '../src/engine/resolve.ts'
import { COMPANION_FREE_VERB, companionWaivesOil } from '../src/engine/data/tuning.ts'
import { CREATURE_WORD } from '../src/engine/data/outcomes.ts'
import type { LegalAction } from '../src/engine/resolve.ts'
import { rngFromState } from '../src/engine/rng.ts'
import { eventsToLines, toStrings } from '../src/classic/lines.ts'
import {
  actionForDirection,
  chartedMap,
  doorways,
  roomView,
  statusChunks,
  waivedVerb,
  wayBack,
} from '../src/classic/view.ts'
import type { MapCell } from '../src/classic/view.ts'
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

/** A chart as one comparable string, for the Wumpus-leak assertion. */
function flatten(rows: MapCell[][] | null): string {
  if (rows === null) return ''
  return rows.map((r) => r.map((c) => `${c.kind}:${c.ch}`).join('')).join('\n')
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
  it('separates "nothing is there" from "you have not looked"', () => {
    let sawUnresolved = 0
    let sawConfused = 0
    let sawEmpty = 0

    for (const difficulty of DIFFICULTIES) {
      for (let seed = 1; seed <= 30; seed++) {
        drive(seed, difficulty, (run) => {
          const { player } = run.state
          const confused = (player.statuses.confused ?? 0) > 0
          const doors = doorways(run.state, run.senses)

          if (confused) {
            sawConfused += 1
            expect(doors.every((d) => !d.sensed)).toBe(true)
            // And it says WHICH silence this is. Confused is suppression on its
            // own clock (GDD 2.8.2); an unresolved doorway is something you can
            // buy with a turn (GDD 2.7). Reporting one as the other points the
            // player at a lever that will not move.
            expect(doors.every((d) => d.unsensed === 'confused')).toBe(true)
            return
          }

          for (const door of doors) {
            if (door.unsensed === 'unresolved') {
              sawUnresolved += 1
              // An unresolved doorway names nothing it has not paid for. The
              // one exception is the stench, which is exempt from FOCUS
              // entirely (GDD 2.8.1) and may appear alongside.
              expect(door.tells.every((t) => t.kind === 'stench')).toBe(true)
            } else if (door.sensed && door.tells.length === 0) {
              sawEmpty += 1
            }
            expect(door.unsensed === null).toBe(door.sensed)
          }
        })
      }
    }

    // All three states have to actually occur, or the test is asserting about
    // a case the sweep never produced — which is how the grellhound mutation
    // check in `tests/outcomes.test.ts` came to pass for the wrong reason.
    expect(sawConfused, 'the sweep was never Confused').toBeGreaterThan(0)
    expect(sawUnresolved, 'the sweep never met an unresolved doorway').toBeGreaterThan(0)
    expect(sawEmpty, 'the sweep never met a doorway with nothing behind it').toBeGreaterThan(0)
  })

  /**
   * SILENCE IS A FACT NOW, and this is the test that says so.
   *
   * Under the old model an empty doorway and an out-of-range one looked alike
   * often enough that "nothing" carried almost no weight. The lamp is honest
   * about presence now, so a doorway reporting nothing is a complete answer
   * about that doorway — and it is the only thing on the panel a player can act
   * on without spending a turn first.
   */
  it('never reports an empty doorway as unresolved, or a full one as empty', () => {
    for (const difficulty of DIFFICULTIES) {
      for (let seed = 1; seed <= 20; seed++) {
        drive(seed, difficulty, (run) => {
          if ((run.state.player.statuses.confused ?? 0) > 0) return
          const room = run.state.labyrinth.rooms[run.state.player.roomId]!
          for (const door of doorways(run.state, run.senses)) {
            const beyond = run.state.labyrinth.rooms[room.exits[door.direction]!]!
            const somethingThere =
              (beyond.hazard !== null && !beyond.hazardCleared) ||
              beyond.creature !== null ||
              (beyond.hasHeart && !run.state.player.carryingHeart)
            if (!somethingThere) {
              expect(door.unsensed, `${door.direction} is empty and must say so`).toBeNull()
              expect(door.tells.filter((t) => t.kind !== 'stench')).toHaveLength(0)
            }
          }
        })
      }
    }
  })

  /**
   * THE STENCH IS NEVER HIDDEN BEHIND THE UNRESOLVED MARKER.
   *
   * The Wumpus's tell is exempt from the FOCUS economy (GDD 2.8.1), so a
   * doorway can carry a resolved stench AND an unresolved remainder at once.
   * The renderer prints the tells before the marker for exactly this reason: a
   * chain that showed "unresolved" first would swallow the one tell CLAUDE.md 3
   * says may never be hidden, on the turns it matters most.
   */
  it('shows the stench even on a doorway nothing has resolved', () => {
    let checked = 0
    for (const difficulty of DIFFICULTIES) {
      for (let seed = 1; seed <= 30; seed++) {
        drive(seed, difficulty, (run) => {
          for (const door of doorways(run.state, run.senses)) {
            if (door.tells.some((t) => t.kind === 'stench')) {
              checked += 1
              expect(door.alarming).toBe(true)
            }
          }
        })
      }
    }
    expect(checked, 'the sweep never got within two rooms of the Wumpus').toBeGreaterThan(0)
  })

  it('lists a doorway for every exit and none for a wall', () => {
    for (let seed = 1; seed <= 20; seed++) {
      drive(seed, 'stirring', (run) => {
        const room = run.state.labyrinth.rooms[run.state.player.roomId]
        if (room === undefined) throw new Error(`no room ${run.state.player.roomId}`)
        const expected = DIRECTIONS.filter((d) => room.exits[d] !== undefined)
        expect(doorways(run.state, run.senses).map((d) => d.direction)).toEqual(expected)
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
          for (const door of doorways(run.state, run.senses)) {
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
        // HEALTH IS GONE FROM THE LINE, 18 Sep 2026 (GDD 2.6, 2.17). The status
        // budget was already over its seven-item limit before this step, so a
        // fact removed is a slot returned — and asserted here so that nothing
        // quietly takes the space back without someone deciding it should.
        expect(labels).not.toContain('Health')
        expect(labels.slice(0, 3)).toEqual(['Turn', 'Lamp', 'Fortune'])

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

describe('classic renderer — the charted map', () => {
  it('is drawn on the two lower difficulties and withheld on the two higher ones', () => {
    for (const difficulty of DIFFICULTIES) {
      const run = startRun(11, { difficulty })
      const chart = chartedMap(run.state)
      const expected = difficulty === 'drowsing' || difficulty === 'stirring'
      expect(chart !== null, `${difficulty}`).toBe(expected)
    }
  })

  /**
   * MUTATION-CHECKED, and the assertion the whole feature hangs on.
   *
   * `docs/EVALS.md` makes 1j prove an agent cannot see through walls; a map is
   * the most direct way a HUMAN renderer could. So: the map is a pure function
   * of the labyrinth and where the player is standing. Move the Wumpus to every
   * room in the labyrinth in turn and the drawing must not change by one
   * character — which it cannot, if nothing in `chartedMap` ever reads
   * `state.wumpus`. Add a `W` to it and this fails on the first seed.
   */
  it('does not change by one character when the Wumpus moves', () => {
    for (let seed = 1; seed <= 10; seed++) {
      let run = startRun(seed, { difficulty: 'stirring' })
      // Walk a little first, so there is a charted area to leak into.
      for (let i = 0; i < 6 && run.state.outcome === 'inProgress'; i++) {
        const entry = run.menu[pick(run.menu.length, seed, i)]
        if (entry === undefined) break
        run = takeAction(run, entry.action)
      }

      const baseline = flatten(chartedMap(run.state))
      for (const roomId of Object.keys(run.state.labyrinth.rooms)) {
        const moved = {
          ...run.state,
          wumpus: { ...run.state.wumpus, roomId },
        }
        expect(flatten(chartedMap(moved)), `leaked with the Wumpus in ${roomId}`).toBe(baseline)
      }
    }
  })

  /**
   * The other half of the same rule: nothing an unvisited room CONTAINS may
   * appear. A room you have never entered is either blank, or — if you have
   * stood next to it and seen its doorway — a lead. Never its hazard, never its
   * creature, never the Heart.
   */
  it('never draws the contents of a room the player has not entered', () => {
    for (const difficulty of ['drowsing', 'stirring'] as const) {
      for (let seed = 1; seed <= 15; seed++) {
        drive(seed, difficulty, (run) => {
          const chart = chartedMap(run.state)
          if (chart === null) throw new Error('expected a chart')
          const { labyrinth, player } = run.state

          for (const room of Object.values(labyrinth.rooms)) {
            if (room.visited || room.id === player.roomId) continue
            const cell = chart[room.y * 2]?.[room.x * 2]
            if (cell === undefined) continue
            expect(['blank', 'lead'], `${room.id} showed ${cell.kind}`).toContain(cell.kind)
            expect([' ', '?']).toContain(cell.ch)
          }

          // And the Heart's room specifically, which is the one worth cheating
          // at: drawn only once it has been stood in.
          const heart = labyrinth.rooms[labyrinth.heartRoomId]
          if (heart !== undefined && !heart.visited) {
            const cell = chart[heart.y * 2]?.[heart.x * 2]
            expect(cell?.kind).not.toBe('heart')
          }
        })
      }
    }
  })

  it('always puts the player somewhere on the map, exactly once', () => {
    for (let seed = 1; seed <= 15; seed++) {
      drive(seed, 'drowsing', (run) => {
        const chart = chartedMap(run.state)
        if (chart === null) throw new Error('expected a chart')
        const players = chart.flat().filter((c) => c.kind === 'player')
        expect(players).toHaveLength(1)
      })
    }
  })
})

describe('classic renderer — getting around', () => {
  /**
   * The way back is the opposite of the way you came, and only when there is a
   * door there. Null on turn 1, because nothing has moved yet.
   */
  it('marks the doorway you came in by, and only that one', () => {
    const opposite: Record<Direction, Direction> = { N: 'S', E: 'W', S: 'N', W: 'E' }

    for (const difficulty of DIFFICULTIES) {
      for (let seed = 1; seed <= 15; seed++) {
        expect(wayBack(startRun(seed, { difficulty }).state)).toBeNull()

        drive(seed, difficulty, (run) => {
          const { player, labyrinth } = run.state
          const back = wayBack(run.state)
          const room = labyrinth.rooms[player.roomId]
          if (room === undefined) throw new Error('no room')

          if (player.facing === null) {
            expect(back).toBeNull()
          } else {
            const reverse = opposite[player.facing]
            expect(back).toBe(room.exits[reverse] === undefined ? null : reverse)
          }

          // At most one doorway is ever the way back.
          const marked = doorways(run.state, run.senses).filter((d) => d.wayBack)
          expect(marked.length).toBeLessThanOrEqual(1)
        })
      }
    }
  })

  /**
   * The direction keys resolve to an action the engine already offered, or to
   * nothing at all. A key that could invent an action would be a renderer
   * building its own menu (GDD 2.17).
   */
  it('binds a direction only to an action legalActions already returned', () => {
    let resolved = 0
    for (const difficulty of DIFFICULTIES) {
      for (let seed = 1; seed <= 15; seed++) {
        drive(seed, difficulty, (run) => {
          for (const direction of DIRECTIONS) {
            const action = actionForDirection(run.menu, direction)
            if (action === null) continue
            resolved += 1
            expect(run.menu.map((e) => e.action)).toContainEqual(action)
            expect('direction' in action && action.direction).toBe(direction)
          }
        })
      }
    }
    expect(resolved, 'no direction key ever resolved').toBeGreaterThan(100)
  })

  /**
   * MUTATION-CHECKED — but only after it was rebuilt, and the first version is
   * the more useful story.
   *
   * A sent companion never comes back (CLAUDE.md 3), so a direction key must
   * never be able to fire SEND. Written first as a sweep, this PASSED when the
   * `kind !== 'send'` filter was deliberately removed — because SEND needs a
   * brave companion, the scripted policy never tames on purpose, and 1g already
   * measured SEND firing in ~0.5% of runs. The mutation was unreachable, which
   * is the identical trap as 1f finding 3 and 1g's unmeasured FIGHT reward.
   *
   * So the companion is placed by hand. `GameState` is plain JSON (CLAUDE.md
   * 2.5), which is exactly what makes a state like this constructible without a
   * fixture library — and the assertion below now fails when the filter goes.
   */
  it('never binds a direction key to SEND', () => {
    // In today's engine SEND always arrives alongside a MOVE — `canSend`
    // requires a doorway, and `legalActions` offers a MOVE through every
    // doorway — so the MOVE preference alone already hides it, and a sweep
    // cannot distinguish the two guards. The menu is therefore built by hand,
    // to test what the filter is actually for: the day SEND turns up without
    // its MOVE, the fallback must still refuse it.
    const sendOnly: LegalAction[] = [
      { action: { kind: 'send', direction: 'N' }, label: 'Send the goblin N', dc: 5 },
      { action: { kind: 'rest' }, label: 'Rest', dc: 5 },
    ]
    expect(actionForDirection(sendOnly, 'N')).toBeNull()

    // And with the MOVE present, the key means the move — not the send.
    const both: LegalAction[] = [
      { action: { kind: 'send', direction: 'N' }, label: 'Send the goblin N', dc: 5 },
      { action: { kind: 'move', direction: 'N' }, label: 'Move north', dc: 5 },
    ]
    expect(actionForDirection(both, 'N')?.kind).toBe('move')

    // FOCUS is directional too as of 1i, and the MOVE preference is what keeps
    // a compass key meaning "walk" rather than sometimes meaning "look". A key
    // that walks must not occasionally spend the turn on something else.
    const moveAndFocus: LegalAction[] = [
      { action: { kind: 'focus', direction: 'N' }, label: 'Focus north', dc: 5 },
      { action: { kind: 'move', direction: 'N' }, label: 'Move north', dc: 5 },
    ]
    expect(actionForDirection(moveAndFocus, 'N')?.kind).toBe('move')

    // A live state, for the co-occurrence claim above rather than for the guard.
    let checked = 0
    for (let seed = 1; seed <= 40 && checked < 3; seed++) {
      const base = startRun(seed, { difficulty: 'stirring' })
      const armed: GameState = {
        ...base.state,
        player: {
          ...base.state.player,
          companion: { kind: 'goblin', brave: true, skittish: false },
        },
      }
      const menu = legalActions(armed)
      for (const entry of menu.filter((e) => e.action.kind === 'send')) {
        if (!('direction' in entry.action)) continue
        const sentWay: Direction = entry.action.direction
        checked += 1
        expect(
          menu.some(
            (e) =>
              e.action.kind === 'move' &&
              'direction' in e.action &&
              e.action.direction === sentWay,
          ),
          'SEND was offered without a MOVE — the hand-built case above is now live',
        ).toBe(true)
      }
    }
    expect(checked, 'never built a state where SEND was on the menu').toBeGreaterThan(0)
  })

  /**
   * The display rule from 1f finding 2: MOVE and FOCUS have no banded
   * consequence above a critical failure — the band moves what the action COST
   * and nothing about what it produced — so their breakdown panel is noise. The
   * roll still happens and still reaches the log; this is about which panel
   * opens.
   *
   * IT SAID `listen` UNTIL 1i PART 2 AND PASSED THE WHOLE TIME, which is the
   * part worth recording. `LISTEN` was retired in part 1, so the second half of
   * the `||` matched nothing a renderer could ever be handed and every FOCUS
   * fell through to the `else` branch — which asserts the opposite, and held,
   * because `INERT_ABOVE_CRIT_FAIL` was equally stale. The test agreed with the
   * constant it was checking rather than with the game. The `focuses` counter
   * is what stops that recurring: the sweep now has to have SEEN a FOCUS roll
   * before its verdict on FOCUS rolls means anything.
   */
  it('marks a MOVE or FOCUS roll inconsequential unless it critically failed', () => {
    let inert = 0
    let loud = 0
    let focuses = 0
    for (const difficulty of DIFFICULTIES) {
      for (let seed = 1; seed <= 20; seed++) {
        const { run } = drive(seed, difficulty)
        for (const turn of run.turns) {
          const roll = turn.roll
          if (roll === null) continue
          if (roll.action === 'focus') focuses += 1
          if (roll.action === 'move' || roll.action === 'focus') {
            const isCrit = roll.band === 'criticalFailure'
            expect(roll.consequential).toBe(isCrit)
            if (isCrit) loud += 1
            else inert += 1
          } else {
            expect(roll.consequential).toBe(true)
          }
        }
      }
    }
    expect(inert, 'never saw an ordinary walk').toBeGreaterThan(50)
    expect(loud, 'never saw a clumsy one').toBeGreaterThan(0)
    expect(focuses, 'the sweep never focused — the FOCUS half asserts nothing').toBeGreaterThan(0)
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

/**
 * Every `ActionKind`, guarded in both directions — the `as const` matters, and
 * `tests/tuning.test.ts` carries the scar explaining why (annotating this as
 * `readonly ActionKind[]` makes the assertion below read `ActionKind extends
 * ActionKind` and hold whatever the list contains).
 */
const ALL_ACTION_KINDS = [
  'move', 'focus', 'search', 'force', 'endure', 'avoid', 'dodge', 'disarm', 'sneak',
  'fight', 'tame', 'flee', 'use', 'send', 'enterPortal', 'rest', 'dropHeart',
] as const
type _KindsCovered = ActionKind extends (typeof ALL_ACTION_KINDS)[number] ? true : never
const _kindsCovered: _KindsCovered = true
void _kindsCovered
const _kindsReal: readonly ActionKind[] = ALL_ACTION_KINDS
void _kindsReal

describe('classic renderer — the companion oil discount', () => {
  /**
   * The discount was invisible until the legibility pass: `oilCostWith` waived
   * the charge and nothing on screen said so, so a player who tamed a lumewing
   * could only learn that FOCUS was free by noticing the oil number had not
   * moved. Two surfaces now say it, and the point of these assertions is that
   * both read the same table the reducer charges from.
   */
  const CREATURES: readonly CreatureKind[] = ['goblin', 'lumewing', 'grellhound', 'quietOne']

  function withCompanion(seed: number, kind: CreatureKind): GameState {
    const base = startRun(seed, { difficulty: 'stirring' })
    return {
      ...base.state,
      player: { ...base.state.player, companion: { kind, brave: false, skittish: false } },
    }
  }

  it('reports exactly what COMPANION_FREE_VERB says, for every creature', () => {
    expect(waivedVerb(startRun(1, { difficulty: 'stirring' }).state)).toBeNull()

    for (const kind of CREATURES) {
      const state = withCompanion(1, kind)
      const expected = COMPANION_FREE_VERB[kind] ?? null
      expect(waivedVerb(state), `${kind}`).toBe(expected)
      // And it agrees with the function the reducer actually charges through.
      for (const action of ALL_ACTION_KINDS) {
        expect(companionWaivesOil(kind, action), `${kind}/${action}`).toBe(
          expected !== null && action === expected,
        )
      }
    }
  })

  /**
   * MUTATION-CHECKED. Naming the verb on the Companion row is what makes the
   * buff discoverable at the moment it is acquired — "is this worth keeping".
   * A companion with no waiver must not grow a row that implies one.
   */
  it('names the waived verb on the Companion row, and only when there is one', () => {
    for (const kind of CREATURES) {
      const chunks = statusChunks(withCompanion(3, kind))
      const row = chunks.find((c) => c.label === 'Companion')
      expect(row, `${kind} had no Companion row`).toBeDefined()

      const free = COMPANION_FREE_VERB[kind]
      if (free === undefined) {
        expect(row?.value, `${kind}`).not.toMatch(/free/i)
      } else {
        expect(row?.value, `${kind}`).toContain(`free ${ACTION_LABEL[free]}`)
      }
      // The creature is always named first, waiver or not.
      expect(row?.value.startsWith(CREATURE_WORD[kind])).toBe(true)
    }

    // No companion, no row at all — the status budget does not spend a slot to
    // say "none" (GDD 2.17).
    expect(
      statusChunks(startRun(3, { difficulty: 'stirring' }).state).some(
        (c) => c.label === 'Companion',
      ),
    ).toBe(false)
  })

  /**
   * MUTATION-CHECKED. The menu marker is the other half: the status line says
   * the companion waives a verb, this says which entry in front of you is the
   * one. Asserted through `legalActions` rather than a hand-built menu, so it
   * is the real list the screen renders.
   */
  it('marks the waived entry in a real menu, and marks nothing else', () => {
    let seenWaived = 0

    for (const kind of CREATURES) {
      for (let seed = 1; seed <= 25; seed++) {
        const state = withCompanion(seed, kind)
        const waived = waivedVerb(state)
        for (const entry of legalActions(state)) {
          const marked = waived !== null && entry.action.kind === waived
          // The marker fires exactly where the reducer waives the charge.
          expect(
            marked,
            `${kind} seed ${seed}: ${entry.label} marked=${marked}`,
          ).toBe(companionWaivesOil(kind, entry.action.kind))
          if (marked) seenWaived += 1
        }
      }
    }

    // A vacuous pass is the failure mode: if no menu ever contained a waived
    // verb the loop above proved nothing. FOCUS is in every unobstructed room's
    // menu, so a lumewing sweep must find plenty.
    expect(seenWaived, 'no waived entry ever appeared in a menu').toBeGreaterThan(20)
  })

  /**
   * The waiver is a property of the companion, not of the turn. 1i part 2 made
   * it flat at every band precisely so there is no state where the companion
   * waives a verb and the action still charges — so the screen may state it
   * unconditionally without ever being wrong.
   */
  it('never disagrees with the price the reducer charges, at any band', () => {
    for (const kind of CREATURES) {
      const free = COMPANION_FREE_VERB[kind]
      if (free === undefined) continue
      for (const band of BAND_ORDER) {
        expect(companionWaivesOil(kind, free), `${kind} at ${band}`).toBe(true)
      }
    }
  })
})
