/**
 * Watch the reducer.  npm run turn -- <seed> [difficulty] [policy]
 *
 *   policy: naive | careful | both   (default: both)
 *   SWEEP=n npm run turn -- <seed> [difficulty] [policy]
 *
 * `scripts/map.ts` shows you a labyrinth. `scripts/hunt.ts` shows you the
 * Wumpus. `scripts/tame.ts` shows you the creature system. This shows you the
 * THING THAT RUNS THEM — a whole run driven through `applyAction`, with every
 * turn broken back out into the eight steps GDD 2.2.2 specifies, in order.
 *
 * Tests can tell you the reducer is correct against the cases you thought of.
 * The reason this file exists is the cases nobody thought of: the two catch
 * checks were added because the hunt visualiser showed a player walking clean
 * THROUGH a Wumpus, which every test at the time passed. So this one is built
 * to make the same class of thing visible:
 *
 *   - WHICH catch check fires. Step 2 ("you walked into it") and step 6 ("it
 *     came for you") are different bugs when they are wrong, and a run report
 *     that says only "caught" cannot tell them apart.
 *   - Whether a two-turn tame really costs two Wumpus moves, visible as two
 *     wumpusMoved events inside one turn.
 *   - What `legalActions` actually offers — the menu is the game's entire
 *     decision surface (GDD 2.17), and a menu with the wrong verbs on it is a
 *     design bug that no assertion about state will ever catch.
 *   - Whether the event stream alone is enough to play by. Text parity
 *     (CLAUDE.md 2.3) is a claim about this stream and nothing else, so PANEL A
 *     prints the turn as its events and nothing but its events.
 *   - Whether (seed, actionLog) still replays. PANEL D re-runs the log and
 *     diffs the final state.
 */

import { rngFromState } from '../src/engine/rng.ts'
import { roomIdAt } from '../src/engine/generate.ts'
import { scentAt } from '../src/engine/wumpus.ts'
import {
  applyAction, createRun, legalActions, replayRun, tellsFor,
} from '../src/engine/resolve.ts'
import type { LegalAction } from '../src/engine/resolve.ts'
import { DIRECTIONS } from '../src/engine/types.ts'
import type {
  Action, Difficulty, GameEvent, GameState, Labyrinth, Room, RoomId,
} from '../src/engine/types.ts'
import { DIFFICULTY } from '../src/engine/data/tuning.ts'

const seedArg = Number(process.argv[2] ?? 1)
const difficulty = (process.argv[3] ?? 'stirring') as Difficulty
const policyArg = (process.argv[4] ?? 'both') as PolicyName | 'both'

type PolicyName = 'naive' | 'careful'

const rule = (n = 74): string => '─'.repeat(n)
const pad = (s: string, n: number): string => s.padEnd(n)

// ===========================================================================
// Which of the eight steps an event belongs to
// ===========================================================================

/**
 * The map from event kind to GDD 2.2.2 step.
 *
 * This is deliberately a LOOKUP AND NOT AN ASSERTION. If the reducer ever
 * emitted its events out of order, the step numbers in PANEL A would run
 * backwards and you would see it immediately — which is the entire point of
 * printing them. A test that asserted the order would only check the cases it
 * enumerated; a column of step numbers that must ascend checks every turn of
 * every run you ever look at.
 */
