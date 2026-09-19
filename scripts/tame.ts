/**
 * Watch the creature system.  npm run tame -- <seed> [difficulty] [tier] [policy]
 *
 *   policy: fight | tame | sneak | both   (default: both)
 *
 * Tests tell you the encounter code is CORRECT. This tells you whether the
 * central claim of the design is TRUE:
 *
 *   Fighting is fast and loud. Taming is slow and quiet.
 *
 * So it runs the identical seed twice — once fighting everything, once taming
 * everything — and puts the two side by side. If one column is simply better
 * than the other, the system has no dilemma in it and the costs need fixing
 * (CLAUDE.md 3: fix the costs, never remove the choice).
 *
 * It also answers three things no assertion asks:
 *   - How often is a BRAVE companion actually reachable? SEND is the escape
 *     valve that makes Tier 4 survivable, and it is gated behind one band.
 *   - Does a sent companion actually pull the Wumpus, or just feed it?
 *   - Does world drift read as a world, or as noise?
 */

import { createRng } from '../src/engine/rng.ts'
import { generateLabyrinth, chooseWumpusStart, distancesFrom, roomIdAt } from '../src/engine/generate.ts'
import {
  createWumpus, decayScent, depositScent, emptyScent, escalate,
  getTells, hasCaught, moveWumpus, scentAt, wumpusIsNear,
} from '../src/engine/wumpus.ts'
import {
  companionSenses, driftWorld, encounterOptions, encounterRollSpec,
  resolveEncounter, scentMultiplierFor, sendCompanion, skittishBolts,
} from '../src/engine/creatures.ts'
import type { EncounterAction } from '../src/engine/creatures.ts'
import { bandForMargin, statModifier } from '../src/engine/dice.ts'
import { DIRECTIONS, BAND_ORDER } from '../src/engine/types.ts'
import type {
  Companion, CreatureKind, Difficulty, Direction, Labyrinth,
  OutcomeBand, Player, Room, RoomId, ScentField, WumpusTier,
} from '../src/engine/types.ts'
import {
  ACTION_DC, COMPANION, DIFFICULTY, DRIFT, ENCOUNTER, FIGHT_OUTCOMES, HEART, OIL,
  PLAYER, SCENT, SCENT_BY_ACTION, TAME_DC, TAME_OUTCOMES, WUMPUS_TIERS,
  oilBandFor, oilCostFor, sendDecoyTurnsFor, sendScentFor, wumpusReach,
} from '../src/engine/data/tuning.ts'

const seedArg = Number(process.argv[2] ?? 1)
let seedOverride: number | null = null
/** The sweep reuses playRun across seeds; everything else reads one fixed seed. */
const currentSeed = (): number => seedOverride ?? seedArg
const seed = seedArg
const difficulty = (process.argv[3] ?? 'stirring') as Difficulty
const tier = Number(process.argv[4] ?? DIFFICULTY[difficulty].wumpusTier) as WumpusTier
const policyArg = (process.argv[5] ?? 'both') as EncounterAction | 'both'

const BESTIARY: readonly CreatureKind[] = ['goblin', 'lumewing', 'grellhound', 'quietOne']
const rule = (n = 74): string => '─'.repeat(n)
const pad = (s: string, n: number): string => s.padEnd(n)

/** `-1.50 oil`, `+0.50 oil`, or `free` — signed so a payout reads as one. */
const oilLabel = (cost: number): string =>
  cost === 0 ? 'free' : `${cost > 0 ? '-' : '+'}${Math.abs(cost).toFixed(2)} oil`
const num = (v: number, n = 5): string => v.toFixed(2).padStart(n)

// ===========================================================================
// PANEL A — the asymmetry, as numbers
// ===========================================================================

function panelAsymmetry(): void {
  console.log(`\n${rule()}\nPANEL A  — fight vs tame, band by band (GDD 2.9)\n${rule()}`)
  console.log(`  a goblin (tame DC ${TAME_DC.goblin}), no companion, scent shown as deposited\n`)
  console.log(
    `  ${pad('band', 17)}${pad('FIGHT', 30)}TAME`,
  )
  console.log(`  ${pad('', 17)}${pad(`${ENCOUNTER.fightTurnCost} turn`, 30)}${ENCOUNTER.tameTurnCost} turns`)
  console.log(`  ${rule(70)}`)

  for (const band of BAND_ORDER) {
    const f = FIGHT_OUTCOMES[band]
    const t = TAME_OUTCOMES[band]
    const fScent = SCENT_BY_ACTION.fight + f.extraScent
    const tScent = SCENT_BY_ACTION.tame + t.extraScent
    // Oil where the health column used to be. Health is retired (GDD 2.6) and
    // what a band costs you now is the action's price scaled by that band —
    // which is the comparison this panel was always trying to make, in the one
    // currency that is left.
    const fOil = oilCostFor('fight', band)
    const tOil = oilCostFor('tame', band)
    const fText = `${num(fScent)} scent  ${pad(oilLabel(fOil), 9)}${f.driven ? 'driven off' : 'still there'}`
    const tText =
      `${num(tScent)} scent  ${pad(oilLabel(tOil), 9)}` +
      (t.tamed
        ? t.brave ? 'TAMED (brave)' : t.skittish ? 'TAMED (skittish)' : t.revealsRooms ? 'TAMED (+reveal)' : 'TAMED'
        : t.hostile ? 'HOSTILE' : 'bolted')
    console.log(`  ${pad(band, 17)}${pad(fText, 30)}${tText}`)
  }

  const ratio = SCENT_BY_ACTION.fight / SCENT_BY_ACTION.tame
  console.log(
    `\n  clean fight is ${ratio.toFixed(1)}x louder than a clean tame, and one turn cheaper.`,
  )
  console.log(
    `  a CRITICALLY FAILED tame lays ${num(SCENT_BY_ACTION.tame + TAME_OUTCOMES.criticalFailure.extraScent, 0)}` +
    ` — exactly a clean fight. it stopped being a tame.`,
  )
}

