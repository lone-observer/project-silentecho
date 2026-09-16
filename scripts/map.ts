/**
 * ASCII labyrinth viewer.  npm run map -- <seed> [count]
 *
 * Generation quality is a thing you judge by LOOKING, not by reading assertions.
 * Print a dozen and ask: does the entrance-to-Heart path offer real choices, or
 * is it a corridor? Are hazards clumping? Does it read as a labyrinth?
 */

import { createRng } from '../src/engine/rng.ts'
import { chooseWumpusStart, distancesFrom, generateLabyrinth, roomIdAt, routeReport } from '../src/engine/generate.ts'
import type { Difficulty, Labyrinth, Room, RoomId } from '../src/engine/types.ts'
import { DIRECTIONS } from '../src/engine/types.ts'
import { DIFFICULTY } from '../src/engine/data/tuning.ts'

const MARK: Record<string, string> = {
  entrance: 'E',
  heart: 'H',
  pit: 'p',
  sporeBloom: 'b',
  snareCarving: 'n',
  portal: '¤',
  goblin: 'g',
  lumewing: 'm',
  grellhound: 'd',
  quietOne: 'q',
  oil: 'o',
  grave: '+',
  wumpus: 'W',
  empty: '·',
}

function markFor(room: Room, wumpusStart: RoomId): string {
  if (room.isEntrance) return MARK.entrance!
  if (room.hasHeart) return MARK.heart!
  if (room.id === wumpusStart) return MARK.wumpus!
  if (room.hazard) return MARK[room.hazard]!
  if (room.creature) return MARK[room.creature]!
  if (room.oilFlask) return MARK.oil!
  if (room.grave) return MARK.grave!
  return MARK.empty!
}

function render(lab: Labyrinth, wumpusStart: RoomId): string {
  const lines: string[] = []
  for (let y = 0; y < lab.height; y++) {
    let row = ''
    let below = ''
    for (let x = 0; x < lab.width; x++) {
      const room = lab.rooms[roomIdAt(x, y)] as Room
      row += `[${markFor(room, wumpusStart)}]`
      row += room.exits.E !== undefined ? '───' : '   '
      below += room.exits.S !== undefined ? ' │ ' : '   '
      below += '   '
    }
    lines.push(row.trimEnd())
    if (y < lab.height - 1) lines.push(below.trimEnd())
  }
  return lines.join('\n')
}

function stats(lab: Labyrinth, wumpusStart: RoomId): string {
  const contract = DIFFICULTY[lab.difficulty]
  const route = routeReport(lab)
  const rooms = Object.values(lab.rooms)
  const degrees = rooms.map((r) => DIRECTIONS.filter((d) => r.exits[d] !== undefined).length)
  const doors = degrees.reduce((a, b) => a + b, 0) / 2
  const dist = distancesFrom(lab, lab.entranceId)
  const heartDist = dist[lab.heartRoomId] ?? -1
  const unreachable = rooms.filter((r) => dist[r.id] === undefined).length

  const hist = [0, 1, 2, 3, 4].map((d) => `${d}:${degrees.filter((x) => x === d).length}`).join('  ')
  const avg = (degrees.reduce((a, b) => a + b, 0) / rooms.length).toFixed(2)
  const deadEnds = degrees.filter((d) => d === 1).length

  const tick = (pass: boolean) => (pass ? 'ok' : 'MISS')
  const routesOk = route.safeRoutes === contract.safeRoutes
  const detourOk = contract.safeRoutes === 0 || route.safeDetour >= contract.minSafeDetour

  return [
    `difficulty ${lab.difficulty}   wumpus tier ${contract.wumpusTier}   turns ${contract.maxTurns}`,
    `rooms ${rooms.length}   doors ${doors}   avg degree ${avg}   dead ends ${deadEnds}`,
    `degree histogram  ${hist}`,
    `heart distance ${heartDist}   round trip ${heartDist * 2}/${contract.maxTurns}   wumpus start ${dist[wumpusStart] ?? -1}   unreachable ${unreachable}`,
    `eccentricity ${Math.max(...Object.values(dist))}   rooms reachable within half the turn budget: ${Object.values(dist).filter((d) => d <= Math.floor(contract.maxTurns / 2)).length}/${rooms.length}`,
    `CONTRACT  pit-free ${tick(route.pitFree)}   safe routes ${route.safeRoutes}/${contract.safeRoutes} ${tick(routesOk)}   safe detour +${route.safeDetour}/+${contract.minSafeDetour} ${tick(detourOk)}`,
  ].join('\n')
}

const LEGEND =
  'E entrance  H heart  W wumpus start  p pit  b bloom  n snare  ¤ portal\n' +
  'g goblin  m lumewing  d grellhound  q quiet one  o oil  + grave  · empty'

const seed = Number(process.argv[2] ?? 1)
const count = Number(process.argv[3] ?? 1)
const difficulty = (process.argv[4] ?? 'stirring') as Difficulty

for (let i = 0; i < count; i++) {
  const s = seed + i
  const rng = createRng(s)
  const lab = generateLabyrinth(rng, { difficulty })
  const wumpusStart = chooseWumpusStart(lab, rng)
  console.log(`\n${'─'.repeat(62)}\nseed ${s}\n`)
  console.log(render(lab, wumpusStart))
  console.log('')
  console.log(stats(lab, wumpusStart))
}
console.log(`\n${'─'.repeat(62)}\n${LEGEND}\n`)
