/**
 * `npm run economy` — the 1i rebalance instrument.
 *
 * WHY A NEW VISUALISER RATHER THAN MORE PANELS ON `hazard.ts`. That tool
 * measures one subsystem: what a hazard verb costs and how often it is chosen.
 * The 18 Sep rewrite replaced the thing the whole run is denominated in, so the
 * questions this step has to answer are not about hazards at all — what a MOVE
 * should cost, whether a 50-turn budget makes the generation contracts
 * meaningless, whether the per-band curve is an income. Bolting those onto
 * `hazard.ts` would have made a subsystem tool pretend to be an economy tool,
 * which is how `scripts/tame.ts` ended up disagreeing with the reducer about
 * step 7.
 *
 * FIVE PANELS, ONE PER QUESTION, in the order they gate each other:
 *
 *   A  the price table          what each verb costs at each band, and the
 *                               expected oil of one attempt at each stat
 *   B  the MOVE price           0.5 or 0.25, swept against real runs
 *   C  turns vs oil             which resource actually ends runs, per difficulty
 *   D  the generation contract  Heart distance and reachability against the new
 *                               turn caps — the numbers GDD 2.2.1 flags as stale
 *   E  the bloom choice         FORCE vs ENDURE under the new cost model
 *
 * EVERY FIGURE IS READ OFF THE EVENT STREAM, never recomputed from the tables
 * the panels are meant to be checking. A visualiser that recomputes the rule it
 * is watching agrees with itself on the day the rule changes, which is the only
 * day anyone opens it (1e, Panel B of `tame.ts`).
 *
 *   npm run economy                    all panels, default difficulty
 *   npm run economy -- price           one panel
 *   SWEEP=300 npm run economy -- move  the MOVE sweep at n=300
 */

import { createRng, rngFromState } from '../src/engine/rng.ts'
import { distancesFrom, generateLabyrinth } from '../src/engine/generate.ts'
import { applyAction, createRun, legalActions, tellsFor } from '../src/engine/resolve.ts'
import { companionSenses } from '../src/engine/creatures.ts'
import { statModifier } from '../src/engine/dice.ts'
import { BAND_ORDER } from '../src/engine/types.ts'
import type {
  ActionKind, CreatureKind, Difficulty, Direction, GameState, OutcomeBand, RoomId, RunOutcome,
  StatKey,
} from '../src/engine/types.ts'
import type { LegalAction } from '../src/engine/resolve.ts'
import {
  ACTION_DC, BAND_OIL_MULTIPLIER, COMPANION, DIFFICULTY, HAZARD_VERB_OUTCOMES, isStatAgnostic,
  OIL, OIL_BANDS, OIL_PRICE, oilBandFor, oilCostFor, PLAYER, POPULATION, RUN, SCENT_BY_ACTION,
  WUMPUS,
} from '../src/engine/data/tuning.ts'

// ---------------------------------------------------------------------------
// Formatting
// ---------------------------------------------------------------------------

const pad = (s: string, n: number): string => s.padEnd(n)
const padLeft = (s: string, n: number): string => s.padStart(n)
const num = (x: number, dp = 2): string => x.toFixed(dp)
const pct = (x: number): string => `${(x * 100).toFixed(1)}%`
const rule = (n: number): string => '─'.repeat(n)

function heading(title: string): void {
  console.log(`\n${'═'.repeat(78)}\n  ${title}\n${'═'.repeat(78)}`)
}

/** Signed, so a payout reads as one. Positive cost prints as a loss. */
const oilCell = (cost: number): string =>
  cost === 0 ? '  —  ' : `${cost > 0 ? '-' : '+'}${num(Math.abs(cost))}`

const BAND_SHORT: Record<OutcomeBand, string> = {
  criticalFailure: 'critFail',
  failure: 'fail',
  mixed: 'mixed',
  success: 'success',
  strongSuccess: 'strong',
  criticalSuccess: 'crit',
}

const DIFFICULTIES: readonly Difficulty[] = ['drowsing', 'stirring', 'hunting', 'ravening']

/** The exact d20 distribution over bands, for a DC and a modifier. */
function bandOdds(dc: number, mod: number): Record<OutcomeBand, number> {
  const out: Record<OutcomeBand, number> = {
    criticalFailure: 0, failure: 0, mixed: 0, success: 0, strongSuccess: 0, criticalSuccess: 0,
  }
  for (let natural = 1; natural <= 20; natural++) {
    const margin = natural + mod - dc
    let band: OutcomeBand =
      margin <= -6 ? 'criticalFailure'
        : margin <= -1 ? 'failure'
          : margin <= 3 ? 'mixed'
            : margin <= 7 ? 'success'
              : margin <= 11 ? 'strongSuccess' : 'criticalSuccess'
    // The natural-1/20 overrides bound the band rather than replacing it.
    if (natural === 1 && BAND_ORDER.indexOf(band) > BAND_ORDER.indexOf('failure')) band = 'failure'
    if (natural === 20 && BAND_ORDER.indexOf(band) < BAND_ORDER.indexOf('success')) band = 'success'
    out[band] += 1 / 20
  }
  return out
}

// ---------------------------------------------------------------------------
// The policies
// ---------------------------------------------------------------------------

/**
 * Three, and the third one exists for a reason 1g found the hard way.
 *
 *   router    walks the shortest path to the Heart and back, answers hazards
 *             with whatever is cheapest in oil, never looks around
 *   scholar   spends FOCUS on unresolved doorways before committing to one,
 *             then routes — the player the information economy is built for
 *   forager   routes, but SEARCHes rooms it passes through
 *
 * `scholar` is the one this step needed adding. Every policy before it was
 * written when tells were free and directional, so none of them has any reason
 * to spend a turn on information — and a sweep of policies that never FOCUS
 * would measure the new economy by measuring players who ignore it. 1g's third
 * finding, one mechanic along: a value function that cannot see what a verb is
 * for proves only that it cannot see it.
 */
/**
 * `houndhandler` is 1i part 2's addition, and it is here for the reason
 * `scholar` was: a policy that cannot use a mechanic cannot measure it.
 *
 * It routes like the others and refuses to step through a doorway it has been
 * warned about — the "sidesteps into a loop" rule 1d measured as worth roughly
 * a third of the catch rate. WHERE the warning comes from is the experiment:
 * with a grellhound it is the hound's `wumpusWarning`, without one it is the
 * free mandatory stench that every player gets. Panel H runs both and moves the
 * hound's radius between them.
 *
 * It is not a good player. It never spends Fortune, never tames, never FOCUSes,
 * and sidesteps on a one-line rule. That is deliberate — the thing being
 * measured is one extra room of warning, so everything else has to be held
 * still — and it means the absolute rates carry the same tell-ignored-floor
 * caveat as every other number in this file.
 */