// ===========================================================================
// PANEL B — is a brave companion actually reachable?
// ===========================================================================

/** Exact band distribution over d20. No sampling: 20 outcomes, enumerated. */
function bandDistribution(dc: number, mod: number): Record<OutcomeBand, number> {
  const counts: Record<OutcomeBand, number> = {
    criticalFailure: 0, failure: 0, mixed: 0, success: 0, strongSuccess: 0, criticalSuccess: 0,
  }
  for (let natural = 1; natural <= 20; natural++) {
    let band = bandForMargin(natural + mod - dc)
    // Natural 1 caps at failure; natural 20 floors at success. See dice.ts.
    if (natural === 1 && BAND_ORDER.indexOf(band) > BAND_ORDER.indexOf('failure')) band = 'failure'
    if (natural === 20 && BAND_ORDER.indexOf(band) < BAND_ORDER.indexOf('success')) band = 'success'
    counts[band] += 1
  }
  for (const b of BAND_ORDER) counts[b] /= 20
  return counts
}

/**
 * P(brave) under the CURRENT gate, read off TAME_OUTCOMES rather than hardcoded.
 *
 * This used to hardcode `.criticalSuccess` and would therefore have kept
 * printing the old, broken answer after the 17 Sep fix moved the gate — a
 * visualiser lying about the exact thing it exists to watch. Deriving the brave
 * bands from the table means the panel cannot drift from the rule again.
 *
 * The natural-20 floor is added on top: it lives in resolve.ts (resolveEncounter
 * never sees the natural die), and it contributes the 1/20 cases where the
 * margin alone would not have reached a brave band.
 */
function braveChance(dc: number, mod: number): number {
  const braveBands = BAND_ORDER.filter((b) => TAME_OUTCOMES[b].brave)
  const dist = bandDistribution(dc, mod)
  const fromBands = braveBands.reduce((sum, b) => sum + dist[b], 0)

  // What a natural 20 alone lands on, so it is not double-counted.
  let nat20Band = bandForMargin(20 + mod - dc)
  if (BAND_ORDER.indexOf(nat20Band) < BAND_ORDER.indexOf('success')) nat20Band = 'success'
  const nat20AlreadyBrave = TAME_OUTCOMES[nat20Band].brave
  return fromBands + (nat20AlreadyBrave ? 0 : 1 / 20)
}

function panelBrave(): void {
  console.log(`\n${rule()}\nPANEL B  — can you ever get a brave companion? (SEND is gated on it)\n${rule()}`)
  const braveBands = BAND_ORDER.filter((b) => TAME_OUTCOMES[b].brave)
  console.log(`  P(brave) on TAME, by INT. mod = floor((INT-10)/2)`)
  console.log(`  gate: ${braveBands.join(' or ')}, OR a natural 20 on any successful tame\n`)
  console.log(`  ${pad('creature', 13)}${pad('DC', 4)}${[8, 10, 12, 14, 16, 18].map((s) => pad(`INT ${s}`, 9)).join('')}`)
  console.log(`  ${rule(70)}`)

  for (const creature of BESTIARY) {
    const dc = TAME_DC[creature]
    const cells = [8, 10, 12, 14, 16, 18].map((stat) => {
      const p = braveChance(dc, statModifier(stat))
      return pad(p === 0 ? '  —  ' : `${(p * 100).toFixed(0)}%`, 9)
    })
    console.log(`  ${pad(creature, 13)}${pad(String(dc), 4)}${cells.join('')}`)
  }

  console.log(`\n  and the same table for P(tamed at all) — mixed or better:\n`)
  console.log(`  ${pad('creature', 13)}${pad('DC', 4)}${[8, 10, 12, 14, 16, 18].map((s) => pad(`INT ${s}`, 9)).join('')}`)
  console.log(`  ${rule(70)}`)
  for (const creature of BESTIARY) {
    const dc = TAME_DC[creature]
    const cells = [8, 10, 12, 14, 16, 18].map((stat) => {
      const d = bandDistribution(dc, statModifier(stat))
      const p = d.mixed + d.success + d.strongSuccess + d.criticalSuccess
      return pad(`${(p * 100).toFixed(0)}%`, 9)
    })
    console.log(`  ${pad(creature, 13)}${pad(String(dc), 4)}${cells.join('')}`)
  }
  console.log(`\n  no dashes any more, and that is the finding: the natural-20 floor puts a`)
  console.log(`  5% baseline under every creature at every stat, so no DC can make SEND`)
  console.log(`  permanently unreachable — which is what the Quiet One's Hard 16 used to do.`)
  console.log(`  Fortune bumps one band, so success -> strongSuccess is a third route.`)
}

