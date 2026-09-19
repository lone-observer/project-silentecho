/**
 * Every tunable number in the game, in one place.
 *
 * RULE: no other file in the engine hardcodes a value that belongs here.
 * Balance is tuned by editing this file and re-running `npm run sim` — if a
 * tuning change ever requires editing logic, the design is wrong
 * (CLAUDE.md 2.4).
 *
 * Each value cites the docs/GDD.md section it came from. When you change one,
 * change the GDD too, or the two drift and the GDD stops being the source of truth.
 */

import type {
  ActionKind, CreatureKind, Difficulty, HazardKind, OutcomeBand, StatKey, StatusEffect, WumpusTier,
} from '../types.ts'
import { DC } from '../types.ts'

// ---------------------------------------------------------------------------
// The run — GDD 2.2
// ---------------------------------------------------------------------------

export const RUN = {
  /**
   * Ceiling across every difficulty; the binding number is per-difficulty
   * (`DIFFICULTY[].maxTurns`, 50/45/40/35 since 18 Sep 2026). Kept as the upper
   * bound so anything sizing an array or an axis by turn count has one number to
   * read rather than a max() over the contract table.
   */
  maxTurns: 50,
  gridWidth: 10,
  gridHeight: 10,

  /**
   * The Heart's distance band is bounded by the TURN BUDGET, not by grid size.
   *
   * THE ARITHMETIC THIS WAS DERIVED FROM IS STALE, and 1i re-measured rather
   * than re-derived it. The original reasoning: a round trip costs at least 2x
   * this distance, so against a flat 20-turn cap a Heart 7 rooms deep already
   * spends 14 of them walking, and the Heart therefore had to sit in the near
   * third whatever the grid size. At 50/45/40/35 turns that constraint is simply
   * gone — a round trip to a Heart 7 deep is 14 of 45 turns, not 14 of 20.
   *
   * See the note on `DIFFICULTY.heartDistance` for what the 1i sweep measured
   * and what moved because of it.
   *
   * Per-difficulty bands narrow this further — see DIFFICULTY.
   */
  minHeartDistance: 5,
  maxHeartDistance: 7,
} as const

// ---------------------------------------------------------------------------
// Generation — GDD 2.2
// ---------------------------------------------------------------------------

export const GENERATION = {
  /**
   * Fraction of the non-tree grid edges braided back in after the spanning tree.
   *
   * A perfect maze (0) has exactly one path between any two rooms, which is
   * wrong for an evasion game: no loops means no route choice, and escaping
   * means retracing your exact steps into whatever is following you. Braiding
   * adds loops so the player can circle around. Too high and it stops reading
   * as a labyrinth and becomes an open field.
   */
  braidRatio: 0.3,
  /**
   * How strongly a room's hazard pulls its archetype toward the thematic match
   * (spore bloom -> fungal grotto, portal -> collapsed shrine, and so on).
   * 1 = always, 0 = archetypes are pure noise. Coherence makes the world feel
   * authored and gives (archetype x action) outcomes real meaning.
   */
  archetypeAffinity: 0.75,
  // Wumpus start distance is a BAND, per difficulty — see DifficultyContract.
  // It used to be a lone minimum here, which is how a monster that could never
  // reach the player shipped for three steps. A distance specified at only one
  // end is the same bug that produced arithmetically unwinnable maps in 1b.
  /** Whole-labyrinth regenerations before we accept the closest near-miss. */
  maxGenerationAttempts: 60,
  /** Place/measure/repair passes spent trying to hit a difficulty contract. */
  maxRepairPasses: 40,
} as const

// ---------------------------------------------------------------------------
// The player — GDD 2.5
// ---------------------------------------------------------------------------

export const PLAYER = {
  // `maxHealth` retired 18 Sep 2026. There is no health resource anywhere in the
  // game; cost is margin, paid in oil (GDD 2.6).
  /**
   * Every stat starts here. mod = floor((stat - 10) / 2), so 10 is 0.
   *
   * WAS 8 THROUGH 1h, which made every starting modifier -1 — so a first-time
   * player's roll breakdown was nothing but negative numbers, on the one screen
   * whose whole job is teaching them how the dice work. Raised to 10 on
   * Gautham's call in 1i. This shifts every DC's felt difficulty by one point,
   * which is why it is a balance change and not a cosmetic one; the 1i sweep
   * measured the four difficulties against it rather than assuming it was free.
   */
  startingStat: 10,
  maxStat: 18,
  /** Awarded after every completed run, win or lose. */
  statPointsPerRun: 3,
  /** Fortune points per run = floor(LCK / fortuneDivisor). GDD 2.5 */
  fortuneDivisor: 4,
} as const

// ---------------------------------------------------------------------------
// Oil — GDD 2.8.1
// ---------------------------------------------------------------------------

/**
 * Oil is an ACTION BUDGET, not a second death clock — and since 18 Sep 2026 it
 * is the ONLY resource the player manages, because health is gone (GDD 2.6).
 * Everything a bad roll can do to you, it does here.
 *
 * The penalty is a LABELLED MODIFIER on the roll, never a hidden DC change —
 * `Guttering lamp -2` in the roll breakdown teaches the mechanic for free.
 *
 * Running dry is not a third death (GDD 2.8.1). At zero you roll at -6 with no
 * lantern, which makes a pit and the Wumpus far likelier to end you, and that is
 * the whole of it.
 */
export interface OilBand {
  readonly name: string
  /** Inclusive lower bound. Bands are contiguous and cover 0..OIL.max. */
  readonly min: number
  readonly max: number
  /** Added to every roll. Always surfaced with `label` as its source. */
  readonly modifier: number
  readonly label: string
  /** Rooms visible around the player in the diorama. */
  readonly lanternRadius: number
}

/**
 * `tellRange` is GONE from this table, 18 Sep 2026.
 *
 * It restricted Ember and Dark to the facing doorway only, and 1g's sweep showed
 * it almost never fired — most runs never reach Ember, so the mechanism defended
 * by the 17 Sep darkness decision had gone quiet before it was retired. `FOCUS`
 * replaces it outright (GDD 2.7): information is now gated per doorway by a turn
 * and a small oil price, capped per room by difficulty, and never by oil level.
 *
 * What survives unchanged is the reason that decision existed: darkness costs
 * you RANGE and never honesty. It still does — zero oil is a -6 on every roll
 * and a dark lantern, and not one word of what reaches you is false.
 */
export const OIL_BANDS: readonly OilBand[] = [
  { name: 'bright',    min: 7, max: 12, modifier:  0, label: 'Lamp bright',    lanternRadius: 2 },
  { name: 'guttering', min: 3, max:  6, modifier: -2, label: 'Guttering lamp', lanternRadius: 1 },
  { name: 'ember',     min: 1, max:  2, modifier: -4, label: 'Failing lamp',   lanternRadius: 1 },
  { name: 'dark',      min: 0, max:  0, modifier: -6, label: 'Darkness',       lanternRadius: 0 },
] as const

/**
 * The band at which the prose switches to its dark register.
 *
 * WAS DERIVED from `OIL_BANDS[].tellRange`, which no longer exists — 1f keyed it
 * there because GDD 2.8.1 had already chosen Ember for the range restriction and
 * the prose shift was meant to land on the same change of state. With the range
 * mechanism retired, the derivation has nothing left to point at, so the choice
 * is explicit here instead of implicit somewhere else.
 *
 * KEPT AT EMBER rather than moved. 1g measured that runs reaching turn 18+ ended
 * at 3.5-5.2 oil — Guttering, not Ember — which means 1f picked the threshold on
 * an arithmetic claim that turned out to be wrong, and "move it to Guttering" is
 * on the open list for that reason. It stays at Ember here because this step
 * changed the entire oil economy underneath the question: a 45-turn run priced
 * per action burns nothing like a 20-turn run burning passively, so 1g's number
 * describes a game that no longer exists, and moving the threshold to match a
 * stale measurement would be worse than leaving it. Re-ask it against the 1i
 * sweep's oil distribution, which is in PHASE-1-PROGRESS.
 */
export const DARK_PROSE_BAND = 'ember'

/**
 * True once the lamp has fallen to `DARK_PROSE_BAND` OR BELOW.
 *
 * At-or-below, not equal-to, and the difference is not academic: `OIL_BANDS` is
 * ordered brightest-first, so an equality test would put the prose back into its
 * LIT register at zero oil — a player standing in total darkness reading about
 * what they could see. Caught by the monotonicity assertion in
 * `tests/outcomes.test.ts`, which exists because this is precisely the kind of
 * off-by-one that reads fine in the source and is absurd on the screen.
 */
export function isDarkBand(name: string): boolean {
  const threshold = OIL_BANDS.findIndex((b) => b.name === DARK_PROSE_BAND)
  const here = OIL_BANDS.findIndex((b) => b.name === name)
  return here >= threshold
}

export const OIL = {
  max: 12,
  starting: 12,
  /**
   * PASSIVE BURN IS RETIRED, 18 Sep 2026 (GDD 2.8.1). The old model burned one
   * oil every two turns whatever you did; oil is now spent per ACTION, and the
   * band the action rolls scales what it costs — see `OIL_PRICE` below.
   *
   * The reason is the turn-cap change. Passive burn against a 20-turn cap was an
   * anti-dawdling tax; against 50 it would be a second death clock, which the
   * 16 Sep oil design explicitly rejected and GDD 2.8.1 still forbids ("0 oil is
   * not a third death").
   */
  flaskValue: 4,
  /** A bad USE spills half of it. GDD 2.8.1 — USE is rolled now, not flat. */
  botchedFlaskFraction: 0.5,
} as const

