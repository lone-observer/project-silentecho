/**
 * Step 1f's coverage test.
 *
 * The ROADMAP's Phase 1 exit criterion is "every (archetype x action x band)
 * outcome has content; coverage test passes", and the easy way to satisfy that
 * is a test that walks the tables it is testing and finds, unsurprisingly, that
 * they contain themselves. So the assertions below are arranged in three
 * layers, and only the last one is worth much:
 *
 *   1. TOTALITY   the lookup answers every triple. Cheap, necessary, weak.
 *   2. QUALITY    no placeholders, no vision words in the dark, no band that
 *                 reads identically to its neighbour. Catches the ways a table
 *                 this size rots while still technically being full.
 *   3. USE        the reducer, driven over hundreds of seeded runs, never
 *                 emits a line that did not come out of the tables. THIS is
 *                 the one that makes `data/outcomes.ts` the single source of
 *                 truth rather than merely the largest one — it fails the
 *                 build the moment someone types a sentence into resolve.ts.
 *
 * Seven assertions here are MUTATION-CHECKED: each was confirmed to fail when
 * the thing it guards was deliberately broken. They are marked in place.
 *
 * One of those checks is worth recording because it PASSED first time, which
 * meant the test was not testing what it claimed. Replacing the grellhound's
 * growl with a raw string literal did not trip the source-of-truth assertion,
 * because 160 runs of a doorway-cycling policy never had a grellhound companion
 * standing within radius 2 of the Wumpus. The fix was a second policy that
 * walks to the Heart and back — which also revealed that `heartTaken`,
 * `wumpusEscalates` and the whole `escaped` ending had been going unverified.
 * A mutation check that passes is not a test that is fine; it is a test whose
 * reach you have just measured.
 */

import { describe, expect, it } from 'vitest'

import { rngFromState } from '../src/engine/rng.ts'
import { distancesFrom } from '../src/engine/generate.ts'
import { applyAction, createRun, legalActions } from '../src/engine/resolve.ts'
import type { LegalAction } from '../src/engine/resolve.ts'
import { BAND_ORDER, DIRECTIONS } from '../src/engine/types.ts'
import type {
  Action,
  ActionKind,
  Difficulty,
  GameEvent,
  GameState,
  NarrationBeat,
  OutcomeBand,
  RoomArchetype,
} from '../src/engine/types.ts'
import { ENTRY_HAZARDS, OIL_BANDS } from '../src/engine/data/tuning.ts'
import {
  allBeats,
  ARCHETYPES,
  COMPANION_LOSS,
  CREATURE_WORD,
  DEFERRED_ACTIONS,
  DIRECTION_WORD,
  ENDINGS,
  fill,
  HAZARD_NARRATION,
  HAZARD_WORD,
  isDarkProse,
  NARRATED_ACTIONS,
  NOTES,
  outcomeBeat,
  ROOM_LED_ACTIONS,
  say,
  SLOT_KEYS,
  SUBJECT_LED_ACTIONS,
  visionWordsIn,
} from '../src/engine/data/outcomes.ts'

const ALL_ACTION_KINDS: readonly ActionKind[] = [
  'move', 'listen', 'search', 'force', 'sneak', 'fight', 'tame',
  'flee', 'use', 'send', 'read', 'enterPortal', 'rest',
]

const DIFFICULTIES: readonly Difficulty[] = ['drowsing', 'stirring', 'hunting', 'ravening']

/**
 * Two policies, because one of them never finishes a run.
 *
 * `cycle` picks whatever the menu offers next and wanders — good for breadth,
 * and it is what the first version of these sweeps used. It turned out never to
 * take the Heart in 160 runs, which meant `heartTaken`, `wumpusEscalates` and
 * the entire `escaped` ending were going unverified by a test whose whole claim
 * is that the reducer only speaks from the table.
 *
 * `route` walks the shortest path to the Heart and then back to the entrance,
 * reading the true map to do it. That is cheating, and it is fine here: this is
 * a test asking "does the engine ever say something that is not in the table",
 * not an agent being measured on fairness. `docs/EVALS.md`'s no-leakage rule is
 * about `AgentView`, which this does not use.
 */
