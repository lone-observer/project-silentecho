/**
 * The outcomes-table viewer.  npm run prose -- [mode] [args]
 *
 *   npm run prose                        Panel A — the coverage matrix
 *   npm run prose -- <action> [archetype] Panel B — the prose itself, lit above dark
 *   npm run prose -- run <seed> [difficulty] [policy]
 *                                        Panel C — a whole run, read as prose
 *   npm run prose -- lint                Panel D — every automatable prose defect
 *
 * WHY THIS EXISTS, given that tests/outcomes.test.ts asserts coverage anyway.
 *
 * A coverage test can tell you every cell is filled. It cannot tell you the six
 * bands of `search.floodedGallery` read as one sentence rewritten six times,
 * which is the actual failure mode of a table this size and the one that makes
 * the archetype axis worthless. That is a thing you find by putting the six
 * lines next to each other and reading them, which is Panel B.
 *
 * Panel C is the one that earns the step. Prose is not read a cell at a time;
 * it is read in the order a run produces it, and the defects that matter are
 * ordering defects — the hazard beat landing before the arrival beat, a
 * companion's departure narrated twice, an ending that does not follow from the
 * line before it. None of those are visible in the table and all of them are
 * obvious in a transcript.
 *
 * EVERY AXIS HERE IS DERIVED FROM THE TABLES, never restated. 1e's lesson from
 * Panel B of tame.ts: a visualiser that hardcodes the rule it is watching is a
 * visualiser that lies on the day the rule changes, which is the only day you
 * are looking at it. If someone adds a seventh archetype, Panel A grows a
 * column by itself.
 */

import { rngFromState } from '../src/engine/rng.ts'
import { applyAction, createRun, legalActions } from '../src/engine/resolve.ts'
import type { LegalAction } from '../src/engine/resolve.ts'
import { BAND_ORDER } from '../src/engine/types.ts'
import type {
  Action,
  ActionKind,
  Difficulty,
  GameEvent,
  GameState,
  OutcomeBand,
  RoomArchetype,
} from '../src/engine/types.ts'
import {
  allBeats,
  ARCHETYPES,
  DEFERRED_ACTIONS,
  HAZARD_NARRATION,
  isDarkProse,
  NARRATED_ACTIONS,
  outcomeBeat,
  ROOM_LED_ACTIONS,
  SUBJECT_LED_ACTIONS,
  visionWordsIn,
} from '../src/engine/data/outcomes.ts'
import type { Beat, EntryHazard } from '../src/engine/data/outcomes.ts'

// ---------------------------------------------------------------------------
// Small formatting helpers
// ---------------------------------------------------------------------------

const BAND_LABEL: Record<OutcomeBand, string> = {
  criticalFailure: 'crit fail',
  failure: 'failure',
  mixed: 'MIXED',
  success: 'success',
  strongSuccess: 'strong',
  criticalSuccess: 'crit succ',
}

function rule(char = '─', width = 78): string {
  return char.repeat(width)
}

function heading(text: string): string {
  return `\n${text}\n${rule('═', Math.max(text.length, 40))}`
}

function pad(text: string, width: number): string {
  return text.length >= width ? text : text + ' '.repeat(width - text.length)
}

/** Wraps at word boundaries so a long beat stays readable in a terminal. */
function wrap(text: string, width: number, indent: string): string[] {
  const words = text.split(' ')
  const lines: string[] = []
  let line = ''
  for (const word of words) {
    if (line.length === 0) line = word
    else if (line.length + 1 + word.length <= width) line += ` ${word}`
    else {
      lines.push(line)
      line = word
    }
  }
  if (line.length > 0) lines.push(line)
  return lines.map((l, i) => (i === 0 ? indent + l : indent + '  ' + l))
}

// ---------------------------------------------------------------------------
// Panel A — the coverage matrix
//
// One grid per narrated verb. Room-led verbs get a real archetype x band grid;
// subject-led verbs collapse to a single row, which is the point of the split
// and should be visible at a glance rather than explained in a comment.
// ---------------------------------------------------------------------------