// ---------------------------------------------------------------------------
// The oil price of an action — GDD 2.6, 2.8.1. The centre of the 1i rebuild.
// ---------------------------------------------------------------------------

/**
 * What an action costs before the dice touch it. GDD 2.8.1's price table.
 *
 * Read with `oilCostFor`, never directly: the number here is the price of doing
 * the thing, and `BAND_OIL_MULTIPLIER` is what a good or bad roll does to it.
 * Cost is POSITIVE; a negative result out of `oilCostFor` is oil coming back.
 *
 * These are the numbers 1i measured — see PHASE-1-PROGRESS for the sweep they
 * came out of, and `npm run economy` to re-run it.
 */
export const OIL_PRICE: Record<ActionKind, number> = {
  /**
   * The most-taken action in the game, so it sets the shape of the whole
   * economy: at 0.5 a 45-turn run of clean moves spends most of a full lamp, at
   * 0.25 it spends a quarter of one. 1i swept both.
   */
  move: 0.5,
  // Answering a hazard or a creature. One, per GDD 2.8.1's table.
  fight: 1,
  tame: 1,
  sneak: 1,
  force: 1,
  endure: 1,
  // AVOID and DODGE are the same hazard at two prices, and the split IS the
  // decision (GDD 2.8): AVOID pays a misread in CLOCK (`extraTurns` in
  // HAZARD_VERB_OUTCOMES), DODGE pays it in oil. Under the old model DODGE paid
  // in health, and with health retired the two verbs would have collapsed into
  // "AVOID but worse" — 1g already measured DODGE as never once chosen because
  // AVOID tied it on scent and beat it on oil. Pricing them apart is what keeps
  // the snare a choice at all.
  avoid: 0.75,
  dodge: 1.25,
  /** Permanence costs more than getting past it once. GDD 2.7. */
  disarm: 1,
  /** Per doorway, and capped per room by difficulty rather than by oil. */
  focus: 0.5,
  /** FOCUS's cheaper, weaker sibling: lower price, later find gate. GDD 2.7. */
  search: 0.25,
  /** A clean exit is priced like the walk it is. GDD 2.8.1. */
  flee: 0.5,
  /** Refunded to net zero on a good roll, lost outright on a bad one. */
  rest: 0.5,
  // Free of oil beyond whatever the roll does to the world.
  use: 0,
  send: 0,
  enterPortal: 0,
  dropHeart: 0,
}

/**
 * What the band does to the price. GDD 2.6: "cost is margin, not injury."
 *
 * Multiplied into `OIL_PRICE`, so one shape serves every verb and a verb is
 * tuned by its base alone. Positive is spent, negative is returned.
 *
 *   criticalFailure  you paid three times over and still wear it
 *   failure          twice the price for nothing
 *   mixed            the signature band: you got it, at the asking price
 *   success          clean, and cheaper than you feared
 *   strongSuccess    a little oil back
 *   criticalSuccess  a little more
 *
 * WHY THE PAYOUT IS THIS SMALL. 1g's model paid a whole flask (4 oil,
 * `OIL.flaskValue`, a third of the lamp) at strongSuccess-or-better, and the
 * first version of that paid at mixed-or-better and was measured at +1.75 oil
 * per bloom — every hazard in the labyrinth an oil farm. Folding the reward into
 * the band delta (GDD 2.8, 18 Sep: "one number per band, not a base price plus a
 * conditional bonus") means the best possible outcome of a 1-oil action returns
 * 1 oil, so no amount of skill turns a hazard into income. The farming trap is
 * closed by the SHAPE this time rather than by a gate, which is why it cannot
 * come back the next time someone widens a band.
 */
export const BAND_OIL_MULTIPLIER: Record<OutcomeBand, number> = {
  criticalFailure: 3,
  failure: 2,
  mixed: 1,
  success: 0.5,
  // THE PAYOUT SIDE IS DELIBERATELY SMALLER THAN ITS MIRROR, and it is the one
  // number in this table that was changed by measurement rather than chosen.
  //
  // The first version was symmetric — -0.5 and -1, the exact negatives of
  // `success` and `mixed`. `npm run economy -- price` showed what that does at
  // the top of the stat curve: against a Trivial DC (MOVE, FOCUS) a character at
  // stat 16 or 18 lands in the paying bands often enough that the EXPECTED value
  // of the action turns positive — +0.07 oil per move at stat 18. A maxed
  // lanternbearer refilled their lamp by walking around, which is 1g's oil farm
  // wearing a different hat: not a gate set too low this time, but a payout
  // curve that beats its own cost curve once the dice stop being fair.
  //
  // Halving the two paying bands makes the expectation negative for every verb
  // at every stat (the panel prints the whole grid), while keeping what GDD 2.6
  // actually asks for: "strong/critical success can net you oil back". A great
  // roll still hands you something. It just cannot become an income.
  //
  // WHY NOT RAISE THE DCs INSTEAD, which would have worked too: MOVE and FOCUS
  // are authored at Trivial on purpose (GDD 2.6 — "routine actions must be
  // authored at Easy or Trivial"), and making walking a Moderate check to fix an
  // oil exploit would be tuning the wrong table.
  strongSuccess: -0.25,
  criticalSuccess: -0.5,
}

/**
 * Verbs whose oil cost is NOT the generic band curve above.
 *
 * Two of them, both because GDD 2.8.1 prices them as a stated rule rather than a
 * scaling: REST is "refunded to net 0 on a good roll; lost outright on a bad
 * one", which is a step function and not a slope — and it must never PAY, or
 * resting becomes the way to farm a lamp. USE and the other zero-priced verbs
 * need no row: zero times anything is zero.
 */
export const OIL_PRICE_OVERRIDE: Partial<Record<ActionKind, Record<OutcomeBand, number>>> = {
  rest: {
    criticalFailure: OIL_PRICE.rest,
    failure: OIL_PRICE.rest,
    mixed: 0,
    success: 0,
    strongSuccess: 0,
    criticalSuccess: 0,
  },
}

/**
 * The oil an action costs at this band. Positive spends, negative returns.
 *
 * THE ONE PLACE THIS IS COMPUTED. `resolve.ts` calls it for every action it
 * resolves, so a verb cannot acquire a second, quieter price somewhere in the
 * reducer — which is exactly how the old model ended up with a passive burn, an
 * `extraCost` table and a conditional flask reward all describing "what this
 * costs you" in three different places.
 */
/**
 * The smallest unit of oil the game keeps track of.
 *
 * TWO REASONS, and the second is the load-bearing one. The obvious one is
 * legibility: a base of 0.5 times a multiplier of 0.25 is an eighth, and a run
 * printing `+0.125 oil` at the player is offering a precision the status line
 * does not show and the decision does not need. Found by playing a run, which
 * is the only thing that ever finds this class of defect (1h finding 7).
 *
 * The real reason is that `GameState` must survive `JSON.parse(JSON.stringify())`
 * unchanged (CLAUDE.md 2.5) and replay bit-identically from `(seed, actionLog)`
 * (2.2). Accumulating binary fractions gets you 7.749999999999999 sooner or
 * later, and a lamp that reads 7.75 in one process and 7.749999999999999 in
 * another is a determinism bug that will surface as a replay divergence months
 * from now, in a telemetry report nobody can reproduce.
 */
export const OIL_QUANTUM = 0.05

/** Snaps an oil figure to `OIL_QUANTUM`, killing float dust. */
export function quantizeOil(value: number): number {
  return Math.round(value / OIL_QUANTUM) * OIL_QUANTUM + 0
}

export function oilCostFor(action: ActionKind, band: OutcomeBand): number {
  const override = OIL_PRICE_OVERRIDE[action]
  if (override) return quantizeOil(override[band])
  // `quantizeOil` also normalises -0, which a zero-priced verb produces at every
  // band with a negative multiplier (0 * -0.5 is -0, and Object.is(-0, 0) is
  // false) — it would survive `JSON.stringify` as `0` and compare unequal in a
  // test that round-tripped state, a difference visible nowhere except where it
  // matters.
  return quantizeOil(OIL_PRICE[action] * BAND_OIL_MULTIPLIER[band])
}

/**
 * One verb each companion does for free. GDD 2.9, built in 1i part 2.
 *
 * A DISCOUNT ON THE PRICE, NOT A CHANGE TO THE ODDS. The roll, the DC and
 * `STAT_AGNOSTIC_ACTIONS` membership are all untouched — the goblin has taken
 * plenty of traps apart and is no better at it than you are, it simply does not
 * cost you lamp oil to let it try. Same for the lumewing and a doorway.
 *
 * WHY THIS IS A TABLE HERE RATHER THAN AN ARGUMENT TO `oilCostFor`. That
 * function is a pure per-band price read, called from two places and from every
 * visualiser; a companion argument would put a creature into the price table's
 * signature and make every caller decide what to pass. Content is data
 * (CLAUDE.md 2.4), so the discount is a row, and `resolve.ts` checks it once at
 * the single call site where oil is actually charged.
 *
 * ZERO AT EVERY BAND, INCLUDING THE TWO THAT PAY. Read literally — a waived
 * charge, not a waived payout. That costs the player the +0.25/+0.5 a top-band
 * DISARM would have returned, which looks like a buff with a sting in it until
 * you price the alternative: `min(0, oilCostFor(...))` would keep the payouts
 * while removing every way to lose, making the expected value of the verb
 * strictly positive. That is 1i finding 1's oil farm rebuilt out of a companion
 * instead of a multiplier, and a bloom you can DISARM repeatedly is an income.
 * Flat zero cannot farm anything, by construction.
 */
