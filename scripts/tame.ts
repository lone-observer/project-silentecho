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
  COMPANION, DIFFICULTY, DRIFT, ENCOUNTER, FIGHT_OUTCOMES, HEART, OIL,
  PLAYER, SCENT, SCENT_BY_ACTION, TAME_DC, TAME_OUTCOMES, WUMPUS_TIERS,
  oilBandFor, wumpusReach,
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
    const fText = `${num(fScent)} scent  ${f.damage ? `-${f.damage}hp ` : '     '} ${f.driven ? 'driven off' : 'still there'}`
    const tText =
      `${num(tScent)} scent  ${t.damage ? `-${t.damage}hp ` : '     '} ` +
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

function panelBrave(): void {
  console.log(`\n${rule()}\nPANEL B  — can you ever get a brave companion? (SEND is gated on it)\n${rule()}`)
  console.log(`  P(critical success) on TAME, by INT. mod = floor((INT-10)/2)\n`)
  console.log(`  ${pad('creature', 13)}${pad('DC', 4)}${[8, 10, 12, 14, 16, 18].map((s) => pad(`INT ${s}`, 9)).join('')}`)
  console.log(`  ${rule(70)}`)

  for (const creature of BESTIARY) {
    const dc = TAME_DC[creature]
    const cells = [8, 10, 12, 14, 16, 18].map((stat) => {
      const p = bandDistribution(dc, statModifier(stat)).criticalSuccess
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
  console.log(`\n  a dash means UNREACHABLE: max total (20 + mod) cannot clear DC + 12.`)
  console.log(`  Fortune bumps one band, so strongSuccess -> criticalSuccess is the other route.`)
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
  let health: number = PLAYER.maxHealth
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

      if (result.damage > 0) {
        health -= result.damage
        damageTaken += result.damage
        // Skittish companions bolt on DAMAGE, not on a failed roll.
        if (skittishBolts(companion, result.damage, false) && companion !== null) {
          detail.push(`      the ${companion.kind} bolts (skittish, took damage; ${fortune} fortune unspent)`)
          companion = null
        }
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
    const tells = getTells(lab, playerId, wumpus.roomId, {
      tellRange: band.tellRange, confused: false, facing, heartTaken: carrying,
    })

    if (verbose) {
      console.log(render(lab, playerId, wumpus.roomId, scent, carrying))
      console.log(
        `turn ${String(turn).padStart(2)}  oil ${String(oil).padStart(2)}(${band.name})  hp ${health}  ` +
        `player ${playerId}${carrying ? ' [HEART]' : ''}  wumpus ${wumpus.roomId} [${moveReason}]  gap ${gap}  ` +
        `companion ${companion ? companion.kind + (companion.brave ? '*' : companion.skittish ? '~' : '') : '—'}` +
        `${wumpusIsNear(lab, playerId, wumpus.roomId) ? '   *** SILENCE ***' : ''}`,
      )
      console.log(`        heading ${heading}  tells: ${tells.length ? tells.map((t) => `${t.direction} ${t.kind}`).join(', ') : 'none'}`)
      for (const d of detail) console.log(d)
      console.log('')
    }

    if (health <= 0) { outcome = `KILLED turn ${turn} — out of health`; break }
    if (playerId === lab.entranceId && carrying) { outcome = `ESCAPED turn ${turn}`; break }

    // ---- upkeep ----------------------------------------------------------
    scent = decayScent(scent)
    if (turn % OIL.burnEveryNTurns === 0) oil = Math.max(0, oil - 1)
    void fortune
  }

  return {
    policy, outcome, turnsUsed, encounters, totalScent, peakScent,
    closestWumpus: closestWumpus === Infinity ? -1 : closestWumpus,
    companionsGained, companionsReleased, damageTaken,
    creatureMoves, braveEverSeen,
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
    health: 3, maxHealth: 3, oil: 12, maxOil: 12, fortune: 2,
    carryingHeart: false, companion, inventory: [], statuses: [],
  } as Player

  const dir = DIRECTIONS.find((d) => (lab.rooms[playerId] as Room).exits[d] !== undefined)
  if (!dir) { console.log('  no exit to send into; pick another seed'); return }

  const sent = sendCompanion(lab, player, dir)
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

  console.log(
    `\n  COMPANION.sendScent=${COMPANION.sendScent}, decay ${SCENT.decayFactor}/turn, ` +
    `sendDecoyTurns claims ${COMPANION.sendDecoyTurns}.`,
  )
  let n = 0
  for (let k = 0; ; k++) {
    if (COMPANION.sendScent * SCENT.decayFactor ** k <= SCENT_BY_ACTION.move) break
    n = k + 1
    if (k > 20) break
  }
  console.log(`  arithmetic: the decoy out-smells a walking player for ${n} turn(s); ${n * 2} at half rate.`)
  const carried = SCENT_BY_ACTION.move * HEART.carryScentMultiplier
  let m = 0
  for (let k = 0; ; k++) {
    if (COMPANION.sendScent * SCENT.decayFactor ** k <= carried) break
    m = k + 1
    if (k > 20) break
  }
  console.log(`  while CARRYING THE HEART (deposit ${carried}) it lasts ${m} turn(s) — the moment you most need it.`)
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
    adjacent: number
  }> = {
    fight: { wins: 0, runs: 0, turns: 0, scent: 0, peak: 0, damage: 0, closest: 0, companions: 0, brave: 0, encounters: 0, adjacent: 0 },
    tame:  { wins: 0, runs: 0, turns: 0, scent: 0, peak: 0, damage: 0, closest: 0, companions: 0, brave: 0, encounters: 0, adjacent: 0 },
    sneak: { wins: 0, runs: 0, turns: 0, scent: 0, peak: 0, damage: 0, closest: 0, companions: 0, brave: 0, encounters: 0, adjacent: 0 },
    flee:  { wins: 0, runs: 0, turns: 0, scent: 0, peak: 0, damage: 0, closest: 0, companions: 0, brave: 0, encounters: 0, adjacent: 0 },
  }
  const startGaps: number[] = []
  const outcomes: Record<string, number> = {}

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
      if (s.braveEverSeen) a.brave += 1
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
  ]
  for (const [label, get] of cmp) {
    console.log(`  ${pad(label, 26)}${pad(get(agg.fight), 14)}${get(agg.tame)}`)
  }

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
  ['creature drift moves', (s) => String(s.creatureMoves)],
]
for (const [label, get] of rows) {
  console.log(`  ${pad(label, 22)}${summaries.map((s) => pad(get(s), 18)).join('')}`)
}

console.log(`\n  shading  · none  ░ faint  ▒ warm  ▓ strong  █ fresh`)
console.log(`  features  p pit  b bloom  n snare  ¤ portal  g goblin  m lumewing  d grellhound  q quietOne`)
console.log(`  companion  * brave  ~ skittish\n`)
