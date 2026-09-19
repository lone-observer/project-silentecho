/**
 * The hazard-verb viewer.  npm run hazard -- [mode] [args]
 *
 *   npm run hazard                        Panel A — the coverage matrix
 *   npm run hazard -- cost                Panel B — every band's price, and the
 *                                         exact d20 odds of reaching it per stat
 *   npm run hazard -- run <seed> [difficulty] [policy]
 *                                         Panel C — a run's hazard beats in order
 *   SWEEP=n npm run hazard -- oil [difficulty]
 *                                         Panel D — the oil economy, measured
 *
 * WHY THIS EXISTS, in the order the panels earn their keep.
 *
 * Panel A is the cheap one and it is the one that would have caught the design
 * gap this whole step was built around. GDD 2.8's promise is that every stat
 * has exactly one hazard it cannot answer — and as first specified, INT
 * answered all three, because INT owns Tame, Endure AND Avoid. That is not
 * visible in prose. It is a column of a table, and the table is one screen.
 *
 * Panel B exists because `HAZARD_VERB_OUTCOMES` is two cost MODELS pretending
 * to be two tables. Force buys time and always pays in Confused; Endure pays a
 * flat time and buys Confused down. Whether that reads as a real choice or as
 * one obviously-correct option is a thing you decide by putting the two columns
 * side by side with the odds of reaching each row attached, which no assertion
 * can do for you.
 *
 * Panel C is the ordering check, the same argument `scripts/prose.ts` makes for
 * Panel C there: a hazard now spans two turns — the flag goes up on arrival and
 * comes down when you answer it — and every ordering defect that shape can have
 * is invisible in the tables and obvious in a transcript.
 *
 * Panel D is the one this session was actually asked for. The hazard reward and
 * the ambient flask count are one number wearing two hats, and GDD 2.8 leaves
 * both open on purpose: "size it against real scarcity data." This panel is
 * that data. It reports the DISTRIBUTION, not a verdict.
 *
 * EVERY AXIS IS DERIVED FROM THE TABLES, never restated. 1e's lesson from
 * `tame.ts` Panel B: a visualiser that hardcodes the rule it is watching is a
 * visualiser that lies on the day the rule changes, which is the only day you
 * are looking at it. Add a hazard verb and every panel here grows a column.
 */

import { rngFromState } from '../src/engine/rng.ts'
import { applyAction, createRun, legalActions } from '../src/engine/resolve.ts'
import type { LegalAction } from '../src/engine/resolve.ts'
import { distancesFrom } from '../src/engine/generate.ts'
import { bandForMargin, statModifier } from '../src/engine/dice.ts'
import { BAND_ORDER } from '../src/engine/types.ts'
import type {
  Action,
  Difficulty,
  GameEvent,
  GameState,
  HazardKind,
  NarrationBeat,
  OutcomeBand,
  RunOutcome,
  StatKey,
} from '../src/engine/types.ts'
import {
  ACTION_DC,
  ACTION_STAT,
  DEFAULT_DIFFICULTY,
  HAZARD_VERB_OUTCOMES,
  HAZARD_VERB_STAT,
  oilCostFor,
  PLAYER,
  HAZARD_VERBS,
  HAZARD_DC,
  HAZARD_STAT,
  OIL,
  OIL_BANDS,
  oilBandFor,
  POPULATION,
  HAZARD_COUNTS,
  SCENT_BY_ACTION,
  STATUS,
  VERB_HAZARDS,
  VERBS_FOR_HAZARD,
} from '../src/engine/data/tuning.ts'
import type { HazardVerb } from '../src/engine/data/tuning.ts'
import { HAZARD_WORD } from '../src/engine/data/outcomes.ts'

// ---------------------------------------------------------------------------
// Formatting
// ---------------------------------------------------------------------------

const DIFFICULTIES: readonly Difficulty[] = ['drowsing', 'stirring', 'hunting', 'ravening']

const BAND_SHORT: Record<OutcomeBand, string> = {
  criticalFailure: 'critFail',
  failure: 'fail',
  mixed: 'mixed',
  success: 'success',
  strongSuccess: 'strong',
  criticalSuccess: 'critical',
}

const STAT_SHORT: Record<StatKey, string> = { str: 'STR', agi: 'AGI', int: 'INT', lck: 'LCK' }

function pad(s: string, width: number): string {
  return s.length >= width ? s : s + ' '.repeat(width - s.length)
}
function padLeft(s: string, width: number): string {
  return s.length >= width ? s : ' '.repeat(width - s.length) + s
}
function rule(width = 78): string {
  return '─'.repeat(width)
}
function heading(title: string): void {
  console.log('')
  console.log(title)
  console.log(rule())
}
function pct(x: number): string {
  return `${(x * 100).toFixed(1)}%`
}
function num(x: number, places = 2): string {
  return x.toFixed(places)
}

// ---------------------------------------------------------------------------
// Shared: exact d20 band odds
//
// Not simulated. The die is uniform over 1..20 and the band is a function of
// the total, so the distribution is exact arithmetic — a sampled version of
// this would be a worse answer to the same question, and it would move between
// runs, which is the last thing a balance table needs.
// ---------------------------------------------------------------------------