function panelA(): void {
  console.log(heading('PANEL A — coverage'))
  console.log(
    'Every (archetype x action x band) cell the lookup can be asked for. A hole is a\n' +
      'bug; the coverage test fails on one. Subject-led verbs show a single row because\n' +
      'the creature is the subject and the archetype is backdrop — see data/outcomes.ts.\n',
  )

  const nameWidth = 16
  const header = pad('', nameWidth) + BAND_ORDER.map((b) => pad(BAND_LABEL[b], 11)).join('')

  let filled = 0
  let holes = 0

  for (const action of ROOM_LED_ACTIONS) {
    console.log(`\n  ${action.toUpperCase()}  (room-led)`)
    console.log('  ' + header)
    for (const archetype of ARCHETYPES) {
      let row = '  ' + pad(archetype, nameWidth)
      for (const band of BAND_ORDER) {
        const beat = outcomeBeat(archetype, action, band)
        const ok = beat !== null && beat.lit.length > 0 && beat.dark.length > 0
        if (ok) filled += 1
        else holes += 1
        row += pad(ok ? '  ✓' : '  ✗ HOLE', 11)
      }
      console.log(row)
    }
  }

  for (const action of SUBJECT_LED_ACTIONS) {
    let row = '  ' + pad(action, nameWidth)
    for (const band of BAND_ORDER) {
      // Asked through the same lookup, with an arbitrary archetype, because the
      // claim being checked is that the archetype does not matter for these.
      const beat = outcomeBeat(ARCHETYPES[0] as RoomArchetype, action, band)
      const ok = beat !== null && beat.lit.length > 0 && beat.dark.length > 0
      if (ok) filled += 1
      else holes += 1
      row += pad(ok ? '  ✓' : '  ✗ HOLE', 11)
    }
    if (action === SUBJECT_LED_ACTIONS[0]) {
      console.log('\n  SUBJECT-LED  (archetype ignored by the lookup)')
      console.log('  ' + header)
    }
    console.log(row)
  }

  console.log(`\n  HAZARDS  (hazard x band, no archetype axis)`)
  console.log('  ' + header)
  for (const hazard of Object.keys(HAZARD_NARRATION) as EntryHazard[]) {
    let row = '  ' + pad(hazard, nameWidth)
    for (const band of BAND_ORDER) {
      const beat = HAZARD_NARRATION[hazard][band]
      const ok = beat.lit.length > 0 && beat.dark.length > 0
      row += pad(ok ? '  ✓' : '  ✗ HOLE', 11)
      if (!ok) holes += 1
    }
    console.log(row)
  }

  const roomLedCells = ARCHETYPES.length * ROOM_LED_ACTIONS.length * BAND_ORDER.length
  const subjectLedCells = SUBJECT_LED_ACTIONS.length * BAND_ORDER.length
  const triples = ARCHETYPES.length * NARRATED_ACTIONS.length * BAND_ORDER.length
  console.log(`\n  ${filled} authored cells, ${holes} holes.`)
  console.log(
    `  ${roomLedCells} room-led (${ARCHETYPES.length} archetypes x ${ROOM_LED_ACTIONS.length} verbs x ${BAND_ORDER.length} bands)` +
      ` + ${subjectLedCells} subject-led (${SUBJECT_LED_ACTIONS.length} verbs x ${BAND_ORDER.length} bands).`,
  )
  console.log(
    `  Those ${roomLedCells + subjectLedCells} cells make the lookup TOTAL over all ` +
      `${triples} (archetype x action x band) triples — the subject-led verbs answer\n` +
      `  the same line for every archetype, which is the layering, not a gap.`,
  )
  console.log(`  Deferred verbs, deliberately unwritten: ${DEFERRED_ACTIONS.join(', ') || 'none'}.`)
  console.log(`  ${allBeats().length} beats in all tables, ${allBeats().length * 2} strings.`)
}

// ---------------------------------------------------------------------------
// Panel B — the prose, lit above dark
//
// The panel that catches monotony. Six bands of one (action, archetype) side by
// side is the only way to see that they are six rewrites of one sentence.
// ---------------------------------------------------------------------------