export const COMPANION_FREE_VERB: Partial<Record<CreatureKind, ActionKind>> = {
  goblin: 'disarm',
  lumewing: 'focus',
}

/** True when this companion waives this verb's oil entirely. See COMPANION_FREE_VERB. */
export function companionWaivesOil(companion: CreatureKind | null, action: ActionKind): boolean {
  return companion !== null && COMPANION_FREE_VERB[companion] === action
}

// ---------------------------------------------------------------------------
// Status effects — GDD 2.8.2
// ---------------------------------------------------------------------------

export const STATUS = {
  /**
   * Confused SUPPRESSES tells for this many turns — no tells at all.
   * It does not scramble movement (a failed MOVE roll already does that) and it
   * does not scramble tell directions (that would break "tells never lie").
   */
  confusedTurns: 2,
} as const

// ---------------------------------------------------------------------------
// Hazards, on entry — GDD 2.8
// ---------------------------------------------------------------------------

/**
 * The saving throw a hazard demands the moment you walk into its room.
 *
 * PORTALS ARE ABSENT ON PURPOSE. Standing in a portal room does nothing to you;
 * ENTER PORTAL is a choice, and its roll is ACTION_DC.enterPortal. A hazard that
 * fires on entry is one you can be forced into, which is why the pit-free-route
 * invariant exists and why a portal — which relocates rather than harms — is not
 * one of these.
 */
export const ENTRY_HAZARDS: readonly HazardKind[] = ['pit'] as const

/**
 * Hazards that open a VERB CHOICE instead of resolving themselves.
 *
 * GDD 2.8, built in step 1g. Bloom and snare used to sit in `ENTRY_HAZARDS`
 * alongside the pit: one fixed stat, one roll, no decision, the moment you
 * crossed the threshold. They now dispatch through `legalActions` exactly the
 * way a creature encounter does, and the coverage matrix is the point —
 *
 *   | hazard  | options                | covers        | no option |
 *   | creature| FIGHT / TAME / SNEAK   | STR, INT, AGI | —         |
 *   | bloom   | FORCE / ENDURE         | STR, INT      | AGI       |
 *   | snare   | AVOID / DODGE          | INT, AGI      | STR       |
 *   | pit     | none                   | —             | all       |
 *
 * — so that every build has a hazard type it is weak against and no single
 * stat is a free pass through the whole labyrinth.
 *
 * THE PIT IS NOT HERE, and that is the design rather than an omission: it is
 * the only instant-loss check in the game, a pit-free route to the Heart is
 * guaranteed at every difficulty (CLAUDE.md 3), and giving it a verb would make
 * the one absolute thing in the labyrinth negotiable.
 *
 * PORTALS ARE ABSENT FROM BOTH LISTS on purpose. Standing in a portal room does
 * nothing to you; ENTER PORTAL is a choice and its roll is ACTION_DC.enterPortal.
 */
export const VERB_HAZARDS: readonly HazardKind[] = ['sporeBloom', 'snareCarving'] as const

/** An action that answers a hazard. GDD 2.7, 2.8. */
export type HazardVerb = 'force' | 'endure' | 'avoid' | 'dodge' | 'disarm'

export const HAZARD_VERBS: readonly HazardVerb[] = ['force', 'endure', 'avoid', 'dodge', 'disarm'] as const

/**
 * Verbs that take no stat modifier at all. GDD 2.7, decided in 1i.
 *
 * DISARM is the only member, and being a member is the whole design of it. GDD
 * 2.7 left "stat-gated or stat-agnostic" open and leaned agnostic "so it doesn't
 * disturb the existing every-stat-has-exactly-one-hazard-it-can't-touch design";
 * this is what agnostic has to mean in a d20 game to actually deliver that.
 *
 * WHY NOT GIVE IT A STAT. Any stat would hand one build a universal answer to
 * both verb hazards, which is precisely the coverage-matrix break the tests in
 * `tests/hazards.test.ts` assert against. The tempting version — DISARM tests
 * the stat the hazard has NO answer for, AGI on blooms and STR on snares — is
 * genuinely nice design and is exactly the invariant revision this step was told
 * not to make on its own; it is written up in the decisions log as the option
 * that was considered and declined.
 *
 * WHAT MAKES IT A TRADE RATHER THAN A FREE WIN, given it dodges the -0/-1 every
 * other verb carries: its DC is Moderate where every other hazard verb is Easy
 * (`ACTION_DC`). At the new starting stat of 10 that is 45% mixed-or-better
 * against FORCE's 65%, and it costs more oil for the privilege. You are paying
 * for permanence with a worse roll, not buying it with a better one.
 */
export const STAT_AGNOSTIC_ACTIONS: readonly ActionKind[] = ['disarm'] as const

export function isStatAgnostic(action: ActionKind): boolean {
  return STAT_AGNOSTIC_ACTIONS.includes(action)
}

/**
 * Which verbs each hazard offers, in menu order.
 *
 * This table IS the coverage matrix above. `legalActions` reads it rather than
 * branching on the hazard kind, so adding a hazard type means adding a row here
 * and nowhere else — and `HAZARD_VERB_STAT` below is what makes the "stat with
 * no option" column true rather than aspirational.
 */
export const VERBS_FOR_HAZARD: Partial<Record<HazardKind, readonly HazardVerb[]>> = {
  // DISARM rides alongside each hazard's own pair rather than replacing either:
  // GDD 2.7 puts it "available alongside FORCE/ENDURE and AVOID/DODGE". It is
  // last in menu order because it is the expensive option, and a menu reads as
  // cheap-to-dear.
  sporeBloom: ['force', 'endure', 'disarm'],
  snareCarving: ['avoid', 'dodge', 'disarm'],
}

/**
 * The stat each hazard verb tests.
 *
 * MUST agree with `ACTION_STAT` below; `tests/tuning.test.ts` asserts it, for
 * the same reason `ACTION_STAT` is asserted against `ENCOUNTER_STAT` in
 * creatures.ts — two tables describing one fact is exactly the drift CLAUDE.md
 * 2.4 warns about. This one exists so the coverage matrix can be checked as
 * data instead of by reading a comment.
 */
export const HAZARD_VERB_STAT: Partial<Record<HazardVerb, StatKey>> = {
  force: 'str', //  shoulder through it
  endure: 'int', // know what it is doing to you and stand there anyway
  avoid: 'int', //  read the mechanism before it triggers
  dodge: 'agi', //  wriggle free after it does
  // DISARM is deliberately ABSENT, and its absence is the data that makes it
  // stat-agnostic — see STAT_AGNOSTIC_ACTIONS. A row here would be a build with
  // a universal answer to every verb hazard, which is the one thing the coverage
  // matrix exists to prevent.
}

export const HAZARD_DC: Partial<Record<HazardKind, number>> = {
  // Easy, not Moderate. A pit is the only instant-loss check in the game, a
  // pit-free route to the Heart is guaranteed at every difficulty, and the draft
  // tell is honest — so the player who lands in one chose to or explored blind.
  // At starting stats (AGI 8, mod -1) this still kills 40% of the time. Whether
  // that is the right BALANCE number is for 1g's sim; it is a defensible
  // correctness floor until something measures it.
  pit: DC.easy,
  // Bloom and snare are deliberately absent since 1g: they no longer roll a
  // save on entry, they offer a verb, and a verb's DC lives in ACTION_DC with
  // every other verb's. Leaving a second, unused difficulty for them here is
  // how the two would drift apart the first time one was tuned.
}

export const HAZARD_STAT: Partial<Record<HazardKind, StatKey>> = {
  pit: 'agi', // dodging the lip. The only hazard that still tests a stat you did not choose.
}

/**
 * What a hazard does to you, band by band. MECHANICS ONLY — the prose lives in
 * data/outcomes.ts (`HAZARD_NARRATION`), keyed by the same bands. The two
 * tables must agree: a pit at `failure` is fatal here, so the failure line
 * there has to end the run.
 *
 * `extraTurns` is the snare's currency: it does not hurt you, it EATS THE CLOCK,
 * which against a 20-turn limit is its own kind of damage and keeps the three
 * entry hazards mechanically distinct (pit kills, bloom blinds, snare delays).
 */