function bandOdds(dc: number, mod: number): Record<OutcomeBand, number> {
  const counts = Object.fromEntries(BAND_ORDER.map((b) => [b, 0])) as Record<OutcomeBand, number>
  for (let natural = 1; natural <= 20; natural++) {
    let band = bandForMargin(natural + mod - dc)
    // The natural-1 and natural-20 bounds from dice.ts, restated here ONLY
    // because bandForMargin is the exported half. If these ever disagree with
    // applyNaturalOverride the odds printed here are a lie — asserted in
    // tests/hazards.test.ts against the real roller rather than trusted.
    if (natural === 1 && BAND_ORDER.indexOf(band) > BAND_ORDER.indexOf('failure')) band = 'failure'
    if (natural === 20 && BAND_ORDER.indexOf(band) < BAND_ORDER.indexOf('success')) band = 'success'
    counts[band] += 1 / 20
  }
  return counts
}

/** The hazard a verb answers, derived rather than stated. */
function hazardFor(verb: HazardVerb): HazardKind {
  for (const hazard of VERB_HAZARDS) {
    if ((VERBS_FOR_HAZARD[hazard] ?? []).includes(verb)) return hazard
  }
  throw new Error(`hazard.ts: ${verb} answers no hazard — VERBS_FOR_HAZARD has a gap`)
}

/**
 * One hazard outcome priced in oil.
 *
 * TURNS ARE CONVERTED AT THE GAME'S OWN EXCHANGE RATE, not at a rate invented
 * here: oil burns one point every `OIL.burnEveryNTurns` turns, so a turn costs
 * exactly that much oil and nothing about the conversion is a judgement call.
 *
 * Damage and Confused are NOT folded in, and that is deliberate. There is no
 * honest exchange rate between turns and oil now that the passive burn is gone:
 * a turn no longer costs a fraction of a lamp on a timer, it costs whatever the
 * player spends it on. So this reports the ACTION's oil and leaves turns and
 * Confused in their own units alongside, which is what they always should have
 * been — the old version folded turns into oil at the burn rate and produced a
 * single tidy number that quietly encoded a design decision nobody made.
 *
 * Signed, per GDD 2.6: positive is spent, negative is oil coming back.
 */
function verbOil(verb: HazardVerb, band: OutcomeBand): number {
  return oilCostFor(verb, band)
}

/**
 * The stat column. DISARM has no row in `HAZARD_VERB_STAT` — being absent from
 * that table is what makes it stat-agnostic (GDD 2.7), so the panel says so
 * rather than printing a blank and leaving the reader to wonder.
 */
function statLabel(verb: HazardVerb): string {
  const key = HAZARD_VERB_STAT[verb]
  return key === undefined ? 'any' : STAT_SHORT[key]
}

// ---------------------------------------------------------------------------
// Panel A — the coverage matrix
// ---------------------------------------------------------------------------

function panelCoverage(): void {
  heading('PANEL A · the coverage matrix — which stat each hazard has no answer for')

  const stats: readonly StatKey[] = ['str', 'agi', 'int']
  const hazards: readonly HazardKind[] = ['sporeBloom', 'snareCarving', 'pit']

  console.log(
    `  ${pad('hazard', 16)}${pad('options', 26)}${pad('covers', 16)}no option`,
  )
  // The creature row is not a hazard and is printed from its own table for
  // contrast — it is the shape the hazards were redesigned to match.
  console.log(
    `  ${pad('creature', 16)}${pad('FIGHT / TAME / SNEAK', 26)}${pad('STR INT AGI', 16)}—`,
  )
  for (const hazard of hazards) {
    const verbs = VERBS_FOR_HAZARD[hazard] ?? []
    const covered = new Set(verbs.map((v) => HAZARD_VERB_STAT[v]))
    const missing = stats.filter((s) => !covered.has(s))
    const options = verbs.length === 0 ? 'none (absolute)' : verbs.map((v) => v.toUpperCase()).join(' / ')
    const coversText = verbs.length === 0 ? '—' : stats.filter((s) => covered.has(s)).map((s) => STAT_SHORT[s]).join(' ')
    const missingText =
      verbs.length === 0 ? 'all' : missing.map((s) => STAT_SHORT[s]).join(' ') || '— NONE'
    console.log(
      `  ${pad(HAZARD_WORD[hazard], 16)}${pad(options, 26)}${pad(coversText, 16)}${missingText}`,
    )
  }

  console.log('')
  console.log('  Read the last column. Every row but the creature must name at least one stat.')
  console.log('  A hazard with "— NONE" there is a hazard some build walks through for free,')
  console.log('  which is the gap the whole 1g redesign exists to close (GDD 2.8).')

  console.log('')
  console.log(`  ${pad('verb', 10)}${pad('hazard', 16)}${pad('stat', 6)}${pad('DC', 4)}${pad('scent', 7)}loudness`)
  const quietest = Math.min(...HAZARD_VERBS.map((v) => SCENT_BY_ACTION[v]))
  for (const verb of HAZARD_VERBS) {
    const scent = SCENT_BY_ACTION[verb]
    // Loud/quiet is read off the table against FIGHT and TAME, the two anchors
    // GDD 2.10 names, rather than against a threshold typed in here.
    const loud = scent > SCENT_BY_ACTION.tame
    console.log(
      `  ${pad(verb.toUpperCase(), 10)}${pad(HAZARD_WORD[hazardFor(verb)], 16)}` +
        `${pad(statLabel(verb), 6)}${pad(String(ACTION_DC[verb]), 4)}` +
        `${pad(num(scent, 2), 7)}${loud ? 'LOUD  (> TAME)' : 'quiet (<= TAME)'}` +
        (scent === quietest ? '  <- quietest' : ''),
    )
  }
  console.log('')
  console.log(`  For scale: SNEAK ${SCENT_BY_ACTION.sneak}, TAME ${SCENT_BY_ACTION.tame}, MOVE ${SCENT_BY_ACTION.move}, FLEE ${SCENT_BY_ACTION.flee}, FIGHT ${SCENT_BY_ACTION.fight}.`)
  console.log('  GDD 2.10: FORCE is loud with FIGHT; ENDURE, AVOID and DODGE are quiet with SNEAK/TAME.')

  console.log('')
  console.log(`  ACTION_STAT vs HAZARD_VERB_STAT: ${HAZARD_VERBS.every((v) => ACTION_STAT[v] === HAZARD_VERB_STAT[v]) ? 'agree' : 'DISAGREE — one of the two tables is lying'}`)
  const pitStat = HAZARD_STAT.pit
  console.log(
    `  Pit still resolves on entry, ${pitStat ? STAT_SHORT[pitStat] : '?'} DC ${HAZARD_DC.pit ?? '?'},` +
      ` no verbs. By design (CLAUDE.md 3).`,
  )
}