// ===========================================================================
// PANEL C — a scripted run, under one encounter policy
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
  return '·'
}

function render(lab: Labyrinth, playerId: RoomId, wumpusId: RoomId, scent: ScentField, carrying: boolean): string {
  const lines: string[] = []
  for (let y = 0; y < lab.height; y++) {
    let row = '', below = ''
    for (let x = 0; x < lab.width; x++) {
      const id = roomIdAt(x, y)
      const room = lab.rooms[id] as Room
      const smell = SHADE(scentAt(scent, id))
      const mark =
        id === playerId ? 'P' + (carrying ? '*' : smell)
        : id === wumpusId ? 'W' + smell
        : featureOf(room, carrying) + smell
      row += `[${mark}]` + (room.exits.E !== undefined ? '───' : '   ')
      below += (room.exits.S !== undefined ? ' │     ' : '       ')
    }
    lines.push(row.trimEnd())
    if (y < lab.height - 1) lines.push(below.trimEnd())
  }
  return lines.join('\n')
}

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
  const out: RoomId[] = []
  for (let c: RoomId | null = to; c !== null; c = prev[c] ?? null) out.unshift(c)
  return out
}

interface RunSummary {
  readonly policy: EncounterAction
  readonly outcome: string
  readonly turnsUsed: number
  readonly encounters: number
  readonly totalScent: number
  readonly peakScent: number
  readonly closestWumpus: number
  readonly companionsGained: number
  readonly companionsReleased: number
  readonly damageTaken: number
  readonly creatureMoves: number
  readonly braveEverSeen: boolean
  /** Times the scripted player actually spent a brave companion as bait. */
  readonly sends: number
  /** The stench fired at least once — the Wumpus was actually a presence. */
  readonly adjacentEver: boolean
}

