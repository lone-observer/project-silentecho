/**
 * The hazard verbs. GDD 2.8 is the specification; this is the enforcement.
 *
 * What is worth testing here is not that FORCE rolls a d20. It is the handful
 * of claims the redesign actually rests on, each of which is one edit away from
 * silently ceasing to be true:
 *
 *   - a bloom and a snare are a CHOICE, not a saving throw you are handed
 *   - the pit is not, and must stay that way
 *   - Force spends margin on TIME and always pays in Confused
 *   - Endure spends margin on the Confused DURATION and never pays it off
 *   - a status applied this turn is not also expired this turn
 *   - the hazard rolls look exactly like every other roll, so 1i's Fortune
 *     hook picks them up for free rather than needing a retrofit
 *
 * Several are marked MUTATION-CHECKED. Each of those was verified to FAIL when
 * the corresponding line was deliberately broken, which is the only evidence
 * that an assertion is load-bearing rather than decorative. The mutations used
 * are named in each comment so the next person can repeat them.
 */

import { describe, it, expect } from 'vitest'
import { rngFromState } from '../src/engine/rng.ts'
import { applyAction, createRun, hasStatus, legalActions, statusTurnsLeft } from '../src/engine/resolve.ts'
import { bandForMargin, roll, statModifier } from '../src/engine/dice.ts'
import { createRng } from '../src/engine/rng.ts'
import { BAND_ORDER } from '../src/engine/types.ts'
import type {
  Action,
  ActionKind,
  Difficulty,
  GameEvent,
  GameState,
  HazardKind,
  OutcomeBand,
  Room,
  RoomId,
  StatKey,
} from '../src/engine/types.ts'
import {
  ACTION_DC,
  ACTION_STAT,
  ENTRY_HAZARDS,
  HAZARD_OUTCOMES,
  HAZARD_VERB_OUTCOMES,
  HAZARD_VERB_STAT,
  HAZARD_VERBS,
  FIGHT_OUTCOMES,
  OIL,
  POPULATION,
  SCENT_BY_ACTION,
  STATUS,
  VERB_HAZARDS,
  VERBS_FOR_HAZARD,
} from '../src/engine/data/tuning.ts'
import type { HazardVerb } from '../src/engine/data/tuning.ts'

const ALL_DIFFICULTIES: readonly Difficulty[] = ['drowsing', 'stirring', 'hunting', 'ravening']

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function roomOf(state: GameState, id: RoomId): Room {
  return state.labyrinth.rooms[id] as Room
}

function patchRoom(state: GameState, id: RoomId, patch: Partial<Room>): GameState {
  return {
    ...state,
    labyrinth: {
      ...state.labyrinth,
      rooms: { ...state.labyrinth.rooms, [id]: { ...roomOf(state, id), ...patch } },
    },
  }
}

/**
 * A state with the player standing in a live, unanswered hazard.
 *
 * Built by hand rather than by walking a seeded run into one, so a test of
 * Force's turn cost is not also a test of whether generation happened to put a
 * bloom on this seed's path. Walking into one for real is exercised separately,
 * below — both are needed, and conflating them is how a test ends up measuring
 * the labyrinth instead of the rule.
 */
function standingIn(hazard: HazardKind, seed = 5): GameState {
  const state = createRun(seed, { difficulty: 'drowsing' })
  const here = state.player.roomId
  return {
    ...patchRoom(state, here, { hazard, creature: null, creatureHostile: false }),
    hazardRoomId: here,
    encounterRoomId: null,
  }
}

/**
 * Resolve one action with the die forced to a chosen band.
 *
 * `applyAction` takes the Rng, and `roll` draws exactly one d20 from it for the
 * action — so an Rng whose next d20 is fixed lands the band we asked for. This
 * is how a band table gets tested band by band rather than by rolling thousands
 * of times and hoping.
 */
function forcedRng(natural: number) {
  const base = createRng(1)
  let drawn = false
  return {
    ...base,
    d20(): number {
      if (drawn) return base.d20()
      drawn = true
      return natural
    },
  }
}