// ---------------------------------------------------------------------------
// Panel B — the price of every band, and the odds of reaching it
// ---------------------------------------------------------------------------

function panelCost(): void {
  heading('PANEL B · what each band costs, and how often you get it')

  for (const hazard of VERB_HAZARDS) {
    const verbs = VERBS_FOR_HAZARD[hazard] ?? []
    console.log('')
    console.log(`  ${HAZARD_WORD[hazard].toUpperCase()} — ${verbs.map((v) => v.toUpperCase()).join(' vs ')}`)
    console.log('')
    console.log(
      `  ${pad('band', 10)}` +
        verbs
          .map((v) => pad(`${v.toUpperCase()}: turns     oil  conf`, 40))
          .join(''),
    )
    for (const band of BAND_ORDER) {
      let line = `  ${pad(BAND_SHORT[band], 10)}`
      for (const verb of verbs) {
        const o = HAZARD_VERB_OUTCOMES[verb][band]
        const turns = 1 + o.extraTurns
        const conf = o.applies === null ? '—' : String(o.statusTurns)
        const oil = verbOil(verb, band)
        line += pad(
          `       ${padLeft(String(turns), 5)}${padLeft((oil > 0 ? '-' : oil < 0 ? '+' : ' ') + num(Math.abs(oil)), 8)}` +
            `${padLeft(conf, 6)}`,
          40,
        )
      }
      console.log(line)
    }

    // The two invariants this pair is supposed to encode, checked against the
    // table rather than described. GDD 2.8 and the 17 Sep design log.
    if (hazard === 'sporeBloom') {
      const force = HAZARD_VERB_OUTCOMES.force
      const endure = HAZARD_VERB_OUTCOMES.endure
      const forceTurnsVary = new Set(BAND_ORDER.map((b) => force[b].extraTurns)).size > 1
      const forceConfFlat = new Set(BAND_ORDER.filter((b) => force[b].applies !== null).map((b) => force[b].statusTurns)).size
      const endureTurnsFlat = new Set(BAND_ORDER.map((b) => endure[b].extraTurns)).size === 1
      const endureConfVary = new Set(BAND_ORDER.map((b) => endure[b].statusTurns)).size > 1
      const endureAlwaysConfuses = BAND_ORDER.every((b) => endure[b].applies !== null && endure[b].statusTurns >= 1)
      const forceAlwaysConfuses = BAND_ORDER.every((b) => force[b].applies !== null)
      console.log('')
      console.log(`    FORCE  turn cost varies with margin: ${forceTurnsVary ? 'yes' : 'NO — the verb has no upside'}`)
      console.log(`    FORCE  Confused applies in every band: ${forceAlwaysConfuses ? 'yes' : 'NO — breaks GDD 2.8'}`)
      console.log(`    ENDURE turn cost is flat:              ${endureTurnsFlat ? 'yes' : 'NO — breaks GDD 2.8'}`)
      console.log(`    ENDURE Confused duration varies:       ${endureConfVary ? 'yes' : 'NO — the verb has no upside'}`)
      console.log(`    ENDURE never cancels Confused:         ${endureAlwaysConfuses ? 'yes' : 'NO — INT becomes the free pass'}`)
      console.log(`    (FORCE writes ${forceConfFlat} distinct Confused duration(s); ENDURE's floor is ${Math.min(...BAND_ORDER.map((b) => endure[b].statusTurns))}, baseline ${STATUS.confusedTurns}.)`)
    }

    console.log('')
    console.log(`  Odds of each band, by the stat the verb tests (stat 8 is fresh, 18 is maxed):`)
    for (const verb of verbs) {
      const dc = ACTION_DC[verb]
      console.log('')
      console.log(`    ${verb.toUpperCase()} (${statLabel(verb)} vs DC ${dc})`)
      console.log(
        `      ${pad('stat', 6)}${BAND_ORDER.map((b) => padLeft(BAND_SHORT[b], 10)).join('')}${padLeft('paid', 10)}`,
      )
      for (const stat of [8, 10, 12, 14, 16, 18]) {
        const odds = bandOdds(dc, statModifier(stat))
        // "Paid" is the bands where the verb hands oil BACK, read off the price
        // model rather than off a band name, so a retune moves this column with
        // it. Panel B's lesson from 1e: a visualiser that hardcodes the rule it
        // is watching lies on the day the rule changes.
        const cleared = BAND_ORDER.filter((b) => verbOil(verb, b) < 0)
          .reduce((s, b) => s + odds[b], 0)
        console.log(
          `      ${pad(String(stat), 6)}${BAND_ORDER.map((b) => padLeft(pct(odds[b]), 10)).join('')}${padLeft(pct(cleared), 10)}`,
        )
      }
    }

    // The expectation both numbers have to satisfy, at the stat the player
    // actually starts with.
    console.log('')
    console.log(`  Expected value of ONE attempt at starting stats (${PLAYER.startingStat}, mod ${statModifier(PLAYER.startingStat)}):`)
    console.log(
      `    ${pad('verb', 8)}${padLeft('oil', 8)}${padLeft('turns', 8)}${padLeft('conf', 7)}`,
    )
    for (const verb of verbs) {
      const odds = bandOdds(ACTION_DC[verb], statModifier(PLAYER.startingStat))
      let oil = 0
      let turns = 0
      let conf = 0
      for (const band of BAND_ORDER) {
        const o = HAZARD_VERB_OUTCOMES[verb][band]
        oil += odds[band] * verbOil(verb, band)
        turns += odds[band] * (1 + o.extraTurns)
        conf += odds[band] * (o.applies === null ? 0 : o.statusTurns)
      }
      console.log(
        `    ${pad(verb.toUpperCase(), 8)}${padLeft('-' + num(oil), 8)}${padLeft(num(turns), 8)}${padLeft(num(conf), 7)}` +
          (oil < 0 ? '   <- NET POSITIVE, this is an oil farm' : ''),
      )
    }
    console.log('')
    console.log('  GDD 2.8 asks for reward SMALLER than the average failure cost, so that')
    console.log('  attempting a hazard stays net-negative in expectation. A positive `net`')
    console.log('  column means the labyrinth is paying the player to walk into blooms.')
  }
}