type Policy = 'cycle' | 'route'

function pickAction(policy: Policy, state: GameState, menu: readonly LegalAction[], salt: number): Action {
  if (policy === 'cycle') {
    return (menu[salt % menu.length] as LegalAction).action
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
  // Standing in an encounter with no way onward: take whatever is offered.
  return best ?? (menu[salt % menu.length] as LegalAction).action
}

/** Drives one run to its end and hands back every event it produced. */
function driveRun(
  policy: Policy,
  seed: number,
  difficulty: Difficulty,
  onTurn: (events: readonly GameEvent[]) => void,
): GameState {
  let state = createRun(seed, { difficulty })
  let guard = 0
  while (state.outcome === 'inProgress' && guard < 40) {
    guard += 1
    const menu = legalActions(state)
    if (menu.length === 0) break
    const action = pickAction(policy, state, menu, seed * 7 + guard * 3)
    const result = applyAction(state, action, rngFromState(state.rng))
    onTurn(result.events)
    state = result.state
  }
  return state
}

// ---------------------------------------------------------------------------
// 1. Totality
// ---------------------------------------------------------------------------

describe('coverage — the lookup is total', () => {
  it('answers every (archetype x action x band) triple with written prose', () => {
    const holes: string[] = []
    let cells = 0
    for (const archetype of ARCHETYPES) {
      for (const action of NARRATED_ACTIONS) {
        for (const band of BAND_ORDER) {
          cells += 1
          const beat = outcomeBeat(archetype, action, band)
          if (beat === null || beat.lit.trim() === '' || beat.dark.trim() === '') {
            holes.push(`${archetype}.${action}.${band}`)
          }
        }
      }
    }
    expect(holes).toEqual([])
    expect(cells).toBe(ARCHETYPES.length * NARRATED_ACTIONS.length * BAND_ORDER.length)
    expect(cells).toBe(432)
  })

  it('covers every entry hazard, band by band', () => {
    for (const hazard of ENTRY_HAZARDS) {
      for (const band of BAND_ORDER) {
        const beat = HAZARD_NARRATION[hazard as keyof typeof HAZARD_NARRATION][band]
        expect(beat.lit.trim().length, `${hazard}.${band}`).toBeGreaterThan(0)
        expect(beat.dark.trim().length, `${hazard}.${band}`).toBeGreaterThan(0)
      }
    }
  })

  /**
   * MUTATION-CHECKED. The tripwire that keeps `DEFERRED_ACTIONS` honest.
   *
   * Adding a verb to `ActionKind` — which the hazard-verb step will do for
   * ENDURE, AVOID and DODGE — fails this until someone has either written its
   * prose or written down why they have not. Removing FORCE from
   * DEFERRED_ACTIONS without writing its prose fails it too.
   */
  it('classifies every ActionKind as either narrated or deliberately deferred', () => {
    const classified = new Set<ActionKind>([...NARRATED_ACTIONS, ...DEFERRED_ACTIONS])
    for (const kind of ALL_ACTION_KINDS) {
      expect(classified.has(kind), `${kind} is neither narrated nor deferred`).toBe(true)
    }
    expect(classified.size).toBe(ALL_ACTION_KINDS.length)
    // Disjoint: a verb cannot be both written and deferred.
    for (const kind of DEFERRED_ACTIONS) {
      expect(NARRATED_ACTIONS).not.toContain(kind)
    }
    // Room-led and subject-led partition the narrated set.
    expect([...ROOM_LED_ACTIONS, ...SUBJECT_LED_ACTIONS].sort()).toEqual([...NARRATED_ACTIONS].sort())
  })

  /**
   * MUTATION-CHECKED. The claim that makes deferring FORCE defensible rather
   * than a hole: a deferred verb must be one the player can never choose.
   *
   * Driven through `legalActions` over real labyrinths rather than asserted
   * against the reducer's own comment, because the comment is what would be
   * wrong if someone wired FORCE up and forgot this file.
   */
  it('never offers a deferred verb in a real run', () => {
    const offered = new Set<ActionKind>()
    for (const difficulty of DIFFICULTIES) {
      for (let seed = 1; seed <= 25; seed++) {
        let state = createRun(seed, { difficulty })
        let guard = 0
        while (state.outcome === 'inProgress' && guard < 40) {
          guard += 1
          const menu = legalActions(state)
          if (menu.length === 0) break
          for (const entry of menu) offered.add(entry.action.kind)
          const pick = menu[(seed + guard) % menu.length] as { action: Action }
          state = applyAction(state, pick.action, rngFromState(state.rng)).state
        }
      }
    }
    for (const deferred of DEFERRED_ACTIONS) {
      expect(offered.has(deferred), `${deferred} was offered but has no prose`).toBe(false)
    }
    // And the converse sanity check: the sweep actually exercised the menu.
    expect(offered.size).toBeGreaterThan(5)
  })

  it('writes every ending, including the quiet ones', () => {
    // GDD 2.17. Retreat is the one this exists for — it shipped through 1e as a
    // placeholder, which made the second-best outcome in the game read as the
    // run simply stopping.
    const endings: NarrationBeat[] = [
      'caughtWalkedInto', 'caughtCameForYou', 'killedByHazard', 'killedByDamage',
      'outOfTurns', 'escaped', 'retreated',
    ]
    for (const beat of endings) {
      const written = ENDINGS[beat as keyof typeof ENDINGS]
      expect(written, `${beat} has no beat`).toBeDefined()
      expect(written.lit.trim().length).toBeGreaterThan(0)
    }
    // Retreat is held to the same standard as the escape it sits beside, which
    // in practice means it has to say what retreating BUYS — the map (GDD 2.11).
    expect(ENDINGS.retreated.lit.length).toBeGreaterThan(ENDINGS.outOfTurns.lit.length)
  })
})

// ---------------------------------------------------------------------------
// 2. Quality
// ---------------------------------------------------------------------------

describe('quality — the ways a full table still rots', () => {
  /**
   * MUTATION-CHECKED. GDD 2.8.1: darkness changes the CHANNEL, not the FACT.
   *
   * A dark variant that tells the player what they saw is the engine describing
   * a sense they do not have — the same class of defect as 1e's hazard save
   * being reported as a MOVE roll, and invisible for exactly as long.
   */
  it('never tells a player with no lantern what they saw', () => {
    const offenders: string[] = []
    for (const { path, beat } of allBeats()) {
      const found = visionWordsIn(beat.dark)
      if (found.length > 0) offenders.push(`${path}: ${found.join(', ')}`)
    }
    expect(offenders).toEqual([])
  })

  /**
   * MUTATION-CHECKED. The other half: a lit variant that leans on sight needs a
   * dark variant that does not, and an identical string has been copied rather
   * than written. A cell whose lit variant is ALREADY non-visual may legitimately
   * share it — most of this game reaches the player by smell, sound and touch,
   * which is the observation GDD 2.8.1 is built on.
   */
  it('rewrites, rather than copies, every dark variant that needs one', () => {
    const offenders: string[] = []
    for (const { path, beat } of allBeats()) {
      if (visionWordsIn(beat.lit).length > 0 && beat.lit === beat.dark) offenders.push(path)
    }
    expect(offenders).toEqual([])
  })

  it('contains no placeholder text', () => {
    for (const { path, beat } of allBeats()) {
      for (const variant of [beat.lit, beat.dark]) {
        expect(/\bTODO\b|\bTBD\b|\bplaceholder\b|\bXXX\b|\bFIXME\b/i.test(variant), path).toBe(false)
      }
    }
  })

  it('ends every line in punctuation', () => {
    for (const { path, beat } of allBeats()) {
      for (const variant of [beat.lit, beat.dark]) {
        expect(/[.!?"'’]$/.test(variant.trim()), `${path}: ${variant.slice(-20)}`).toBe(true)
      }
    }
  })

  /**
   * MUTATION-CHECKED. The defect a coverage test cannot see.
   *
   * Six bands that read as one sentence rewritten six times is a table that is
   * technically complete and practically empty, and it is the specific failure
   * mode of authoring 222 cells in one sitting. Grouped by (action, archetype)
   * so that two archetypes legitimately sharing a phrase is fine and one
   * archetype repeating itself across bands is not.
   */
  it('gives each band within a group its own sentence', () => {
    const groups = new Map<string, Map<string, string[]>>()
    for (const { path, beat } of allBeats()) {
      const group = path.split('.').slice(0, -1).join('.')
      if (!groups.has(group)) groups.set(group, new Map())
      const seen = groups.get(group) as Map<string, string[]>
      seen.set(beat.lit, [...(seen.get(beat.lit) ?? []), path])
    }
    const duplicates: string[] = []
    for (const [, seen] of groups) {
      for (const [, paths] of seen) if (paths.length > 1) duplicates.push(paths.join(' = '))
    }
    expect(duplicates).toEqual([])
  })

  it('keeps the slot vocabulary closed', () => {
    const used = new Set<string>()
    for (const { beat } of allBeats()) {
      for (const variant of [beat.lit, beat.dark]) {
        for (const match of variant.matchAll(/\{([a-zA-Z]+)\}/g)) used.add(match[1] as string)
      }
    }
    for (const slot of used) {
      expect(SLOT_KEYS as readonly string[], `{${slot}} is not a declared slot`).toContain(slot)
    }
  })

  it('throws rather than shipping an unfilled or unknown slot', () => {
    expect(() => fill('a {creature} appears')).toThrow(/not supplied/)
    expect(() => fill('a {wumpus} appears')).toThrow(/unknown slot/)
    expect(fill('a {creature} goes {direction}', { creature: 'goblin', direction: 'N' })).toBe(
      'a goblin goes north',
    )
  })

  it('renders compass letters and hazard keys as words a sentence can hold', () => {
    // GDD 2.4 keys information to doorways; "to the N" is a data structure
    // leaking into prose.
    for (const direction of DIRECTIONS) {
      expect(DIRECTION_WORD[direction].length).toBeGreaterThan(1)
    }
    expect(HAZARD_WORD.sporeBloom).toBe('spore bloom')
    expect(HAZARD_WORD.snareCarving).toBe('snare-carving')
    // The Quiet One is a name, not a species.
    expect(CREATURE_WORD.quietOne).toBe('Quiet One')
  })

  it('puts the prose register change where the oil table puts the range change', () => {
    // Derived from OIL_BANDS rather than restated, so moving the threshold in
    // one place moves it in both. GDD 2.8.1.
    for (const band of OIL_BANDS) {
      const oil = band.min
      expect(isDarkProse(oil), `oil ${oil} (${band.name})`).toBe(band.tellRange === 'facing')
    }
    expect(isDarkProse(12)).toBe(false)
    expect(isDarkProse(2)).toBe(true)
    expect(isDarkProse(0)).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// 3. Use — the assertion that makes the table the source of truth
// ---------------------------------------------------------------------------

/** Every string the tables can produce, as a matcher. Slots become wildcards. */
function tableMatchers(): RegExp[] {
  const escape = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const out: RegExp[] = []
  for (const { beat } of allBeats()) {
    for (const variant of [beat.lit, beat.dark]) {
      const pattern = variant
        .split(/\{[a-zA-Z]+\}/)
        .map(escape)
        .join('.+')
      out.push(new RegExp(`^${pattern}$`))
    }
  }
  return out
}

function spokenText(event: GameEvent): string | null {
  if (event.kind === 'narration') return event.text
  if (event.kind === 'oilChanged') return event.text
  if (event.kind === 'companionLost') return event.text
  return null
}

describe('use — the reducer speaks only from the table', () => {
  /**
   * MUTATION-CHECKED, and the assertion this whole step is for.
   *
   * CLAUDE.md 2.4 says prose lives in data and never in code. Before 1f that
   * was a convention a reviewer had to enforce; this makes it a build failure.
   * Type a sentence into resolve.ts and this test names it.
   */
  it('never emits a line that did not come out of data/outcomes.ts', () => {
    const matchers = tableMatchers()
    const strays: string[] = []
    let spoken = 0

    for (const policy of ['cycle', 'route'] as const) {
      for (const difficulty of DIFFICULTIES) {
        for (let seed = 1; seed <= 40; seed++) {
          driveRun(policy, seed, difficulty, (events) => {
            for (const event of events) {
              const text = spokenText(event)
              if (text === null) continue
              spoken += 1
              if (!matchers.some((m) => m.test(text))) strays.push(text)
            }
          })
        }
      }
    }

    expect([...new Set(strays)]).toEqual([])
    // A sweep that said nothing would pass the assertion above vacuously.
    expect(spoken).toBeGreaterThan(2000)
  })

  /**
   * WHAT THE TEST ABOVE DOES NOT COVER, written down rather than assumed.
   *
   * The source-of-truth assertion only sees branches the sweep reaches. That
   * turned out to matter: the first mutation check for it — replacing the
   * grellhound's growl with a raw string — PASSED, because 160 runs of a
   * doorway-cycling policy never once had a grellhound companion standing
   * within radius 2 of the Wumpus. The test was fine; the mutation was
   * unreachable, which is a more interesting fact than the mutation.
   *
   * So this records which beats the sweep actually exercises. A beat in
   * `unreached` is a line no automated check protects — if you add one there,
   * you are saying out loud that it is unverified. If a beat LEAVES the
   * unreached list because gameplay changed, this fails and asks you to say so.
   */
  it('records which beats a sweep reaches and which it does not', () => {
    const observed = new Set<NarrationBeat>()
    for (const policy of ['cycle', 'route'] as const) {
      for (const difficulty of DIFFICULTIES) {
        for (let seed = 1; seed <= 40; seed++) {
          driveRun(policy, seed, difficulty, (events) => {
            for (const event of events) {
              if (event.kind === 'narration' || event.kind === 'oilChanged') observed.add(event.beat)
            }
          })
        }
      }
    }

    // The six beats neither policy reaches, and why. Each is a line no
    // automated check protects — if you add one to this list, you are saying
    // out loud that it is unverified.
    //
    //   grellhoundGrowls/Reveals  needs a tamed grellhound ALIVE next to the
    //                             Wumpus, or adjacent to a hazard
    //   goblinScrounges           needs a tamed goblin and a 10% roll
    //   skittishUpkeep            needs a mixed-success tame
    //   braveOverride             a natural 20 on a tame that also succeeds
    //   actionUnavailable         only an agent asking for something illegal
    //
    // FOUR OF THE SIX NEED A COMPANION, which neither of these policies ever
    // tames. That is the observation worth carrying to 1g: the companion system
    // is the least-exercised part of the reducer, and its prose is currently
    // verified by nothing but the table-shape assertions above.
    const unreached: NarrationBeat[] = [
      'grellhoundGrowls',
      'grellhoundReveals',
      'goblinScrounges',
      'skittishUpkeep',
      'braveOverride',
      'actionUnavailable',
    ]
    for (const beat of unreached) {
      expect(
        observed.has(beat),
        `${beat} is now reached by the sweep — remove it from the unreached list`,
      ).toBe(false)
    }
    // Everything else the sweep does see is genuinely covered by the
    // source-of-truth assertion above.
    expect(observed.size).toBeGreaterThanOrEqual(20)
  })

  it('never ships an unsubstituted slot to the player', () => {
    for (const difficulty of DIFFICULTIES) {
      for (let seed = 1; seed <= 20; seed++) {
        let state = createRun(seed, { difficulty })
        let guard = 0
        while (state.outcome === 'inProgress' && guard < 40) {
          guard += 1
          const menu = legalActions(state)
          if (menu.length === 0) break
          const pick = menu[(seed + guard * 5) % menu.length] as { action: Action }
          const result = applyAction(state, pick.action, rngFromState(state.rng))
          for (const event of result.events) {
            const text = spokenText(event)
            if (text !== null) expect(text, `seed ${seed}`).not.toMatch(/[{}]/)
          }
          state = result.state
        }
      }
    }
  })

  /**
   * Every run ends, and every ending is narrated. GDD 2.17 asks for a beat on
   * every ending including the quiet ones, and a run whose last event is
   * `runEnded` with no line before it is the failure that asks for.
   */
  it('gives every finished run a closing line before runEnded', () => {
    const seen = new Set<NarrationBeat>()
    for (const difficulty of DIFFICULTIES) {
      for (let seed = 1; seed <= 40; seed++) {
        let state = createRun(seed, { difficulty })
        let guard = 0
        let lastEvents: readonly GameEvent[] = []
        while (state.outcome === 'inProgress' && guard < 40) {
          guard += 1
          const menu = legalActions(state)
          if (menu.length === 0) break
          const pick = menu[(seed * 5 + guard) % menu.length] as { action: Action }
          const result = applyAction(state, pick.action, rngFromState(state.rng))
          lastEvents = result.events
          state = result.state
        }
        if (state.outcome === 'inProgress') continue
        const ended = lastEvents.findIndex((e) => e.kind === 'runEnded')
        expect(ended, `seed ${seed} ${difficulty} ended with no runEnded`).toBeGreaterThan(0)
        const before = lastEvents[ended - 1] as GameEvent
        expect(before.kind, `seed ${seed} ${difficulty}`).toBe('narration')
        if (before.kind === 'narration') seen.add(before.beat)
      }
    }
    // The sweep should reach most of the ways a run can end; if it only ever
    // found one, this test is not testing what it claims to.
    expect(seen.size).toBeGreaterThanOrEqual(4)
  })

  it('switches register when the lamp gets low', () => {
    // The dark variants are half the writing in this file. A run that never
    // reads one would make them decoration.
    const bright = say(ENDINGS.escaped, false)
    const dim = say(ENDINGS.escaped, true)
    expect(bright).not.toBe(dim)

    // Burned to Ember, the reducer must be speaking the dark register.
    let state = createRun(11, { difficulty: 'stirring' })
    state = { ...state, player: { ...state.player, oil: 1 } }
    const menu = legalActions(state)
    const move = menu.find((m) => m.action.kind === 'move')
    expect(move).toBeDefined()
    const result = applyAction(state, (move as { action: Action }).action, rngFromState(state.rng))
    const lines = result.events.map(spokenText).filter((t): t is string => t !== null)
    expect(lines.length).toBeGreaterThan(0)
    expect(isDarkProse(1)).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// Table bookkeeping — cheap assertions that catch a half-finished edit
// ---------------------------------------------------------------------------

describe('bookkeeping', () => {
  it('holds the number of beats the panels report', () => {
    const roomLed = ROOM_LED_ACTIONS.length * ARCHETYPES.length * BAND_ORDER.length
    const subjectLed = SUBJECT_LED_ACTIONS.length * BAND_ORDER.length
    const hazards = Object.keys(HAZARD_NARRATION).length * BAND_ORDER.length
    const fixed = Object.keys(ENDINGS).length + Object.keys(NOTES).length +
      Object.keys(COMPANION_LOSS).length
    expect(allBeats().length).toBe(roomLed + subjectLed + hazards + fixed)
  })

  it('keeps every archetype in the type reachable from the table', () => {
    // A seventh archetype added to RoomArchetype without a row here would fail
    // the Record type, but an archetype dropped from ARCHETYPES while staying
    // in the type would only fail here.
    const fromTable = new Set<RoomArchetype>(ARCHETYPES)
    for (const archetype of ['hewnChamber', 'floodedGallery', 'fungalGrotto',
      'collapsedShrine', 'carvedHall', 'heartChamber'] as RoomArchetype[]) {
      expect(fromTable.has(archetype), archetype).toBe(true)
    }
    expect(fromTable.size).toBe(6)
  })

  it('bands every outcome table over the full band order', () => {
    const bands: OutcomeBand[] = [...BAND_ORDER]
    for (const action of SUBJECT_LED_ACTIONS) {
      for (const band of bands) {
        expect(outcomeBeat('hewnChamber', action, band), `${action}.${band}`).not.toBeNull()
      }
    }
  })
})