/** The natural die that lands `band` for this verb at starting stats. */
function naturalFor(verb: HazardVerb, band: OutcomeBand, stat = 8): number | null {
  const dc = ACTION_DC[verb]
  const mod = statModifier(stat)
  for (let natural = 2; natural <= 19; natural++) {
    // 2..19 skips the natural-1/20 overrides, which are a separate rule and
    // would make this helper silently return a band it did not compute.
    if (bandForMargin(natural + mod - dc) === band) return natural
  }
  return null
}

function resolveAt(state: GameState, verb: HazardVerb, band: OutcomeBand, stat = 8) {
  const natural = naturalFor(verb, band, stat)
  if (natural === null) throw new Error(`no natural die reaches ${band} for ${verb} at stat ${stat}`)
  const withStat: GameState = {
    ...state,
    player: { ...state.player, stats: { ...state.player.stats, [HAZARD_VERB_STAT[verb]]: stat } },
  }
  return applyAction(withStat, { kind: verb } as Action, forcedRng(natural))
}

function eventsOf(result: { events: readonly GameEvent[] }, kind: GameEvent['kind']) {
  return result.events.filter((e) => e.kind === kind)
}

// ---------------------------------------------------------------------------
// 1. The shape: a choice, not a saving throw
// ---------------------------------------------------------------------------

describe('verb hazards are an encounter, the way a creature is', () => {
  it('no longer auto-resolves bloom or snare on entry', () => {
    // MUTATION-CHECKED. Putting 'sporeBloom' back into ENTRY_HAZARDS fails this.
    //
    // The two lists are the whole redesign expressed as data: ENTRY_HAZARDS
    // resolve themselves the moment you cross the threshold, VERB_HAZARDS hand
    // you a menu. A hazard in both would resolve AND offer a choice about the
    // thing it had already resolved.
    for (const hazard of VERB_HAZARDS) {
      expect(ENTRY_HAZARDS, `${hazard} must not auto-resolve any more`).not.toContain(hazard)
    }
    for (const hazard of ENTRY_HAZARDS) {
      expect(VERB_HAZARDS).not.toContain(hazard)
    }
    expect([...ENTRY_HAZARDS]).toEqual(['pit'])
  })

  it('raises the flag on entry and offers exactly that hazard\'s verbs', () => {
    for (const hazard of VERB_HAZARDS) {
      const state = standingIn(hazard)
      const menu = legalActions(state)
      const kinds = menu.map((m) => m.action.kind).sort()
      expect(kinds, `${hazard} menu`).toEqual([...(VERBS_FOR_HAZARD[hazard] ?? [])].sort())
      // The menu IS the hazard: no walking away from a bloom, unlike a creature
      // you can SNEAK past or FLEE from. If MOVE ever appears here, the "stat
      // with no option" column in GDD 2.8's matrix costs nothing.
      expect(kinds).not.toContain('move')
      expect(kinds).not.toContain('flee')
      for (const entry of menu) {
        expect(entry.dc, `${entry.action.kind} must publish its DC`).toBe(ACTION_DC[entry.action.kind])
      }
    }
  })

  it('clears the flag when the verb resolves, and leaves the hazard in the room', () => {
    // Terrain never drifts within a run (GDD 2.9.1). What an answered hazard
    // clears is the ENCOUNTER, not the world — walk back in and it is still a
    // bloom, and still a choice.
    for (const hazard of VERB_HAZARDS) {
      const verb = (VERBS_FOR_HAZARD[hazard] ?? [])[0] as HazardVerb
      const state = standingIn(hazard)
      const { state: after } = resolveAt(state, verb, 'success')
      expect(after.hazardRoomId).toBeNull()
      expect(roomOf(after, after.player.roomId).hazard).toBe(hazard)
      expect(legalActions(after).some((m) => m.action.kind === 'move')).toBe(true)
    }
  })

  it('offers the verbs when a real run walks into a real hazard', () => {
    // The companion to `standingIn`: the hand-built state proves the rule, this
    // proves the rule is reachable. 1f's finding 3 is the reason both exist —
    // a mutation that passes because the sweep never reaches the code is not a
    // passing test, it is an unreachable one.
    const offered = new Set<ActionKind>()
    for (const difficulty of ALL_DIFFICULTIES) {
      for (let seed = 1; seed <= 25; seed++) {
        let state = createRun(seed, { difficulty })
        let guard = 0
        while (state.outcome === 'inProgress' && guard < 30) {
          guard += 1
          const menu = legalActions(state)
          if (menu.length === 0) break
          for (const entry of menu) offered.add(entry.action.kind)
          const choice = menu[(seed + guard) % menu.length] as { action: Action }
          state = applyAction(state, choice.action, rngFromState(state.rng)).state
        }
      }
    }
    for (const verb of HAZARD_VERBS) {
      expect(offered.has(verb), `${verb} is never reachable in a real run`).toBe(true)
    }
  })
})