// ---------------------------------------------------------------------------
// Policies
//
// Neither is the heuristic bot 1i owes; both read the true map, which an
// AgentView never will. That is fine for a balance harness and NOT fine for a
// benchmark, and the distinction is exactly what docs/EVALS.md's no-leakage
// rule is about. Stated here so nobody promotes one of these later by accident.
// ---------------------------------------------------------------------------

type PolicyName = 'route' | 'forager' | 'quiet'

/**
 * How a policy answers a hazard.
 *
 * TWO RULES, NOT ONE, AND THAT IS THE POINT. The first version of this file had
 * only `cheapest`, and the first sweep it produced showed ENDURE and DODGE
 * chosen zero times out of 164 hazards — because a value function denominated
 * in oil cannot see what those two verbs are FOR. Endure buys a shorter
 * Confused and near-silence; Dodge buys speed over Avoid's caution. Neither
 * shows up in an oil ledger, so an oil-maximising policy proves only that it is
 * an oil-maximising policy, and half the mechanic goes unmeasured.
 *
 *   cheapest  best expected oil, counting the reward, the oil lost and the
 *             turns at the game's own turn-to-oil rate. Damage is weighted
 *             because health is a countdown, not a budget.
 *   quietest  least scent, ties broken by expected oil. This is the policy that
 *             takes GDD 2.10's fast-and-loud-vs-slow-and-quiet split seriously.
 *
 * Both are DERIVED from the tables, never hardcoded — retune the cost models
 * and both preferences move with them, so Panel D keeps measuring "a player who
 * chooses on this axis" rather than "a player who always picks FORCE".
 */
function hazardVerbValue(state: GameState, verb: HazardVerb): number {
  const key = HAZARD_VERB_STAT[verb]
  // A stat-agnostic verb rolls flat, so its odds take no modifier — the same
  // short-circuit the reducer makes in `rollForAction`.
  const mod = key === undefined ? 0 : statModifier(state.player.stats[key])
  const odds = bandOdds(ACTION_DC[verb], mod)
  let value = 0
  for (const band of BAND_ORDER) {
    value += odds[band] * -verbOil(verb, band)
  }
  return value
}

