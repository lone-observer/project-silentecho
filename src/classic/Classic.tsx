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

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import type { Action, ActionKind, Direction } from '../engine/types.ts'
import type { LegalAction } from '../engine/resolve.ts'
import { RUN_INTRO } from '../engine/data/outcomes.ts'
import { useRun } from '../state/run.ts'
import type { RunView, TurnRecord } from '../state/run.ts'
import {
  actionForDirection,
  chartedMap,
  doorways,
  isWin,
  OUTCOME_LABEL,
  roomView,
  listedEntries,
  padCells,
  statusChunks,
  verbButtons,
  waivedVerb,
  wayBack,
} from './view.ts'
import type {
  DoorwayView,
  MapCell,
  PadCell,
  PadMode,
  RollView,
  StatusChunk,
  UnsensedReason,
  VerbButton,
} from './view.ts'
import { num } from './labels.ts'
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

/**
 * WASD and the arrow keys, bound to the compass rather than to a menu slot.
 *
 * WHY THIS IS NOT A SECOND MENU. GDD 2.17 forbids a renderer building its own
 * action list, and this does not: it looks up an entry that `legalActions`
 * already returned and fires that entry's action unchanged. A direction with no
 * legal action does nothing — which is correct, and is what makes a hazard
 * menu feel like a wall rather than a bug.
 *
 * The problem it solves is real and specific to a filtered menu: the numbers
 * RENUMBER. `legalActions` returns what is available this turn, so "Move N" is
 * 1 in a two-exit room and 3 in another, and the player re-reads the list every
 * single turn to find the same move. Directions never renumber. The numbers
 * stay for everything that has no compass (Search, Rest, Fight, Tame).
 *
 * FOCUS is directional too as of 1i, and it is deliberately NOT reachable this
 * way. `actionForDirection` prefers a MOVE, and FOCUS is only ever offered on a
 * doorway that also has a MOVE, so the compass keys keep meaning "walk" and
 * never quietly spend a turn looking instead. Same instinct as excluding SEND:
 * a key that walks must not sometimes do something else.
 */
const DIRECTION_KEYS: Record<string, Direction> = {
  W: 'N',
  A: 'W',
  S: 'S',
  D: 'E',
  ARROWUP: 'N',
  ARROWLEFT: 'W',
  ARROWDOWN: 'S',
  ARROWRIGHT: 'E',
}


// ---------------------------------------------------------------------------

