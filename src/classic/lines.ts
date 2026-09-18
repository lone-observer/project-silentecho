/**
 * The event stream, projected to lines a human can read.
 *
 * WHY THIS IS ITS OWN MODULE AND NOT A LOOP INSIDE THE LOG COMPONENT.
 * `AgentView.log` is declared `readonly string[]` in `types.ts`, and 1f's
 * `NarrationBeat` work means the text renderer's log and that log want the
 * identical projection: the engine already resolved every sentence, so both
 * consumers are choosing which events SPEAK and in what order, not writing
 * anything. Two copies of that choice would drift, and the one that drifted
 * would be the agent's — the one nobody reads.
 *
 * It writes no prose. Every sentence here came out of `data/outcomes.ts` on the
 * event; what this module adds is punctuation, a direction word and an
 * archetype name, all from data tables.
 *
 * THE ONE THING IT DELIBERATELY REFUSES TO SAY is at `wumpusMoved` — read that
 * case before adding anything to this file.
 */

import type { Direction, GameEvent, Labyrinth, NarrationBeat, RollResult } from '../engine/types.ts'
import { ARCHETYPE_WORD, DIRECTION_WORD } from '../engine/data/outcomes.ts'
import { BAND_LABEL, signed } from './labels.ts'

export type LineTone =
  | 'narration' //  something happened, in the engine's own words
  | 'roll' //       the dice, broken out
  | 'move' //       where you went
  | 'tell' //       what leaks through a doorway
  | 'effect' //     health and oil changing
  | 'epitaph' //    a grave from one of your own earlier runs

export interface LogLine {
  readonly text: string
  readonly tone: LineTone
  /** Present on lines the engine narrated. Renderers key off this, never off `text`. */
  readonly beat?: NarrationBeat
}

/**
 * One roll, with every modifier kept separate.
 *
 * CLAUDE.md 4: "the UI shows the player exactly why they rolled what they
 * rolled". Summing the modifiers into one number here would be the renderer
 * throwing away the labels the engine is required to attach.
 */
export function formatRoll(result: RollResult): string {
  const parts = [`d20 ${result.natural}`]
  for (const m of result.modifiers) parts.push(`${m.source} ${signed(m.value)}`)
  const head = parts.join('  ·  ')
  const band = BAND_LABEL[result.band]
  const tail = `= ${result.total} vs DC ${result.dc}  →  ${band} (${signed(result.margin)})`
  const flags: string[] = []
  if (result.overridden) flags.push('natural die overrode the margin')
  if (result.fortuneUsed) flags.push(`Fortune: ${result.fortuneUsed}`)
  return flags.length > 0 ? `${head}  ${tail}  [${flags.join('; ')}]` : `${head}  ${tail}`
}

/**
 * Every event, in order, as lines — or deliberately as nothing.
 *
 * The switch is exhaustive over `GameEvent` and ends in a `never` check, so
 * adding an event kind is a compile error here rather than a fact that silently
 * stops reaching the player. That direction of text-parity failure (CLAUDE.md
 * 2.3) is the one 1f found three of.
 */
export function eventsToLines(events: readonly GameEvent[], labyrinth: Labyrinth): LogLine[] {
  const out: LogLine[] = []

  for (const event of events) {
    switch (event.kind) {
      case 'narration':
        out.push({ text: event.text, tone: 'narration', beat: event.beat })
        break

      case 'roll': {
        // A hazard save is a different roll from the action that triggered it
        // (1e). Saying which is the whole reason `roll.hazard` exists.
        const prefix = event.hazard === undefined ? event.action : `${event.action} → ${event.hazard}`
        out.push({ text: `${prefix}:  ${formatRoll(event.result)}`, tone: 'roll' })
        break
      }

      case 'moved': {
        const room = labyrinth.rooms[event.to]
        const where = room === undefined ? '' : `  ·  ${ARCHETYPE_WORD[room.archetype]}`
        out.push({ text: `→ ${DIRECTION_WORD[event.direction]}${where}`, tone: 'move' })
        break
      }

      case 'tell':
        // Carried so the projection stays total over the union, and so
        // `AgentView.log` can include the end-of-turn senses if 1j wants them.
        // The classic screen shows tells on the doorways instead, where GDD
        // 2.17 puts them — see `<Doorways>` — and filters this tone out of the
        // scrollback rather than printing four lines a turn.
        out.push({ text: event.text, tone: 'tell' })
        break

      case 'damage':
        out.push({ text: `−${event.amount} health  ·  ${event.cause}`, tone: 'effect' })
        break

      case 'oilChanged':
        out.push({ text: `${event.text}  (${signed(event.delta)} oil)`, tone: 'effect', beat: event.beat })
        break

      case 'companionLost':
        out.push({ text: event.text, tone: 'narration' })
        break

      case 'graveFound':
        out.push({ text: event.epitaph.text, tone: 'epitaph' })
        break

      // --- deliberately silent ------------------------------------------
      //
      // Each of these is either already spoken by a narration beat emitted in
      // the same step, or is a fact the player is not entitled to.
      case 'wumpusMoved':
        // NEVER RENDER THIS. It carries the Wumpus's true room id. The player
        // learns where the Wumpus is from the stench and from nothing else
        // (GDD 2.4, 2.17) — printing this would be the renderer seeing through
        // walls, which is the exact failure `docs/EVALS.md` makes 1j write a
        // test against. The event exists for replays and telemetry.
        //
        // 1j: `AgentView.log` cannot be `events.map(e => e.text)`. It has to go
        // through a projection that drops this, and this is that projection.
        break
      case 'wumpusTierChanged':
        // Spoken by the `wumpusEscalates` beat in the same step. The tier
        // number itself is not something the player is told.
        break
      case 'creatureEncounter':
        // Spoken by `creatureFound` (1f finding 1). The menu is the encounter.
        break
      case 'companionGained':
        // Spoken by the TAME outcome line that produced it.
        break
      case 'statusChanged':
        // Spoken by `confusedSettles` / `confusedLifts`. GDD 2.8.2 is explicit
        // that Confused is suppression the player KNOWS about, so the beat
        // carries it and the status line shows the clock.
        break
      case 'heartTaken':
        // Spoken by the `heartTaken` beat — the loudest line in the game.
        break
      case 'runEnded':
        // The ending beat was emitted immediately before it. The event flips
        // the screen; it does not add a sentence.
        break

      default: {
        const never: never = event
        throw new Error(`classic/lines: unhandled event ${JSON.stringify(never)}`)
      }
    }
  }

  return out
}

/** What `AgentView.log` wants: the spoken lines, in order, as plain strings. */
export function toStrings(lines: readonly LogLine[]): string[] {
  return lines.filter((l) => l.tone !== 'tell').map((l) => l.text)
}

/** Directions in a stable reading order, for a doorway list. */
export const READING_ORDER: readonly Direction[] = ['N', 'E', 'S', 'W'] as const
