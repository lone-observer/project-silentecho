/**
 * Classic mode — the text renderer. GDD 2.14.
 *
 * A shipping feature, not a dev harness (CLAUDE.md 1): this is the whole of
 * what goes free to itch.io at week 6. It renders the five things GDD 2.14
 * names — room description, directional tells listed per doorway, a numbered
 * action menu, the roll breakdown, an event log — and nothing the engine did
 * not say.
 *
 * TWO RULES IT DOES NOT BEND:
 *
 *  - **It writes no prose.** Every sentence on the screen came out of
 *    `data/outcomes.ts` on a `GameEvent`. If a state has no line, that is a
 *    missing beat in the table and it gets flagged, not papered over with a
 *    string typed in here.
 *  - **It builds no menu.** `legalActions` is computed in the engine and
 *    rendered verbatim, numbered. Nothing is shown greyed out — GDD 2.17 is
 *    explicit that a menu of thirteen where three apply costs the player a
 *    menu of thirteen.
 */

import { useCallback, useEffect, useMemo, useRef } from 'react'

import type { Action } from '../engine/types.ts'
import type { LegalAction } from '../engine/resolve.ts'
import { useRun } from '../state/run.ts'
import type { RunView, TurnRecord } from '../state/run.ts'
import { doorways, isWin, OUTCOME_LABEL, roomView, statusChunks } from './view.ts'
import type { DoorwayView, RollView, StatusChunk, UnsensedReason } from './view.ts'
import './classic.css'

/**
 * Menu keys: 1-9, then A-D. Thirteen is the most verbs that can ever be legal
 * at once, and a key the player can type is what makes this a menu rather than
 * a row of buttons — the 1973 original and Oregon Trail are both played from
 * the number row.
 */
const MENU_KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'A', 'B', 'C', 'D'] as const

function keyFor(index: number): string | null {
  return MENU_KEYS[index] ?? null
}

// ---------------------------------------------------------------------------