export interface HazardOutcome {
  /** Ends the run outright. Pits only — see CLAUDE.md 3. */
  readonly fatal: boolean
  /**
   * `damage`, `oilLoss` and `rewardFlasks` are all GONE, 18 Sep 2026.
   *
   * Health is retired (GDD 2.6) and oil is no longer something a hazard row
   * decides on its own: every action's oil moves through `oilCostFor`, so a
   * hazard verb's cost and its payout are the same number seen from two ends.
   * A row that could still subtract oil here would be a second, quieter price
   * for the same verb — which is the drift CLAUDE.md 2.4 exists to stop.
   *
   * What a hazard row still owns is what oil cannot express: the CLOCK and the
   * STATUS. Those are the two currencies the verbs actually differ in.
   */
  readonly extraTurns: number
  readonly applies: StatusEffect | null
  /**
   * Turns the status in `applies` lasts. Read ONLY when `applies` is non-null.
   *
   * A per-band duration rather than the single `STATUS.confusedTurns` constant
   * because ENDURE's whole cost model is that margin shortens Confused instead
   * of shortening the clock — the variable Force spends on turns, Endure spends
   * here. `STATUS.confusedTurns` remains the baseline these rows are written
   * against, not a value any of them has to equal.
   */
  readonly statusTurns: number
}

/**
 * What a hazard does to you on ENTRY, band by band — pits only, now.
 *
 * MECHANICS ONLY; the prose lives in data/outcomes.ts (`HAZARD_NARRATION`),
 * keyed by the same bands. The two tables must agree: a pit at `failure` is
 * fatal here, so the failure line there has to end the run.
 */
export const HAZARD_OUTCOMES: Partial<Record<HazardKind, Record<OutcomeBand, HazardOutcome>>> = {
  /**
   * BINARY SINCE 18 Sep 2026. Pass and you are through unhurt; fail and the run
   * ends. GDD 2.8.
   *
   * The pit used to have a Mixed Success survive-band — you caught the lip, lost
   * a point of health and two oil — and it was the one hazard in the game with
   * partial credit. It went with health: "you caught the lip and it cost you
   * some lamp oil" is not a thing that happens to someone falling into a hole,
   * and once injury stopped existing there was no honest currency left for a
   * near-miss to be paid in. So the pit is now what it has always been described
   * as in play, and every band above `failure` is the same row.
   *
   * It pays NOTHING for being survived, at any band, and that stays true for the
   * original reason: there is nothing in the hole to earn. You did not beat it,
   * you failed to fall in.
   */
  pit: {
    criticalFailure: { fatal: true,  extraTurns: 0, applies: null, statusTurns: 0 },
    failure:         { fatal: true,  extraTurns: 0, applies: null, statusTurns: 0 },
    mixed:           { fatal: false, extraTurns: 0, applies: null, statusTurns: 0 },
    success:         { fatal: false, extraTurns: 0, applies: null, statusTurns: 0 },
    strongSuccess:   { fatal: false, extraTurns: 0, applies: null, statusTurns: 0 },
    criticalSuccess: { fatal: false, extraTurns: 0, applies: null, statusTurns: 0 },
  },
}

/**
 * What each hazard VERB costs and earns, band by band. GDD 2.8, step 1g.
 *
 * Read the two bloom rows together — they are one decision, written twice:
 *
 *   FORCE  loud, STR. Confused ALWAYS applies, at full duration, whatever you
 *          roll. What margin buys is TIME: two turns, or one on a strong
 *          success. You pay in blindness for the chance to pay less in clock.
 *   ENDURE quiet, INT. Time is FLAT at two turns — standing through a bloom
 *          never gets faster. What margin buys is the Confused duration, and it
 *          never reaches zero. INT answers a bloom; it never walks out clean.
 *
 * That floor of 1 is deliberate and it is the whole reason this table is shaped
 * this way. As first specified, INT covered Creature (Tame), Bloom (Endure) and
 * Snare (Avoid) — full coverage, no weak matchup, while STR and AGI were each
 * walled out of a hazard, and INT already owns taming, the game's central
 * mechanic. Letting a clean Endure cancel Confused outright would have made INT
 * the safe generalist stat. Shortening it instead keeps the answer real and the
 * cost real. See claude/design-decisions.md, 17 Sep 2026.
 *
 * And the snare rows, which are a cleaner split because nothing lingers:
 *
 *   AVOID  INT. You see it coming, so failure means it still closes on you and
 *          eats the clock — the snare's own currency (it delays, it does not
 *          kill).
 *   DODGE  AGI. You react after it triggers, so failure costs blood as well as
 *          time, and success is faster than reading your way round it.
 *
 * `extraTurns` is ON TOP of the action's base cost of 1.
 */
export const HAZARD_VERB_OUTCOMES: Record<HazardVerb, Record<OutcomeBand, HazardOutcome>> = {
  // ---- spore bloom -------------------------------------------------------
  force: {
    criticalFailure: { fatal: false, extraTurns: 1, applies: 'confused', statusTurns: 3 },
    failure:         { fatal: false, extraTurns: 1, applies: 'confused', statusTurns: 2 },
    mixed:           { fatal: false, extraTurns: 1, applies: 'confused', statusTurns: 2 },
    success:         { fatal: false, extraTurns: 1, applies: 'confused', statusTurns: 2 },
    // GDD 2.8: "margin sets how many turns it costs (2, or 1 on a strong
    // success)". This row and the one below it ARE that sentence.
    strongSuccess:   { fatal: false, extraTurns: 0, applies: 'confused', statusTurns: 2 },
    criticalSuccess: { fatal: false, extraTurns: 0, applies: 'confused', statusTurns: 2 },
  },
  endure: {
    // extraTurns is 1 in EVERY row: flat, by design. Enduring never buys clock.
    criticalFailure: { fatal: false, extraTurns: 1, applies: 'confused', statusTurns: 3 },
    failure:         { fatal: false, extraTurns: 1, applies: 'confused', statusTurns: 3 },
    mixed:           { fatal: false, extraTurns: 1, applies: 'confused', statusTurns: 2 },
    success:         { fatal: false, extraTurns: 1, applies: 'confused', statusTurns: 2 },
    // The floor. Never 0 — see the header.
    strongSuccess:   { fatal: false, extraTurns: 1, applies: 'confused', statusTurns: 1 },
    criticalSuccess: { fatal: false, extraTurns: 1, applies: 'confused', statusTurns: 1 },
  },
  // ---- snare-carving -----------------------------------------------------
  //
  // The snare split used to be "AVOID pays in clock, DODGE pays in blood", and
  // blood is gone. It is now "AVOID pays in clock, DODGE pays in oil" — and the
  // oil half lives in `OIL_PRICE` (avoid 0.75, dodge 1.25) rather than in these
  // rows, because oil has exactly one road into the ledger now. What is left
  // here is the clock, which is AVOID's currency alone.
  avoid: {
    criticalFailure: { fatal: false, extraTurns: 2, applies: null, statusTurns: 0 },
    failure:         { fatal: false, extraTurns: 1, applies: null, statusTurns: 0 },
    mixed:           { fatal: false, extraTurns: 0, applies: null, statusTurns: 0 },
    success:         { fatal: false, extraTurns: 0, applies: null, statusTurns: 0 },
    strongSuccess:   { fatal: false, extraTurns: 0, applies: null, statusTurns: 0 },
    criticalSuccess: { fatal: false, extraTurns: 0, applies: null, statusTurns: 0 },
  },
  dodge: {
    // Faster than reading your way round it when it works — one turn back at the
    // bottom where AVOID loses two, which is what "reacts after it fires" buys.
    criticalFailure: { fatal: false, extraTurns: 1, applies: null, statusTurns: 0 },
    failure:         { fatal: false, extraTurns: 0, applies: null, statusTurns: 0 },
    mixed:           { fatal: false, extraTurns: 0, applies: null, statusTurns: 0 },
    success:         { fatal: false, extraTurns: 0, applies: null, statusTurns: 0 },
    strongSuccess:   { fatal: false, extraTurns: 0, applies: null, statusTurns: 0 },
    criticalSuccess: { fatal: false, extraTurns: 0, applies: null, statusTurns: 0 },
  },
  /**
   * DISARM — one row shape for both hazards, because it does the same thing to
   * each: takes it out of the room for good (GDD 2.7).
   *
   * It costs the clock on a botch like AVOID does, and it applies Confused on a
   * bloom exactly as FORCE and ENDURE do — you are still standing in spores
   * while you pull it apart. `resolve.ts` only applies `applies` when the hazard
   * it is answering can produce that status, so this single row serves a snare
   * without handing the player a Confused they could not have got from a snare.
   */
  disarm: {
    criticalFailure: { fatal: false, extraTurns: 2, applies: 'confused', statusTurns: 3 },
    failure:         { fatal: false, extraTurns: 1, applies: 'confused', statusTurns: 2 },
    mixed:           { fatal: false, extraTurns: 1, applies: 'confused', statusTurns: 2 },
    success:         { fatal: false, extraTurns: 0, applies: 'confused', statusTurns: 2 },
    strongSuccess:   { fatal: false, extraTurns: 0, applies: 'confused', statusTurns: 1 },
    criticalSuccess: { fatal: false, extraTurns: 0, applies: 'confused', statusTurns: 1 },
  },
}

/**
 * Bands at which a DISARM actually removes the hazard.
 *
 * Mixed-or-better, the same gate a clearing has always had — GDD 2.6 is explicit
 * that Mixed means you got what you wanted and it cost you something, and a
 * DISARM that failed to disarm at the signature band would make the widest good
 * band a failure in disguise. A botched DISARM still gets you PAST the hazard
 * (the encounter clears, as it does for every verb); what it does not do is take
 * the thing out of the room.
 */
export function disarmClears(band: OutcomeBand): boolean {
  return band !== 'criticalFailure' && band !== 'failure'
}