function bestHazardVerb(
  policy: PolicyName,
  state: GameState,
  menu: readonly LegalAction[],
): Action | null {
  let best: Action | null = null
  let bestKey: readonly [number, number] | null = null
  for (const entry of menu) {
    const kind = entry.action.kind
    if (!HAZARD_VERBS.includes(kind as HazardVerb)) continue
    const verb = kind as HazardVerb
    const oil = hazardVerbValue(state, verb)
    // Sorted on a pair so the tie-break is explicit rather than incidental.
    const key: readonly [number, number] =
      policy === 'quiet' ? [-SCENT_BY_ACTION[verb], oil] : [oil, -SCENT_BY_ACTION[verb]]
    if (
      bestKey === null ||
      key[0] > bestKey[0] ||
      (key[0] === bestKey[0] && key[1] > bestKey[1])
    ) {
      bestKey = key
      best = entry.action
    }
  }
  return best
}

function pickAction(
  policy: PolicyName,
  state: GameState,
  menu: readonly LegalAction[],
  salt: number,
): Action {
  const hazardVerb = bestHazardVerb(policy, state, menu)
  if (hazardVerb !== null) return hazardVerb

  // Burn a flask before the lamp does something expensive to every roll.
  const guttering = oilBandFor(state.player.oil).modifier < 0
  if (guttering) {
    const use = menu.find((m) => m.action.kind === 'use')
    if (use) return use.action
  }

  // The forager searches an unsearched room it is standing in; the router does
  // not. The two together bracket how much ambient oil a run can actually pick
  // up, which is half of the question Panel D exists to answer.
  if (policy === 'forager') {
    const here = state.labyrinth.rooms[state.player.roomId]
    if (here?.oilFlask === true) {
      const search = menu.find((m) => m.action.kind === 'search')
      if (search) return search.action
    }
  }

  const target = state.player.carryingHeart
    ? state.labyrinth.entranceId
    : state.labyrinth.heartRoomId
  const distance = distancesFrom(state.labyrinth, target)
  const here = state.labyrinth.rooms[state.player.roomId]
  let best: Action | null = null
  let bestDistance = Number.POSITIVE_INFINITY
  for (const entry of menu) {
    const action = entry.action
    if (action.kind !== 'move' && action.kind !== 'sneak' && action.kind !== 'flee') continue
    const to = here?.exits[action.direction]
    if (to === undefined) continue
    const d = distance[to]
    if (d !== undefined && d < bestDistance) {
      bestDistance = d
      best = action
    }
  }
  return best ?? (menu[salt % menu.length] as LegalAction).action
}

// ---------------------------------------------------------------------------
// Running
// ---------------------------------------------------------------------------

interface RunTally {
  readonly outcome: RunOutcome
  readonly turns: number
  /** Oil the passive schedule burned. */
  passiveBurn: number
  /** Oil lost to hazard bands and action extra-costs. */
  otherBurn: number
  /** Oil put back by flasks. */
  restored: number
  flasksFoundAmbient: number
  flasksEarnedHazard: number
  flasksEarnedFight: number
  flasksUsed: number
  flasksUnspent: number
  hazardsMet: number
  hazardsByVerb: Record<HazardVerb, number>
  bandsByVerb: Record<HazardVerb, Record<OutcomeBand, number>>
  confusedTurns: number
  hazardOil: number
  minOil: number
  /** Oil still in the lamp when the run ended. */
  endOil: number
  /** Turns spent in each oil band, by band name. */
  turnsInBand: Record<string, number>
}

function emptyTally(outcome: RunOutcome, turns: number): RunTally {
  const byVerb = Object.fromEntries(HAZARD_VERBS.map((v) => [v, 0])) as Record<HazardVerb, number>
  const bands = Object.fromEntries(
    HAZARD_VERBS.map((v) => [v, Object.fromEntries(BAND_ORDER.map((b) => [b, 0]))]),
  ) as Record<HazardVerb, Record<OutcomeBand, number>>
  return {
    outcome,
    turns,
    passiveBurn: 0,
    otherBurn: 0,
    restored: 0,
    flasksFoundAmbient: 0,
    flasksEarnedHazard: 0,
    flasksEarnedFight: 0,
    flasksUsed: 0,
    flasksUnspent: 0,
    hazardsMet: 0,
    hazardsByVerb: byVerb,
    bandsByVerb: bands,
    confusedTurns: 0,
    hazardOil: 0,
    minOil: OIL.max,
    endOil: OIL.starting,
    turnsInBand: Object.fromEntries(OIL_BANDS.map((b) => [b.name, 0])),
  }
}

/**
 * Drive one run and tally it.
 *
 * EVERY NUMBER IS READ OFF THE EVENT STREAM, not recomputed from the tables.
 * That is the whole point: a tally derived from `HAZARD_VERB_OUTCOMES` would
 * agree with `HAZARD_VERB_OUTCOMES` by construction and could never catch the
 * reducer failing to apply a row. Beats are matched on `beat` ids, never on
 * text — 1f's finding 4, where `scripts/turn.ts` identified oil events by
 * comparing prose and started mislabelling them the moment a second variant
 * existed.
 */