function panelB(action: ActionKind, only: RoomArchetype | null): void {
  console.log(heading(`PANEL B — ${action}`))

  const isRoomLed = (ROOM_LED_ACTIONS as readonly ActionKind[]).includes(action)
  const archetypes = isRoomLed
    ? only === null
      ? ARCHETYPES
      : [only]
    : [ARCHETYPES[0] as RoomArchetype]

  if (!isRoomLed) {
    console.log('  Subject-led: one band table, no archetype axis.\n')
  }

  for (const archetype of archetypes) {
    if (isRoomLed) console.log(`\n  ${rule('─', 74)}\n  ${archetype}\n  ${rule('─', 74)}`)
    for (const band of BAND_ORDER) {
      const beat = outcomeBeat(archetype, action, band)
      if (beat === null) {
        console.log(`\n  ${pad(BAND_LABEL[band], 11)} ✗ no prose (deferred verb)`)
        continue
      }
      console.log(`\n  ${BAND_LABEL[band]}`)
      for (const line of wrap(beat.lit, 66, '    lit  ')) console.log(line)
      if (beat.dark === beat.lit) {
        console.log('    dark   = lit (already non-visual; nothing to shift)')
      } else {
        for (const line of wrap(beat.dark, 66, '    dark ')) console.log(line)
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Panel C — a run, read as prose
//
// The panel that earns the step. Ordering defects are invisible in the table
// and obvious here.
// ---------------------------------------------------------------------------

function narrate(event: GameEvent): string | null {
  switch (event.kind) {
    case 'narration':
      return `${pad(`[${event.beat}]`, 20)} ${event.text}`
    case 'oilChanged':
      return `${pad(`[${event.beat}]`, 20)} ${event.text}  (${event.delta > 0 ? '+' : ''}${event.delta})`
    case 'companionLost':
      return `${pad(`[lost:${event.reason}]`, 20)} ${event.text}`
    case 'tell':
      return `${pad('[tell]', 20)} ${event.text}`
    case 'roll':
      return `${pad(`[roll:${event.hazard ?? event.action}]`, 20)} d20=${event.result.natural} → ${event.result.total} vs DC ${event.result.dc} → ${event.result.band}`
    case 'damage':
      return `${pad('[damage]', 20)} -${event.amount} health (${event.cause})`
    case 'creatureEncounter':
      return `${pad('[encounter]', 20)} ${event.creature}`
    case 'wumpusTierChanged':
      return `${pad('[tier]', 20)} the Wumpus is now tier ${event.tier}`
    case 'statusChanged':
      return `${pad('[status]', 20)} ${event.status}: ${event.turns} turn(s)`
    case 'companionGained':
      return `${pad('[companion]', 20)} A ${event.companion.kind} joins you${event.companion.brave ? ', and it is brave' : ''}${event.companion.skittish ? ', and it is skittish' : ''}.`
    case 'heartTaken':
      return `${pad('[heart]', 20)} (the Heart leaves the plinth)`
    case 'graveFound':
      return `${pad('[grave]', 20)} ${event.epitaph.text}`
    case 'runEnded':
      return `${pad('[ended]', 20)} ${event.outcome}`
    default:
      return null
  }
}

/**
 * A deliberately dim player: walk somewhere legal, prefer a doorway, take the
 * encounter option that is offered first. The point is to generate a long,
 * varied event stream to READ, not to play well — Panel C is about whether the
 * prose flows, and 1g's policies are the ones that care about winning.
 */
function chooseAction(menu: LegalAction[], state: GameState): Action {
  const turnIn = state.turn % 7
  const moves = menu.filter((m) => m.action.kind === 'move')
  const quiet = menu.filter((m) =>
    ['search', 'read', 'rest', 'listen'].includes(m.action.kind),
  )
  if (turnIn === 3 && quiet.length > 0) {
    return (quiet[state.turn % quiet.length] as LegalAction).action
  }
  if (moves.length > 0) return (moves[state.turn % moves.length] as LegalAction).action
  return (menu[0] as LegalAction).action
}

function panelC(seed: number, difficulty: Difficulty): void {
  console.log(heading(`PANEL C — seed ${seed}, ${difficulty}, read as prose`))
  console.log(
    '  Every line the engine emits, in the order it emits it. Read it as a page,\n' +
      '  not as a log: the defects worth finding here are ordering defects.\n',
  )

  let state = createRun(seed, { difficulty })
  let guard = 0
  while (state.outcome === 'inProgress' && guard < 60) {
    guard += 1
    const menu = legalActions(state)
    if (menu.length === 0) break
    const action = chooseAction(menu, state)
    const register = isDarkProse(state.player.oil) ? 'dark' : 'lit'
    const result = applyAction(state, action, rngFromState(state.rng))

    const label =
      'direction' in action ? `${action.kind} ${action.direction}` : action.kind
    console.log(
      `\n  ${rule('─', 74)}\n  turn ${state.turn}  ·  ${label}  ·  oil ${state.player.oil} (${register})  ·  hp ${state.player.health}\n`,
    )
    for (const event of result.events) {
      const line = narrate(event)
      if (line !== null) console.log(`    ${line}`)
    }
    state = result.state
  }
  console.log(`\n  Run ended: ${state.outcome}, turn ${state.turn}.`)
}

// ---------------------------------------------------------------------------
// Panel D — the lint
//
// Everything about prose that a machine can legitimately judge. Deliberately
// the same checks tests/outcomes.test.ts asserts, run from the same tables, so
// a failing test can be read here with the offending line in front of you
// instead of as an assertion message.
// ---------------------------------------------------------------------------

interface Complaint {
  readonly path: string
  readonly what: string
  readonly detail: string
}

function lint(): Complaint[] {
  const out: Complaint[] = []
  const beats = allBeats()

  for (const { path, beat } of beats) {
    // A dark variant that tells the player what they SAW is the engine
    // describing a sense they do not have. GDD 2.8.1.
    const vision = visionWordsIn(beat.dark)
    if (vision.length > 0) {
      out.push({ path, what: 'vision word in dark variant', detail: vision.join(', ') })
    }
    // A lit variant that leans on sight needs a dark variant that does not, and
    // an identical one has not been written, only copied.
    if (visionWordsIn(beat.lit).length > 0 && beat.lit === beat.dark) {
      out.push({
        path,
        what: 'visual lit variant with no dark rewrite',
        detail: visionWordsIn(beat.lit).join(', '),
      })
    }
    for (const variant of ['lit', 'dark'] as const) {
      const text = beat[variant]
      if (text.trim().length === 0) {
        out.push({ path, what: `empty ${variant}`, detail: '' })
      }
      if (!/[.!?"'’]$/.test(text.trim())) {
        out.push({ path, what: `${variant} does not end in punctuation`, detail: text.slice(-24) })
      }
      if (/\bTODO\b|\bTBD\b|\bplaceholder\b|\bXXX\b/i.test(text)) {
        out.push({ path, what: `${variant} is a placeholder`, detail: text })
      }
    }
  }

  // Monotony: within one (action, archetype), the six bands must be six
  // different sentences. This is the defect a coverage test cannot see.
  const groups = new Map<string, Map<string, string[]>>()
  for (const { path, beat } of beats) {
    const group = path.split('.').slice(0, -1).join('.')
    if (!groups.has(group)) groups.set(group, new Map())
    const seen = groups.get(group) as Map<string, string[]>
    const key = beat.lit
    seen.set(key, [...(seen.get(key) ?? []), path])
  }
  for (const [group, seen] of groups) {
    for (const [, paths] of seen) {
      if (paths.length > 1) {
        out.push({
          path: group,
          what: 'identical lit prose in more than one band',
          detail: paths.join(' = '),
        })
      }
    }
  }

  return out
}

function panelD(): void {
  console.log(heading('PANEL D — lint'))
  const complaints = lint()
  if (complaints.length === 0) {
    console.log('  Clean. No vision words in dark variants, no placeholders, no repeated bands.')
    return
  }
  for (const c of complaints) {
    console.log(`  ✗ ${pad(c.path, 34)} ${c.what}`)
    if (c.detail) console.log(`    ${c.detail}`)
  }
  console.log(`\n  ${complaints.length} complaint(s).`)
}

// ---------------------------------------------------------------------------
// Entry
// ---------------------------------------------------------------------------

function main(): void {
  const [first, second, third] = process.argv.slice(2)

  if (first === undefined) {
    panelA()
    panelD()
    console.log(
      '\n  npm run prose -- <action> [archetype]   the prose itself' +
        '\n  npm run prose -- run <seed> [difficulty] a run, read as prose' +
        '\n  npm run prose -- lint                    just the lint\n',
    )
    return
  }

  if (first === 'lint') {
    panelD()
    return
  }

  if (first === 'run') {
    const seed = Number(second ?? 1)
    const difficulty = (third ?? 'stirring') as Difficulty
    panelC(Number.isFinite(seed) ? seed : 1, difficulty)
    return
  }

  if ((NARRATED_ACTIONS as readonly string[]).includes(first)) {
    const archetype =
      second !== undefined && (ARCHETYPES as readonly string[]).includes(second)
        ? (second as RoomArchetype)
        : null
    panelB(first as ActionKind, archetype)
    return
  }

  console.log(`Unknown mode "${first}".`)
  console.log(`Narrated verbs: ${NARRATED_ACTIONS.join(', ')}`)
  console.log(`Archetypes: ${ARCHETYPES.join(', ')}`)
  console.log('Modes: run <seed> [difficulty], lint')
}

main()

// A `Beat` is imported for the type-only side of the table walk above; naming
// it here keeps the import honest under `noUnusedLocals`.
export type { Beat }