// ---------------------------------------------------------------------------
// 2. The pit — untouched, and staying that way
// ---------------------------------------------------------------------------

describe('the pit has no options, by design', () => {
  it('never offers a verb, and still resolves the moment you walk in', () => {
    // MUTATION-CHECKED. Adding `pit: ['dodge']` to VERBS_FOR_HAZARD fails this.
    //
    // CLAUDE.md 3: a pit is the only instant-loss check in the game and a
    // pit-free route to the Heart is guaranteed. Giving it a verb would make
    // the one absolute thing in the labyrinth negotiable, which is a design
    // change and not a tuning one.
    expect(VERBS_FOR_HAZARD.pit).toBeUndefined()
    expect(ENTRY_HAZARDS).toContain('pit')

    const state = standingIn('pit')
    // `standingIn` sets the flag by hand; the reducer must refuse to believe it,
    // because a pit is not a hazard the flag is ever legitimately set for.
    const kinds = legalActions(state).map((m) => m.action.kind)
    for (const verb of HAZARD_VERBS) {
      expect(kinds, `pit must not offer ${verb}`).not.toContain(verb)
    }
    expect(kinds).toContain('move')
  })

  it('keeps its band table, and that table still kills at the bottom', () => {
    const pit = HAZARD_OUTCOMES.pit
    expect(pit).toBeDefined()
    expect(pit?.criticalFailure.fatal).toBe(true)
    expect(pit?.failure.fatal).toBe(true)
    expect(pit?.mixed.fatal).toBe(false)
    // And it pays nothing for being survived, at any band — you did not clear
    // it, you failed to fall in.
    for (const band of BAND_ORDER) {
      expect(pit?.[band].rewardFlasks, `pit must never pay at ${band}`).toBe(0)
    }
  })
})

// ---------------------------------------------------------------------------
// 3. Force — margin buys TIME, Confused is unconditional
// ---------------------------------------------------------------------------