function driveRun(
  policy: PolicyName,
  seed: number,
  difficulty: Difficulty,
  onEvents?: (state: GameState, action: Action, events: readonly GameEvent[]) => void,
): RunTally {
  let state = createRun(seed, { difficulty })
  let tally = emptyTally('inProgress', 0)
  let guard = 0

  while (state.outcome === 'inProgress' && guard < state.maxTurns * 3) {
    guard += 1
    const menu = legalActions(state)
    if (menu.length === 0) break
    const action = pickAction(policy, state, menu, seed * 7 + guard * 3)
    const before = state
    const result = applyAction(state, action, rngFromState(state.rng))
    onEvents?.(before, action, result.events)

    const oilBandName = oilBandFor(before.player.oil).name
    const consumed = Math.max(1, result.state.turn - before.turn)
    tally.turnsInBand[oilBandName] = (tally.turnsInBand[oilBandName] ?? 0) + consumed

    for (const event of result.events) {
      if (event.kind === 'oilChanged') {
        if (event.beat === 'lampBurnsDown') tally.passiveBurn += Math.abs(event.delta)
        else if (event.delta < 0) tally.otherBurn += Math.abs(event.delta)
        else tally.restored += event.delta
      }
      if (event.kind === 'narration') {
        const beat: NarrationBeat = event.beat
        if (beat === 'foundFlask') tally.flasksFoundAmbient += 1
        if (beat === 'hazardCleared') tally.flasksEarnedHazard += 1
        if (beat === 'spoilsTaken') tally.flasksEarnedFight += 1
        if (beat === 'hazardBlocks') tally.hazardsMet += 1
      }
      if (event.kind === 'roll' && HAZARD_VERBS.includes(event.action as HazardVerb)) {
        const verb = event.action as HazardVerb
        tally.hazardsByVerb[verb] += 1
        tally.bandsByVerb[verb][event.result.band] += 1
        tally.hazardOil += verbOil(verb, event.result.band)
      }
      if (event.kind === 'statusChanged' && event.status === 'confused') {
        tally.confusedTurns += event.turns
      }
    }
    if (action.kind === 'use' && action.item === 'oilFlask') tally.flasksUsed += 1
    tally.minOil = Math.min(tally.minOil, result.state.player.oil)
    state = result.state
  }

  tally = {
    ...tally,
    outcome: state.outcome,
    turns: state.turn,
    endOil: state.player.oil,
    flasksUnspent: state.player.inventory.filter((i) => i === 'oilFlask').length,
  }
  return tally
}

// ---------------------------------------------------------------------------
// Panel C — one run's hazard beats, in order
// ---------------------------------------------------------------------------

function panelRun(seed: number, difficulty: Difficulty, policy: PolicyName): void {
  heading(`PANEL C · seed ${seed}, ${difficulty}, policy "${policy}" — hazards in order`)
  console.log('  A hazard now spans TWO turns: the flag goes up on arrival, and comes down')
  console.log('  when you answer it. `blocks` with no `answer` after it is the defect to')
  console.log('  look for — a menu the player was handed and never got to resolve.')
  console.log('')

  let open: string | null = null
  const tally = driveRun(policy, seed, difficulty, (state, action, events) => {
    const lines: string[] = []
    for (const event of events) {
      if (event.kind === 'narration' && event.beat === 'hazardBlocks') {
        const hazard = state.labyrinth.rooms[state.player.roomId]?.hazard
        open = `turn ${state.turn}`
        lines.push(`    blocks   ${event.text}`)
        void hazard
      }
      if (event.kind === 'roll' && HAZARD_VERBS.includes(event.action as HazardVerb)) {
        const mods = event.result.modifiers.map((m) => `${m.source} ${m.value >= 0 ? '+' : ''}${m.value}`).join(', ')
        lines.push(
          `    roll     ${event.action.toUpperCase()}  d20=${event.result.natural}` +
            ` [${mods}] = ${event.result.total} vs DC ${event.result.dc}` +
            `  margin ${event.result.margin >= 0 ? '+' : ''}${event.result.margin}` +
            `  -> ${BAND_SHORT[event.result.band]}${event.result.overridden ? ' (natural override)' : ''}`,
        )
        lines.push(`    answer   opened ${open ?? '?'}, answered turn ${state.turn}`)
        open = null
      }
      if (event.kind === 'narration' && (event.beat === 'actionOutcome' || event.beat === 'hazardCleared')) {
        if (HAZARD_VERBS.includes(action.kind as HazardVerb)) {
          lines.push(`    ${pad(event.beat === 'hazardCleared' ? 'reward' : 'outcome', 9)}${event.text}`)
        }
      }
      if (event.kind === 'statusChanged') {
        lines.push(`    status   ${event.status} for ${event.turns} turn(s)`)
      }
    }
    if (lines.length > 0) {
      console.log(`  turn ${padLeft(String(state.turn), 2)}  oil ${padLeft(String(state.player.oil), 2)} (${oilBandFor(state.player.oil).name})`)
      for (const line of lines) console.log(line)
    }
  })

  console.log('')
  console.log(`  Ended: ${tally.outcome} on turn ${tally.turns}.`)
  console.log(`  Hazards met ${tally.hazardsMet}, answered ${Object.values(tally.hazardsByVerb).reduce((a, b) => a + b, 0)}.`)
  if (open !== null) {
    console.log(`  *** A hazard opened ${open} and was never answered. That is a defect. ***`)
  }
}