function stepOf(event: GameEvent): number {
  switch (event.kind) {
    case 'roll': return 1
    case 'moved': return 1
    case 'creatureEncounter': return 1
    case 'graveFound': return 1
    case 'companionGained': return 1
    case 'damage': return 3
    case 'statusChanged': return event.turns > 0 ? 3 : 7
    case 'heartTaken': return 3
    case 'wumpusTierChanged': return 3
    // Losing a companion happens at three different steps depending on WHY, and
    // the typed reason is the only thing that says which. Released and sent are
    // the player's own action resolving; bolted is the step-3 damage effect;
    // starved is the step-7 upkeep.
    case 'companionLost':
      return event.reason === 'starved' ? 7 : event.reason === 'bolted' ? 3 : 1
    case 'wumpusMoved': return 5
    case 'tell': return 8
    case 'runEnded': return 8
    // The oil table is the one place two different steps share an event kind:
    // a flask, a gutter or a pit's cost lands at step 3, the passive burn and
    // the companion's upkeep at step 7.
    //
    // This used to compare `event.text` against prose constants. Step 1f gave
    // every beat a lit and a dark variant, which broke that outright — the
    // panel would have gone on reporting until the player's lamp got low and
    // then quietly started mislabelling every oil event in the run. It keys off
    // `event.beat` now, which is what that field exists for. Same lesson as
    // Panel B of tame.ts in 1e: a visualiser that identifies the thing it is
    // watching by its appearance is a visualiser that lies the day the
    // appearance changes.
    case 'oilChanged':
      return event.beat === 'lampBurnsDown' ||
        event.beat === 'goblinScrounges' ||
        event.beat === 'skittishUpkeep'
        ? 7
        : 3
    case 'narration':
      switch (event.beat) {
        case 'actionOutcome':
        case 'hazardOutcome':
        case 'braveOverride':
        case 'foundFlask':
        case 'caughtBreath':
        case 'carvingsWarn':
        case 'companionReveals':
        case 'creatureFound':
        case 'portalCrossed':
        case 'actionUnavailable':
          return 1
        case 'caughtWalkedInto':
          return 2
        // The Heart, its escalation and a bloom's Confused are all step-3
        // effects — they are what the action DID, not the action itself.
        case 'heartTaken':
        case 'wumpusEscalates':
        case 'confusedSettles':
          return 3
        case 'caughtCameForYou':
          return 6
        case 'creatureWanders':
        case 'grellhoundGrowls':
        case 'grellhoundReveals':
        case 'confusedLifts':
          return 7
        default:
          // Every remaining beat is an ending, and endings are step 8.
          return 8
      }
    default: return 8
  }
}

function describeEvent(event: GameEvent): string {
  switch (event.kind) {
    case 'roll':
      return (
        `roll ${event.hazard ? `${event.hazard} SAVE` : event.action}: d20=${String(event.result.natural).padStart(2)} ` +
        `${event.result.modifiers.map((m) => `${m.value >= 0 ? '+' : ''}${m.value} ${m.source}`).join(' ')} ` +
        `= ${event.result.total} vs DC ${event.result.dc} → ${event.result.band}` +
        `${event.result.overridden ? ' (natural override)' : ''}`
      )
    case 'moved': return `moved ${event.direction}: ${event.from} → ${event.to}`
    case 'tell': return `tell ${event.tell.direction} ${event.tell.kind}`
    case 'damage': return `damage ${event.amount} (${event.cause})`
    case 'oilChanged': return `oil ${event.delta >= 0 ? '+' : ''}${event.delta} — ${event.text}`
    case 'wumpusMoved': return `WUMPUS moved → ${event.to}`
    case 'wumpusTierChanged': return `WUMPUS escalates to tier ${event.tier}`
    case 'creatureEncounter': return `encounter: ${event.creature}`
    case 'companionGained':
      return (
        `companion +${event.companion.kind}` +
        `${event.companion.brave ? ' BRAVE' : event.companion.skittish ? ' skittish' : ''}`
      )
    case 'companionLost': return `companion -${event.kind_} (${event.reason})`
    case 'statusChanged': return event.turns > 0 ? `status +${event.status} (${event.turns}t)` : `status -${event.status}`
    case 'heartTaken': return '*** THE HEART LEAVES THE PLINTH ***'
    case 'graveFound': return `a grave: ${event.epitaph.text}`
    case 'runEnded': return `RUN ENDED: ${event.outcome}`
    case 'narration': return event.text
    default: return JSON.stringify(event)
  }
}

// ===========================================================================
// Rendering
// ===========================================================================