describe('FORCE spends margin on the clock', () => {
  /**
   * MUTATION-CHECKED, two ways: flattening every `extraTurns` in
   * HAZARD_VERB_OUTCOMES.force to 1 fails the "cheaper at the top" assertion,
   * and setting strongSuccess's `applies` to null fails the "always Confused"
   * one.
   *
   * This is the sentence GDD 2.8 writes about FORCE — "margin sets how many
   * turns it costs (2, or 1 on a strong success), but Confused always applies
   * regardless of the roll" — turned into something that fails when it stops
   * being true. Both halves matter: without the first, FORCE has no upside and
   * nobody would ever pick it over ENDURE; without the second, STR gets a clean
   * answer to a bloom and the AGI-has-no-option column stops being the only
   * asymmetry in the matrix.
   */
  it('costs strictly fewer turns at the top bands than at the bottom', () => {
    const table = HAZARD_VERB_OUTCOMES.force
    const costs = BAND_ORDER.map((b) => 1 + table[b].extraTurns)
    // Monotone: a better roll is never slower.
    for (let i = 1; i < costs.length; i++) {
      expect(costs[i]!, `${BAND_ORDER[i]} must not cost more turns than ${BAND_ORDER[i - 1]}`)
        .toBeLessThanOrEqual(costs[i - 1]!)
    }
    // And it actually varies — a monotone constant would pass the loop above
    // while deleting the mechanic.
    expect(new Set(costs).size, 'FORCE turn cost must depend on the band').toBeGreaterThan(1)
    expect(costs[BAND_ORDER.indexOf('strongSuccess')]).toBeLessThan(
      costs[BAND_ORDER.indexOf('success')]!,
    )
  })

  it('applies Confused in every band, at the same duration', () => {
    const table = HAZARD_VERB_OUTCOMES.force
    for (const band of BAND_ORDER) {
      expect(table[band].applies, `FORCE at ${band} must still Confuse you`).toBe('confused')
      expect(table[band].statusTurns).toBeGreaterThan(0)
    }
    // The good bands share one duration: FORCE buys time, never clarity. If
    // these ever differ, FORCE has quietly grown ENDURE's upside as well as its
    // own, and the bloom stops being a choice.
    const good = (['mixed', 'success', 'strongSuccess', 'criticalSuccess'] as const).map(
      (b) => table[b].statusTurns,
    )
    expect(new Set(good).size).toBe(1)
    expect(good[0]).toBe(STATUS.confusedTurns)
  })

  it('actually spends those turns in the reducer, not just in the table', () => {
    // The table is data; this is the wiring. A `turnCost` that ignored
    // `extraTurns` would leave every assertion above passing.
    const bloom = standingIn('sporeBloom')
    const slow = resolveAt(bloom, 'force', 'success')
    const fast = resolveAt(bloom, 'force', 'strongSuccess')
    expect(slow.state.turn - bloom.turn).toBe(1 + HAZARD_VERB_OUTCOMES.force.success.extraTurns)
    expect(fast.state.turn - bloom.turn).toBe(1 + HAZARD_VERB_OUTCOMES.force.strongSuccess.extraTurns)
    expect(fast.state.turn).toBeLessThan(slow.state.turn)
  })
})

// ---------------------------------------------------------------------------
// 4. Endure — margin buys the Confused DURATION, and never all of it
// ---------------------------------------------------------------------------

describe('ENDURE spends margin on how long the sweetness holds you', () => {
  /**
   * MUTATION-CHECKED, two ways: setting strongSuccess's `statusTurns` to 0
   * fails the floor assertion, and flattening every `statusTurns` to
   * STATUS.confusedTurns fails the "must vary" one.
   *
   * The floor is not flavour. As first specified, INT answered Creature (Tame),
   * Bloom (Endure) AND Snare (Avoid) — full coverage, no weak matchup, on top
   * of INT already owning taming. A clean ENDURE that walked out unconfused
   * would restore exactly that: INT as the safe generalist stat and the
   * coverage matrix as decoration. See claude/design-decisions.md, 17 Sep 2026.
   */
  it('shortens Confused with margin but never cancels it', () => {
    const table = HAZARD_VERB_OUTCOMES.endure
    const durations = BAND_ORDER.map((b) => table[b].statusTurns)
    for (const band of BAND_ORDER) {
      expect(table[band].applies, `ENDURE at ${band} must still Confuse you`).toBe('confused')
      expect(table[band].statusTurns, `ENDURE at ${band} must never fully cancel Confused`)
        .toBeGreaterThanOrEqual(1)
    }
    // Monotone downward: a better roll never leaves you blind for longer.
    for (let i = 1; i < durations.length; i++) {
      expect(durations[i]!).toBeLessThanOrEqual(durations[i - 1]!)
    }
    expect(new Set(durations).size, 'ENDURE duration must depend on the band').toBeGreaterThan(1)
    expect(table.strongSuccess.statusTurns).toBeLessThan(table.success.statusTurns)
  })

  it('keeps its turn cost flat across every band', () => {
    // The inverse of FORCE, and the other half of the trade. Enduring never
    // buys the clock back; if it ever does, the two verbs collapse into one.
    const turns = new Set(BAND_ORDER.map((b) => HAZARD_VERB_OUTCOMES.endure[b].extraTurns))
    expect(turns.size, 'ENDURE turn cost must be flat').toBe(1)
  })

  it('writes the band\'s own duration into the player, not a constant', () => {
    // MUTATION-CHECKED. Reverting resolve.ts step 3 to
    // `const turns = STATUS.confusedTurns` fails this.
    //
    // That constant was right for as long as one thing applied Confused. The
    // moment the duration became the variable ENDURE spends, reading it from a
    // constant threw away the entire mechanic while leaving every table
    // assertion above green.
    const bloom = standingIn('sporeBloom')
    const weak = resolveAt(bloom, 'endure', 'success')
    const strong = resolveAt(bloom, 'endure', 'strongSuccess')
    expect(statusTurnsLeft(weak.state.player, 'confused')).toBe(
      HAZARD_VERB_OUTCOMES.endure.success.statusTurns,
    )
    expect(statusTurnsLeft(strong.state.player, 'confused')).toBe(
      HAZARD_VERB_OUTCOMES.endure.strongSuccess.statusTurns,
    )
    expect(statusTurnsLeft(strong.state.player, 'confused')).toBeLessThan(
      statusTurnsLeft(weak.state.player, 'confused'),
    )
  })
})