export function Classic({ run }: { run: RunView }): React.JSX.Element {
  const act = useRun((s) => s.act)
  const ended = run.state.outcome !== 'inProgress'

  const room = useMemo(() => roomView(run.state), [run.state])
  const doors = useMemo(
    () => doorways(run.state, run.tells, run.sensed),
    [run.state, run.tells, run.sensed],
  )
  const chunks = useMemo(() => statusChunks(run.state), [run.state])
  const lastRoll = useMemo(() => lastRollOf(run.turns), [run.turns])

  const choose = useCallback((action: Action) => act(action), [act])

  // The number row drives the menu. Bound on the window rather than on a
  // focused element so the player never has to click into anything first.
  useEffect(() => {
    if (ended) return
    function onKey(event: KeyboardEvent): void {
      if (event.metaKey || event.ctrlKey || event.altKey) return
      const target = event.target
      if (target instanceof HTMLInputElement || target instanceof HTMLSelectElement) return
      const index = MENU_KEYS.indexOf(event.key.toUpperCase() as (typeof MENU_KEYS)[number])
      if (index === -1) return
      const entry = run.menu[index]
      if (entry === undefined) return
      event.preventDefault()
      choose(entry.action)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [run.menu, choose, ended])

  return (
    <div className="classic">
      <header className="masthead">
        <h1>Silent Echo · classic</h1>
        <span className="run-id">
          seed {run.seed} · {run.difficulty}
        </span>
      </header>

      <Status chunks={chunks} />

      <div className="columns">
        <div>
          <section className="panel">
            <h2>Where you are</h2>
            <p className="room-heading">
              {room.heading}
              {room.isEntrance && <span className="entrance">the way out</span>}
            </p>
          </section>

          {/*
            Hidden once the run is over, and that is a correctness fix rather
            than tidiness. A finished run has no standing senses — `takeAction`
            carries none forward — so every doorway would render as "beyond your
            senses", which reads as the lamp having failed. Found by playing a
            run to a catch at Lamp 6, where the panel claimed the player could
            not sense a thing through a perfectly bright doorway.
          */}
          {!ended && (
            <section className="panel">
              <h2>Doorways</h2>
              <Doorways doors={doors} />
            </section>
          )}

          {/*
            The heading names the action, because during an encounter or a
            hazard this panel is showing the roll for the MOVE that walked you
            in, not for the choice you are about to make — and a breakdown you
            cannot attribute is a breakdown you cannot learn from.
          */}
          {lastRoll !== null && (
            <section className="panel roll">
              <h2>The roll · {lastRoll.action}</h2>
              <Roll roll={lastRoll} />
            </section>
          )}

          <section className="panel">
            <h2>{ended ? 'The run is over' : 'What do you do?'}</h2>
            {ended ? <Ending run={run} /> : <Menu menu={run.menu} onChoose={choose} />}
          </section>
        </div>

        <section className="panel log-panel">
          <h2>Log</h2>
          <Log turns={run.turns} />
        </section>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------

function Status({ chunks }: { chunks: readonly StatusChunk[] }): React.JSX.Element {
  return (
    <div className="status">
      {chunks.map((chunk) => (
        <span key={chunk.label} className={`chunk ${chunk.tone}`}>
          <span className="label">{chunk.label}</span>
          <span className="value">{chunk.value}</span>
        </span>
      ))}
    </div>
  )
}

/**
 * The four words this renderer writes about the world, and why.
 *
 * THESE ARE THE ONLY RENDERER-AUTHORED DESCRIPTIONS IN CLASSIC MODE and they
 * are here because the engine cannot currently say either of them: `tellsFor`
 * returns the tells it found and nothing about the ones it did not look for, so
 * "there is nothing through that door", "your lamp does not reach that far" and
 * "you are too confused to tell" all arrive at every renderer as the same
 * absence. The distinction is load-bearing (see `DoorwayView.sensed`), so it has
 * to be made somewhere, and until the engine emits the sensed set this is the
 * only place it can be. Written up in PHASE-1-PROGRESS as an engine gap rather
 * than left as a comment nobody reads.
 *
 * Kept deliberately flat and label-like. They are not trying to be the game's
 * voice; the game's voice is in `data/outcomes.ts` and stays there.
 */
const UNSENSED_TEXT: Record<UnsensedReason, string> = {
  range: 'beyond your lamp',
  confused: 'you cannot tell',
}

const NOTHING_TEXT = 'nothing'

/**
 * Tells, attached to the doorway they come through (GDD 2.17).
 *
 * Proximity by construction: the engine keys a `Tell` by direction, so the fact
 * arrives already attached to the thing it concerns and no renderer has to
 * remember to put it there.
 */
function Doorways({ doors }: { doors: readonly DoorwayView[] }): React.JSX.Element {
  return (
    <ul className="doorways">
      {doors.map((door) => (
        <li key={door.direction} className={door.alarming ? 'alarming' : undefined}>
          <span className="dir">{door.word}</span>
          {door.unsensed !== null ? (
            <span className="unsensed">{UNSENSED_TEXT[door.unsensed]}</span>
          ) : door.tells.length === 0 ? (
            <span className="quiet">{NOTHING_TEXT}</span>
          ) : (
            <span className="sense">{door.tells.map((t) => t.text).join('; ')}</span>
          )}
        </li>
      ))}
    </ul>
  )
}

/**
 * Every modifier as its own term, never summed away. CLAUDE.md 4 requires the
 * engine to label them and this is the only screen where that label is visible.
 */
function Roll({ roll }: { roll: RollView }): React.JSX.Element {
  return (
    <>
      <div className="sum">
        <span className="die">d20 {roll.natural}</span>
        {/*
          Separated by a middot, NOT by a leading "+". Each modifier already
          carries its own sign, so a plus in front of a negative one renders as
          "+ Agility −1" — which is what this did until a played run put it on
          screen. The log line got this right from the start; the two agree now.
        */}
        {roll.parts.map((part, i) => (
          <span key={`${part.source}-${i}`} className="mod">
            <span className="op">·</span> <span className="src">{part.source}</span> {part.value}
          </span>
        ))}
        <span className="op">=</span>
        <span>{roll.total}</span>
        <span className="op">vs</span>
        <span>DC {roll.dc}</span>
      </div>
      <div className={`verdict${roll.bad ? ' bad' : ''}`}>
        <span className="band">{roll.bandLabel}</span>{' '}
        <span className="margin">
          margin {roll.margin >= 0 ? `+${roll.margin}` : `−${Math.abs(roll.margin)}`}
        </span>
      </div>
      {roll.overridden && <div className="flag">the natural die overrode the margin</div>}
      {roll.fortuneUsed !== null && <div className="flag">Fortune spent: {roll.fortuneUsed}</div>}
    </>
  )
}

function Menu({
  menu,
  onChoose,
}: {
  menu: readonly LegalAction[]
  onChoose: (action: Action) => void
}): React.JSX.Element {
  return (
    <ul className="menu">
      {menu.map((entry, index) => {
        const key = keyFor(index)
        return (
          <li key={`${entry.label}-${index}`}>
            <button type="button" onClick={() => onChoose(entry.action)}>
              <span className="key">{key ?? '·'}</span>
              <span className="label">{entry.label}</span>
              {entry.dc !== undefined && <span className="dc">DC {entry.dc}</span>}
            </button>
          </li>
        )
      })}
    </ul>
  )
}

/**
 * The scrollback, grouped by turn.
 *
 * Tell lines are filtered out: they are the same four facts the doorway panel
 * already shows, re-stated every turn, and printing them here would bury the
 * narration four lines deep per turn. `eventsToLines` still produces them so
 * the projection stays total over the event union and `AgentView.log` can make
 * its own choice.
 */
function Log({ turns }: { turns: readonly TurnRecord[] }): React.JSX.Element {
  const endRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'end' })
  }, [turns.length])

  return (
    <div className="log">
      {turns.map((turn, i) => {
        const lines = turn.lines.filter((line) => line.tone !== 'tell')
        return (
          <div className="turn" key={`${turn.n}-${i}`}>
            <div className="turn-head">
              {turn.action === null ? turn.label : `${turn.n} · ${turn.label}`}
            </div>
            {lines.map((line, j) => (
              <p key={j} className={`tone-${line.tone}`}>
                {line.text}
              </p>
            ))}
          </div>
        )
      })}
      <div ref={endRef} />
    </div>
  )
}