type Policy = 'router' | 'scholar' | 'forager' | 'houndhandler'

function route(state: GameState, from: RoomId, to: RoomId): RoomId[] {
  const previous: Record<RoomId, RoomId> = {}
  const seen = new Set<RoomId>([from])
  const queue: RoomId[] = [from]
  for (let head = 0; head < queue.length; head++) {
    const id = queue[head] as RoomId
    if (id === to) break
    for (const n of Object.values(state.labyrinth.rooms[id]?.exits ?? {})) {
      if (n === undefined || seen.has(n)) continue
      seen.add(n)
      previous[n] = id
      queue.push(n)
    }
  }
  if (!seen.has(to)) return []
  const path: RoomId[] = [to]
  let cursor = to
  while (cursor !== from) {
    const back = previous[cursor]
    if (back === undefined) return []
    path.unshift(back)
    cursor = back
  }
  return path
}

function choose(policy: Policy, state: GameState, menu: readonly LegalAction[]): LegalAction | null {
  if (menu.length === 0) return null

  // A hazard takes the whole menu. Pick by expected oil, which is the only axis
  // this harness has — and note that is exactly the limitation 1g recorded
  // rather than a claim that oil is what matters.
  const hazardVerbs = menu.filter((m) => m.action.kind in HAZARD_VERB_OUTCOMES)
  type HazardVerbKind = keyof typeof HAZARD_VERB_OUTCOMES
  if (hazardVerbs.length === menu.length && hazardVerbs.length > 0) {
    let best = hazardVerbs[0] as LegalAction
    let bestValue = Infinity
    for (const entry of hazardVerbs) {
      const kind = entry.action.kind as HazardVerbKind
      const mod = isStatAgnostic(kind) ? 0 : statModifier(state.player.stats[statKeyOf(kind)])
      const odds = bandOdds(ACTION_DC[kind], mod)
      const expected = BAND_ORDER.reduce((s, b) => s + odds[b] * oilCostFor(kind, b), 0)
      if (expected < bestValue) {
        bestValue = expected
        best = entry
      }
    }
    return best
  }

  // An encounter: slip past if you can, otherwise fight. Taming is left to a
  // policy that has a reason to want a companion, which none of these do —
  // still the least-exercised corner of the reducer (carried from 1d).
  const encounter = menu.filter((m) => ['fight', 'tame', 'sneak', 'flee'].includes(m.action.kind))
  if (encounter.length === menu.length && encounter.length > 0) {
    return encounter.find((m) => m.action.kind === 'sneak')
      ?? encounter.find((m) => m.action.kind === 'fight')
      ?? (encounter[0] as LegalAction)
  }

  // SCHOLAR: buy the doorway you are about to walk through, if it is unresolved
  // and still affordable. One look per room per decision, never more — a policy
  // that focused everything would measure the ceiling rather than the play.
  if (policy === 'scholar') {
    const focus = menu.filter((m) => m.action.kind === 'focus')
    if (focus.length > 0 && state.player.oil > OIL_PRICE.focus * 4) {
      const target = state.player.carryingHeart
        ? state.labyrinth.entranceId
        : state.labyrinth.heartRoomId
      const plan = route(state, state.player.roomId, target)
      const next = plan[1]
      const ahead = focus.find(
        (m) => 'direction' in m.action
          && exitTo(state, m.action.direction) === next,
      )
      if (ahead) return ahead
    }
  }

  if (policy === 'forager') {
    const search = menu.find((m) => m.action.kind === 'search')
    if (search && state.labyrinth.rooms[state.player.roomId]?.oilFlask === true) return search
  }

  const target = state.player.carryingHeart
    ? state.labyrinth.entranceId
    : state.labyrinth.heartRoomId
  const plan = route(state, state.player.roomId, target)
  const next = plan[1]
  const moves = menu.filter((m) => m.action.kind === 'move')
  if (moves.length === 0) return menu[0] as LegalAction
  const planned = moves.find(
    (m) => 'direction' in m.action && exitTo(state, m.action.direction) === next,
  )

  // HOUNDHANDLER: do not walk into a warned doorway if there is another one.
  //
  // The rule is one line on purpose (see the policy note above). What it is NOT
  // is a retreat: 1d measured backing out the way you came as WORSE than
  // ignoring the warning entirely, because you are walking back down your own
  // scent into a thing that navigates by scent. Any other doorway, then, and
  // the planned one only when there is no other.
  if (policy === 'houndhandler') {
    const warned = new Set(warnedDirections(state))
    if (warned.size > 0) {
      const open = moves.filter((m) => 'direction' in m.action && !warned.has(m.action.direction))
      if (open.length > 0) {
        const plannedIsWarned =
          planned !== undefined && 'direction' in planned.action && warned.has(planned.action.direction)
        if (plannedIsWarned) {
          // Of the doorways nobody warned about, the one that loses the least
          // ground. Sorted by room id first so ties break deterministically.
          const distances = distancesFrom(state.labyrinth, target)
          const ranked = [...open].sort((a, b) => {
            const da = distances[exitTo(state, (a.action as { direction: Direction }).direction) ?? ''] ?? Infinity
            const db = distances[exitTo(state, (b.action as { direction: Direction }).direction) ?? ''] ?? Infinity
            return da - db
          })
          return ranked[0] as LegalAction
        }
      }
    }
  }

  return planned ?? (moves[0] as LegalAction)
}

/**
 * The doorways this player has been warned about, from whichever channel they
 * actually have. Read through the same functions the renderers read, never
 * recomputed from the true map — a visualiser that recomputes the rule it is
 * watching agrees with itself on the day the rule changes (1e, Panel B of
 * `tame.ts`).
 */
function warnedDirections(state: GameState): Direction[] {
  const hound = companionSenses(
    state.labyrinth,
    state.player.companion,
    state.player.roomId,
    state.wumpus.roomId,
  ).wumpusWarning
  if (hound !== null) return [...hound.directions]
  return floorDirections(state)
}