// ---------------------------------------------------------------------------
// 5. The defect Panel C found: a status applied this turn is not expired by it
// ---------------------------------------------------------------------------

describe('a status survives the turn that applied it', () => {
  /**
   * MUTATION-CHECKED. Removing the `appliedThisTurn` guard from `tickStatuses`
   * fails every assertion here.
   *
   * Found by reading `npm run hazard -- run 3 stirring route`, not by any test.
   * Statuses land at step 3; step 7 counts the turn's cost off them; 1e made
   * step 7 run once per turn CONSUMED. So a Confused applied by a two-turn
   * FORCE was decremented twice and expired inside the same turn, and the
   * transcript printed
   *
   *     status   confused for 2 turn(s)
   *     status   confused for 0 turn(s)
   *
   * back to back. FORCE's one unconditional cost cost nothing at four of its
   * six bands, ENDURE's duration mechanic did nothing at any band, and a
   * strongSuccess FORCE (one turn) left the player blind while a plain success
   * (two turns) did not — a better roll punished. Every test passed throughout.
   */
  it('leaves the player Confused for the full duration after a two-turn FORCE', () => {
    const bloom = standingIn('sporeBloom')
    const { state: after } = resolveAt(bloom, 'force', 'success')
    expect(HAZARD_VERB_OUTCOMES.force.success.extraTurns, 'precondition: this band costs 2 turns')
      .toBeGreaterThan(0)
    expect(hasStatus(after.player, 'confused')).toBe(true)
    expect(statusTurnsLeft(after.player, 'confused')).toBe(
      HAZARD_VERB_OUTCOMES.force.success.statusTurns,
    )
  })

  it('does not let a better roll leave you blinder than a worse one', () => {
    // The inversion, asserted directly. This is the shape of the bug rather
    // than its cause, so it stays true under any future retune of the tables.
    const bloom = standingIn('sporeBloom')
    const worse = resolveAt(bloom, 'force', 'success')
    const better = resolveAt(bloom, 'force', 'strongSuccess')
    expect(statusTurnsLeft(better.state.player, 'confused'))
      .toBeGreaterThanOrEqual(statusTurnsLeft(worse.state.player, 'confused'))
  })

  it('still counts the status down on the turns after', () => {
    // The guard must not become "never tick at all".
    const bloom = standingIn('sporeBloom')
    let state = resolveAt(bloom, 'endure', 'success').state
    const start = statusTurnsLeft(state.player, 'confused')
    expect(start).toBeGreaterThan(0)
    const move = legalActions(state).find((m) => m.action.kind === 'move')
    expect(move, 'precondition: the hazard is answered and the player can leave').toBeDefined()
    state = applyAction(state, move!.action, rngFromState(state.rng)).state
    expect(statusTurnsLeft(state.player, 'confused')).toBeLessThan(start)
  })
})

