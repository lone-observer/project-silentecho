/**
 * Watch the Wumpus hunt.  npm run hunt -- <seed> <tier> [difficulty]
 *
 * Drives a scripted player along the shortest route to the Heart and back,
 * printing the scent field decaying and the Wumpus closing, turn by turn.
 *
 * Tests tell you the AI is CORRECT. This tells you whether it is FRIGHTENING —
 * whether the stench arrives with enough warning to act on, whether Tier 3
 * feels relentless or merely unfair, and whether the escape is the hard part.
 */

import { createRng } from '../src/engine/rng.ts'
import { generateLabyrinth, chooseWumpusStart, distancesFrom, roomIdAt } from '../src/engine/generate.ts'
import {
  createWumpus, decayScent, depositScent, emptyScent, escalate,
  getTells, hasCaught, moveWumpus, perceive, scentAt, wumpusIsNear,
} from '../src/engine/wumpus.ts'
import { DIRECTIONS } from '../src/engine/types.ts'
import type { Difficulty, Direction, Labyrinth, Room, RoomId, ScentField, WumpusTier } from '../src/engine/types.ts'
import { DIFFICULTY, HEART, OIL, SCENT, SCENT_BY_ACTION, WUMPUS_TIERS, oilBandFor } from '../src/engine/data/tuning.ts'

const seed = Number(process.argv[2] ?? 1)
const tier = Number(process.argv[3] ?? 2) as WumpusTier
const difficulty = (process.argv[4] ?? 'stirring') as Difficulty

const rng = createRng(seed)
const lab = generateLabyrinth(rng, { difficulty })
const contract = DIFFICULTY[difficulty]

function route(lab: Labyrinth, from: RoomId, to: RoomId): RoomId[] {
  const prev: Record<RoomId, RoomId | null> = { [from]: null }
  const q = [from]
  for (let h = 0; h < q.length; h++) {
    const id = q[h]!
    if (id === to) break
    for (const d of DIRECTIONS) {
      const n = lab.rooms[id]!.exits[d]
      if (n !== undefined && prev[n] === undefined) { prev[n] = id; q.push(n) }
    }
  }
  const out: RoomId[] = []
  for (let c: RoomId | null = to; c !== null; c = prev[c]!) out.unshift(c)
  return out
}

/**
 * Each cell is two characters: WHAT IS IN THE ROOM, then HOW IT SMELLS.
 *
 *   [p\u2592]  a pit, in a room carrying a warm trail
 *   [g ]  a goblin, no scent
 *   [P*]  the player, carrying the Heart
 *
 * Without the feature column the tells had nothing to check against — the map
 * reported "N skittering" over a grid of identical dots.
 */
const SHADE = (v: number): string =>
  v >= 3 ? '\u2588' : v >= 1.5 ? '\u2593' : v >= 0.5 ? '\u2592' : v > 0 ? '\u2591' : ' '

const FEATURE: Record<string, string> = {
  pit: 'p', sporeBloom: 'b', snareCarving: 'n', portal: '\u00a4',
  goblin: 'g', lumewing: 'm', grellhound: 'd', quietOne: 'q',
}

function featureOf(room: Room, carrying: boolean): string {
  if (room.hasHeart && !carrying) return 'H'
  if (room.isEntrance) return 'E'
  if (room.hazard) return FEATURE[room.hazard] ?? '?'
  if (room.creature) return FEATURE[room.creature] ?? '?'
  if (room.oilFlask) return 'o'
  if (room.grave) return '+'
  return '\u00b7'
}

function render(playerId: RoomId, wumpusId: RoomId, scent: ScentField, carrying: boolean): string {
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

      row += `[${mark}]` + (room.exits.E !== undefined ? '\u2500\u2500\u2500' : '   ')
      // Cell pitch is 7: '[xy]' (4) + connector (3). The mark's first character
      // sits at index 1, so the bar goes at index 1 too.
      below += (room.exits.S !== undefined ? ' \u2502     ' : '       ')
    }
    lines.push(row.trimEnd())
    if (y < lab.height - 1) lines.push(below.trimEnd())
  }
  return lines.join('\n')
}

// --- the run ------------------------------------------------------------
const inbound = route(lab, lab.entranceId, lab.heartRoomId)
const plan = [...inbound, ...route(lab, lab.heartRoomId, lab.entranceId).slice(1)]