const SHADE = (v: number): string =>
  v >= 3 ? '█' : v >= 1.5 ? '▓' : v >= 0.5 ? '▒' : v > 0 ? '░' : ' '

const FEATURE: Record<string, string> = {
  pit: 'p', sporeBloom: 'b', snareCarving: 'n', portal: '¤',
  goblin: 'g', lumewing: 'm', grellhound: 'd', quietOne: 'q',
}

function featureOf(room: Room, carrying: boolean): string {
  if (room.hasHeart && !carrying) return 'H'
  if (room.isEntrance) return 'E'
  if (room.hazard) return FEATURE[room.hazard] ?? '?'
  if (room.creature) return FEATURE[room.creature] ?? '?'
  if (room.oilFlask) return 'o'
  return room.visited ? '·' : ' '
}

function render(state: GameState): string {
  const lab = state.labyrinth
  const lines: string[] = []
  for (let y = 0; y < lab.height; y++) {
    let row = '', below = ''
    for (let x = 0; x < lab.width; x++) {
      const id = roomIdAt(x, y)
      const room = lab.rooms[id] as Room
      const smell = SHADE(scentAt(state.scent, id))
      const mark =
        id === state.player.roomId ? 'P' + (state.player.carryingHeart ? '*' : smell)
        : id === state.wumpus.roomId ? 'W' + smell
        : featureOf(room, state.player.carryingHeart) + smell
      row += `[${mark}]` + (room.exits.E !== undefined ? '───' : '   ')
      below += (room.exits.S !== undefined ? ' │     ' : '       ')
    }
    lines.push(row.trimEnd())
    if (y < lab.height - 1) lines.push(below.trimEnd())
  }
  return lines.join('\n')
}

// ===========================================================================
// The scripted policies
// ===========================================================================

function route(lab: Labyrinth, from: RoomId, to: RoomId): RoomId[] {
  const prev: Record<RoomId, RoomId | null> = { [from]: null }
  const q = [from]
  for (let h = 0; h < q.length; h++) {
    const id = q[h] as RoomId
    if (id === to) break
    for (const d of DIRECTIONS) {
      const n = (lab.rooms[id] as Room).exits[d]
      if (n !== undefined && prev[n] === undefined) { prev[n] = id; q.push(n) }
    }
  }
  if (prev[to] === undefined) return []
  const out: RoomId[] = []
  for (let c: RoomId | null = to; c !== null; c = prev[c] ?? null) out.unshift(c)
  return out
}

/**
 * Two one-line policies, because the interesting number is the DIFFERENCE.
 *
 *   naive   — shortest route, ignores every tell. The floor.
 *   careful — same route, but will not step toward a draft or a stench if any
 *             other doorway is open. Fifty characters of caution.
 *
 * 1d measured a third of the catch rate coming off exactly this rule with a
 * hand-rolled loop. Running it through the real reducer is how we find out
 * whether that survived contact with the turn order.
 */
function choose(state: GameState, policy: PolicyName): Action | null {
  const menu = legalActions(state)
  if (menu.length === 0) return null

  const encounterVerbs = menu.filter((m) => m.action.kind === 'fight' || m.action.kind === 'tame')
  if (encounterVerbs.length > 0) {
    // Prefer the quiet option when it is on the menu; the hostile gate removes
    // it, and then there is nothing to be patient about.
    const tame = encounterVerbs.find((m) => m.action.kind === 'tame')
    return (tame ?? encounterVerbs[0] as LegalAction).action
  }

  // SEND: the stench is firing and you have something brave. Spend it.
  const stench = tellsFor(state).filter((t) => t.kind === 'stench')
  const sendable = menu.filter((m) => m.action.kind === 'send')
  if (stench.length > 0 && sendable.length > 0) {
    const towardIt = sendable.find(
      (m) => 'direction' in m.action && m.action.direction === stench[0]?.direction,
    )
    return (towardIt ?? sendable[0] as LegalAction).action
  }

  const target = state.player.carryingHeart
    ? state.labyrinth.entranceId
    : state.labyrinth.heartRoomId
  const plan = route(state.labyrinth, state.player.roomId, target)
  const nextRoom = plan[1]

  const moves = menu.filter((m) => m.action.kind === 'move')
  if (moves.length === 0) return menu[0]?.action ?? null

  const planned = moves.find(
    (m) => 'direction' in m.action &&
      (state.labyrinth.rooms[state.player.roomId] as Room).exits[m.action.direction] === nextRoom,
  )

  if (policy === 'naive') return (planned ?? moves[0] as LegalAction).action

  // careful: refuse to walk toward an announced pit or the Wumpus, if there is
  // any other open doorway. Everything else about the route is unchanged.
  const warned = new Set(
    tellsFor(state).filter((t) => t.kind === 'draft' || t.kind === 'stench').map((t) => t.direction),
  )
  const isWarned = (m: LegalAction): boolean =>
    'direction' in m.action && warned.has(m.action.direction)

  if (planned && !isWarned(planned)) return planned.action
  const safe = moves.filter((m) => !isWarned(m))
  if (safe.length > 0) return (safe[0] as LegalAction).action
  return (planned ?? moves[0] as LegalAction).action
}