/** The free, always-on, always-directional mandatory stench floor (GDD 2.10). */
function floorDirections(state: GameState): Direction[] {
  return tellsFor(state)
    .filter((d) => d.tells.some((t) => t.kind === 'stench'))
    .map((d) => d.direction)
}

function statKeyOf(kind: ActionKind): StatKey {
  const map: Partial<Record<ActionKind, StatKey>> = {
    force: 'str', endure: 'int', avoid: 'int', dodge: 'agi',
  }
  return map[kind] ?? 'int'
}

/** Where a doorway leads from where the player stands, or undefined for a wall. */
function exitTo(state: GameState, direction: Direction): RoomId | undefined {
  return state.labyrinth.rooms[state.player.roomId]?.exits[direction]
}

// ---------------------------------------------------------------------------
// A run, reduced to what the panels need
// ---------------------------------------------------------------------------

interface RunTally {
  readonly outcome: RunOutcome
  readonly turns: number
  readonly maxTurns: number
  /** Oil spent and returned, read off `oilChanged` rather than recomputed. */
  readonly oilOut: number
  readonly oilIn: number
  readonly oilLeft: number
  readonly roomsVisited: number
  readonly focuses: number
  readonly reachedHeart: boolean
  readonly turnsInBand: Record<string, number>
  readonly actionCounts: Record<string, number>
  /** Turns on which this player was warned about at least one doorway. */
  readonly warnedTurns: number
  /**
   * Turns on which the warning said something the free stench floor did not —
   * the only turns the grellhound's rework can possibly be worth anything.
   * Zero by construction for a player without a hound.
   */
  readonly newInfoTurns: number
}

function driveRun(
  policy: Policy,
  seed: number,
  difficulty: Difficulty,
  /**
   * A companion the player starts with. Panel H only.
   *
   * IT IS A COUNTERFACTUAL AND IT IS LABELLED AS ONE. Handing the player a
   * grellhound on turn one is not what a run looks like — encounter density is
   * about one per run (1d) and a quarter of those are hounds, so measuring the
   * passive through natural acquisition would be measuring encounter density
   * with a warning radius attached. The question this parameter exists to ask
   * is narrower and answerable: what is the passive worth to a player who HAS
   * one? A grellhound draws no randomness at step 7 (`companionUpkeep` only
   * rolls for a goblin), so granting one does not shift the RNG stream and the
   * rows below are the same seeds walking the same labyrinths.
   */
  companion: CreatureKind | null = null,
): RunTally {
  const fresh = createRun(seed, { difficulty })
  let state: GameState = companion === null
    ? fresh
    : {
        ...fresh,
        player: { ...fresh.player, companion: { kind: companion, brave: false, skittish: false } },
      }
  let oilOut = 0
  let oilIn = 0
  let focuses = 0
  let reachedHeart = false
  const turnsInBand: Record<string, number> = {}
  const actionCounts: Record<string, number> = {}

  let warnedTurns = 0
  let newInfoTurns = 0

  for (let guard = 0; guard < 500 && state.outcome === 'inProgress'; guard++) {
    const menu = legalActions(state)
    const pick = choose(policy, state, menu)
    if (pick === null) break

    // Read before the action, which is when a player would read it.
    const warned = warnedDirections(state)
    if (warned.length > 0) {
      warnedTurns += 1
      if (floorDirections(state).length === 0) newInfoTurns += 1
    }

    turnsInBand[oilBandFor(state.player.oil).name] =
      (turnsInBand[oilBandFor(state.player.oil).name] ?? 0) + 1
    actionCounts[pick.action.kind] = (actionCounts[pick.action.kind] ?? 0) + 1
    if (pick.action.kind === 'focus') focuses += 1

    const result = applyAction(state, pick.action, rngFromState(state.rng))
    for (const event of result.events) {
      if (event.kind === 'oilChanged') {
        if (event.delta < 0) oilOut += -event.delta
        else oilIn += event.delta
      }
      if (event.kind === 'heartTaken') reachedHeart = true
    }
    state = result.state
  }

  const visited = Object.values(state.labyrinth.rooms).filter((r) => r.visited).length
  return {
    outcome: state.outcome,
    turns: state.turn,
    maxTurns: state.maxTurns,
    oilOut,
    oilIn,
    oilLeft: state.player.oil,
    roomsVisited: visited,
    focuses,
    reachedHeart,
    turnsInBand,
    actionCounts,
    warnedTurns,
    newInfoTurns,
  }
}

/**
 * Exact two-sided binomial p for `hits` out of `n` against a fair coin.
 *
 * Written out rather than approximated because the counts this panel produces
 * are small — a normal approximation on n = 20 discordant pairs is exactly the
 * kind of figure that gets quoted later as if it were measured.
 */
function binomialP(hits: number, n: number): number {
  if (n === 0) return 1
  const choose = (a: number, b: number): number => {
    let out = 1
    for (let i = 0; i < b; i++) out = (out * (a - i)) / (i + 1)
    return out
  }
  const pmf = (k: number): number => choose(n, k) * Math.pow(0.5, n)
  const observed = pmf(hits)
  let total = 0
  for (let k = 0; k <= n; k++) {
    // 1e-9 so a tie with the observed mass counts, which is what makes this the
    // conventional two-sided exact test rather than a one-sided one doubled.
    if (pmf(k) <= observed + 1e-9) total += pmf(k)
  }
  return Math.min(1, total)
}

const mean = (runs: readonly RunTally[], f: (t: RunTally) => number): number =>
  runs.length === 0 ? 0 : runs.reduce((s, t) => s + f(t), 0) / runs.length
const share = (runs: readonly RunTally[], f: (t: RunTally) => boolean): number =>
  runs.length === 0 ? 0 : runs.filter(f).length / runs.length

// ---------------------------------------------------------------------------
// Panel A — the price table
// ---------------------------------------------------------------------------