// ---------------------------------------------------------------------------
// Assorted action effects — GDD 2.7, 2.8.1
// ---------------------------------------------------------------------------

/**
 * REST no longer heals, because there is nothing to heal (GDD 2.6). What it buys
 * is its own price back: 0.5 oil on a bad roll, nothing on a good one, and never
 * a profit — see `OIL_PRICE_OVERRIDE.rest`. The world keeps turning through it;
 * nothing in this game pauses, and REST did not become the first thing that does.
 */

/**
 * The band at or above which `SEARCH` turns up what is in the room.
 *
 * FOCUS's weaker sibling, in the one currency a find can be weak in: SEARCH used
 * to pay out at mixed-or-better like everything else, and GDD 2.7 asks for
 * "loot at lower reliability" to match its lower price. Success-or-better is
 * that — 45% at the new starting stat against a DC 8, where mixed-or-better
 * would be 65%.
 */
export const SEARCH_FIND_BAND: OutcomeBand = 'success'

// ---------------------------------------------------------------------------
// Difficulty — GDD 2.6
// ---------------------------------------------------------------------------

/**
 * Base DC per action. (Room archetype and hazard context were once meant to
 * override these from data/outcomes.ts; as of 1f that file carries PROSE only,
 * and no DC is read from it. If per-archetype DCs are wanted, they belong here.) Routine actions sit at Trivial/Easy on purpose: a fresh
 * character (mod -1) only reaches Mixed-or-better 40% of the time against a
 * Moderate 12, so Moderate is reserved for genuine risk.
 */
export const ACTION_DC: Record<ActionKind, number> = {
  move: DC.trivial,
  /**
   * FOCUS is Trivial, where LISTEN was, and for the same reason: what it returns
   * is the tell list, and the tell list is honest at every band (CLAUDE.md 3).
   * A FOCUS ALWAYS resolves its doorway — the band scales what the looking cost
   * you, never whether you were told the truth. Making a bad FOCUS return less
   * information would be probabilistic tells wearing a different hat, and GDD
   * 2.8.1 rejects those in as many words.
   */
  focus: DC.trivial,
  search: DC.easy,
  // The four hazard verbs all sit at Easy, and they sit at the SAME Easy.
  //
  // Easy because that is where the hazard saves they replace already sat, for
  // the reason given above HAZARD_DC — a hazard you can be forced into must not
  // be authored at a DC that punishes a route you had no way to avoid. (FORCE
  // was at Moderate through 1f; that was a placeholder for a door-forcing verb
  // that never existed. GDD 2.7 settles what FORCE is actually for.)
  //
  // The same Easy for both options on a hazard because the CHOICE is not meant
  // to be between an easy answer and a hard one — it is between two cost models
  // (see HAZARD_VERB_OUTCOMES). Making one verb cheaper to roll as well as
  // cheaper to pay would collapse the decision into a single right answer for
  // whichever stat you happened to raise.
  force: DC.easy,
  endure: DC.easy,
  avoid: DC.easy,
  dodge: DC.easy,
  /**
   * The ONE hazard verb that is not Easy, and the exception proves the rule
   * above rather than breaking it. The same-Easy rule exists so the choice
   * between two verbs is a choice between two COST MODELS and never between an
   * easy option and a hard one. DISARM is not one of that pair — it is a third
   * thing offered alongside them, it carries no stat modifier at all
   * (STAT_AGNOSTIC_ACTIONS), and it buys something neither of them can. Moderate
   * is what stops "no stat modifier" from meaning "strictly better odds than the
   * verb you were supposed to be choosing between".
   */
  disarm: DC.moderate,
  sneak: DC.easy,
  fight: DC.moderate,
  tame: DC.moderate,
  flee: DC.easy,
  use: DC.trivial,
  send: DC.easy,
  enterPortal: DC.hard,
  rest: DC.trivial,
  /** Never rolled — free and unconditional (GDD 2.9.1). Present so the record is total. */
  dropHeart: DC.trivial,
}

/**
 * Which stat each action tests.
 *
 * The four encounter options MUST agree with ENCOUNTER_STAT in creatures.ts;
 * tests/resolve.test.ts asserts they do, because two tables describing one fact
 * is exactly the drift CLAUDE.md 2.4 warns about — this one exists only because
 * resolve.ts needs the other nine verbs as well.
 */
export const ACTION_STAT: Record<ActionKind, StatKey> = {
  move: 'agi',
  focus: 'int', // reading a doorway for what it is, not merely that it is
  search: 'int',
  // These four MUST equal HAZARD_VERB_STAT; tests/tuning.test.ts asserts it.
  // They are the coverage matrix: bloom has no AGI answer, snare has no STR one.
  force: 'str',
  endure: 'int',
  avoid: 'int',
  dodge: 'agi',
  // DISARM's entry is never READ — `isStatAgnostic` short-circuits it in
  // `rollForAction` before this table is consulted — but the record is total by
  // type, and a lie here would be worse than a value nothing uses. INT is what
  // it would test if it tested anything.
  disarm: 'int',
  sneak: 'agi',
  fight: 'str',
  tame: 'int',
  flee: 'agi',
  use: 'agi',
  send: 'agi',
  enterPortal: 'int',
  rest: 'str',
  dropHeart: 'str', // never rolled
}

export const PORTAL = {
  /**
   * How deep into the NEW labyrinth a portal drops you, at minimum.
   *
   * Never the entrance. A portal that could land you on the way out would make
   * it a free escape rather than a gamble, and the whole point is that you trade
   * everything you have charted for a fresh, unknown position and a Wumpus that
   * has lost your scent entirely.
   */
  minLandingDistance: 3,
} as const

// ---------------------------------------------------------------------------
// The Wumpus — GDD 2.10
// ---------------------------------------------------------------------------

export interface TierProfile {
  readonly name: string
  /** Moves once every N turns. */
  readonly moveEveryNTurns: number
  /** Rooms out to which it can sense scent. */
  readonly perceptionRadius: number
  /** Turns it remembers the player's last known room after losing the trail. */
  readonly memoryTurns: number
  readonly takesPortals: boolean
  /** Moves toward the entrance while the player carries the Heart. */
  readonly anticipatesExit: boolean
}

export const WUMPUS = {
  /**
   * The mandatory adjacency stench fires out to this many rooms. GDD 2.10.
   *
   * WIDENED FROM 1 TO 2 on 18 Sep 2026, and it is a PRESENTATION-LAYER FLOOR
   * rather than a perception radius: it fires whatever the tier's own
   * `perceptionRadius` is, including for a Drowsing Wumpus that has not noticed
   * the player at all. It is what CLAUDE.md 3's "a player who holds still is
   * always warned" now means in rooms.
   *
   * IT IS ALSO THE COMPENSATION FOR `FOCUS`. Making identity cost a turn and a
   * price makes the base game blinder than the always-on directional tells it
   * replaced; without a wider floor, first contact with the Wumpus would read as
   * unfair instead of tense. The two changes are one change and must not be
   * tuned apart — narrowing this back to 1 without restoring free directional
   * tells would put the game somewhere neither design intended.
   *
   * What it does NOT promise: that you can never be caught unwarned. Walk into a
   * room that happens to sit two from the Wumpus and nothing leaked at your last
   * room, because it was three away. That is the price of exploring blind.
   */
  mandatoryStenchRadius: 2,
} as const

export const WUMPUS_TIERS: Record<WumpusTier, TierProfile> = {
  1: { name: 'Drowsing', moveEveryNTurns: 3, perceptionRadius: 1, memoryTurns: 0, takesPortals: false, anticipatesExit: false },
  2: { name: 'Stirring', moveEveryNTurns: 2, perceptionRadius: 2, memoryTurns: 0, takesPortals: false, anticipatesExit: false },
  3: { name: 'Hunting',  moveEveryNTurns: 1, perceptionRadius: 3, memoryTurns: 3, takesPortals: false, anticipatesExit: false },
  4: { name: 'Ravening', moveEveryNTurns: 1, perceptionRadius: 4, memoryTurns: 3, takesPortals: true,  anticipatesExit: true },
}

// ---------------------------------------------------------------------------
// Scent — GDD 2.10
// ---------------------------------------------------------------------------

/**
 * Scent the player leaves in the room they acted in. The Wumpus navigates
 * toward the strongest trail within its perception radius.
 *
 * This table IS the fight/tame asymmetry: FIGHT rings a dinner bell, TAME
 * barely whispers. If one option ever becomes strictly better, fix these
 * weights and the turn costs below — do not remove the choice (CLAUDE.md 3).
 */