// ---------------------------------------------------------------------------
// 6. The reward
// ---------------------------------------------------------------------------

describe('clearing a hazard pays an oil flask', () => {
  it('pays on the same bands for every verb, and never on a failure', () => {
    for (const verb of HAZARD_VERBS) {
      const table = HAZARD_VERB_OUTCOMES[verb]
      expect(table.criticalFailure.rewardFlasks, `${verb} must not pay on a critical failure`).toBe(0)
      expect(table.failure.rewardFlasks, `${verb} must not pay on a failure`).toBe(0)
      // Reachable at starting stats. The gate that is never reached is the bug
      // the 1d sweep found in TAME_OUTCOMES.brave — a reward nobody can earn is
      // a mechanic that does not exist, and nobody notices for three steps.
      expect(table.strongSuccess.rewardFlasks, `${verb} must pay somewhere reachable`)
        .toBeGreaterThan(0)
    }
    // One gate, not four. If these diverge it should be a decision, not a typo.
    const gates = HAZARD_VERBS.map((v) =>
      BAND_ORDER.filter((b) => HAZARD_VERB_OUTCOMES[v][b].rewardFlasks > 0).join(','),
    )
    expect(new Set(gates).size, 'every hazard verb should pay on the same bands').toBe(1)
  })

  it('actually puts a flask in the pack', () => {
    for (const hazard of VERB_HAZARDS) {
      for (const verb of VERBS_FOR_HAZARD[hazard] ?? []) {
        const state = standingIn(hazard)
        const paid = resolveAt(state, verb, 'strongSuccess')
        const unpaid = resolveAt(state, verb, 'failure')
        expect(paid.state.player.inventory.filter((i) => i === 'oilFlask').length, `${verb} paid`)
          .toBe(HAZARD_VERB_OUTCOMES[verb].strongSuccess.rewardFlasks)
        expect(unpaid.state.player.inventory).toHaveLength(0)
        // And the player is TOLD. A reward the event stream cannot express is a
        // text-parity failure (CLAUDE.md 2.3), which is how three beats shipped
        // silent through 1e.
        const narration = paid.events.filter((e) => e.kind === 'narration')
        expect(narration.some((e) => e.kind === 'narration' && e.beat === 'hazardCleared')).toBe(true)
      }
    }
  })

  it('pays a driven-off creature\'s hoard on the same gate as the hazards', () => {
    // GDD 2.8's reward pass covers a successful FIGHT too. Gated on `driven`,
    // so a band that paid without clearing the room would be visible here.
    for (const band of BAND_ORDER) {
      const out = FIGHT_OUTCOMES[band]
      if (out.rewardFlasks > 0) {
        expect(out.driven, `FIGHT pays at ${band} without driving the creature off`).toBe(true)
      }
    }
    expect(FIGHT_OUTCOMES.criticalFailure.rewardFlasks).toBe(0)
    expect(FIGHT_OUTCOMES.failure.rewardFlasks).toBe(0)
    expect(FIGHT_OUTCOMES.strongSuccess.rewardFlasks).toBeGreaterThan(0)
  })

  it('keeps earned oil worth less than a whole lamp', () => {
    // A guard rail rather than a balance number: whatever the reward is retuned
    // to, one cleared hazard must not refill the lamp. If this ever fails,
    // someone has made oil a formality.
    const best = Math.max(...HAZARD_VERBS.map((v) =>
      Math.max(...BAND_ORDER.map((b) => HAZARD_VERB_OUTCOMES[v][b].rewardFlasks)),
    ))
    expect(best * OIL.flaskValue).toBeLessThan(OIL.max)
    // And the ambient supply is still an ambient supply. Sized together with
    // the reward in 1g; see POPULATION.oilFlasks for the measured table.
    expect(POPULATION.oilFlasks[0]).toBeGreaterThan(0)
    expect(POPULATION.oilFlasks[0]).toBeLessThanOrEqual(POPULATION.oilFlasks[1])
  })
})