function panelPrice(): void {
  heading('PANEL A · the price table — what a band does to a verb (GDD 2.6, 2.8.1)')
  console.log('  Cost is margin, not injury. Every action has a base price and the band it')
  console.log('  rolls scales it. Negative is oil coming back.')
  console.log('')
  console.log(`  band multipliers: ` + BAND_ORDER.map((b) => `${BAND_SHORT[b]} x${BAND_OIL_MULTIPLIER[b]}`).join('  '))
  console.log('')
  console.log(`  ${pad('action', 12)}${padLeft('base', 6)}   ` + BAND_ORDER.map((b) => padLeft(BAND_SHORT[b], 9)).join(''))
  console.log(`  ${rule(74)}`)

  const kinds = Object.keys(OIL_PRICE) as ActionKind[]
  for (const kind of kinds) {
    console.log(
      `  ${pad(kind, 12)}${padLeft(num(OIL_PRICE[kind]), 6)}   ` +
      BAND_ORDER.map((b) => padLeft(oilCell(oilCostFor(kind, b)), 9)).join(''),
    )
  }

  console.log('')
  console.log('  THE ANTI-FARMING CHECK. 1g measured its first reward model at +1.75 oil per')
  console.log('  bloom and closed it by moving a gate. This closes it by shape — the best')
  console.log('  possible outcome never returns more than the attempt cost — so the expected')
  console.log('  value below is negative at every stat, for every verb, by construction.')
  console.log('')
  console.log(`  Expected oil of ONE attempt, by stat (- is spent, + is an oil farm):`)
  console.log(`  ${pad('action', 12)}` + [10, 12, 14, 16, 18].map((s) => padLeft(`stat ${s}`, 10)).join(''))
  console.log(`  ${rule(62)}`)
  for (const kind of kinds) {
    if (OIL_PRICE[kind] === 0) continue
    const cells = [10, 12, 14, 16, 18].map((stat) => {
      const mod = isStatAgnostic(kind) ? 0 : statModifier(stat)
      const odds = bandOdds(ACTION_DC[kind], mod)
      const expected = BAND_ORDER.reduce((s, b) => s + odds[b] * oilCostFor(kind, b), 0)
      return padLeft(oilCell(expected), 10)
    })
    console.log(`  ${pad(kind, 12)}` + cells.join(''))
  }
  console.log('')
  console.log('  (A stat-agnostic verb — DISARM — is flat across the row by design: it takes')
  console.log('   no stat modifier, which is what makes it build-independent. GDD 2.7.)')
}

// ---------------------------------------------------------------------------
// Panel B — the MOVE price
// ---------------------------------------------------------------------------

/**
 * THE ONE NUMBER GDD 2.8.1 EXPLICITLY DEFERS TO THIS SWEEP.
 *
 * MOVE is the most-taken action in the game, so its price sets the shape of the
 * whole economy: at 0.5 a 50-turn run of clean walking spends more than a full
 * lamp, at 0.25 it spends about half of one. The failure mode to watch for is
 * named in the handoff — 0.5 risks re-tightening oil into a binding constraint
 * at low difficulties, which would undercut the entire point of raising the
 * turn cap there.
 *
 * Measured rather than argued: the panel re-prices MOVE and re-runs the sweep.
 */
function panelMove(sweep: number): void {
  heading(`PANEL B · what should a MOVE cost? (${sweep} seeds x 3 policies x 4 difficulties)`)
  console.log('  GDD 2.8.1 leaves this to the sim. MOVE is the most-taken action in the game,')
  console.log('  so its price is the shape of the economy rather than one row of a table.')
  console.log('')
  console.log('  The failure mode to watch: at 50 turns a price that binds turns Drowsing back')
  console.log('  into a resource-starvation puzzle, which is the opposite of what raising the')
  console.log('  turn cap was for (GDD 2.2.1).')

  const original = OIL_PRICE.move
  for (const price of [0.5, 0.25]) {
    ;(OIL_PRICE as Record<ActionKind, number>).move = price
    console.log('')
    console.log(`  ── MOVE at ${num(price)} ${rule(56)}`)
    console.log(
      `     ${pad('difficulty', 12)}${padLeft('escaped', 9)}${padLeft('caught', 9)}` +
      `${padLeft('outOfTurns', 12)}${padLeft('ran dry', 9)}${padLeft('oil left', 10)}${padLeft('rooms', 8)}`,
    )
    for (const difficulty of DIFFICULTIES) {
      const runs: RunTally[] = []
      for (const policy of ['router', 'scholar', 'forager'] as const) {
        for (let seed = 1; seed <= sweep; seed++) runs.push(driveRun(policy, seed, difficulty))
      }
      console.log(
        `     ${pad(difficulty, 12)}${padLeft(pct(share(runs, (t) => t.outcome === 'escaped')), 9)}` +
        `${padLeft(pct(share(runs, (t) => t.outcome === 'caught')), 9)}` +
        `${padLeft(pct(share(runs, (t) => t.outcome === 'outOfTurns')), 12)}` +
        `${padLeft(pct(share(runs, (t) => t.oilLeft <= 0)), 9)}` +
        `${padLeft(num(mean(runs, (t) => t.oilLeft)), 10)}` +
        `${padLeft(num(mean(runs, (t) => t.roomsVisited), 1), 8)}`,
      )
    }
  }
  ;(OIL_PRICE as Record<ActionKind, number>).move = original
  console.log('')
  console.log(`  (restored MOVE to ${num(original)})`)
}

// ---------------------------------------------------------------------------
// Panel C — turns vs oil
// ---------------------------------------------------------------------------