export const SCENT_BY_ACTION: Record<ActionKind, number> = {
  move: 1,
  /** Inherits LISTEN's weight: holding still at a doorway, quieter than walking. */
  focus: 0.5,
  search: 1.5,
  // The hazard verbs split loud/quiet on exactly the fight/tame line, decided
  // 18 Sep 2026 and written into GDD 2.10's scent paragraph.
  //
  // FORCE is the loud half: you shoulder through a bloom and the labyrinth
  // hears it. Placed between FLEE (2) and FIGHT (4) — louder than running,
  // quieter than a brawl, because a bloom does not shriek back.
  force: 3,
  // ENDURE, AVOID and DODGE are the quiet half, anchored to values that already
  // exist rather than inventing a third tier. ENDURE is SNEAK-quiet because you
  // do not move at all; AVOID and DODGE are TAME-quiet because you do, carefully
  // or quickly. Nothing here may rise above TAME without reopening the
  // fast-and-loud-vs-slow-and-quiet invariant (CLAUDE.md 3).
  endure: 0.25,
  avoid: 0.5,
  dodge: 0.5,
  // Taking a trap apart is patient work, not loud work — it sits with the quiet
  // half. It is above ENDURE because you are handling the thing rather than
  // standing still in it, and below FORCE because nothing gets shouldered.
  disarm: 0.5,
  sneak: 0.25,
  fight: 4,
  tame: 0.5,
  flee: 2,
  use: 1,
  send: 0, // the marker lands in the TARGET room — see COMPANION.sendScent
  enterPortal: 0, // the trail does not follow you through
  rest: 0.5,
  // Setting the Heart down is the quietest thing you can do while holding it —
  // it is the deposit MULTIPLIER this action cancels (HEART.carryScentMultiplier),
  // and cancelling it while still laying a full marker would undo the point.
  dropHeart: 0.25,
}

export const SCENT = {
  /** Nominal lifetime of a trail, in turns. Documentation for decayFactor. */
  decayTurns: 3,
  /**
   * Multiplied into every room's scent each turn. 0.37 (~1/e) leaves about 5%
   * of a deposit after `decayTurns`.
   *
   * Exponential rather than linear on purpose: it preserves the ORDERING of
   * trails, so a fight stays louder than a sneak for as long as both exist.
   * A linear rate would make loud actions linger absurdly (a 4-weight fight
   * outlasting the whole run) or quiet ones vanish instantly.
   */
  decayFactor: 0.37,
  /** Below this a trail is deleted outright, keeping the field sparse and JSON small. */
  epsilon: 0.02,
  /** Added on top of the action's weight when the roll is a critical failure. */
  criticalFailureBonus: 2,
  /** Taking the Heart is the loudest thing in the game. */
  heartTaken: 6,
} as const

// ---------------------------------------------------------------------------
// Creatures and companions — GDD 2.9
// ---------------------------------------------------------------------------

export const ENCOUNTER = {
  /** Fighting is FAST and loud. */
  fightTurnCost: 1,
  /** Taming is SLOW and quiet. The whole tension lives in this difference. */
  tameTurnCost: 2,
  companionSlots: 1,
} as const

export const TAME_DC: Record<CreatureKind, number> = {
  goblin: DC.easy,
  lumewing: DC.moderate,
  grellhound: DC.moderate,
  quietOne: DC.hard,
}

/**
 * How well the send went. GDD 2.9, 18 Sep 2026.
 *
 * SUPERSEDES THE 17 Sep TIERING, which keyed the decoy's strength to the tamed
 * creature's DC (10 for goblin/lumewing/grellhound, 5 for the Quiet One). That
 * made the escape valve's strength a function of a tame roll you made several
 * turns ago and possibly had no choice about — you bait the Wumpus with whatever
 * you managed to catch, not with whatever you would have picked. The roll you
 * make NOW decides it instead, which is both simpler to reason about and the
 * only version where executing the send well is a thing you can do.
 */
export type SendQuality = 'good' | 'bad'

export function sendQualityFor(band: OutcomeBand): SendQuality {
  return band === 'criticalFailure' || band === 'failure' ? 'bad' : 'good'
}

/** Scent a sent companion drops in the target room. GDD 2.9 */
export function sendScentFor(band: OutcomeBand): number {
  return COMPANION.sendScent[sendQualityFor(band)]
}

/** Turns that decoy is expected to out-smell the player. Derived; see COMPANION. */
export function sendDecoyTurnsFor(band: OutcomeBand, carryingHeart: boolean): number {
  const pair = COMPANION.sendDecoyTurns[sendQualityFor(band)]
  return carryingHeart ? pair.carryingHeart : pair.alone
}

/**
 * The grellhound's warning, escalating as the thing closes. GDD 2.9, 1i part 2.
 *
 * WHAT THE REWORK IS ACTUALLY BUYING, because it is not the escalation. The
 * universal mandatory stench floor is radius 2 and already directional
 * (`WUMPUS.mandatoryStenchRadius`, `stenchDirections`), free to every player
 * with or without a companion — so at radius 2 and 1 this table reports doorways
 * the game has already named. THE NEW INFORMATION IS ENTIRELY THE OUTER BAND:
 * one room past where the free floor reaches at all. Everything inside it is
 * earlier, louder narration of a fact the player already had, which is worth
 * having and is not what makes the tame worth a companion slot.
 *
 * Bands rather than one boolean because the hound is the game's early-warning
 * system and a warning that says the same thing at three rooms and at one is not
 * a warning system, it is a light that is on. Ordered nearest-first; read it
 * with `grellhoundWarningFor`.
 */
export type GrellhoundWarningBand = 'urgentBark' | 'lowGrowl' | 'raisedEars'

export const GRELLHOUND_WARNING: readonly {
  readonly maxDistance: number
  readonly band: GrellhoundWarningBand
}[] = [
  { maxDistance: 1, band: 'urgentBark' },
  { maxDistance: 2, band: 'lowGrowl' },
  { maxDistance: 3, band: 'raisedEars' },
] as const

/** Which band a Wumpus at this many rooms produces, or null for out of range. */
export function grellhoundWarningFor(distance: number): GrellhoundWarningBand | null {
  if (distance <= 0) return null
  for (const row of GRELLHOUND_WARNING) {
    if (distance <= row.maxDistance) return row.band
  }
  return null
}

export const COMPANION = {
  /**
   * Skittish companions bolt on a CRITICAL FAILURE — the band where the world
   * escalates (GDD 2.6). Replaces "bolts on damage taken", which died with
   * health; see `TameOutcome.skittish`.
   *
   * The original reasoning survives the change and is why the trigger is the
   * critical band rather than any failure: failed rolls are common (over a third
   * even at the new starting stat), so tying flight to them would make a Mixed
   * Success tame worthless, and Mixed is meant to be the widest good band rather
   * than a booby prize.
   */
  skittishFleesOnCriticalFailure: true,
  /** Fortune points spent to keep a bolting skittish companion. GDD 2.9 */
  skittishFortuneSave: 1,
  /**
   * A sent companion drops this much scent in the target room, keyed by how hard
   * the creature was to tame (see sendTierFor). Read it with sendScentFor().
   *
   * The decoy is PURE SCENT — there is no "the Wumpus is distracted" flag, and
   * there must not be one. The bait works by out-smelling the player's own trail
   * inside the existing perception model, which keeps SEND legible in the
   * hunt/tame visualisers. A special-case lock would make SEND the only thing in
   * the game the Wumpus AI knows about by name.
   *
   * THE TWO VALUES ARE THE SAME TWO VALUES the 17 Sep tiering derived; what
   * changed is what selects between them. The arithmetic is unchanged and still
   * load-bearing: a decoy dominates for as long as `sendScent * decayFactor^n`
   * exceeds the player's freshest deposit, and solving that for the turn counts
   * GDD 2.9 promises gives 3-turns-without-Heart ∈ (7.3, 14.6] and
   * 2-turns-without ∈ (2.7, 7.3]. 10 and 5 sit in those bands, and each carries
   * its Heart-halved case with it for free — which is why "3/2 on a good roll,
   * 2/1 on a bad one" is a shape the scent math can actually produce.
   *
   * (3-without / 1-with remains ARITHMETICALLY IMPOSSIBLE under one shared
   * decayFactor, and the factor must stay shared or the Wumpus would perceive
   * different trails fading at different physical rates. That constraint is why
   * the pairs below are 3/2 and 2/1 and not something rounder.)
   *
   * Its duration is arithmetic, not a setting: see sendDecoyTurns.
   */
  sendScent: { good: 10, bad: 5 } as Record<SendQuality, number>,
  /**
   * Turns the decoy is expected to out-smell the player. DERIVED, not free —
   * one pair per roll quality, each split by whether the player is carrying the
   * Heart (which doubles their own deposit, so it halves the decoy's lead).
   *
   * tests/creatures.test.ts asserts all four cases against the decay model, so
   * changing sendScent without changing these fails the build rather than
   * quietly making GDD 2.9's "3 turns on a good send" a lie.
   */
  sendDecoyTurns: {
    good: { alone: 3, carryingHeart: 2 },
    bad: { alone: 2, carryingHeart: 1 },
  } as Record<SendQuality, { readonly alone: number; readonly carryingHeart: number }>,
  /** A sent companion NEVER returns. Not a tunable — see CLAUDE.md 3. */
  sendIsPermanent: true,
  /** Oil per turn to keep a skittish companion fed and calm. */
  skittishUpkeepOil: 1,
  lumewingLanternBonus: 1,
  goblinSearchBonus: 2,
  /** Chance per turn a goblin companion turns up a point of oil. GDD 2.9 */
  goblinScroungeChance: 0.1,
  goblinScroungeOil: 1,
  /**
   * How far the grellhound's warning reaches. DERIVED from `GRELLHOUND_WARNING`
   * so the outermost band and the radius cannot disagree — adding a fourth band
   * widens the query that feeds it, rather than requiring someone to remember
   * that two numbers describe one thing.
   *
   * It was 2 and was doing nothing there: the mandatory stench floor moved to 2
   * on 18 Sep 2026 and is directional already, so the hound's whole passive was
   * a second copy of a free tell. Raised to 3 in 1i part 2, which is where the
   * value is — see `GRELLHOUND_WARNING`.
   */
  grellhoundWarningRadius: Math.max(...GRELLHOUND_WARNING.map((b) => b.maxDistance)),
  /** Multiplier on the player's scent output while the Quiet One follows. */
  quietOneScentMultiplier: 0.5,
} as const