// ---------------------------------------------------------------------------
// Panel D — the oil economy, measured
// ---------------------------------------------------------------------------

function panelOil(difficulty: Difficulty, sweep: number): void {
  heading(`PANEL D · the oil economy over ${sweep} seeds x route/forager/quiet at ${difficulty}`)
  console.log('  The question GDD 2.8 leaves open: how big should a cleared hazard pay, and')
  console.log('  how much oil should be lying on the floor? They are one number. Sizing')
  console.log('  either alone solves for it and breaks the other.')
  console.log('')
  console.log(`  Current settings: oil comes back on ${BAND_ORDER.filter((b) => verbOil('avoid', b) < 0).map((b) => BAND_SHORT[b]).join('/')},`)
  console.log(`  ambient flasks ${POPULATION.oilFlasks[0]}-${POPULATION.oilFlasks[1]} per labyrinth, flask worth ${OIL.flaskValue} oil, lamp starts at ${OIL.starting}.`)
  console.log(`  Hazards per labyrinth: bloom ${HAZARD_COUNTS.sporeBloom.join('-')}, snare ${HAZARD_COUNTS.snareCarving.join('-')}, pit ${HAZARD_COUNTS.pit.join('-')}.`)

  for (const policy of ['route', 'forager', 'quiet'] as const) {
    const runs: RunTally[] = []
    for (let seed = 1; seed <= sweep; seed++) runs.push(driveRun(policy, seed, difficulty))

    const mean = (f: (t: RunTally) => number): number =>
      runs.reduce((s, t) => s + f(t), 0) / runs.length
    const share = (f: (t: RunTally) => boolean): number => runs.filter(f).length / runs.length

    console.log('')
    console.log(`  ── policy "${policy}" ${'─'.repeat(60 - policy.length)}`)
    console.log(`     outcomes: ` + (['escaped', 'retreated', 'caught', 'killed', 'outOfTurns'] as const)
      .map((o) => `${o} ${pct(share((t) => t.outcome === o))}`).join('  '))
    console.log(`     turns survived: mean ${num(mean((t) => t.turns), 1)}`)

    console.log('')
    console.log(`     OIL OUT (mean per run)`)
    // The passive burn is retired (GDD 2.8.1) — every point of oil out is now
    // the price of something the player chose to do.
    console.log(`       spent on actions                            ${padLeft(num(mean((t) => t.otherBurn)), 7)}`)

    const ambient = mean((t) => t.flasksFoundAmbient)
    const earnedH = mean((t) => t.flasksEarnedHazard)
    const earnedF = mean((t) => t.flasksEarnedFight)
    const earned = earnedH + earnedF
    const acquired = ambient + earned
    console.log('')
    console.log(`     FLASKS IN (mean per run)`)
    console.log(`       found ambient (SEARCH)                      ${padLeft(num(ambient), 7)}`)
    console.log(`       earned clearing a hazard                    ${padLeft(num(earnedH), 7)}`)
    console.log(`       earned driving off a creature               ${padLeft(num(earnedF), 7)}`)
    console.log(`       total acquired                              ${padLeft(num(acquired), 7)}`)
    console.log(`       of which EARNED rather than FOUND           ${padLeft(acquired > 0 ? pct(earned / acquired) : '—', 7)}`)
    console.log(`       used                                        ${padLeft(num(mean((t) => t.flasksUsed)), 7)}`)
    console.log(`       still in the pack at the end                ${padLeft(num(mean((t) => t.flasksUnspent)), 7)}`)
    console.log(`       oil restored                                ${padLeft(num(mean((t) => t.restored)), 7)}`)

    const netBurn = mean((t) => t.passiveBurn + t.otherBurn - t.restored)
    console.log('')
    console.log(`     NET`)
    console.log(`       net oil consumed per run                    ${padLeft(num(netBurn), 7)}`)
    console.log(`       against a ${OIL.starting}-point lamp: ${netBurn > OIL.starting ? 'runs out' : 'finishes with ' + num(OIL.starting - netBurn) + ' spare'}`)
    console.log(`       lowest oil reached, mean                    ${padLeft(num(mean((t) => t.minOil)), 7)}`)
    console.log(`       runs that hit Dark (oil 0)                  ${padLeft(pct(share((t) => t.minOil === 0)), 7)}`)
    console.log(`       runs that never left Bright                 ${padLeft(pct(share((t) => t.minOil >= 7)), 7)}`)
    // GDD 2.8.1's actual claim is about a run that LASTS, and most runs do not:
    // the Wumpus ends them around turn 12. Averaging oil over every run
    // therefore measures how early runs end, not whether oil is a real budget.
    // These two lines are the claim tested on the runs it was written about.
    const long = runs.filter((t) => t.turns >= 18)
    console.log(`       oil left at the end, all runs               ${padLeft(num(mean((t) => t.endOil)), 7)}`)
    console.log(
      `       oil left at the end, runs reaching turn 18+  ` +
        `${padLeft(long.length === 0 ? 'n=0' : num(long.reduce((s, t) => s + t.endOil, 0) / long.length), 7)}` +
        `   (n=${long.length} of ${runs.length})`,
    )

    const totalTurns = runs.reduce((s, t) => s + Object.values(t.turnsInBand).reduce((a, b) => a + b, 0), 0)
    console.log('')
    console.log(`     TURNS BY LAMP STATE (share of all turns played)`)
    for (const band of OIL_BANDS) {
      const inBand = runs.reduce((s, t) => s + (t.turnsInBand[band.name] ?? 0), 0)
      console.log(
        `       ${pad(band.name, 12)}${padLeft(pct(totalTurns > 0 ? inBand / totalTurns : 0), 8)}` +
          `   (roll ${band.modifier >= 0 ? '+' : ''}${band.modifier}, lantern ${band.lanternRadius})`,
      )
    }

    console.log('')
    console.log(`     HAZARD ENCOUNTERS`)
    console.log(`       met per run, mean                           ${padLeft(num(mean((t) => t.hazardsMet)), 7)}`)
    console.log(`       runs that met none                          ${padLeft(pct(share((t) => t.hazardsMet === 0)), 7)}`)
    console.log(`       Confused turns inflicted, mean              ${padLeft(num(mean((t) => t.confusedTurns)), 7)}`)
    console.log(`       net oil spent on hazard verbs, mean         ${padLeft(num(mean((t) => t.hazardOil)), 7)}`)
    console.log('')
    console.log(`       ${pad('verb', 9)}${padLeft('n', 6)}   ` + BAND_ORDER.map((b) => padLeft(BAND_SHORT[b], 10)).join('') + padLeft('paid', 8))
    for (const verb of HAZARD_VERBS) {
      const n = runs.reduce((s, t) => s + t.hazardsByVerb[verb], 0)
      if (n === 0) {
        console.log(`       ${pad(verb.toUpperCase(), 9)}${padLeft('0', 6)}   — never chosen`)
        continue
      }
      const bands = BAND_ORDER.map((b) => runs.reduce((s, t) => s + t.bandsByVerb[verb][b], 0))
      const paid = BAND_ORDER.reduce(
        (s, b, i) => s + (verbOil(verb, b) < 0 ? (bands[i] ?? 0) : 0),
        0,
      )
      console.log(
        `       ${pad(verb.toUpperCase(), 9)}${padLeft(String(n), 6)}   ` +
          bands.map((c) => padLeft(pct(c / n), 10)).join('') +
          padLeft(pct(paid / n), 8),
      )
    }
  }

  console.log('')
  console.log(`  ${rule(74)}`)
  console.log('  HOW TO READ THIS FOR TUNING')
  console.log('  1. "net oil consumed" against the 12-point lamp says whether oil is a')
  console.log('     budget or a formality. GDD 2.8.1 wants a clean run to end with a')
  console.log('     little left — meaning Ember, not Bright, and not empty.')
  console.log('  2. "of which EARNED rather than FOUND" is the lever Gautham asked for:')
  console.log('     the economy should lean on earned oil. Moving it has two handles,')
  console.log('     the reward bands and POPULATION.oilFlasks, and they trade off.')
  console.log('  3. Panel B\'s `net` column is the constraint: per-attempt expectation')
  console.log('     must stay negative however generous the run-level totals look.')
}