// ===========================================================================
// Driving a run
// ===========================================================================

interface TurnTrace {
  readonly turn: number
  readonly action: Action
  readonly events: readonly GameEvent[]
  readonly menuSize: number
}

interface RunSummary {
  readonly policy: PolicyName
  readonly outcome: GameState['outcome']
  readonly turnsUsed: number
  /** 2 or 6 — WHICH catch check ended it. -1 if it did not. */
  readonly caughtAtStep: number
  readonly sends: number
  readonly tames: number
  readonly fights: number
  readonly encounters: number
  readonly maxMenu: number
  readonly minMenu: number
  readonly deterministic: boolean
  readonly jsonSafe: boolean
  readonly traces: readonly TurnTrace[]
  readonly final: GameState
}

function playRun(seed: number, policy: PolicyName): RunSummary {
  let state = createRun(seed, { difficulty })
  const traces: TurnTrace[] = []
  let sends = 0, tames = 0, fights = 0, encounters = 0
  let maxMenu = 0, minMenu = 99
  let caughtAtStep = -1

  // A hard ceiling on ITERATIONS, not turns. A tame costs two turns, so the
  // loop and the turn counter are not the same clock, and a reducer bug that
  // failed to advance the turn would otherwise spin here forever rather than
  // being reported.
  for (let iteration = 0; iteration < 200; iteration++) {
    if (state.outcome !== 'inProgress') break
    const menu = legalActions(state)
    maxMenu = Math.max(maxMenu, menu.length)
    minMenu = Math.min(minMenu, menu.length)

    const action = choose(state, policy)
    if (action === null) break

    if (action.kind === 'send') sends += 1
    if (action.kind === 'tame') tames += 1
    if (action.kind === 'fight') fights += 1

    const turn = state.turn
    const result = applyAction(state, action, rngFromState(state.rng))
    if (result.events.some((e) => e.kind === 'creatureEncounter')) encounters += 1

    // WHICH catch check. The two ending beats are the only thing that
    // distinguishes them, which is itself worth knowing.
    for (const e of result.events) {
      if (e.kind !== 'narration') continue
      if (e.beat === 'caughtWalkedInto') caughtAtStep = 2
      if (e.beat === 'caughtCameForYou') caughtAtStep = 6
    }

    traces.push({ turn, action, events: result.events, menuSize: menu.length })
    state = result.state
  }

  // Determinism and JSON-safety are properties of every run, so they are
  // checked on every run rather than in a test that picks one seed.
  const replayed = replayRun(seed, state.actionLog, { difficulty })
  const deterministic = JSON.stringify(replayed) === JSON.stringify(state)
  const jsonSafe = JSON.stringify(JSON.parse(JSON.stringify(state))) === JSON.stringify(state)

  return {
    policy, outcome: state.outcome, turnsUsed: state.turn, caughtAtStep,
    sends, tames, fights, encounters,
    maxMenu, minMenu: minMenu === 99 ? 0 : minMenu,
    deterministic, jsonSafe, traces, final: state,
  }
}