// ---------------------------------------------------------------------------
// Encounter outcome bands — GDD 2.9
// ---------------------------------------------------------------------------

/**
 * The MECHANICAL consequence of each band. Prose is data/outcomes.ts; these
 * tables say only what changes in the world. The four encounter verbs are
 * SUBJECT-LED over there — the creature is what the sentence is about, so they
 * get band-only prose and no archetype axis.
 *
 * `extraScent` is added ON TOP of SCENT_BY_ACTION for the action taken, so the
 * fight/tame asymmetry survives every band: a clean tame is still quieter than
 * a clean fight, and a botched tame is loud precisely because it stopped being
 * a tame. Nothing here may invert that ordering (CLAUDE.md 3).
 */
export interface TameOutcome {
  readonly tamed: boolean
  /**
   * A companion brave enough to be sent as bait. Strong success or better.
   *
   * This was criticalSuccess-only until 17 Sep 2026, which made SEND
   * unreachable: a critical needs margin >= +12, so at starting stats (INT 8,
   * mod -1) the maximum possible total is 19 and P(brave) was 0% on every
   * creature — SEND did not fire once in 150 sweep runs, for the beat the GDD
   * calls "the single most important design beat in the game".
   *
   * Widening to strongSuccess gives a progression curve (20% on a goblin at
   * INT 8, 5% on the Quiet One at INT 18). It is only half the fix: the Quiet
   * One's Hard DC still rarely clears Strong Success, so resolve.ts also floors
   * a natural 20 on a successful tame to brave. That half cannot live here —
   * resolveEncounter only ever receives the resolved band, never the natural
   * roll. See GDD 2.9.
   */
  readonly brave: boolean
  /**
   * Mixed success: costs oil to keep, and bolts when a roll comes apart.
   *
   * The bolt trigger MOVED in 1i. It was "the player takes damage", and there is
   * no damage any more (GDD 2.6) — leaving it there would have shipped a GDD
   * line that nothing could ever fire. It is now a critical failure on any roll:
   * the band GDD 2.6 already defines as "the world escalates", which is the
   * nearest thing the new economy has to the old trigger's meaning, and rare
   * enough (~5% at the new starting stat against an Easy DC) that a Mixed tame
   * is still worth having. Gautham's call, 1i.
   */
  readonly skittish: boolean
  /** It turns on you and stays in the room. */
  readonly hostile: boolean
  /** It leaves the room entirely — the creature is gone from the labyrinth. */
  readonly bolts: boolean
  readonly extraScent: number
  /** A strong success knows this place: adjacent rooms revealed. */
  readonly revealsRooms: number
}

export const TAME_OUTCOMES: Record<OutcomeBand, TameOutcome> = {
  // It shrieks. 0.5 + 3.5 = 4 — exactly a FIGHT's worth of noise, which is the
  // point: a tame that fails this badly has become the thing you were avoiding.
  criticalFailure: { tamed: false, brave: false, skittish: false, hostile: true,  bolts: false, extraScent: 3.5, revealsRooms: 0 },
  // Bolts noisily. 0.5 + 1.5 = 2, a FLEE's worth. Turn wasted, creature gone.
  failure:         { tamed: false, brave: false, skittish: false, hostile: false, bolts: true,  extraScent: 1.5, revealsRooms: 0 },
  mixed:           { tamed: true,  brave: false, skittish: true,  hostile: false, bolts: false, extraScent: 0,   revealsRooms: 0 },
  success:         { tamed: true,  brave: false, skittish: false, hostile: false, bolts: false, extraScent: 0,   revealsRooms: 0 },
  strongSuccess:   { tamed: true,  brave: true,  skittish: false, hostile: false, bolts: false, extraScent: 0,   revealsRooms: 1 },
  criticalSuccess: { tamed: true,  brave: true,  skittish: false, hostile: false, bolts: false, extraScent: 0,   revealsRooms: 0 },
}

export interface FightOutcome {
  /** The creature is driven off and removed from the labyrinth. */
  readonly driven: boolean
  readonly extraScent: number
  /**
   * `damage` and `rewardFlasks` both retired 18 Sep 2026.
   *
   * FIGHT's oil reward was the one number in 1g that nothing ever measured — no
   * sweep policy fought, so `earned driving off a creature` came back 0.00 per
   * run at every setting tried, and its strongSuccess-or-better gate was the
   * conservative guess rather than an observation. The question it left open —
   * should FIGHT pay from mixed up, the way TAME pays its companion from mixed
   * up? — is answered by the new model without anyone having to settle it:
   * every action's band carries its own oil delta now (`BAND_OIL_MULTIPLIER`),
   * so a FIGHT and a TAME are paid on exactly the same curve and the asymmetry
   * between them is back where CLAUDE.md 3 wants it, in the turn cost and the
   * scent.
   */
}

export const FIGHT_OUTCOMES: Record<OutcomeBand, FightOutcome> = {
  // 4 + 2 = 6 — a botched fight is the loudest thing short of taking the Heart.
  criticalFailure: { driven: false, extraScent: 2 },
  failure:         { driven: false, extraScent: 0 },
  // The signature band: you won, and it cost you a point of health.
  mixed:           { driven: true, extraScent: 0 },
  // FIGHT's gate is set to match the hazard verbs' — strongSuccess and above —
  // and it is the one reward number in this pass that NOTHING MEASURED IT.
  // Neither sweep policy ever fights, so `earned driving off a creature` came
  // back 0.00 per run at every difficulty and every setting tried. Aligning it
  // with the hazards is the conservative choice, not an observed one; the
  // argument for mixed+ instead is that TAME pays its companion from mixed up,
  // and a FIGHT that pays a band later is a FIGHT that is worse at the band
  // where most wins happen. 1i's heuristic bot has to fight and tame on purpose
  // before anyone can settle this.
  success:         { driven: true, extraScent: 0 },
  strongSuccess:   { driven: true, extraScent: 0 },
  criticalSuccess: { driven: true, extraScent: 0 },
}

export interface SneakOutcome {
  /** True if the player slips past into the room they were headed for. */
  readonly passed: boolean
  readonly extraScent: number
}

export const SNEAK_OUTCOMES: Record<OutcomeBand, SneakOutcome> = {
  criticalFailure: { passed: false, extraScent: 2 },
  failure:         { passed: false, extraScent: 0.75 },
  // Through, but not silently — 0.25 + 0.75 = 1, no quieter than walking.
  mixed:           { passed: true, extraScent: 0.75 },
  success:         { passed: true, extraScent: 0 },
  strongSuccess:   { passed: true, extraScent: 0 },
  criticalSuccess: { passed: true, extraScent: 0 },
}

export interface FleeOutcome {
  /** True if the player retreats to the room they came from. */
  readonly fled: boolean
  readonly extraScent: number
}

export const FLEE_OUTCOMES: Record<OutcomeBand, FleeOutcome> = {
  criticalFailure: { fled: false, extraScent: 1 },
  failure:         { fled: false, extraScent: 1 },
  mixed:           { fled: true, extraScent: 0 },
  success:         { fled: true, extraScent: 0 },
  strongSuccess:   { fled: true, extraScent: 0 },
  criticalSuccess: { fled: true, extraScent: 0 },
}

// ---------------------------------------------------------------------------
// World drift — GDD 2.9.1
// ---------------------------------------------------------------------------

/**
 * WITHIN A RUN, exactly two things move: the creatures, and the Wumpus.
 *
 * The terrain does not. Hazards are fixed at generation and stay where they
 * were put, so a map the player charts stays accurate about the dangerous
 * rooms for the whole run. That is what makes "return to a labyrinth you
 * mapped" (GDD 2.11) reward the right thing: you keep the hazards, and what
 * you lose is the living half — the Wumpus has moved and the creatures have
 * wandered. Blooms spreading is a BETWEEN-RUNS change, not a per-turn one.
 *
 * Drift resolves at step 7 of the turn order — the last thing before the next
 * turn's tells are read — so a tell can never describe a pre-drift world.
 *
 * One placement rule is load-bearing rather than tuning: nothing drifts into
 * an occupied room. One thing per room is what keeps a doorway's tells
 * unambiguous, and drift must not undo what generation promises.
 */
export const DRIFT = {
  /**
   * Chance per untamed creature per turn to step to an adjacent empty room.
   *
   * Deliberately low. At a high rate the skittering tell degenerates into
   * noise — knowing a creature is east is worthless if it will not be east
   * when you arrive. A quarter means a tell acted on immediately is usually
   * still true, while a map charted ten turns ago is not.
   */
  creatureMoveChance: 0.25,
  /**
   * Multiplier on the rate, per difficulty.
   *
   * Drowsing is ZERO on purpose. It is the teaching tier (GDD 2.10) and a
   * player learning what `skittering` means cannot learn it in a world where
   * the thing has moved by the time they arrive — the tells would read as
   * arbitrary, which is exactly what "tells never lie" exists to prevent.
   * A static first difficulty is the tutorial, not a missing feature.
   */
  byDifficulty: { drowsing: 0, stirring: 1, hunting: 1, ravening: 1.5 } as Record<Difficulty, number>,
} as const