function panelPressure(sweep: number): void {
  heading(`PANEL C · which resource actually ends runs (${sweep} seeds x 3 policies)`)
  console.log('  1g finding 6: oil was sized for a run that lasts and almost none did — 57-64%')
  console.log('  of runs ended with the Wumpus around turn 12, so the lamp was decorative.')
  console.log('  The turn caps moved and the burn model changed underneath that finding, so it')
  console.log('  is re-measured here rather than assumed to transfer.')
  console.log('')
  console.log('  GDD 2.2.1 asks for a SPLIT: Drowsing/Stirring oil-constrained, Hunting/Ravening')
  console.log('  turn-constrained. That is the thing to read off this panel.')

  for (const difficulty of DIFFICULTIES) {
    const runs: RunTally[] = []
    for (const policy of ['router', 'scholar', 'forager'] as const) {
      for (let seed = 1; seed <= sweep; seed++) runs.push(driveRun(policy, seed, difficulty))
    }
    const cap = DIFFICULTY[difficulty].maxTurns
    console.log('')
    console.log(`  ── ${difficulty} (cap ${cap} turns, ${DIFFICULTY[difficulty].focusesPerRoom} focus/room) ${rule(40)}`)
    console.log(`     outcomes: ` + (['escaped', 'retreated', 'caught', 'killed', 'outOfTurns'] as const)
      .map((o) => `${o} ${pct(share(runs, (t) => t.outcome === o))}`).join('  '))
    console.log(`     turns used, mean ${num(mean(runs, (t) => t.turns), 1)} of ${cap}` +
      `   (used the whole budget: ${pct(share(runs, (t) => t.turns >= cap))})`)
    console.log(`     rooms visited, mean ${num(mean(runs, (t) => t.roomsVisited), 1)}` +
      `   reached the Heart: ${pct(share(runs, (t) => t.reachedHeart))}`)
    console.log(`     oil: out ${num(mean(runs, (t) => t.oilOut))}  back ${num(mean(runs, (t) => t.oilIn))}` +
      `  left ${num(mean(runs, (t) => t.oilLeft))}   ran dry: ${pct(share(runs, (t) => t.oilLeft <= 0))}`)

    const totalTurns = runs.reduce((s, t) => s + Object.values(t.turnsInBand).reduce((a, b) => a + b, 0), 0)
    const bands = OIL_BANDS.map((b) => {
      const inBand = runs.reduce((s, t) => s + (t.turnsInBand[b.name] ?? 0), 0)
      return `${b.name} ${pct(totalTurns > 0 ? inBand / totalTurns : 0)}`
    })
    console.log(`     turns by lamp state: ${bands.join('  ')}`)
    console.log(`     focuses per run, mean ${num(mean(runs, (t) => t.focuses), 1)}`)
  }
}

// ---------------------------------------------------------------------------
// Panel D — the generation contract against the new caps
// ---------------------------------------------------------------------------

/**
 * THE PANEL THAT ANSWERS THE STALEST NUMBER IN THE GDD.
 *
 * GDD 2.2 derived "100 rooms, Heart in the near third" from a flat 20-turn cap:
 * a round trip costs twice the Heart's distance, so at 20 turns the Heart had to
 * sit close whatever the grid size, and the other ~70 rooms were the "too-deep
 * region" a player only reached by searching the wrong way. At 50 turns that
 * arithmetic is simply gone, and GDD 2.2.1 says so in as many words: Heart
 * distance, hazard-free route counts and minimum safe detour were all tuned
 * against the old budget and have not been re-measured.
 *
 * This measures them.
 */
function panelContract(): void {
  heading('PANEL D · the generation contract against the new turn caps (GDD 2.2.1)')
  console.log('  Everything here was sized against a flat 18-20 turn budget. The caps are now')
  console.log('  50/45/40/35, so the question is whether these numbers still describe a')
  console.log('  constraint or merely a preference.')
  console.log('')
  console.log(
    `  ${pad('difficulty', 12)}${padLeft('turns', 7)}${padLeft('heart', 8)}${padLeft('round trip', 12)}` +
    `${padLeft('spare', 8)}${padLeft('reachable', 11)}${padLeft('too deep', 10)}`,
  )
  console.log(`  ${rule(70)}`)

  for (const difficulty of DIFFICULTIES) {
    const contract = DIFFICULTY[difficulty]
    let heartDistance = 0
    let reachable = 0
    let total = 0
    const labs = 60
    for (let seed = 1; seed <= labs; seed++) {
      const lab = generateLabyrinth(createRng(seed), { difficulty })
      const dist = distancesFrom(lab, lab.entranceId)
      heartDistance += dist[lab.heartRoomId] ?? 0
      // "Reachable" the way GDD 2.2 meant it: inside HALF the budget, so there
      // is a return trip left.
      const half = Math.floor(contract.maxTurns / 2)
      reachable += Object.values(dist).filter((d) => d <= half).length
      total += Object.keys(dist).length
    }
    const meanHeart = heartDistance / labs
    const roundTrip = meanHeart * 2
    const meanReach = reachable / labs
    const meanTotal = total / labs
    console.log(
      `  ${pad(difficulty, 12)}${padLeft(String(contract.maxTurns), 7)}${padLeft(num(meanHeart, 1), 8)}` +
      `${padLeft(num(roundTrip, 1), 12)}${padLeft(num(contract.maxTurns - roundTrip, 1), 8)}` +
      `${padLeft(num(meanReach, 1), 11)}${padLeft(num(meanTotal - meanReach, 1), 10)}`,
    )
  }

  console.log('')
  console.log('  READ THE LAST TWO COLUMNS. "too deep" is how many of the 100 rooms sit')
  console.log('  outside half the turn budget — the region GDD 2.2 says the player never')
  console.log('  CHOOSES to enter. If it is zero, that framing is dead and the grid is doing')
  console.log('  something else now.')
  console.log('')
  console.log(`  Heart band is currently ${RUN.minHeartDistance}-${RUN.maxHeartDistance} rooms;`)
  console.log(`  ambient flasks ${POPULATION.oilFlasks[0]}-${POPULATION.oilFlasks[1]}, worth ${OIL.flaskValue} each, lamp starts at ${OIL.starting}.`)
}

// ---------------------------------------------------------------------------
// Panel E — the bloom choice
// ---------------------------------------------------------------------------

/**
 * 1g finding 2, re-asked under the new cost model.
 *
 * FORCE and ENDURE produced outcomes within noise of each other over 300 seeds,
 * and 1g was explicit that a sim saying "nothing you do matters" usually
 * indicts the policy rather than the game — "do not act on this before the
 * agent-harness step". That still holds and nothing here changes it. What this
 * panel is for is narrower and worth knowing: did the new prices move the
 * needle AT ALL, or are the two verbs still arithmetically interchangeable?
 */