let wumpus = createWumpus(chooseWumpusStart(lab, rng), tier)
let scent = emptyScent()
let oil: number = OIL.starting
let carrying = false
let facing: Direction | null = null
let step = 1
let outcome = 'ran out of plan'

console.log(`\nseed ${seed}  difficulty ${difficulty}  wumpus tier ${tier} (${WUMPUS_TIERS[tier].name})`)
console.log(`entrance ${lab.entranceId}  heart ${lab.heartRoomId}  wumpus starts ${wumpus.roomId}`)
console.log(`plan: ${inbound.length - 1} moves in, ${plan.length - inbound.length} out, of ${contract.maxTurns} turns\n`)

for (let turn = 1; turn <= contract.maxTurns && step < plan.length; turn++) {
  const from = plan[step - 1]!
  const to = plan[step]!
  const dir = DIRECTIONS.find((d) => lab.rooms[from]!.exits[d] === to) ?? null

  // 1. player acts
  facing = dir
  const player = to
  step++

  // 2. CATCH CHECK — you walked into it. Must come before the Wumpus moves,
  //    or a Wumpus that steps aside the same turn is walked straight through.
  //    This also closes the swap case: two bodies trading places down a
  //    corridor would slip past a check made only after the Wumpus moves.
  if (hasCaught(wumpus, player)) {
    console.log(render(player, wumpus.roomId, scent, carrying))
    console.log(`turn ${turn}  player walked into the Wumpus at ${player}`)
    outcome = `CAUGHT on turn ${turn} — walked into it`
    break
  }

  // 3. outcome — reaching the plinth is the escalation trigger
  let revealed: RoomId | null = null
  if (player === lab.heartRoomId && !carrying) {
    carrying = true
    wumpus = escalate(wumpus)
    revealed = player
  }

  // 4. scent
  const weight = SCENT_BY_ACTION.move * (carrying ? HEART.carryScentMultiplier : 1)
  scent = depositScent(scent, player, weight)

  // 5. wumpus
  const before = wumpus.roomId
  const result = moveWumpus(lab, wumpus, scent, {
    carryingHeart: carrying, entranceId: lab.entranceId, revealedPlayerRoom: revealed,
  }, rng)
  wumpus = result.wumpus

  // 6. report
  const band = oilBandFor(oil)
  const tells = getTells(lab, player, wumpus.roomId, {
    tellRange: band.tellRange, confused: false, facing, heartTaken: carrying,
  })
  const sensed = perceive(lab, wumpus, scent)
  const gap = distancesFrom(lab, player)[wumpus.roomId] ?? -1

  console.log(render(player, wumpus.roomId, scent, carrying))
  console.log(
    `turn ${String(turn).padStart(2)}  oil ${String(oil).padStart(2)} (${band.name})  ` +
    `player ${player}${carrying ? ' [HEART]' : ''}  wumpus ${wumpus.roomId}` +
    `${result.moved ? ` <- ${before}` : ' (resting)'}  [${result.reason}]  gap ${gap}` +
    `${wumpusIsNear(lab, player, wumpus.roomId) ? '   *** SILENCE ***' : ''}`,
  )
  console.log(
    `        smells ${sensed.target ? `${sensed.target} @ ${sensed.strength.toFixed(2)} (${sensed.distance} away)` : 'nothing'}` +
    `   tells: ${tells.length ? tells.map((t) => `${t.direction} ${t.kind}`).join(', ') : 'none'}`,
  )
  console.log('')

  // CATCH CHECK — it came for you.
  if (hasCaught(wumpus, player)) { outcome = `CAUGHT on turn ${turn} — it came for you`; break }
  if (player === lab.entranceId && carrying) { outcome = `ESCAPED on turn ${turn}`; break }

  // 7. upkeep
  scent = decayScent(scent)
  if (turn % OIL.burnEveryNTurns === 0) oil = Math.max(0, oil - 1)
}

console.log(`${'='.repeat(62)}\n${outcome}\n`)
console.log(`scent decay ${SCENT.decayFactor}/turn, dropped below ${SCENT.epsilon}`)
console.log(`shading  · none  ░ faint  ▒ warm  ▓ strong  █ fresh\n`)