// ---------------------------------------------------------------------------
// World population — GDD 2.8
// ---------------------------------------------------------------------------

/** Inclusive [min, max] counts per generated labyrinth. */
export const HAZARD_COUNTS: Record<HazardKind, readonly [number, number]> = {
  pit: [6, 9],
  sporeBloom: [4, 6],
  snareCarving: [4, 6],
  portal: [3, 4],
}

export const POPULATION = {
  /**
   * Ambient oil flasks on the floor. Was [8, 12] through 1f; cut in 1g, and cut
   * together with the hazard reward rather than on its own, because the two are
   * one number wearing two hats — oil income — and sizing either alone solves
   * for it while breaking the other.
   *
   * MEASURED, not chosen. `SWEEP=300 npm run hazard -- oil stirring`, with the
   * reward paying at strongSuccess-or-better, varying only this pair:
   *
   *   ambient   found/run   earned/run   EARNED share   escape%   oil left, 18+ turn runs
   *   [8, 12]      0.47        0.22          32.0%       18.7%          4.83
   *   [5,  8]      0.31        0.23          42.5%       20.0%          4.77
   *   [3,  5]      0.18        0.23          55.7%       20.3%          4.24
   *
   * (Forager policy — the only one that searches. A router never picks an
   * ambient flask up at all, so its earned share is 100% at every setting.)
   *
   * [3, 5] is the first setting where the economy actually leans on EARNED oil
   * rather than found oil, which is what Gautham asked for, and the win rate and
   * the oil budget's shape are flat across the whole range — the cost of the cut
   * is inside the noise at n=300. The lever is genuinely free; what it changes
   * is where oil comes from, not how much of it there is.
   *
   * THE HONEST CAVEAT: a flask on the floor is only found by a player standing
   * on it who then spends a turn and a point of oil on SEARCH. At [3, 5] over a
   * 100-room map against a ~12-room path, blind searching finds almost nothing,
   * which makes SEARCH weaker — and SEARCH is already one of the five verbs 1f
   * found rolls for nearly nothing. If 1i's sim says SEARCH has stopped being
   * worth a turn, this number is the first place to look, not the last.
   */
  oilFlasks: [3, 5] as const,
  creatures: [8, 12] as const,
  /** Graves from the player's own earlier runs. GDD 2.16 */
  maxGraves: 4,
} as const

// ---------------------------------------------------------------------------
// The Heart — GDD 2.10
// ---------------------------------------------------------------------------

export const HEART = {
  /**
   * The Heart is LOUD. Carrying it multiplies every scent deposit.
   *
   * This is the answer to "why not just retrace my steps" (GDD 2.9.1 — it is
   * the third world drift, the one that changes you rather than the map): the way
   * out crosses the same rooms but poses a different problem, because you are
   * now laying a hot trail down a corridor the Wumpus is already moving toward.
   */
  carryScentMultiplier: 2,
  /** Tiers the Wumpus jumps when the Heart leaves its plinth (capped at 4). */
  tierEscalation: 1,
  /** Turns the Wumpus knows the player's exact position after the Heart is taken. */
  revealTurns: 1,
} as const

// ---------------------------------------------------------------------------
// Lookups
// ---------------------------------------------------------------------------

/** The oil band containing `oil`. Throws if the band table has a gap. */
export function oilBandFor(oil: number): OilBand {
  const clamped = Math.max(0, Math.min(OIL.max, Math.floor(oil)))
  const band = OIL_BANDS.find((b) => clamped >= b.min && clamped <= b.max)
  if (!band) throw new Error(`oilBandFor: no band covers oil=${clamped} — OIL_BANDS has a gap`)
  return band
}

// ---------------------------------------------------------------------------
// Difficulty — a contract on GENERATION, not merely a Wumpus tier
// ---------------------------------------------------------------------------

/**
 * `safeRoutes` counts hazard-free routes from the entrance to the Heart:
 *   0 — no route avoids every hazard; a bloom, snare or creature is unavoidable
 *   1 — one such route exists, but blocking a single room on it closes them all
 *   2 — at least two meaningfully distinct hazard-free routes
 *
 * `minSafeDetour` is how many EXTRA moves the safe route costs. Without it the
 * safe route is usually free, everyone takes it, and hazards stop being a
 * decision — which is what the first 5x5 generator actually produced.
 */
export interface DifficultyContract {
  readonly wumpusTier: WumpusTier
  readonly safeRoutes: 0 | 1 | 2
  readonly minSafeDetour: number
  readonly heartDistance: readonly [number, number]
  /**
   * Where the Wumpus starts, as a distance band from the entrance — a
   * GUARANTEE, exactly like heartDistance, not a preference.
   *
   * The floor keeps it off the player at turn one. The CEILING is the part that
   * was missing: with only a floor, a 10x10 grid placed it a mean of 11 rooms
   * away, and a tier-1 Wumpus covers 6 rooms in 20 turns. It was unreachable in
   * 83% of Drowsing seeds and 63% of Stirring ones — the teaching tier could not
   * teach the tell it exists to teach. tests/generate.test.ts now asserts every
   * ceiling sits inside its tier's reach, so this cannot regress silently.
   *
   * The band compensates for tier SPEED so the thing arrives at all; the tier
   * then decides how bad that is. Drowsing is tighter because tier 1 moves once
   * every three turns; the other three share a band and escalate purely through
   * perception and move rate.
   */
  readonly wumpusStartDistance: readonly [number, number]
  readonly maxTurns: number
  /**
   * How many doorways a room is worth `FOCUS`ing, for the whole run. GDD 2.7.
   *
   * THE SECOND AXIS DIFFICULTY NOW OWNS. Through 1h, difficulty was a contract
   * on GENERATION alone — how the labyrinth is built. This makes it a contract
   * on INFORMATION too: at Drowsing and Stirring you may resolve all four
   * doorways if you can afford the turns, and at Hunting and Ravening you get
   * exactly one and have to guess the rest.
   *
   * That is a deliberate repositioning and it pairs with the turn caps above:
   * the two easy difficulties are an oil-management puzzle with time to look
   * around, and the two hard ones are a turn-pressure puzzle where looking
   * around is the thing you cannot afford. Naming it here rather than leaving it
   * to be discovered as an inconsistency later.
   */
  readonly focusesPerRoom: number
}

/**
 * TURNS WENT FROM A FLAT 20/20/20/18 TO 50/45/40/35 on 18 Sep 2026, and the
 * shape of the change matters more than the size. Turn pressure is no longer
 * uniform: Drowsing and Stirring are deliberately generous so that OIL is the
 * thing being managed, and Hunting and Ravening tighten back down so the clock
 * is the dominant threat again, stacked on a faster and more perceptive Wumpus.
 *
 * `heartDistance`, `safeRoutes` and `minSafeDetour` were all sized against the
 * old 18-20 turn budget and were re-measured in 1i rather than carried over —
 * see PHASE-1-PROGRESS for the numbers and what moved.
 */
export const DIFFICULTY: Record<Difficulty, DifficultyContract> = {
  drowsing: { wumpusTier: 1, safeRoutes: 2, minSafeDetour: 2, heartDistance: [5, 6], wumpusStartDistance: [4, 6], maxTurns: 50, focusesPerRoom: 4 },
  stirring: { wumpusTier: 2, safeRoutes: 1, minSafeDetour: 3, heartDistance: [6, 7], wumpusStartDistance: [5, 8], maxTurns: 45, focusesPerRoom: 4 },
  hunting:  { wumpusTier: 3, safeRoutes: 0, minSafeDetour: 0, heartDistance: [7, 7], wumpusStartDistance: [5, 8], maxTurns: 40, focusesPerRoom: 1 },
  // Harder through pressure, not distance: a deeper Heart only adds corridors,
  // whereas fewer turns bites on every decision in the run at once. The start
  // band is shared with stirring and hunting on purpose — a tier-4 Wumpus
  // placed identically is a far worse problem than a tier-2 one.
  ravening: { wumpusTier: 4, safeRoutes: 0, minSafeDetour: 0, heartDistance: [7, 7], wumpusStartDistance: [5, 8], maxTurns: 35, focusesPerRoom: 1 },
}

/**
 * How far the Wumpus can travel inside the turn budget at a given difficulty.
 * A start band whose ceiling exceeds this places a monster that cannot arrive.
 */
export function wumpusReach(difficulty: Difficulty): number {
  const contract = DIFFICULTY[difficulty]
  return Math.floor(contract.maxTurns / WUMPUS_TIERS[contract.wumpusTier].moveEveryNTurns)
}

export const DEFAULT_DIFFICULTY: Difficulty = 'stirring'

/**
 * INVARIANT, not a tunable — see CLAUDE.md 3.
 * A pit-free route to the Heart must exist at EVERY difficulty. A pit is an
 * instant-loss check, so forcing one means a run can end to a die roll the
 * player had no way to avoid. Blooms, snares and creatures may be forced
 * because failing them costs you without ending you.
 */
export const PIT_FREE_ROUTE_REQUIRED = true