// ---------------------------------------------------------------------------
// Entry
// ---------------------------------------------------------------------------

function main(): void {
  const [mode, ...rest] = process.argv.slice(2)
  const sweep = Number(process.env.SWEEP ?? '0') || 60

  if (mode === undefined || mode === 'matrix') {
    panelCoverage()
    console.log('')
    console.log('  npm run hazard -- cost                  the band tables and the odds')
    console.log('  npm run hazard -- run <seed> [difficulty] [route|forager]')
    console.log('  SWEEP=n npm run hazard -- oil [difficulty]')
    return
  }
  if (mode === 'cost') {
    panelCost()
    return
  }
  if (mode === 'run') {
    const seed = Number(rest[0] ?? '1')
    const difficulty = (rest[1] as Difficulty) ?? DEFAULT_DIFFICULTY
    const policy = (rest[2] as PolicyName) ?? 'route'
    if (!DIFFICULTIES.includes(difficulty)) throw new Error(`unknown difficulty ${difficulty}`)
    panelRun(seed, difficulty, policy)
    return
  }
  if (mode === 'oil') {
    const difficulty = (rest[0] as Difficulty) ?? DEFAULT_DIFFICULTY
    if (!DIFFICULTIES.includes(difficulty)) throw new Error(`unknown difficulty ${difficulty}`)
    panelOil(difficulty, sweep)
    return
  }
  throw new Error(`hazard.ts: unknown mode "${mode}" — try matrix, cost, run or oil`)
}

main()