// ===========================================================================
// PANEL A — one turn, as nothing but its event stream
// ===========================================================================

function panelTextParity(summary: RunSummary): void {
  console.log(`\n${rule()}\nPANEL A  — a turn as NOTHING BUT its events (CLAUDE.md 2.3)\n${rule()}`)
  console.log(`  Text parity says every fact any renderer can show must be expressible from`)
  console.log(`  this stream. So: no state, no map. If a turn is unreadable here, the`)
  console.log(`  diorama would be showing the player something the engine never said.\n`)

  // The most eventful turn in the run is the one worth reading.
  const busiest = [...summary.traces].sort((a, b) => b.events.length - a.events.length)[0]
  if (!busiest) { console.log('  (no turns)'); return }

  console.log(`  turn ${busiest.turn}, action ${JSON.stringify(busiest.action)}, ${busiest.menuSize} verbs offered\n`)
  console.log(`  ${pad('step', 7)}${pad('event', 20)}detail`)
  console.log(`  ${rule(70)}`)
  let lastStep = 0
  for (const event of busiest.events) {
    const step = stepOf(event)
    // A step number that goes BACKWARDS means the reducer emitted out of order.
    const flag = step < lastStep ? ' <-- OUT OF ORDER' : ''
    lastStep = Math.max(lastStep, step)
    console.log(`  ${pad(String(step), 7)}${pad(event.kind, 20)}${describeEvent(event)}${flag}`)
  }
}

// ===========================================================================
// PANEL B — the run
// ===========================================================================

function panelRun(summary: RunSummary): void {
  console.log(`\n${rule()}\nPANEL B  — the run, policy ${summary.policy.toUpperCase()}\n${rule()}`)

  for (const trace of summary.traces) {
    const stateAfter = trace
    void stateAfter
    console.log(
      `\nturn ${String(trace.turn).padStart(2)}  ${pad(JSON.stringify(trace.action), 34)}` +
      `menu ${trace.menuSize} verbs`,
    )
    for (const event of trace.events) {
      if (event.kind === 'tell') continue // shown on the status line instead
      const step = stepOf(event)
      console.log(`         ${step}  ${describeEvent(event)}`)
    }
    const tells = trace.events.filter((e) => e.kind === 'tell')
    if (tells.length > 0) {
      console.log(
        `         8  tells: ` +
        tells.map((e) => (e.kind === 'tell' ? `${e.tell.direction} ${e.tell.kind}` : '')).join(', '),
      )
    }
  }

  console.log(`\n${render(summary.final)}`)
  const p = summary.final.player
  console.log(
    `\nfinal: ${summary.outcome} on turn ${summary.turnsUsed}  hp ${p.health}  oil ${p.oil}  ` +
    `${p.carryingHeart ? '[HEART] ' : ''}companion ${p.companion?.kind ?? '—'}`,
  )
}

// ===========================================================================
// PANEL C — the decision surface
// ===========================================================================

function panelMenu(summary: RunSummary): void {
  console.log(`\n${rule()}\nPANEL C  — what legalActions actually offered (GDD 2.17)\n${rule()}`)
  console.log(`  GDD 2.17: no renderer builds its own list, and none shows thirteen verbs`)
  console.log(`  with ten greyed out — a menu of thirteen is a menu of thirteen as far as`)
  console.log(`  the player's decision cost goes. So the SIZE of this is a design number.\n`)
  console.log(`  menu size across the run: min ${summary.minMenu}, max ${summary.maxMenu}`)

  const sample = summary.traces[0]
  if (sample) {
    const state = createRun(seedArg, { difficulty })
    console.log(`\n  turn 1 menu:`)
    for (const item of legalActions(state)) {
      console.log(`    ${pad(item.label, 34)}${item.dc !== undefined ? `DC ${item.dc}` : ''}`)
    }
  }

  const encounterTurn = summary.traces.find((t) =>
    t.events.some((e) => e.kind === 'creatureEncounter'),
  )
  console.log(
    `\n  first encounter: ${encounterTurn ? `turn ${encounterTurn.turn}` : 'never happened in this run'}`,
  )
}