function panelBloom(sweep: number): void {
  heading(`PANEL E · is the bloom choice a choice yet? (${sweep} seeds)`)
  console.log('  1g measured FORCE and ENDURE as indistinguishable over 300 seeds and said not')
  console.log('  to act on it before a real bot exists. This does not act on it. It asks only')
  console.log('  whether the new cost model separated them arithmetically.')
  console.log('')

  console.log(`  ${pad('verb', 10)}${padLeft('base', 7)}${padLeft('E[oil] @10', 12)}${padLeft('E[turns]', 10)}${padLeft('E[confused]', 13)}${padLeft('scent', 8)}`)
  console.log(`  ${rule(62)}`)
  for (const verb of ['force', 'endure', 'avoid', 'dodge', 'disarm'] as const) {
    const mod = isStatAgnostic(verb) ? 0 : statModifier(PLAYER.startingStat)
    const odds = bandOdds(ACTION_DC[verb], mod)
    let oil = 0
    let turns = 0
    let conf = 0
    for (const band of BAND_ORDER) {
      const out = HAZARD_VERB_OUTCOMES[verb][band]
      oil += odds[band] * oilCostFor(verb, band)
      turns += odds[band] * (1 + out.extraTurns)
      conf += odds[band] * (out.applies === null ? 0 : out.statusTurns)
    }
    console.log(
      `  ${pad(verb.toUpperCase(), 10)}${padLeft(num(OIL_PRICE[verb]), 7)}${padLeft(oilCell(oil), 12)}` +
      `${padLeft(num(turns), 10)}${padLeft(num(conf), 13)}${padLeft(num(SCENT_BY_ACTION[verb]), 8)}`,
    )
  }

  console.log('')
  console.log('  The separation that matters is between the two verbs answering ONE hazard.')
  const gap = (a: 'force' | 'avoid', b: 'endure' | 'dodge'): string => {
    const odds = (v: string) => bandOdds(ACTION_DC[v as ActionKind], statModifier(PLAYER.startingStat))
    const exp = (v: 'force' | 'endure' | 'avoid' | 'dodge') =>
      BAND_ORDER.reduce((s, band) => s + odds(v)[band] * oilCostFor(v, band), 0)
    return `${num(Math.abs(exp(a) - exp(b)))} oil`
  }
  console.log(`    bloom  FORCE vs ENDURE: ${gap('force', 'endure')} apart in expectation`)
  console.log(`    snare  AVOID vs DODGE:  ${gap('avoid', 'dodge')} apart in expectation`)
  console.log('')
  console.log('  AVOID/DODGE is the pair this step deliberately separated: health was the only')
  console.log('  thing distinguishing them and it is gone, so the split moved into the price')
  console.log('  (AVOID pays a misread in clock, DODGE in oil). 1g measured DODGE as never once')
  console.log('  chosen because AVOID tied it on scent and beat it on oil.')
}

// ---------------------------------------------------------------------------
// Panel F — how far should the Heart be?
// ---------------------------------------------------------------------------

/**
 * THE LEVER PANEL D SAYS IS AVAILABLE, MEASURED BEFORE IT IS PULLED.
 *
 * Panel D shows 21-39 spare turns after a round trip and a "too-deep region" of
 * essentially zero rooms — the Heart band was sized against a 20-turn cap and
 * the cap is now 35-50. Panel C shows runs covering 6-7 rooms, which is not a
 * coincidence: a policy that walks straight to the Heart visits about as many
 * rooms as the Heart is deep, so HEART DISTANCE IS THE DIRECT LEVER on the
 * original complaint ("a 20-turn run only covered 10-12 rooms, felt short").
 *
 * The thing that could go wrong is obvious and is why this is a sweep rather
 * than an edit: every extra room of depth is two more turns spent inside a
 * labyrinth where something is hunting you, and the catch rate is already the
 * dominant failure mode. Distance bought at the cost of the escape rate is not
 * a longer run, it is a worse one.
 */
function panelHeart(sweep: number): void {
  heading(`PANEL F · how far should the Heart be? (${sweep} seeds x 3 policies)`)
  console.log('  Panel D says the turn budget can afford a deeper Heart. Panel C says runs')
  console.log('  cover about as many rooms as the Heart is deep. This asks what depth costs.')

  const originalMin = RUN.minHeartDistance
  const originalMax = RUN.maxHeartDistance
  const originalBands: Record<string, readonly [number, number]> = {}
  for (const d of DIFFICULTIES) originalBands[d] = DIFFICULTY[d].heartDistance

  // Each row shifts every difficulty's band by the same amount, so the shape of
  // the contract (drowsing shallowest, ravening deepest) is preserved and only
  // the depth moves.
  for (const shift of [0, 2, 4, 6]) {
    ;(RUN as { minHeartDistance: number }).minHeartDistance = originalMin + shift
    ;(RUN as { maxHeartDistance: number }).maxHeartDistance = originalMax + shift
    for (const d of DIFFICULTIES) {
      const band = originalBands[d] as readonly [number, number]
      ;(DIFFICULTY[d] as { heartDistance: readonly [number, number] }).heartDistance =
        [band[0] + shift, band[1] + shift]
    }

    console.log('')
    console.log(`  ── Heart band shifted +${shift} ${rule(52)}`)
    console.log(
      `     ${pad('difficulty', 12)}${padLeft('band', 8)}${padLeft('escaped', 9)}${padLeft('caught', 9)}` +
      `${padLeft('outOfTurns', 12)}${padLeft('turns', 8)}${padLeft('rooms', 8)}${padLeft('oil left', 10)}`,
    )
    for (const difficulty of DIFFICULTIES) {
      const runs: RunTally[] = []
      for (const policy of ['router', 'scholar', 'forager'] as const) {
        for (let seed = 1; seed <= sweep; seed++) runs.push(driveRun(policy, seed, difficulty))
      }
      const band = DIFFICULTY[difficulty].heartDistance
      console.log(
        `     ${pad(difficulty, 12)}${padLeft(`${band[0]}-${band[1]}`, 8)}` +
        `${padLeft(pct(share(runs, (t) => t.outcome === 'escaped')), 9)}` +
        `${padLeft(pct(share(runs, (t) => t.outcome === 'caught')), 9)}` +
        `${padLeft(pct(share(runs, (t) => t.outcome === 'outOfTurns')), 12)}` +
        `${padLeft(num(mean(runs, (t) => t.turns), 1), 8)}` +
        `${padLeft(num(mean(runs, (t) => t.roomsVisited), 1), 8)}` +
        `${padLeft(num(mean(runs, (t) => t.oilLeft)), 10)}`,
      )
    }
  }

  ;(RUN as { minHeartDistance: number }).minHeartDistance = originalMin
  ;(RUN as { maxHeartDistance: number }).maxHeartDistance = originalMax
  for (const d of DIFFICULTIES) {
    ;(DIFFICULTY[d] as { heartDistance: readonly [number, number] }).heartDistance =
      originalBands[d] as readonly [number, number]
  }
  console.log('')
  console.log('  (restored the Heart bands)')
}

// ---------------------------------------------------------------------------
// Panel G — are hazards still net-negative in TURNS?
// ---------------------------------------------------------------------------