export function Classic({ run }: { run: RunView }): React.JSX.Element {
  const act = useRun((s) => s.act)
  const ended = run.state.outcome !== 'inProgress'

  const room = useMemo(() => roomView(run.state), [run.state])
  const doors = useMemo(() => doorways(run.state, run.senses), [run.state, run.senses])
  const chunks = useMemo(() => statusChunks(run.state), [run.state])
  const lastRoll = useMemo(() => lastRollOf(run.turns), [run.turns])
  const chart = useMemo(() => chartedMap(run.state), [run.state])
  const back = useMemo(() => wayBack(run.state), [run.state])
  const waived = useMemo(() => waivedVerb(run.state), [run.state])
  // F points the pad at FOCUS; the next direction spends it. Reset whenever the
  // menu changes, so an armed F can never survive into a turn that has no FOCUS
  // in it — a hazard taking the menu disarms it by construction.
  const [mode, setMode] = useState<PadMode>('move')
  // Four paragraphs are the right size on turn one and dead weight on turn
  // twelve, so it folds itself away once the run is actually under way — once,
  // and then it is the player's toggle again rather than something that keeps
  // snapping shut under them.
  const [introOpen, setIntroOpen] = useState(true)
  const started = run.state.turn > 1
  useEffect(() => {
    if (started) setIntroOpen(false)
  }, [started])
  useEffect(() => setMode('move'), [run.turns.length])
  const pad = useMemo(() => padCells(run.menu, run.state, mode), [run.menu, run.state, mode])
  const verbs = useMemo(() => verbButtons(run.menu), [run.menu])

  const choose = useCallback((action: Action) => act(action), [act])

  // The number row drives the menu. Bound on the window rather than on a
  // focused element so the player never has to click into anything first.
  useEffect(() => {
    if (ended) return
    function onKey(event: KeyboardEvent): void {
      if (event.metaKey || event.ctrlKey || event.altKey) return
      const target = event.target
      if (target instanceof HTMLInputElement || target instanceof HTMLSelectElement) return
      const key = event.key.toUpperCase()

      // F arms FOCUS and a second F disarms it; Escape always disarms.
      if (key === 'ESCAPE') {
        event.preventDefault()
        setMode('move')
        return
      }
      if (key === 'F') {
        event.preventDefault()
        if (verbs.some((v) => v.arms === 'focus' && v.available)) {
          setMode((m) => (m === 'focus' ? 'move' : 'focus'))
        }
        return
      }
      if (key === 'E' || key === 'R') {
        const verb = verbs.find((v) => v.key === key)
        event.preventDefault()
        if (verb?.available && verb.action !== null) {
          setMode('move')
          choose(verb.action)
        }
        return
      }

      const direction = DIRECTION_KEYS[key]
      if (direction !== undefined) {
        // In focus mode the direction spends the armed FOCUS; otherwise it is a
        // MOVE. This is why the two verbs no longer contend for one key — the
        // pad's mode decides, rather than a preference order inside the lookup.
        const cellAction = pad.find((c) => c.direction === direction)?.action ?? null
        event.preventDefault()
        if (cellAction !== null) {
          setMode('move')
          choose(cellAction)
        }
        return
      }

      const index = MENU_KEYS.indexOf(key as (typeof MENU_KEYS)[number])
      if (index === -1) return
      const entry = run.menu[index]
      if (entry === undefined) return
      event.preventDefault()
      choose(entry.action)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [run.menu, choose, ended, pad, verbs])

  return (
    <div className="classic">
      <header className="masthead">
        <h1>Silent Echo · classic</h1>
        <span className="run-id">
          seed {run.seed} · {run.difficulty}
        </span>
      </header>

      {/*
        The opening frame is its own tile now, below the title and above the
        status row, rather than sitting inside the scrolling log where it was
        pushed off-screen by turn three.
      */}
      <Intro paragraphs={RUN_INTRO} open={introOpen} onToggle={setIntroOpen} />

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

            `consequential` is why a plain walk no longer opens this panel: five
            of MOVE's six bands do nothing, and a breakdown shown for a step
            that cost nothing teaches the player to stop reading breakdowns.
          */}
          {lastRoll !== null && lastRoll.consequential && (
            <section className="panel roll">
              <h2>The roll · {lastRoll.action}</h2>
              <Roll roll={lastRoll} />
            </section>
          )}

          {/*
            THE CONTROLLER SITS ABOVE THE MAP, which is the one place this
            deviates from the sketch, and the reason is vertical order by
            frequency: the pad is touched every single turn and the map is
            consulted occasionally, and the map's grid is fixed-size and mostly
            empty early (deliberately — see `chartedMap`). With the map between
            them, the pad started the run below the fold.
          */}
          <section className="panel">
            <h2>{ended ? 'The run is over' : 'What do you do?'}</h2>
            {ended ? (
              <Ending run={run} />
            ) : (
              <>
                <Pad cells={pad} mode={mode} onChoose={choose} />
                <Verbs verbs={verbs} mode={mode} onChoose={choose} onArm={setMode} />
                {mode === 'focus' && (
                  <p className="armed-hint">
                    Pick a doorway to look through. F or Esc to put it down.
                  </p>
                )}
                <Menu menu={run.menu} onChoose={choose} back={back} waived={waived} />
              </>
            )}
          </section>

          {chart !== null && (
            <section className="panel">
              <h2>Charted</h2>
              <ChartedMap rows={chart} />
            </section>
          )}
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
  // Says there is something and refuses to say what, which is exactly the state
  // the lamp leaves a doorway in. It must not read as danger (much of what leaks
  // through a doorway is a creature you could talk round, or the Heart) and it
  // must not read as an apology — it is a price tag, and FOCUS is the price.
  unresolved: 'something, unlooked at',
  confused: 'you cannot tell',
}

/**
 * A doorway that reported nothing, and MEANT it.
 *
 * Under the old model this was nearly always what an empty doorway said and it
 * carried almost no weight. It is load-bearing now: the lamp is honest about
 * presence, so "nothing" is a complete answer about that doorway and the one
 * thing on the panel a player can act on without spending a turn first.
 */
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
          <span className="dir">
            {door.word}
            {door.wayBack && <span className="back"> ↩</span>}
          </span>
          {/*
            THE STENCH IS PRINTED EVEN ON AN UNRESOLVED DOORWAY, and this
            ordering is the reason this is not a ternary chain any more.

            The Wumpus's stench and a companion's reveals are exempt from the
            FOCUS economy (GDD 2.8.1), so a doorway can carry a resolved tell AND
            an unresolved remainder at the same time — two rooms away is the
            Wumpus, and also something nobody has looked at. A chain that showed
            `unsensed` first would swallow the one tell CLAUDE.md 3 says may
            never be hidden, on exactly the turns it matters most.
          */}
          {door.tells.length > 0 && (
            <span className="sense">{door.tells.map((t) => t.text).join('; ')}</span>
          )}
          {door.unsensed !== null ? (
            <span className="unsensed">{UNSENSED_TEXT[door.unsensed]}</span>
          ) : door.tells.length === 0 ? (
            <span className="quiet">{NOTHING_TEXT}</span>
          ) : null}
          {/*
            Which doorways are still worth a turn. At Hunting and Ravening there
            is exactly one FOCUS per room, so knowing the allowance is spent is
            as much a part of the decision as knowing what is unresolved.
          */}
          {door.focusable && <span className="focusable">· focusable</span>}
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
        <span>{num(roll.total)}</span>
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

/** The compass letter shown for a direction, matching `DIRECTION_KEYS`. */
const KEY_FOR_DIRECTION: Record<Direction, string> = { N: 'W', W: 'A', S: 'S', E: 'D' }

/** Structural equality for two actions, for matching a menu entry to a binding. */
function sameAction(a: Action | null, b: Action): boolean {
  if (a === null || a.kind !== b.kind) return false
  const ad = 'direction' in a ? a.direction : null
  const bd = 'direction' in b ? b.direction : null
  if (ad !== bd) return false
  const ai = 'item' in a ? a.item : null
  const bi = 'item' in b ? b.item : null
  return ai === bi
}

/**
 * The compass pad. Four fixed cells; a dark one is a wall.
 *
 * See `padCells` for why a four-cell compass is not the greyed-out verb list
 * GDD 2.17 forbids, and for the argued exception now written into that section.
 */
function Pad({
  cells,
  mode,
  onChoose,
}: {
  cells: readonly PadCell[]
  mode: PadMode
  onChoose: (action: Action) => void
}): React.JSX.Element {
  const cell = (direction: string): React.JSX.Element => {
    const c = cells.find((x) => x.direction === direction)
    if (c === undefined) return <span className="pad-cell empty" />
    const live = c.action !== null
    return (
      <button
        type="button"
        className={`pad-cell${live ? ' live' : ''}${c.wayBack ? ' back' : ''}`}
        disabled={!live}
        title={live ? `${mode === 'focus' ? 'Focus' : 'Move'} ${c.word}` : `wall to the ${c.word}`}
        onClick={() => c.action !== null && onChoose(c.action)}
      >
        <span className="pad-key">{c.key}</span>
        <span className="pad-word">{c.word}</span>
      </button>
    )
  }
  return (
    <div className={`pad mode-${mode}`}>
      <div className="pad-row">{cell('N')}</div>
      <div className="pad-row">
        {cell('W')}
        {cell('S')}
        {cell('E')}
      </div>
    </div>
  )
}

function Verbs({
  verbs,
  mode,
  onChoose,
  onArm,
}: {
  verbs: readonly VerbButton[]
  mode: PadMode
  onChoose: (action: Action) => void
  onArm: (mode: PadMode) => void
}): React.JSX.Element {
  return (
    <div className="verbs">
      {verbs.map((v) => {
        const armed = v.arms !== null && mode === v.arms
        return (
          <button
            key={v.key}
            type="button"
            className={`verb${v.available ? ' live' : ''}${armed ? ' armed' : ''}`}
            disabled={!v.available}
            onClick={() => {
              if (v.arms !== null) onArm(armed ? 'move' : v.arms)
              else if (v.action !== null) onChoose(v.action)
            }}
          >
            <span className="pad-key">{v.key}</span>
            <span className="pad-word">{v.label}</span>
          </button>
        )
      })}
    </div>
  )
}

function Menu({
  menu,
  onChoose,
  back,
  waived,
}: {
  menu: readonly LegalAction[]
  onChoose: (action: Action) => void
  back: Direction | null
  waived: ActionKind | null
}): React.JSX.Element {
  const rows = listedEntries(menu)
  if (rows.length === 0) return <></>
  return (
    <ul className="menu">
      {rows.map(({ entry, index }) => {
        // Directional entries show their compass key instead of their number.
        // The number still works — the handler is index-based and unchanged —
        // but the compass key is the one worth learning, because it is the only
        // one that means the same thing next turn.
        // THE KEY SHOWN MUST BE THE KEY THAT FIRES THIS ROW. Deriving it from
        // the entry's own direction was correct in 1h, when MOVE was the only
        // directional verb in the normal menu — and 1i made it a lie by adding
        // FOCUS as a second one: `Move north` and `Focus north` both rendered
        // `W`, and `W` has always resolved to the MOVE. So ask the binding what
        // it would actually do with this direction, and only claim the compass
        // key when the answer is this exact entry. Anything else falls back to
        // its number, which is index-based and always true.
        const dir =
          'direction' in entry.action && entry.action.kind !== 'send'
            ? entry.action.direction
            : null
        const boundHere =
          dir !== null && sameAction(actionForDirection(menu, dir), entry.action)
        const shown = boundHere ? KEY_FOR_DIRECTION[dir] : (keyFor(index) ?? '·')
        return (
          <li key={`${entry.label}-${index}`}>
            <button type="button" onClick={() => onChoose(entry.action)}>
              <span className="key">{shown}</span>
              <span className="label">
                {entry.label}
                {entry.action.kind === 'move' && dir === back && dir !== null && (
                  <span className="back"> (go back)</span>
                )}
              </span>
              {/*
                A companion is paying for this one. Marked HERE as well as on
                the status line because this is where the decision is made:
                the status line answers "is this companion worth keeping",
                and the player weighing a verb against a guttering lamp is
                asking a different question, one turn at a time.

                It says "no oil" rather than "free" on purpose. The menu shows
                no prices at all — see the close-out note — so "free" would be
                free of something the screen never mentions, and oil is the
                only currency it could mean.
              */}
              {waived !== null && entry.action.kind === waived && (
                <span className="waived">no oil</span>
              )}
              {entry.dc !== undefined && <span className="dc">DC {entry.dc}</span>}
            </button>
          </li>
        )
      })}
    </ul>
  )
}

/**
 * The frame around the run, before the first turn.
 *
 * Collapsible and open by default: it is four paragraphs on turn one and dead
 * weight on turn twelve, and closing it is the player's call rather than a
 * timer's. The text is `RUN_INTRO` from `data/outcomes.ts` — the renderer still
 * writes no prose.
 */
function Intro({
  paragraphs,
  open,
  onToggle,
}: {
  paragraphs: readonly string[]
  open: boolean
  onToggle: (open: boolean) => void
}): React.JSX.Element {
  return (
    <details
      className="intro"
      open={open}
      onToggle={(e) => onToggle((e.currentTarget as HTMLDetailsElement).open)}
    >
      <summary>Before you go down</summary>
      {paragraphs.map((text, i) => (
        <p key={i}>{text}</p>
      ))}
    </details>
  )
}

/**
 * What the player has charted. Drawn only where `chartedMap` returns something,
 * which is the two lower difficulties — see `MAP_DIFFICULTIES`.
 */
function ChartedMap({ rows }: { rows: readonly MapCell[][] }): React.JSX.Element {
  return (
    <pre className="chart" aria-label="charted map">
      {rows.map((row, y) => (
        // Connector rows get a shorter line so the grid is not half whitespace.
        // The grid itself is NEVER cropped to the charted area, deliberately:
        // a map that re-frames as you explore moves every room you had already
        // placed, which is the opposite of what an orientation aid is for.
        // Fixed coordinates for the whole run; empty space is the cheap part.
        <div key={y} className={y % 2 === 1 ? 'link-row' : undefined}>
          {row.map((cell, x) => (
            <span key={x} className={`m-${cell.kind}`}>
              {cell.ch}
            </span>
          ))}
        </div>
      ))}
    </pre>
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