// ===========================================================================
// PANEL D — determinism
// ===========================================================================

function panelDeterminism(summary: RunSummary): void {
  console.log(`\n${rule()}\nPANEL D  — (seed, actionLog) replays exactly (CLAUDE.md 2.2)\n${rule()}`)
  console.log(`  This is the load-bearing property. Replays, the sim harness, agent play`)
  console.log(`  and any future server-side validation all rest on it, and it is cheap to`)
  console.log(`  break by accident — one Object.keys() iteration whose order matters is`)
  console.log(`  enough. So it is re-checked on every run this tool prints.\n`)
  console.log(`  actions logged          ${summary.final.actionLog.length}`)
  console.log(`  replay matches          ${summary.deterministic ? 'yes' : '*** NO ***'}`)
  console.log(`  survives JSON round-trip ${summary.jsonSafe ? 'yes' : '*** NO ***'}`)
  console.log(`  rng position            seed ${summary.final.rng.seed}, counter ${summary.final.rng.counter}`)
}

// ===========================================================================
// SWEEP
// ===========================================================================

function sweep(count: number): void {
  console.log(`\n${rule()}\nSWEEP  — ${count} seeds, ${difficulty}, through the reducer\n${rule()}`)

  const policies: PolicyName[] = ['naive', 'careful']
  const agg: Record<PolicyName, {
    runs: number; escaped: number; retreated: number; caught: number; killed: number
    outOfTurns: number; turns: number; step2: number; step6: number
    sends: number; tames: number; fights: number; encounters: number
    nonDeterministic: number; notJsonSafe: number; maxMenu: number
  }> = {
    naive: { runs: 0, escaped: 0, retreated: 0, caught: 0, killed: 0, outOfTurns: 0, turns: 0, step2: 0, step6: 0, sends: 0, tames: 0, fights: 0, encounters: 0, nonDeterministic: 0, notJsonSafe: 0, maxMenu: 0 },
    careful: { runs: 0, escaped: 0, retreated: 0, caught: 0, killed: 0, outOfTurns: 0, turns: 0, step2: 0, step6: 0, sends: 0, tames: 0, fights: 0, encounters: 0, nonDeterministic: 0, notJsonSafe: 0, maxMenu: 0 },
  }

  for (let i = 0; i < count; i++) {
    for (const policy of policies) {
      const s = playRun(seedArg + i, policy)
      const a = agg[policy]
      a.runs += 1
      a.turns += s.turnsUsed
      a.sends += s.sends
      a.tames += s.tames
      a.fights += s.fights
      a.encounters += s.encounters
      a.maxMenu = Math.max(a.maxMenu, s.maxMenu)
      if (s.caughtAtStep === 2) a.step2 += 1
      if (s.caughtAtStep === 6) a.step6 += 1
      if (!s.deterministic) a.nonDeterministic += 1
      if (!s.jsonSafe) a.notJsonSafe += 1
      if (s.outcome === 'escaped') a.escaped += 1
      if (s.outcome === 'retreated') a.retreated += 1
      if (s.outcome === 'caught') a.caught += 1
      if (s.outcome === 'killed') a.killed += 1
      if (s.outcome === 'outOfTurns') a.outOfTurns += 1
    }
  }

  console.log(`  ${pad('', 30)}${pad('NAIVE', 16)}CAREFUL`)
  console.log(`  ${rule(64)}`)
  const pct = (n: number, d: number): string => `${((n / Math.max(1, d)) * 100).toFixed(0)}%`
  const rows: readonly [string, (a: typeof agg.naive) => string][] = [
    ['escaped (won)', (a) => `${pct(a.escaped, a.runs)}  (${a.escaped}/${a.runs})`],
    ['retreated (partial)', (a) => `${pct(a.retreated, a.runs)}`],
    ['caught by the Wumpus', (a) => `${pct(a.caught, a.runs)}`],
    ['killed by a hazard', (a) => `${pct(a.killed, a.runs)}`],
    ['ran out of turns', (a) => `${pct(a.outOfTurns, a.runs)}`],
    ['', () => ''],
    ['  step 2: walked into it', (a) => String(a.step2)],
    ['  step 6: it came for you', (a) => String(a.step6)],
    ['', () => ''],
    ['mean turns used', (a) => (a.turns / a.runs).toFixed(1)],
    ['mean encounters', (a) => (a.encounters / a.runs).toFixed(2)],
    ['tame : fight', (a) => `${a.tames} : ${a.fights}`],
    ['SEND fired', (a) => `${a.sends} time(s)`],
    ['largest menu offered', (a) => `${a.maxMenu} verbs`],
    ['', () => ''],
    ['replay mismatches', (a) => (a.nonDeterministic === 0 ? 'none' : `*** ${a.nonDeterministic} ***`)],
    ['JSON round-trip failures', (a) => (a.notJsonSafe === 0 ? 'none' : `*** ${a.notJsonSafe} ***`)],
  ]
  for (const [label, get] of rows) {
    if (label === '') { console.log(''); continue }
    console.log(`  ${pad(label, 30)}${pad(get(agg.naive), 16)}${get(agg.careful)}`)
  }

  console.log(
    `\n  the two catch-check counts are the reason step 2 exists. If step 2 is ever 0`,
  )
  console.log(`  across a sweep this size, the check has stopped doing anything and the`)
  console.log(`  walk-through-a-Wumpus bug is back in whatever form it takes next.`)
}