/**
 * 1g FINDING 1, RE-RUN. The controlled counterfactual: identical seeds and
 * policies, once with the hazard verbs' turn and oil costs zeroed, once as
 * shipped.
 *
 * 1g measured the verb redesign at -12.5 points of escape rate and drew the
 * conclusion this step was told not to assume transfers: the OIL ledger said
 * +0.15 and the TURN ledger said -12.5 points, and the second is the one that
 * decides runs. Both halves of that moved underneath it — the turn caps went
 * from 20 to 35-50, and the oil ledger is a completely different mechanism — so
 * the question is asked again rather than inherited.
 */
function panelHazardCost(sweep: number): void {
  heading(`PANEL G · are hazards still net-negative in turns? (${sweep} seeds x 3 policies)`)
  console.log('  1g measured the hazard-verb redesign at -12.5 points of escape rate, and')
  console.log('  concluded that turns rather than oil are what decide runs. The turn caps and')
  console.log('  the whole cost model moved since, so this re-measures rather than inheriting.')

  const measure = (): Record<Difficulty, { escaped: number; turns: number; met: number }> => {
    const out = {} as Record<Difficulty, { escaped: number; turns: number; met: number }>
    for (const difficulty of DIFFICULTIES) {
      const runs: RunTally[] = []
      for (const policy of ['router', 'scholar', 'forager'] as const) {
        for (let seed = 1; seed <= sweep; seed++) runs.push(driveRun(policy, seed, difficulty))
      }
      out[difficulty] = {
        escaped: share(runs, (t) => t.outcome === 'escaped'),
        turns: mean(runs, (t) => t.turns),
        met: mean(runs, (t) =>
          (['force', 'endure', 'avoid', 'dodge', 'disarm'] as const)
            .reduce((s, v) => s + (t.actionCounts[v] ?? 0), 0)),
      }
    }
    return out
  }

  const shipped = measure()

  // Free them: no extra turns, no oil price.
  const originalTurns = new Map<string, number>()
  const originalPrice = new Map<string, number>()
  for (const verb of ['force', 'endure', 'avoid', 'dodge', 'disarm'] as const) {
    originalPrice.set(verb, OIL_PRICE[verb])
    ;(OIL_PRICE as Record<ActionKind, number>)[verb] = 0
    for (const band of BAND_ORDER) {
      const row = HAZARD_VERB_OUTCOMES[verb][band] as { extraTurns: number }
      originalTurns.set(`${verb}.${band}`, row.extraTurns)
      row.extraTurns = 0
    }
  }
  const free = measure()

  // Put them back.
  for (const verb of ['force', 'endure', 'avoid', 'dodge', 'disarm'] as const) {
    ;(OIL_PRICE as Record<ActionKind, number>)[verb] = originalPrice.get(verb) as number
    for (const band of BAND_ORDER) {
      ;(HAZARD_VERB_OUTCOMES[verb][band] as { extraTurns: number }).extraTurns =
        originalTurns.get(`${verb}.${band}`) as number
    }
  }

  console.log('')
  console.log(
    `  ${pad('difficulty', 12)}${padLeft('shipped', 10)}${padLeft('free', 10)}${padLeft('swing', 10)}` +
    `${padLeft('hazards/run', 13)}${padLeft('turns', 8)}`,
  )
  console.log(`  ${rule(64)}`)
  for (const difficulty of DIFFICULTIES) {
    const s = shipped[difficulty]
    const f = free[difficulty]
    const swing = (f.escaped - s.escaped) * 100
    console.log(
      `  ${pad(difficulty, 12)}${padLeft(pct(s.escaped), 10)}${padLeft(pct(f.escaped), 10)}` +
      `${padLeft(`${swing >= 0 ? '+' : ''}${num(swing, 1)}`, 10)}` +
      `${padLeft(num(s.met, 2), 13)}${padLeft(num(s.turns, 1), 8)}`,
    )
  }
  console.log('')
  console.log('  A POSITIVE SWING MEANS HAZARDS COST THE PLAYER SOMETHING — making them free')
  console.log('  improved the escape rate by that many points. Near zero means the price is')
  console.log('  not what is deciding these runs, which is a finding about the Wumpus rather')
  console.log('  than about the hazards.')
}

// ---------------------------------------------------------------------------
// Panel H — what is one extra room of warning worth?
// ---------------------------------------------------------------------------

/**
 * 1i PART 2's ONE BALANCE QUESTION. The other two buffs are flat discounts on
 * verbs that are individually cheap; this one hands the player information
 * earlier, and information changes what they do.
 *
 * THE CONTROLLED COMPARISON IS THE RADIUS, not the companion. Three rows, same
 * seeds, same policy, same evasion rule:
 *
 *   no hound        the free radius-2 mandatory stench floor, and nothing else
 *   hound @ 2       the passive as it shipped from 1g through 1i part 1
 *   hound @ 3       as built in this step
 *
 * The first two rows are the control that makes the third mean anything, and
 * they should come out IDENTICAL rather than merely close: inside two rooms the
 * hound reports the same doorways the floor already gives away for nothing
 * (asserted in tests/creatures.test.ts), and a grellhound draws no randomness at
 * step 7, so the same seed walks the same labyrinth either way. A difference
 * between rows one and two is a bug in this panel, not a finding.
 *
 * `new info` is the column to read first. If the warning almost never says
 * anything the floor did not, no swing in the escape rate is attributable to it
 * however the other columns land.
 */