// ---------------------------------------------------------------------------
// 7. Loudness — GDD 2.10's split, extended to the new verbs
// ---------------------------------------------------------------------------

describe('the hazard verbs take the fast-and-loud / slow-and-quiet split', () => {
  it('puts FORCE in the loud half and the other three in the quiet half', () => {
    // MUTATION-CHECKED. Setting SCENT_BY_ACTION.endure to 3 fails this.
    //
    // Anchored to FIGHT, FLEE and TAME rather than to numbers typed in here, so
    // it keeps meaning what GDD 2.10 says it means after a scent retune.
    expect(SCENT_BY_ACTION.force).toBeGreaterThanOrEqual(SCENT_BY_ACTION.flee)
    expect(SCENT_BY_ACTION.force).toBeLessThanOrEqual(SCENT_BY_ACTION.fight)
    for (const verb of ['endure', 'avoid', 'dodge'] as const) {
      expect(SCENT_BY_ACTION[verb], `${verb} must be as quiet as TAME or quieter`)
        .toBeLessThanOrEqual(SCENT_BY_ACTION.tame)
      expect(SCENT_BY_ACTION[verb]).toBeLessThan(SCENT_BY_ACTION.force)
    }
  })

  it('deposits that much scent through the reducer', () => {
    const bloom = standingIn('sporeBloom')
    const loud = resolveAt(bloom, 'force', 'success')
    const quiet = resolveAt(bloom, 'endure', 'success')
    const at = (s: GameState): number => s.scent[s.player.roomId] ?? 0
    expect(at(loud.state)).toBeGreaterThan(at(quiet.state))
  })
})

// ---------------------------------------------------------------------------
// 8. The coverage matrix — GDD 2.8's actual promise
// ---------------------------------------------------------------------------

describe('every stat has exactly one hazard it cannot answer', () => {
  it('leaves at least one stat with no option against each verb hazard', () => {
    // MUTATION-CHECKED. Adding 'dodge' to the bloom's verb list fails this —
    // which is the exact change that would give AGI a free pass.
    const stats: readonly StatKey[] = ['str', 'agi', 'int']
    for (const hazard of VERB_HAZARDS) {
      const covered = new Set((VERBS_FOR_HAZARD[hazard] ?? []).map((v) => HAZARD_VERB_STAT[v]))
      const missing = stats.filter((s) => !covered.has(s))
      expect(missing.length, `${hazard} must leave a stat with no answer`).toBeGreaterThan(0)
    }
    // Bloom is the STR/INT one and snare is the INT/AGI one. Stated explicitly
    // because "some stat is missing somewhere" is satisfiable by a matrix that
    // walls the same stat out of everything.
    expect(new Set((VERBS_FOR_HAZARD.sporeBloom ?? []).map((v) => HAZARD_VERB_STAT[v])))
      .toEqual(new Set(['str', 'int']))
    expect(new Set((VERBS_FOR_HAZARD.snareCarving ?? []).map((v) => HAZARD_VERB_STAT[v])))
      .toEqual(new Set(['int', 'agi']))
  })

  it('keeps ACTION_STAT and HAZARD_VERB_STAT in step', () => {
    // Two tables describing one fact is the drift CLAUDE.md 2.4 warns about;
    // the same assertion already exists for ACTION_STAT vs ENCOUNTER_STAT.
    for (const verb of HAZARD_VERBS) {
      expect(ACTION_STAT[verb], `${verb}`).toBe(HAZARD_VERB_STAT[verb])
    }
  })

  it('gives both options on a hazard the same DC', () => {
    // The choice is between two COST MODELS, never between an easy option and a
    // hard one — a cheaper roll as well as a cheaper price would collapse it
    // into one right answer per build.
    for (const hazard of VERB_HAZARDS) {
      const dcs = new Set((VERBS_FOR_HAZARD[hazard] ?? []).map((v) => ACTION_DC[v]))
      expect(dcs.size, `${hazard}'s options must share a DC`).toBe(1)
    }
  })
})