/**
 * How a run closes.
 *
 * The last LINE of the run is the ending beat the engine emitted, and it is
 * already the final entry in the log — GDD 2.17 calls it the thing the player
 * remembers, so it is repeated here at size rather than left to scroll. What
 * this panel adds around it is the outcome name, the turn count, and the run
 * record: `seed + actionLog` replays it exactly (CLAUDE.md 2.2).
 *
 * There is no epitaph and the ending is not archetype-aware. Both are real gaps
 * (GDD 2.16, 2.17), both scheduled, and 1h renders what exists rather than
 * inventing richness the engine cannot back.
 */
function Ending({ run }: { run: RunView }): React.JSX.Element {
  const start = useRun((s) => s.start)
  const quit = useRun((s) => s.quit)
  const last = run.turns[run.turns.length - 1]
  const closing = last?.lines.filter((l) => l.tone === 'narration').at(-1) ?? null
  /*
    HOW LONG THE RUN LASTED, not what `state.turn` reads now. `finish` advances
    the clock by the action's turn cost before it commits (1e), so a run that
    ended on turn 14 leaves `state.turn` at 15 — and an ending panel saying
    "turn 15 of 20" next to a log whose last entry is "14 · Move S" is the
    renderer contradicting itself. Found by playing, not by a test.
  */
  const lasted = last?.n ?? run.state.turn
  const record = JSON.stringify(
    { seed: run.seed, difficulty: run.difficulty, actionLog: run.state.actionLog },
    null,
    0,
  )

  return (
    <>
      {closing !== null && <p className="ending-line">{closing.text}</p>}
      <p>
        <strong style={{ color: isWin(run.state.outcome) ? 'var(--amber)' : undefined }}>
          {OUTCOME_LABEL[run.state.outcome]}
        </strong>{' '}
        · lasted {lasted} turn{lasted === 1 ? '' : 's'} of {run.state.maxTurns}
      </p>
      <div className="actions">
        <button
          type="button"
          className="primary"
          onClick={() => start(randomSeed(), { difficulty: run.difficulty })}
        >
          Another run
        </button>
        <button type="button" onClick={() => start(run.seed, { difficulty: run.difficulty })}>
          Same labyrinth again
        </button>
        <button type="button" onClick={quit}>
          Back to the title
        </button>
      </div>
      <details className="replay">
        <summary>Run record</summary>
        <pre>{record}</pre>
      </details>
    </>
  )
}

// ---------------------------------------------------------------------------

function lastRollOf(turns: readonly TurnRecord[]): RollView | null {
  for (let i = turns.length - 1; i >= 0; i--) {
    const roll = turns[i]?.roll
    if (roll != null) return roll
  }
  return null
}

/**
 * A seed for a fresh run. `Math.random` is fine HERE and nowhere below this
 * layer — CLAUDE.md 2.1 bans ambient randomness from the engine, and the seed
 * is the one number chosen outside it.
 */
export function randomSeed(): number {
  return Math.floor(Math.random() * 1_000_000)
}