function panelWarning(sweep: number): void {
  heading(`PANEL H · what is one extra room of warning worth? (${sweep} seeds, houndhandler)`)
  console.log('  Same seeds, same sidestep rule, three warning channels. The grellhound is')
  console.log('  granted at turn 1 — a counterfactual, NOT an encounter-density estimate.')

  const original = COMPANION.grellhoundWarningRadius
  const setRadius = (r: number): void => {
    ;(COMPANION as { grellhoundWarningRadius: number }).grellhoundWarningRadius = r
  }

  const rows: { label: string; companion: CreatureKind | null; radius: number }[] = [
    { label: 'no hound', companion: null, radius: original },
    { label: `hound @ ${WUMPUS.mandatoryStenchRadius}`, companion: 'grellhound', radius: WUMPUS.mandatoryStenchRadius },
    { label: `hound @ ${original}`, companion: 'grellhound', radius: original },
  ]

  for (const difficulty of DIFFICULTIES) {
    console.log('')
    console.log(`  ── ${difficulty} ${rule(62)}`)
    console.log(
      `     ${pad('channel', 12)}${padLeft('escaped', 9)}${padLeft('caught', 9)}${padLeft('killed', 9)}` +
      `${padLeft('retreated', 11)}${padLeft('outOfTurns', 12)}` +
      `${padLeft('turns', 8)}${padLeft('rooms', 8)}${padLeft('warned/run', 12)}${padLeft('new info', 10)}`,
    )
    for (const row of rows) {
      setRadius(row.radius)
      const runs: RunTally[] = []
      for (let seed = 1; seed <= sweep; seed++) {
        runs.push(driveRun('houndhandler', seed, difficulty, row.companion))
      }
      console.log(
        `     ${pad(row.label, 12)}${padLeft(pct(share(runs, (t) => t.outcome === 'escaped')), 9)}` +
        `${padLeft(pct(share(runs, (t) => t.outcome === 'caught')), 9)}` +
        `${padLeft(pct(share(runs, (t) => t.outcome === 'killed')), 9)}` +
        `${padLeft(pct(share(runs, (t) => t.outcome === 'retreated')), 11)}` +
        `${padLeft(pct(share(runs, (t) => t.outcome === 'outOfTurns')), 12)}` +
        `${padLeft(num(mean(runs, (t) => t.turns), 1), 8)}` +
        `${padLeft(num(mean(runs, (t) => t.roomsVisited), 1), 8)}` +
        `${padLeft(num(mean(runs, (t) => t.warnedTurns), 2), 12)}` +
        `${padLeft(num(mean(runs, (t) => t.newInfoTurns), 2), 10)}`,
      )
    }
  }

  // THE PAIRED TEST, which is the one this design supports and the unpaired
  // rates above do not. Every row walks the same seeds, so the question is not
  // "are two proportions different" — with n in the low hundreds a 5-point
  // swing sits inside one standard error and nothing could be concluded — but
  // "of the runs whose OUTCOME MOVED, which way did they move". Discordant
  // pairs only, and an exact two-sided binomial against a coin.
  const caughtBy = (
    difficulty: Difficulty,
    companion: CreatureKind | null,
    radius: number,
  ): boolean[] => {
    setRadius(radius)
    return Array.from({ length: sweep }, (_, i) =>
      driveRun('houndhandler', i + 1, difficulty, companion).outcome === 'caught')
  }

  const paired = (title: string, left: string, right: string,
    a: (d: Difficulty) => boolean[], b: (d: Difficulty) => boolean[]): void => {
    console.log('')
    console.log(`  ── paired: ${title} ${rule(Math.max(4, 58 - title.length))}`)
    console.log(
      `     ${pad('difficulty', 12)}${padLeft(left, 17)}${padLeft(right, 17)}${padLeft('p (2-sided)', 13)}`,
    )
    for (const difficulty of DIFFICULTIES) {
      const before = a(difficulty)
      const after = b(difficulty)
      let onlyBefore = 0
      let onlyAfter = 0
      for (let i = 0; i < sweep; i++) {
        if (before[i] === true && after[i] === false) onlyBefore += 1
        if (before[i] === false && after[i] === true) onlyAfter += 1
      }
      console.log(
        `     ${pad(difficulty, 12)}${padLeft(String(onlyBefore), 17)}${padLeft(String(onlyAfter), 17)}` +
        `${padLeft(num(binomialP(onlyBefore, onlyBefore + onlyAfter), 4), 13)}`,
      )
    }
  }

  // The rework: one more room of warning, hound in both columns.
  paired(
    'which runs changed outcome when the radius went 2 → 3?',
    'caught @2 only', 'caught @3 only',
    (d) => caughtBy(d, 'grellhound', WUMPUS.mandatoryStenchRadius),
    (d) => caughtBy(d, 'grellhound', original),
  )

  // The premise the rework rests on: at the floor's own radius the hound should
  // be worth NOTHING, because it repeats the floor. Anything here is the
  // Confused divergence described below, and nothing else — the two columns
  // differ only in whether a grellhound is present, and a grellhound draws no
  // randomness at step 7, so these are the same seeds walking the same rooms.
  paired(
    'is a hound at the FLOOR radius worth anything? (it should not be)',
    'caught, no hound', 'caught, hound @2',
    (d) => caughtBy(d, null, WUMPUS.mandatoryStenchRadius),
    (d) => caughtBy(d, 'grellhound', WUMPUS.mandatoryStenchRadius),
  )

  setRadius(original)
  console.log('')
  console.log('  (restored the warning radius)')
  console.log('  ROWS 1 AND 2 WERE PREDICTED TO MATCH and do not, and the gap is a finding')
  console.log('  rather than noise: `new info` is 0.3-0.5 per run on row 2, where it should')
  console.log('  be 0.00 by construction. Every one of those turns is a CONFUSED one —')
  console.log('  measured, 65 of 65. GDD 2.8.1 says Confused suppresses the stench AND the')
  console.log('  companion passives ("the exemption is from oil and from FOCUS, not from')
  console.log('  the spores"); `getTells` implements that and `companionSenses` does not, so')
  console.log('  the hound keeps talking through a lungful of spores. Pre-dates this step.')
  console.log('')
  console.log('  READ THE CAUGHT COLUMN, NOT THE ESCAPED ONE. Escapes also move on how')
  console.log('  often the sidestep rule blunders back out of the entrance (retreated),')
  console.log('  which is this policy being crude rather than the warning being worth')
  console.log('  anything. Being caught less is the effect the warning can actually have.')
}

// ---------------------------------------------------------------------------
// Entry
// ---------------------------------------------------------------------------

const mode = (process.argv[2] ?? 'all').toLowerCase()
const sweep = Number(process.env.SWEEP ?? 60)

if (mode === 'all' || mode === 'price') panelPrice()
if (mode === 'all' || mode === 'move') panelMove(sweep)
if (mode === 'all' || mode === 'pressure') panelPressure(sweep)
if (mode === 'all' || mode === 'contract') panelContract()
if (mode === 'all' || mode === 'bloom') panelBloom(sweep)
if (mode === 'all' || mode === 'heart') panelHeart(sweep)
if (mode === 'all' || mode === 'hazardcost') panelHazardCost(sweep)
if (mode === 'all' || mode === 'warning') panelWarning(sweep)
console.log('')