function playRun(policy: EncounterAction, verbose: boolean): RunSummary {
  // A fresh Rng per policy so both runs see the IDENTICAL labyrinth and the
  // identical Wumpus start. The runs then diverge only through their choices.
  const rng = createRng(currentSeed())
  let lab = generateLabyrinth(rng, { difficulty })
  const contract = DIFFICULTY[difficulty]
  let wumpus = createWumpus(chooseWumpusStart(lab, rng), tier)

  let scent = emptyScent()
  let oil: number = OIL.starting
  let fortune = Math.floor(PLAYER.startingStat / PLAYER.fortuneDivisor)
  let companion: Companion | null = null
  let carrying = false
  let facing: Direction | null = null
  let playerId = lab.entranceId

  const intMod = statModifier(PLAYER.startingStat)

  let plan = route(lab, lab.entranceId, lab.heartRoomId)
  let planStep = 1
  let heading: 'in' | 'out' = 'in'

  let outcome = 'ran out of turns'
  let turnsUsed = 0
  let encounters = 0, totalScent = 0, peakScent = 0, damageTaken = 0
  let companionsGained = 0, companionsReleased = 0
  let creatureMoves = 0
  let braveEverSeen = false
  let sends = 0
  let closestWumpus = Infinity

  if (verbose) {
    console.log(`\n${rule()}`)
    console.log(`PANEL C  — scripted run, policy: ${policy.toUpperCase()}`)
    console.log(`${rule()}`)
    console.log(`seed ${currentSeed()}  ${difficulty}  wumpus tier ${tier} (${WUMPUS_TIERS[tier].name})`)
    console.log(`entrance ${lab.entranceId}  heart ${lab.heartRoomId}  wumpus starts ${wumpus.roomId}`)
    console.log(`drift rate x${DRIFT.byDifficulty[difficulty]}  (creature ${DRIFT.creatureMoveChance}/turn; terrain is fixed within a run)\n`)
  }

  for (let turn = 1; turn <= contract.maxTurns; turn++) {
    turnsUsed = turn
    const here = lab.rooms[playerId] as Room
    const detail: string[] = []

    // ---- 1. player acts --------------------------------------------------
    // An encounter in the current room takes priority over walking on: you are
    // standing next to the thing.
    let turnsConsumed = 1

    // SEND, under the one rule a scripted player can defend: the stench is
    // firing, you have something brave, so you spend it. Before the 17 Sep
    // fixes this branch was dead code in every run ever swept — a brave
    // companion was unobtainable at starting stats, so the escape valve the GDD
    // calls "the single most important design beat in the game" had never once
    // been exercised by the harness that exists to exercise it.
    const gapNow = distancesFrom(lab, playerId)[wumpus.roomId] ?? -1
    if (companion?.brave === true && gapNow === 1) {
      // Bait it where it already is — the decoy has to out-smell your trail
      // inside its perception radius, not somewhere it will never look.
      const nextStep = planStep < plan.length ? plan[planStep] : null
      const candidates = DIRECTIONS
        .map((d) => ({ d, to: (lab.rooms[playerId] as Room).exits[d] }))
        .filter((x): x is { d: Direction; to: RoomId } => x.to !== undefined && x.to !== nextStep)
      const towardWumpus = candidates.sort(
        (a, b) =>
          (distancesFrom(lab, a.to)[wumpus.roomId] ?? 99) - (distancesFrom(lab, b.to)[wumpus.roomId] ?? 99),
      )[0]

      const player = {
        roomId: playerId, facing,
        stats: { str: PLAYER.startingStat, agi: PLAYER.startingStat, int: PLAYER.startingStat, lck: PLAYER.startingStat },
        oil, maxOil: OIL.max, fortune,
        carryingHeart: carrying, companion, inventory: [], statuses: {},
      } as Player
      // The send's own roll decides the decoy now (GDD 2.9), so this visualiser
      // has to roll one rather than reading the creature's tame DC.
      const sendBand = bandForMargin(
        rng.d20() + statModifier(PLAYER.startingStat) + oilBandFor(oil).modifier - ACTION_DC.send,
      )
      const sent = towardWumpus ? sendCompanion(lab, player, towardWumpus.d, sendBand) : null

      if (sent) {
        scent = depositScent(scent, sent.targetRoomId, sent.scent)
        detail.push(
          `      SEND the ${sent.sent} ${towardWumpus?.d} into ${sent.targetRoomId}: ` +
          `${sent.scent} scent, covers ${sendDecoyTurnsFor(sendBand, carrying)} turn(s)` +
          `${carrying ? ' (carrying the Heart)' : ''} — IT DOES NOT COME BACK`,
        )
        companion = null
        sends += 1
        // Spending the turn on bait means not walking this turn; that is the cost.
        turnsConsumed = 1
        // Fall through to the wumpus step without moving or encountering.
        if (hasCaught(wumpus, playerId)) { closestWumpus = 0; outcome = `CAUGHT turn ${turn}`; break }
        for (let i = 0; i < turnsConsumed; i++) {
          const r = moveWumpus(lab, wumpus, scent, {
            carryingHeart: carrying, entranceId: lab.entranceId, revealedPlayerRoom: null,
          }, rng)
          wumpus = r.wumpus
        }
        if (hasCaught(wumpus, playerId)) { closestWumpus = 0; outcome = `CAUGHT turn ${turn} — it came for you`; break }
        const drift0 = driftWorld(lab, { playerRoomId: playerId, wumpusRoomId: wumpus.roomId }, rng)
        lab = drift0.labyrinth
        creatureMoves += drift0.movedCreatures.length
        const gap0 = distancesFrom(lab, playerId)[wumpus.roomId] ?? -1
        if (gap0 >= 0) closestWumpus = Math.min(closestWumpus, gap0)
        if (verbose) {
          console.log(render(lab, playerId, wumpus.roomId, scent, carrying))
          console.log(
            `turn ${String(turn).padStart(2)}  oil ${oil.toFixed(2)}  ` +
            `player ${playerId}  wumpus ${wumpus.roomId}  gap ${gap0}  companion —`,
          )
          for (const dline of detail) console.log(dline)
          console.log('')
        }
        scent = decayScent(scent)
        oil = Math.max(0, oil - oilCostFor('send', 'mixed'))
        continue
      }
    }

    if (here.creature !== null && policy !== 'flee') {
      encounters += 1
      const creature = here.creature
      // A creature that turned on you can no longer be tamed — the engine says
      // so via encounterOptions, so the tame policy has to fall back.
      const options = encounterOptions(here)
      const chosen: EncounterAction = options.includes(policy) ? policy : 'fight'
      if (chosen !== policy) detail.push(`      the ${creature} is HOSTILE \u2014 TAME is off the menu, falling back to FIGHT`)
      const spec = encounterRollSpec(chosen, creature)
      const oilMod = oilBandFor(oil).modifier
      const natural = rng.d20()
      const total = natural + intMod + oilMod
      let band = bandForMargin(total - spec.dc)
      if (natural === 1 && BAND_ORDER.indexOf(band) > BAND_ORDER.indexOf('failure')) band = 'failure'
      if (natural === 20 && BAND_ORDER.indexOf(band) < BAND_ORDER.indexOf('success')) band = 'success'

      const result = resolveEncounter(chosen, band, {
        labyrinth: lab, creature, roomId: playerId, companion,
        retreatRoomId: null, carryingHeart: carrying,
      }, rng)

      turnsConsumed = result.turnCost
      totalScent += result.scent
      peakScent = Math.max(peakScent, result.scent)
      scent = depositScent(scent, playerId, result.scent)

      // The encounter's oil price, and the skittish bolt that replaced the
      // damage trigger it used to hang off (GDD 2.6, 2.9).
      oil = Math.max(0, oil - oilCostFor(chosen, band))
      if (skittishBolts(companion, band, false) && companion !== null) {
        detail.push(`      the ${companion.kind} bolts (skittish, critical failure; ${fortune} fortune unspent)`)
        companion = null
      }

      if (result.companionGained) {
        if (result.companionReleased) {
          detail.push(`      released the ${result.companionReleased} — one slot`)
          companionsReleased += 1
        }
        companion = result.companionGained
        companionsGained += 1
        if (companion.brave) braveEverSeen = true
      }

      if (!result.creatureRemains) {
        lab = { ...lab, rooms: { ...lab.rooms, [playerId]: { ...here, creature: null, creatureHostile: false } } }
      } else if (result.hostile) {
        lab = { ...lab, rooms: { ...lab.rooms, [playerId]: { ...here, creatureHostile: true } } }
      }

      const flags = [
        result.hostile ? 'HOSTILE' : '',
        result.companionGained ? `+${result.companionGained.kind}${result.companionGained.brave ? ' BRAVE' : result.companionGained.skittish ? ' skittish' : ''}` : '',
        result.revealedRooms.length ? `reveals ${result.revealedRooms.join(',')}` : '',
        !result.creatureRemains && !result.companionGained ? 'gone' : '',
      ].filter(Boolean).join(' ')

      detail.unshift(
        `      ${chosen.toUpperCase()} the ${creature}: d20=${String(natural).padStart(2)} ${total >= spec.dc ? '+' : ''}${total - spec.dc} vs DC ${spec.dc}` +
        ` → ${pad(band, 16)} ${num(result.scent)} scent, ${turnsConsumed}t ${flags}`,
      )
    } else {
      // walk the plan
      if (planStep < plan.length) {
        const to = plan[planStep] as RoomId
        facing = DIRECTIONS.find((d) => (lab.rooms[playerId] as Room).exits[d] === to) ?? facing
        playerId = to
        planStep += 1
      }
      const weight = SCENT_BY_ACTION.move * (carrying ? HEART.carryScentMultiplier : 1) * scentMultiplierFor(companion)
      totalScent += weight
      peakScent = Math.max(peakScent, weight)
      scent = depositScent(scent, playerId, weight)
    }

    // ---- 2. CATCH CHECK — you walked into it -------------------------------
    if (hasCaught(wumpus, playerId)) { closestWumpus = 0; outcome = `CAUGHT turn ${turn} — walked into it`; break }

    // ---- 3. effects: the Heart ------------------------------------------
    let revealed: RoomId | null = null
    if (playerId === lab.heartRoomId && !carrying) {
      carrying = true
      wumpus = escalate(wumpus)
      revealed = playerId
      plan = route(lab, lab.heartRoomId, lab.entranceId)
      planStep = 1
      heading = 'out'
      scent = depositScent(scent, playerId, SCENT.heartTaken)
      detail.push(`      *** THE HEART. wumpus escalates to tier ${wumpus.tier}, +${SCENT.heartTaken} scent, position revealed ***`)
    }

    // ---- 5. wumpus moves (one step per consumed turn — taming costs two) --
    let moveReason = ''
    for (let i = 0; i < turnsConsumed; i++) {
      const r = moveWumpus(lab, wumpus, scent, {
        carryingHeart: carrying, entranceId: lab.entranceId,
        revealedPlayerRoom: i === 0 ? revealed : null,
      }, rng)
      wumpus = r.wumpus
      moveReason = r.reason
      if (i < turnsConsumed - 1) scent = decayScent(scent)
    }

    // ---- 6. CATCH CHECK — it came for you --------------------------------
    if (hasCaught(wumpus, playerId)) { closestWumpus = 0; outcome = `CAUGHT turn ${turn} — it came for you`; break }

    // ---- 7. world drift, THEN companion passives ------------------------
    const drift = driftWorld(lab, { playerRoomId: playerId, wumpusRoomId: wumpus.roomId }, rng)
    lab = drift.labyrinth
    creatureMoves += drift.movedCreatures.length
    for (const m of drift.movedCreatures) {
      detail.push(`      drift: ${m.kind}${m.hostile ? ' (HOSTILE)' : ''} ${m.from} → ${m.to}`)
    }

    const senses = companionSenses(lab, companion, playerId, wumpus.roomId)
    if (senses.wumpusGrowl) detail.push(`      the grellhound GROWLS — wumpus within ${COMPANION.grellhoundWarningRadius}`)
    if (senses.revealedHazards.length) {
      detail.push(`      the grellhound smells: ${senses.revealedHazards.map((h) => `${h.direction} ${h.hazard}`).join(', ')}`)
    }

    // ---- report ----------------------------------------------------------
    const gap = distancesFrom(lab, playerId)[wumpus.roomId] ?? -1
    if (gap >= 0) closestWumpus = Math.min(closestWumpus, gap)
    const band = oilBandFor(oil)
    // Everything resolved: this is a view of the WORLD, not a simulation of
    // what a player has paid to learn (GDD 2.7's FOCUS economy).
    const tells = getTells(lab, playerId, wumpus.roomId, {
      confused: false, resolved: [...DIRECTIONS], heartTaken: carrying,
    }).flatMap((d) => d.tells)

    if (verbose) {
      console.log(render(lab, playerId, wumpus.roomId, scent, carrying))
      console.log(
        `turn ${String(turn).padStart(2)}  oil ${oil.toFixed(2)}(${band.name})  ` +
        `player ${playerId}${carrying ? ' [HEART]' : ''}  wumpus ${wumpus.roomId} [${moveReason}]  gap ${gap}  ` +
        `companion ${companion ? companion.kind + (companion.brave ? '*' : companion.skittish ? '~' : '') : '—'}` +
        `${wumpusIsNear(lab, playerId, wumpus.roomId) ? '   *** SILENCE ***' : ''}`,
      )
      console.log(`        heading ${heading}  tells: ${tells.length ? tells.map((t) => `${t.direction} ${t.kind}`).join(', ') : 'none'}`)
      for (const d of detail) console.log(d)
      console.log('')
    }

    // No health means no death by attrition (GDD 2.6): only a pit and the
    // Wumpus end a run, and both are checked elsewhere in this loop.
    if (playerId === lab.entranceId && carrying) { outcome = `ESCAPED turn ${turn}`; break }

    // ---- upkeep ----------------------------------------------------------
    scent = decayScent(scent)
    void fortune
  }

  return {
    policy, outcome, turnsUsed, encounters, totalScent, peakScent,
    closestWumpus: closestWumpus === Infinity ? -1 : closestWumpus,
    companionsGained, companionsReleased, damageTaken,
    creatureMoves, braveEverSeen, sends,
    adjacentEver: closestWumpus <= 1,
  }
}