// ---------------------------------------------------------------------------
// 9. The roll path — what 1i's Fortune hook depends on
// ---------------------------------------------------------------------------

describe('a hazard roll looks exactly like every other roll', () => {
  /**
   * MUTATION-CHECKED. Emitting the hazard-verb roll with a `hazard` field, or
   * assembling its modifiers separately from `rollForAction`, fails this.
   *
   * GDD 2.5 spends Fortune AFTER seeing a roll, and 1i's `Policy.spendFortune`
   * will be handed whatever the reducer produced (docs/EVALS.md). A hazard roll
   * built by hand in its own branch would be invisible to that hook, and
   * retrofitting it later is a cost nobody has budgeted. Cheap to assert now,
   * expensive to discover in 1i.
   */
  it('emits one ordinary action roll, with no hazard-specific shape', () => {
    for (const hazard of VERB_HAZARDS) {
      for (const verb of VERBS_FOR_HAZARD[hazard] ?? []) {
        const result = resolveAt(standingIn(hazard), verb, 'success')
        const rolls = eventsOf(result, 'roll')
        expect(rolls, `${verb} must roll exactly once`).toHaveLength(1)
        const event = rolls[0]
        if (event?.kind !== 'roll') throw new Error('unreachable')
        expect(event.action).toBe(verb)
        // `hazard` marks a SAVING THROW attached to another action's turn — a
        // pit's, now. The verb's own roll is the action's roll.
        expect(event.hazard).toBeUndefined()
        expect(event.result.dc).toBe(ACTION_DC[verb])
        expect(event.result.band).toBe('success')
        // Every modifier labelled (CLAUDE.md 4), including the stat's.
        expect(event.result.modifiers.length).toBeGreaterThan(0)
        for (const m of event.result.modifiers) expect(m.source).not.toBe('')
      }
    }
  })

  it('carries the oil penalty like any other action', () => {
    const bloom = standingIn('sporeBloom')
    const dim: GameState = { ...bloom, player: { ...bloom.player, oil: 4 } }
    const result = resolveAt(dim, 'force', 'success')
    const event = eventsOf(result, 'roll')[0]
    if (event?.kind !== 'roll') throw new Error('unreachable')
    expect(event.result.modifiers.some((m) => m.value === -2)).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// 10. The visualiser's odds table is not a second implementation
// ---------------------------------------------------------------------------

describe('scripts/hazard.ts Panel B agrees with the real roller', () => {
  it('reproduces the band distribution dice.ts actually produces', () => {
    // `bandOdds` in the visualiser restates the natural-1/20 overrides, because
    // `applyNaturalOverride` is not exported. A visualiser that hardcodes the
    // rule it is watching is a visualiser that lies on the day the rule changes
    // (1e, tame.ts Panel B) — so the restatement is checked against the roller
    // rather than trusted.
    for (const dc of [5, 8, 12, 16]) {
      for (const stat of [8, 12, 18]) {
        const mod = statModifier(stat)
        for (let natural = 1; natural <= 20; natural++) {
          let expected = bandForMargin(natural + mod - dc)
          if (natural === 1 && BAND_ORDER.indexOf(expected) > BAND_ORDER.indexOf('failure')) {
            expected = 'failure'
          }
          if (natural === 20 && BAND_ORDER.indexOf(expected) < BAND_ORDER.indexOf('success')) {
            expected = 'success'
          }
          const actual = roll(createRng(1), {
            dc,
            modifiers: [{ source: 'stat', value: mod }],
            forceNatural: natural,
          })
          expect(actual.band, `dc ${dc}, stat ${stat}, natural ${natural}`).toBe(expected)
        }
      }
    }
  })
})