// ===========================================================================

console.log(`\n${'='.repeat(74)}`)
console.log(`  PROJECT SILENT ECHO — the reducer, turn by turn`)
console.log(`  seed ${seedArg}  ${difficulty}  tier ${DIFFICULTY[difficulty].wumpusTier}  policy ${policyArg}`)
console.log(`${'='.repeat(74)}`)

if (process.env.SWEEP) {
  sweep(Number(process.env.SWEEP))
  process.exit(0)
}

const chosen: PolicyName[] = policyArg === 'both' ? ['naive', 'careful'] : [policyArg]
const summaries = chosen.map((p) => playRun(seedArg, p))
const first = summaries[0] as RunSummary

panelTextParity(first)
for (const s of summaries) panelRun(s)
panelMenu(first)
panelDeterminism(first)

console.log(`\n${rule()}\nTHE COMPARISON\n${rule()}`)
console.log(`  ${pad('', 26)}${summaries.map((s) => pad(s.policy.toUpperCase(), 18)).join('')}`)
console.log(`  ${rule(66)}`)
const cmp: readonly [string, (s: RunSummary) => string][] = [
  ['outcome', (s) => s.outcome],
  ['turns used', (s) => String(s.turnsUsed)],
  ['caught at step', (s) => (s.caughtAtStep < 0 ? '—' : String(s.caughtAtStep))],
  ['encounters', (s) => String(s.encounters)],
  ['tames / fights', (s) => `${s.tames} / ${s.fights}`],
  ['SEND fired', (s) => String(s.sends)],
  ['menu size min..max', (s) => `${s.minMenu}..${s.maxMenu}`],
  ['replays exactly', (s) => (s.deterministic ? 'yes' : 'NO')],
]
for (const [label, get] of cmp) {
  console.log(`  ${pad(label, 26)}${summaries.map((s) => pad(get(s), 18)).join('')}`)
}

console.log(`\n  shading  · none  ░ faint  ▒ warm  ▓ strong  █ fresh`)
console.log(`  a blank cell is a room you have never been in — the map you have, not the map there is.`)
console.log(`  features  p pit  b bloom  n snare  ¤ portal  g goblin  m lumewing  d grellhound  q quietOne\n`)