// ===========================================================================
// PANEL D — does a sent companion actually pull the Wumpus?
// ===========================================================================

function panelSend(): void {
  console.log(`\n${rule()}\nPANEL D  — SEND: does the decoy out-smell you, and for how long?\n${rule()}`)

  const rng = createRng(seed)
  const lab = generateLabyrinth(rng, { difficulty })
  let wumpus = createWumpus(chooseWumpusStart(lab, rng), tier)

  // Walk the player to a room mid-route so there is a real trail behind them,
  // then grant a brave companion outright. Panel B explains why we have to.
  const inbound = route(lab, lab.entranceId, lab.heartRoomId)
  let scent = emptyScent()
  let playerId = lab.entranceId
  for (const step of inbound.slice(1, Math.min(5, inbound.length))) {
    playerId = step
    scent = depositScent(scent, playerId, SCENT_BY_ACTION.move)
    scent = decayScent(scent)
  }

  const companion: Companion = { kind: 'grellhound', brave: true, skittish: false }
  const player = {
    roomId: playerId, facing: null, stats: { str: 8, agi: 8, int: 8, lck: 8 },
    oil: 12, maxOil: 12, fortune: 2,
    carryingHeart: false, companion, inventory: [], statuses: [],
  } as Player

  const dir = DIRECTIONS.find((d) => (lab.rooms[playerId] as Room).exits[d] !== undefined)
  if (!dir) { console.log('  no exit to send into; pick another seed'); return }

  // A clean send, so Panel D shows the decoy at its stated strength.
  const sent = sendCompanion(lab, player, dir, 'success')
  if (!sent) { console.log('  send refused'); return }

  console.log(`  player at ${playerId}, wumpus at ${wumpus.roomId}, gap ${distancesFrom(lab, playerId)[wumpus.roomId] ?? -1}`)
  console.log(`  sending the ${sent.sent} ${dir} into ${sent.targetRoomId} — it drops ${sent.scent} scent and DOES NOT COME BACK\n`)
  scent = depositScent(scent, sent.targetRoomId, sent.scent)

  console.log(`  ${pad('turn', 6)}${pad('decoy', 8)}${pad('player trail', 14)}${pad('decoy wins?', 13)}${pad('wumpus', 8)}${pad('goes for', 12)}`)
  console.log(`  ${rule(70)}`)

  for (let t = 1; t <= 6; t++) {
    const decoy = scentAt(scent, sent.targetRoomId)
    const mine = scentAt(scent, playerId)
    const r = moveWumpus(lab, wumpus, scent, { carryingHeart: false, entranceId: lab.entranceId, revealedPlayerRoom: null }, rng)
    const toDecoy = distancesFrom(lab, sent.targetRoomId)[r.wumpus.roomId] ?? -1
    const toMe = distancesFrom(lab, playerId)[r.wumpus.roomId] ?? -1
    wumpus = r.wumpus
    console.log(
      `  ${pad(String(t), 6)}${pad(num(decoy), 8)}${pad(num(mine), 14)}` +
      `${pad(decoy > mine ? 'yes' : 'NO', 13)}${pad(wumpus.roomId, 8)}${pad(r.reason, 12)}` +
      ` d(decoy)=${toDecoy} d(me)=${toMe}`,
    )
    // The player holds still, laying a fresh trail each turn — the hard case.
    scent = depositScent(scent, playerId, SCENT_BY_ACTION.move)
    scent = decayScent(scent)
  }

  // The decoy's strength is keyed to the tame DC, so the duration is now a
  // TABLE rather than a number. Measured against the arithmetic, per creature,
  // per Heart state — the claim and the observation side by side, which is the
  // only form in which a derived constant is worth printing.
  const carried = SCENT_BY_ACTION.move * HEART.carryScentMultiplier
  const dominatesFor = (decoy: number, deposit: number): number => {
    let n = 0
    for (let k = 0; k <= 20; k++) {
      if (decoy * SCENT.decayFactor ** k <= deposit) break
      n = k + 1
    }
    return n
  }

  console.log(`\n  decay ${SCENT.decayFactor}/turn. walking deposits ${SCENT_BY_ACTION.move}, carrying the Heart ${carried}.\n`)
  // KEYED BY THE ROLL, NOT BY THE CREATURE, since 18 Sep 2026 (GDD 2.9). The
  // rows used to be the four creatures and their tame DCs — the decoy's
  // strength was a function of which animal you had managed to catch. It is
  // the send's own band now, so every companion bids the same and the table is
  // two rows instead of four.
  //
  // Panel B's lesson from 1e applies here and is why this reads `sendScentFor`
  // rather than a constant: a visualiser that hardcodes the rule it is watching
  // is a visualiser that lies on the day the rule changes, which is the only
  // day anyone is looking at it.
  console.log(
    `  ${pad('send roll', 13)}${pad('sendScent', 11)}` +
    `${pad('alone', 16)}${pad('with Heart', 16)}`,
  )
  console.log(`  ${rule(70)}`)
  for (const band of ['success', 'failure'] as const) {
    const decoy = sendScentFor(band)
    const alone = dominatesFor(decoy, SCENT_BY_ACTION.move)
    const withHeart = dominatesFor(decoy, carried)
    const claimAlone = sendDecoyTurnsFor(band, false)
    const claimHeart = sendDecoyTurnsFor(band, true)
    const cell = (measured: number, claimed: number): string =>
      `${measured}t ${measured === claimed ? '✓' : `✗ claims ${claimed}`}`
    console.log(
      `  ${pad(band === 'success' ? 'good' : 'bad', 13)}${pad(String(decoy), 11)}` +
      `${pad(cell(alone, claimAlone), 16)}${pad(cell(withHeart, claimHeart), 16)}`,
    )
  }
  console.log(
    `\n  a ✗ means COMPANION.sendDecoyTurns and the decay arithmetic disagree — the GDD's`,
  )
  console.log(`  promise would be a lie. tests/creatures.test.ts asserts all four of these.`)
  console.log(
    `  3-without / 1-with is ARITHMETICALLY IMPOSSIBLE under one shared decayFactor,`,
  )
  console.log(`  which is why the Quiet One keeps 2/1 rather than matching the others.`)
}

// ===========================================================================

// ===========================================================================
// SWEEP — aggregates across seeds, so findings are numbers and not anecdotes
// ===========================================================================

function sweep(count: number): void {
  console.log(`\n${rule()}\nSWEEP  — ${count} seeds, ${difficulty}, tier ${tier}, fight vs tame\n${rule()}`)

  const agg: Record<EncounterAction, {
    wins: number; runs: number; turns: number; scent: number; peak: number
    damage: number; closest: number; companions: number; brave: number; encounters: number
    adjacent: number; sends: number
  }> = {
    fight: { wins: 0, runs: 0, turns: 0, scent: 0, peak: 0, damage: 0, closest: 0, companions: 0, brave: 0, encounters: 0, adjacent: 0, sends: 0 },
    tame:  { wins: 0, runs: 0, turns: 0, scent: 0, peak: 0, damage: 0, closest: 0, companions: 0, brave: 0, encounters: 0, adjacent: 0, sends: 0 },
    sneak: { wins: 0, runs: 0, turns: 0, scent: 0, peak: 0, damage: 0, closest: 0, companions: 0, brave: 0, encounters: 0, adjacent: 0, sends: 0 },
    flee:  { wins: 0, runs: 0, turns: 0, scent: 0, peak: 0, damage: 0, closest: 0, companions: 0, brave: 0, encounters: 0, adjacent: 0, sends: 0 },
  }
  const startGaps: number[] = []
  const outcomes: Record<string, number> = {}
  // Seeds worth going back and WATCHING. An aggregate tells you a rate; it
  // cannot show you the beat. SEND is rare enough now that without this you
  // would have to guess which of 300 seeds to open.
  const sendSeeds: number[] = []
  const braveSeeds: number[] = []

  const baseSeed = seed
  for (let i = 0; i < count; i++) {
    seedOverride = baseSeed + i
    // Wumpus start distance is a property of generation, not of the policy.
    const r = createRng(seedOverride)
    const l = generateLabyrinth(r, { difficulty })
    startGaps.push(distancesFrom(l, l.entranceId)[chooseWumpusStart(l, r)] ?? -1)

    for (const p of ['fight', 'tame'] as EncounterAction[]) {
      const s = playRun(p, false)
      const a = agg[p]
      a.runs += 1
      a.turns += s.turnsUsed
      a.scent += s.totalScent / Math.max(1, s.turnsUsed)
      a.peak += s.peakScent
      a.damage += s.damageTaken
      a.closest += s.closestWumpus < 0 ? 99 : s.closestWumpus
      a.companions += s.companionsGained
      a.encounters += s.encounters
      a.sends += s.sends
      if (s.braveEverSeen) { a.brave += 1; if (!braveSeeds.includes(seedOverride)) braveSeeds.push(seedOverride) }
      if (s.sends > 0 && !sendSeeds.includes(seedOverride)) sendSeeds.push(seedOverride)
      if (s.adjacentEver) a.adjacent += 1
      if (s.outcome.startsWith('ESCAPED')) a.wins += 1
      const key = `${p}:${s.outcome.split(' turn')[0]}`
      outcomes[key] = (outcomes[key] ?? 0) + 1
    }
  }
  seedOverride = null

  console.log(`  ${pad('', 26)}${pad('FIGHT', 14)}TAME`)
  console.log(`  ${rule(60)}`)
  const cmp: readonly [string, (a: typeof agg.fight) => string][] = [
    ['escape rate', (a) => `${((a.wins / a.runs) * 100).toFixed(0)}%  (${a.wins}/${a.runs})`],
    ['mean turns used', (a) => (a.turns / a.runs).toFixed(1)],
    ['mean encounters met', (a) => (a.encounters / a.runs).toFixed(1)],
    ['mean scent per turn', (a) => (a.scent / a.runs).toFixed(2)],
    ['mean loudest act', (a) => (a.peak / a.runs).toFixed(2)],
    ['mean damage taken', (a) => (a.damage / a.runs).toFixed(2)],
    ['mean closest wumpus', (a) => (a.closest / a.runs).toFixed(1)],
    ['runs the stench fired in', (a) => `${((a.adjacent / a.runs) * 100).toFixed(0)}%  (${a.adjacent}/${a.runs})`],
    ['mean companions gained', (a) => (a.companions / a.runs).toFixed(2)],
    ['runs with a BRAVE one', (a) => `${a.brave}/${a.runs}`],
    // The number finding #1 existed to move. It was 0 across 150 runs.
    ['SEND fired', (a) => `${a.sends} in ${a.runs} runs`],
  ]
  for (const [label, get] of cmp) {
    console.log(`  ${pad(label, 26)}${pad(get(agg.fight), 16)}${get(agg.tame)}`)
  }

  if (braveSeeds.length > 0) {
    console.log(`\n  seeds that produced a BRAVE companion: ${braveSeeds.join(', ')}`)
  }
  console.log(
    sendSeeds.length > 0
      ? `  seeds where SEND actually fired:       ${sendSeeds.join(', ')}  <- run these verbose`
      : `  SEND never fired in this sweep.`,
  )

  console.log(`\n  outcome distribution:`)
  for (const key of Object.keys(outcomes).sort()) {
    console.log(`    ${pad(key, 34)}${outcomes[key]}`)
  }

  const sorted = [...startGaps].sort((a, b) => a - b)
  const mean = startGaps.reduce((s, v) => s + v, 0) / startGaps.length
  const [lo, hi] = DIFFICULTY[difficulty].wumpusStartDistance
  const reach = wumpusReach(difficulty)
  const outside = startGaps.filter((g) => g < lo || g > hi).length
  console.log(
    `\n  wumpus START distance from the entrance: mean ${mean.toFixed(1)}, ` +
    `min ${sorted[0]}, max ${sorted[sorted.length - 1]} — band [${lo},${hi}], ${outside}/${count} outside it`,
  )
  console.log(
    `  a tier-${tier} wumpus covers ${reach} rooms in ${DIFFICULTY[difficulty].maxTurns} turns, ` +
    `so every start in the band can actually arrive.`,
  )
}

console.log(`\n${'='.repeat(74)}`)
console.log(`  PROJECT SILENT ECHO — creature system visualiser`)
console.log(`  seed ${seed}  ${difficulty}  tier ${tier}  policy ${policyArg}`)
console.log(`${'='.repeat(74)}`)

if (process.env.SWEEP) {
  panelAsymmetry()
  panelBrave()
  sweep(Number(process.env.SWEEP))
  process.exit(0)
}

panelAsymmetry()
panelBrave()

const policies: EncounterAction[] = policyArg === 'both' ? ['fight', 'tame'] : [policyArg]
const summaries = policies.map((p) => playRun(p, true))

panelSend()

console.log(`\n${rule()}\nPANEL E  — the comparison\n${rule()}`)
console.log(`  ${pad('', 22)}${summaries.map((s) => pad(s.policy.toUpperCase(), 18)).join('')}`)
console.log(`  ${rule(70)}`)
const rows: readonly [string, (s: RunSummary) => string][] = [
  ['outcome', (s) => s.outcome],
  ['turns used', (s) => String(s.turnsUsed)],
  ['encounters', (s) => String(s.encounters)],
  ['total scent laid', (s) => s.totalScent.toFixed(1)],
  // Total is confounded by run length — a run that died early laid less scent
  // because it was shorter, not because it was quieter. Per-turn is the honest one.
  ['scent PER TURN', (s) => (s.totalScent / Math.max(1, s.turnsUsed)).toFixed(2)],
  ['loudest single act', (s) => s.peakScent.toFixed(2)],
  ['closest wumpus got', (s) => String(s.closestWumpus)],
  ['damage taken', (s) => String(s.damageTaken)],
  ['companions gained', (s) => String(s.companionsGained)],
  ['companions released', (s) => String(s.companionsReleased)],
  ['brave ever obtained', (s) => (s.braveEverSeen ? 'yes' : 'NO')],
  ['SEND fired', (s) => String(s.sends)],
  ['creature drift moves', (s) => String(s.creatureMoves)],
]
for (const [label, get] of rows) {
  console.log(`  ${pad(label, 22)}${summaries.map((s) => pad(get(s), 18)).join('')}`)
}

console.log(`\n  shading  · none  ░ faint  ▒ warm  ▓ strong  █ fresh`)
console.log(`  features  p pit  b bloom  n snare  ¤ portal  g goblin  m lumewing  d grellhound  q quietOne`)
console.log(`  companion  * brave  ~ skittish\n`)
