# Phase 1 — progress

Running notes for a phase that spans many sessions. `docs/ROADMAP.md` says what Phase 1 *is*; this says how far in we are and what the next session should pick up.

**Last updated:** 17 Sep 2026, end of step 1d (creatures, plus the Wumpus start-distance fix in `generate.ts`). Sessions are now one per step — see below.

**Doc lock:** none. *(If this says otherwise, STOP before writing to `docs/GDD.md`, this file, or `docs/ROADMAP.md` — see "Doc lock" below.)*

## Where we are

| Step | State | What landed |
|---|---|---|
| 1a · tuning constants | **done** | `src/engine/data/tuning.ts` — every tunable number, each citing its GDD section |
| 1b · labyrinth generation | **done** | `src/engine/generate.ts`, `scripts/map.ts`, difficulty contracts. Wumpus start became a per-difficulty band in the 1d session — see finding 3 |
| 1c · the Wumpus | **done** | `src/engine/wumpus.ts`, `scripts/hunt.ts` |
| 1d · creatures | **done** | `src/engine/creatures.ts`, `scripts/tame.ts`, GDD §2.9.1 written |
| 1e · resolve | **next** | the reducer — turn order is already specified in GDD §2.2.2 |
| 1f · outcomes table | pending | `(archetype × action × band)`, with a coverage test |
| 1g · text renderer + agent harness | pending | built to `docs/EVALS.md` requirements |

180 tests. `npm test`, `npm run typecheck`, both clean.

## One session per step

**Each step of Phase 1 gets its own fresh session, named for that step** — `SE 1d — creatures`, `SE 1e — resolve`, and so on. The name should match the `label` in `docs/dev-log.json` so the session list and the log line up.

This is measured, not a preference. The first long session covering Phase 0 through 1c ran 438 turns and 36.2M effective tokens, of which **79% was re-reading the growing conversation and 0.1% was every tool result put together**. Context per turn grew from 87k to 678k; the last quarter cost nearly four times the first for the same number of turns. A new session starts at ~87k, so a step-sized session runs roughly 8x cheaper per turn.

**Second measurement, from this session.** Step 1d ran 155 assistant turns and **6.78M effective tokens — 43.8k per turn**, against the 678k/turn the long session had climbed to by its end. That is roughly 15x cheaper per turn, and the whole step cost less than a quarter of what the Phase 0–1c session did. The split was 60.5% cache reads, 27% cache writes, 12.5% output; raw input was 310 tokens, which is to say essentially all of the cost is carrying context, not receiving instructions. The claim above is now measured twice rather than once.

Starting fresh is only cheap because this repo can orient a session that knows nothing. That is what `CLAUDE.md`, `docs/GDD.md` and this file are for — keep them current, and the cost of closing a session stays near zero.

**Opening a step session:**

```
Read CLAUDE.md, docs/GDD.md, docs/PHASE-1-PROGRESS.md and docs/EVALS.md.
Execute Phase 1 step <N>. Stop at its exit criteria.
Build a visualiser for the subsystem before writing its tests.
```

**Closing one — do this before the session ends, not after:**

1. Update this file's step table and the carried-forward notes.
2. Add a session object to `docs/dev-log.json`: hours, tests before/after, commits, and every defect with what found it.
3. **Harvest the token counts.** Ask Claude to read the session transcript at `~/.claude/projects/<project>/<session>.jsonl` and sum `input_tokens`, `cache_read_input_tokens`, `cache_creation_input_tokens` and `output_tokens` across the assistant turns. The container is ephemeral — once the session is gone, so is the file, and the numbers are unrecoverable.
4. `npm run devlog`, commit, push.

## Doc lock, for concurrent sessions

A PM session (design decisions, roadmap, progress notes) and a code session (implementing a step) can be open at the same time, and both write to `docs/GDD.md`, this file, and `docs/ROADMAP.md`. Neither surface merges — whichever session writes last wins, and silently discards whatever the other one wrote, even mid-sentence inside the same paragraph. This happened for real on 17 Sep: a PM session's SEND-decision writeup was overwritten by a Wumpus-fix code session's own close-out write, twice, with no error either time — it looked like every commit had succeeded.

**The rule:** before a multi-edit doc-writing sequence — more than a one-line status flip; a design decision folded into GDD + this file + `claude/design-decisions.md`, or a phase close-out — set the **Doc lock** line at the top of this file to `Locked by <PM/code>, <what it's editing>, <date/time>`, and clear it back to `none` the moment the sequence is done. Before writing to `docs/GDD.md`, this file, or `docs/ROADMAP.md`, check that line first. If it's locked, stop and surface it to Gautham rather than overwriting — don't guess whether the other session is still running.

A single-line update (marking a step done, correcting one number) doesn't need the lock. It's the multi-file, multi-edit sequences that collide, because they leave the file in an inconsistent state for several tool calls in a row.

**Not every clobber is another session. Read the file back and check.** During the 1d close-out this file was found reverted to a copy several hours stale, PM writeup and all — and the obvious reading, that a concurrent session had overwritten it, was wrong. The cause was local: a Cowork session stages a file to a scratch path and then asks the bridge to copy that path onto disk, and the copy can read the **previous** contents of that path rather than the bytes just written to it. The write succeeds and reports success; it simply carries an older version. Two files staged to the same scratch path in one session is all it takes, and a close-out does exactly that.

So: **stage each revision to a fresh path**, never reuse one within a session, and after any write to `docs/GDD.md`, this file, or `docs/ROADMAP.md`, read it back and confirm a phrase you just wrote is present. A byte count is enough. This is also the likeliest explanation for the two earlier incidents blamed on session collision, which means the lock above is worth keeping but was never the thing that would have saved them.

## The two tools, and what they are for

Neither is a toy. Each caught a real defect that tests did not.

**`npm run map -- <seed> <count> [difficulty]`** — a labyrinth as ASCII, with its difficulty contract checked at the bottom. Reading ten of these is how you judge whether generation is *interesting*, which no assertion can tell you.

**`npm run hunt -- <seed> <tier> [difficulty]`** — a scripted player walks to the Heart and back while the scent field decays and the Wumpus closes. Cells are `[what is there][how it smells]`.

**`npm run tame -- <seed> [difficulty] [tier] [policy]`** — runs the identical seed twice, once fighting everything and once taming everything, and puts the two columns side by side. `SWEEP=n npm run tame -- <seed> …` aggregates over `n` seeds instead of printing runs. Panels A and B are static tables (the band-by-band cost of each option; the exact d20 probability of each tame band per creature per INT) and cost nothing to read.

What they found:
- **Generation produced unwinnable seeds.** No cap on Heart distance meant 7.1% of maps needed a round trip longer than the turn limit. Fixed with a distance *band*; there is now a test named "never generates an arithmetically unwinnable run".
- **68.7% of seeds forced the player across a hazard** with no alternative. Fixed with the place/measure/repair pass and the difficulty contracts.
- **A Tier 4 Wumpus walked past a player it could smell** to go and guard the entrance. Guarding now only applies when it has lost the trail.
- **The player walked clean through the Wumpus.** One catch check after the Wumpus moves is not enough — GDD §2.2.2 now specifies two.
- **A brave companion is unobtainable at starting stats, so `SEND` has never once fired.** See the 1d findings below.
- **The Wumpus started too far away to reach you** in 83% of Drowsing seeds and 63% of Stirring ones — a start distance with a floor and no ceiling. Fixed with a per-difficulty band; the numbers are below.
- **Retreating the way you came is worse than ignoring the stench.** Measured, not assumed. The braid loops are the counterplay.

Build the equivalent tool for each remaining step. It has paid for itself every time.

## What 1d landed

- `src/engine/creatures.ts` — encounters, the four options and their band tables, companion passives, `SEND`, world drift. Pure; the module owns no state and does not advance the turn, so `resolve.ts` wires it in the GDD §2.2.2 order.
- `scripts/tame.ts` — the visualiser, plus a `SWEEP=n` aggregate mode.
- `tests/creatures.test.ts` — 59 tests. Six invariant assertions were mutation-checked and all fail when the code is deliberately broken: record-order determinism, brave-band gating, fight/tame scent ordering, terrain stability under drift, hostility travelling with the creature, and the hostile tame gate.
- **GDD §2.9.1 written.** It did not exist. Three places referenced it (§2.2.2 step 7, the ROADMAP's Phase 1 line, and a comment in `tuning.ts`) and the only spec anywhere was nine words in the ROADMAP.
- `tuning.ts` gained `TAME_OUTCOMES`, `FIGHT_OUTCOMES`, `SNEAK_OUTCOMES`, `FLEE_OUTCOMES` and `DRIFT`. The mechanical consequence of a band lives here; 1f layers prose on top.
- `Room` gained `creatureHostile`. It is the only type change 1d made.

### Decisions taken in 1d, all reversible

- **A creature may wander onto the player; it does not trigger an encounter.** The encounter stays bound to *entering* a room. By step 7 the player's turn has already resolved, so a forced encounter would spend a turn they never took.
- **Within a run, only creatures move. The terrain is fixed.** Hazards stay where generation put them, so a charted map keeps telling the truth about where the pits are; what decays is the living half. Blooms spreading is the *between-runs* half of the §2.11 promise, not a per-turn one. A test asserts the whole hazard layout is byte-identical after 60 drift passes at every difficulty, which subsumes the pit-free invariant — drift cannot create a pit because it cannot create any hazard.
- **Drowsing does not drift at all**, and draws no randomness doing it. It is the teaching tier; a world that moves while you are learning what a tell means makes the lesson unlearnable.
- **Step 7 is reordered: drift first, then companion passives.** A grellhound resolving before a creature wandered in would report a labyrinth that no longer exists — a companion whose whole job is honest information, lying. GDD §2.2.2 updated.
- **Informational passives are queries, not stored effects** (grellhound reveal and growl, lumewing radius). This satisfies §2.9's "must land before the player chooses" by construction rather than by an ordering rule. It does split §2.9's "one rule for all five creatures" — flagged, not hidden.
- **Hostility is persistent, and it travels with the creature.** A critically failed tame sets `Room.creatureHostile`, and `encounterOptions()` then drops `TAME` from the menu — fight it, slip past it, or run. `driftWorld` carries the flag along when the creature wanders; a hostile flag stranded in a vacated room would be a bug, and there is a test that follows one angry goblin around the map asserting exactly one room is ever flagged. This is the only band that leaves a live, untamed creature standing in front of you: plain `failure` bolts it, `mixed` and up tame it, and every `FIGHT` at mixed-or-better drives it off.

## 1d findings — three real defects, none of them in 1d's own code

Finding 3 is fixed (in `generate.ts`, where it belonged). Findings 1 and 2 are now decided (17 Sep) but not yet implemented — see below for the exact code changes a 1d-fix or 1e session needs to make.

Numbers are from `SWEEP=60 npm run tame`, scripted shortest-route player, starting stats.

**1. `SEND` has never fired. Not once, in 150 runs.** *(Decided 17 Sep 2026 — see below. Not yet implemented.)*

A brave companion requires a critical-success tame — margin ≥ +12. At starting stats (INT 8, mod −1) the maximum possible total is 19, so:

| creature | tame DC | P(brave) at INT 8 | at INT 12 | at INT 18 |
|---|---|---|---|---|
| goblin | 8 | **0%** | 10% | 25% |
| lumewing | 12 | **0%** | 0% | 5% |
| grellhound | 12 | **0%** | 0% | 5% |
| quietOne | 16 | **0%** | **0%** | **0%** |

The Quiet One can never be brave at any stat. Sweeps recorded `0/60` brave companions at drowsing, stirring and ravening alike. The GDD calls `SEND` "the single most important design beat in the game" and "the escape valve that makes a Tier 4 Wumpus survivable" — and it is currently reachable only by spending a Fortune point to bump a strong success, which is an undocumented coupling rather than a design.

Two levers were costed. **(a)** move brave down to `strongSuccess` or better — one cell in `TAME_OUTCOMES` — giving 20% on a goblin at INT 8, 10% on a grellhound at INT 12, 5% on the Quiet One at INT 18, i.e. a progression curve. **(b)** brave on a natural 20 of any successful tame — a flat 5% at every stat and every creature, simpler but with no growth.

**Decided 17 Sep 2026: both (a) and (b), together.** (a) alone leaves the Quiet One permanently un-brave even at max INT, which is backwards given `SEND` is billed as mattering most against exactly the kind of run where you didn't get to pick your creature. (b) alone flattens the curve and severs `SEND` from stat investment. Full reasoning in `claude/design-decisions.md` (project). `docs/GDD.md` §2.9's outcome table is updated to match.

**Left for 1e — not a standalone 1d-fix, see below for why:**
- `src/engine/data/tuning.ts`: flip `TAME_OUTCOMES.strongSuccess.brave` to `true`; update the stale comment on `TameOutcome.brave` ("Only a critical success yields…"). This half has no dependency on 1e and could be done standalone.
- The natural-20 override **cannot live in `creatures.ts`.** `resolveEncounter(action, band, context, rng)` only ever receives the already-resolved `band` — deliberately, per its own doc comment, so Fortune has a settled roll to react to before the band is final. The natural die value (`RollResult.natural` from `dice.ts`) and the band only coexist in `resolve.ts`, which step 1e builds. So this override belongs in 1e's `tame` handling: after calling `resolveEncounter('tame', band, …)`, if `rollResult.natural === 20` and `result.companionGained !== null`, set `companionGained.brave = true` before writing it to state.
- `tests/creatures.test.ts`: move the brave-band-gating mutation-check from `criticalSuccess` to `strongSuccess` (this part doesn't depend on resolve.ts). The nat-20-override test belongs in 1e's own new `tests/resolve.test.ts`, not in `creatures.test.ts` — `resolveEncounter` never sees the natural roll, so it can't be the thing under test for that case.

**Why this rides along with 1e instead of a separate 1d-fix session:** the `TAME_OUTCOMES` flip is one line either way, but the nat-20 piece structurally requires the roll→band→`resolveEncounter` wiring that 1e is building anyway — spinning up a fresh session just to add three lines next to code 1e is about to touch is more overhead than it saves. Fold both SEND fixes into 1e's own deliverables.

Settled separately: `SEND` is *not* a tutorial mechanic. At Drowsing the Wumpus moves once every three turns and starts ~10 rooms away, so there is nothing to bait, and teaching the irreversible button in a context where it accomplishes nothing trains players to read it as routine. Fix reachability globally, not for Drowsing.

**2. `SEND` is weakest exactly when it is needed.** *(Decided 17 Sep 2026 — see below. Not yet implemented.)*

The decoy is pure scent (deliberately — no "distracted" flag on the Wumpus). `COMPANION.sendScent = 5` against `SCENT.decayFactor = 0.37`:

- versus a walking player (deposit 1): the decoy dominates for **2 turns**
- versus a player **carrying the Heart** (deposit 2, via `HEART.carryScentMultiplier`): **1 turn**

GDD §2.9 promises "2–3 turns". `COMPANION.sendDecoyTurns` has been corrected from 3 to 2, and `tests/creatures.test.ts` now derives it from `sendScent` so the two cannot drift apart again. But the deeper problem stands: the multiplier that makes the escape hard also neutralises the valve meant to survive it. Three turns while carrying would need `sendScent ≈ 15`.

**Decided 17 Sep 2026: `sendScent` becomes a two-value lookup keyed by the creature's tame DC, not one flat constant.**

Solving `sendScent × decayFactorⁿ > deposit` for the turn counts wanted shows the achievable pairs don't overlap: hitting 3-turns-without-Heart forces `sendScent ∈ (7.3, 14.6]`, which forces 2-turns-with-Heart; hitting 1-turn-with-Heart forces `sendScent ∈ (2.7, 5.4]`, which caps out at 2-turns-without-Heart. **3-without / 1-with is mathematically impossible under one shared `decayFactor`** — and it should stay shared, since a per-creature decay rate would mean the Wumpus perceives different creatures' trails fading at different physical rates, breaking `creatures.ts`'s own "tuned by this one number" doc comment.

| Tier | Creatures | `sendScent` | Without Heart | With Heart |
|---|---|---|---|---|
| Easy / Moderate (DC 8, 12) | goblin, lumewing, grellhound | **10** (was 5) | 3 turns | 2 turns |
| Hard (DC 16) | quietOne | **5** (unchanged) | 2 turns | 1 turn |

`sendScent = 10` lands goblin/lumewing/grellhound exactly on the "2–3 turns" GDD originally promised. The Quiet One keeps its current value and current 2/1 behaviour — not a shortfall, but the only internally-consistent way to keep "1 turn while carrying the Heart" for a Hard-DC creature. Full derivation in `claude/design-decisions.md` (project). `docs/GDD.md` §2.9's `SEND` paragraph is updated to match.

**Left for 1e (or a standalone fix, this one has no resolve.ts dependency):**
- `src/engine/data/tuning.ts`: replace `COMPANION.sendScent = 5` with a lookup off `TAME_DC` (e.g. `sendScent: (dc: number) => dc <= DC.moderate ? 10 : 5`, or an explicit per-creature table). `sendCompanion` in `creatures.ts` already has `context.creature`/`companion.kind` in scope, so threading the lookup through is a small change, not a signature rework.
- `COMPANION.sendDecoyTurns` (currently one derived constant, 2) becomes two derived pairs, one per tier — update its doc comment and whatever test asserts the single value.
- `tests/creatures.test.ts`: extend the sendScent/sendDecoyTurns consistency check to cover both tiers and both Heart states (4 cases instead of 1).

**3. The Wumpus usually could not reach you at the lower tiers.** *(FIXED.)*

`GENERATION.minWumpusStartDistance = 5` was a floor with no ceiling. On a 10×10 grid that put the Wumpus a mean of 11 rooms from the entrance, against tier reaches of 6 to 18 rooms. Measured over 300 seeds with a scripted route-walking player, *ever gets adjacent* / *ever catches you*:

| difficulty | tier | reach | before | after |
|---|---|---|---|---|
| drowsing | 1 | 6 | 9% adj / 4% caught | **51% / 33%** |
| stirring | 2 | 10 | 21% / 16% | **61% / 48%** |
| hunting | 3 | 20 | 33% / 27% | **64% / 58%** |
| ravening | 4 | 18 | 37% / 31% | **71% / 67%** |

`wumpusStartDistance` is now a per-difficulty band on `DifficultyContract`, alongside `heartDistance`: drowsing `[4,6]`, the other three `[5,8]`. The band compensates for tier *speed* so the thing arrives; the tier then decides how bad that is. Drowsing needs a tighter band because tier 1 moves once every three turns. `GENERATION.minWumpusStartDistance` is gone — two sources of truth for one number is the drift `CLAUDE.md` §2.4 warns about.

First contact now lands around turn 6.5–7.1 at every difficulty, which is when the player lifts the Heart. That shape was not tuned for; it falls out of the start band overlapping the Heart band, and it is the one the GDD asks for — the escape is the hard part, not the approach.

Two placements were tested and rejected. Banding on distance from the *Heart* worked about as well but is harder to reason about. Seeding the Wumpus near the entrance→Heart corridor scored highest on adjacency (88%) but pulled first contact forward to turn 4.9 — it ambushes you on the way in, which is the wrong shape at any rate.

**The counterplay result, which is the part worth reading.** Adjacency is set by placement, so it is identical for every player. The catch rate is not. Same 300 seeds, same placement, three one-line policies:

| difficulty | ignores the stench | backs off the way it came | **sidesteps into a loop** |
|---|---|---|---|
| drowsing | 33% | 45% | **27%** |
| stirring | 48% | 60% | **35%** |
| hunting | 58% | 63% | **43%** |
| ravening | 67% | 70% | **43%** |

Two things follow. First, **the tells have real mechanical value** — one rule cuts deaths by roughly a third, and by 24 points at Ravening. The catch rates above are the tell-ignored floor, not the expectation; the naive player never listens, sneaks, detours, keeps a companion or spends Fortune.

Second, and better: **retreating the way you came is worse than ignoring the warning entirely.** That is not a bug. You are backing down your own scent trail into a thing that navigates by scent, and standing in the hottest-smelling room nearby. It is exactly what the `GENERATION.braidRatio` comment predicted — "escaping means retracing your exact steps into whatever is following you. Braiding adds loops so the player can circle around" — and it is now measured rather than asserted. The loops are the counterplay, and the engine punishes the obvious wrong instinct without anyone having coded that punishment.

Caveat: all of this is a scripted shortest-route player with a one-line reaction. 1g's heuristic bot is the real arbiter, and it should beat all three columns.

### Two softer observations, for the 1g sim to settle

- **Taming may still dominate fighting, but by much less than first measured.** The first sweep (before the hostile gate, before bloom drift was removed, and before the Wumpus start band) read 80% escape vs 68% at stirring. After the first two changes it read **75% vs 72%**; after the start band, **48% vs 47%** — the placement fix dominates everything else, because a Wumpus that can actually arrive kills both policies equally, with the gap on damage and noise also narrowed. Do not read that as "the hostile gate fixed it" — removing bloom drift changed how much randomness each turn consumes, so every seed now produces a different run and the two sweeps are not directly comparable. What is fair to say: the gap is small enough that the 1g sim, not a scripted policy, has to settle it. Mean encounters per run is still only 0.5–1.2, so the sample of actual decisions is thin either way.
- **The encounter fires about once per run.** 8–12 creatures over 100 rooms against a ~12-room path. The GDD wants "a genuine dilemma every single encounter"; at this density that is one dilemma per run, for the system billed as the game's second system and its warmth.

## Invariants the next session must not quietly break

All in `CLAUDE.md` §3, but these have been tested against and are easy to erode:

- **Tells never lie.** Darkness restricts *range*; Confused *suppresses*. Neither ever makes a reported tell false.
- **A pit-free route to the Heart always exists**, at every difficulty.
- **Fighting is loud and fast; taming is quiet and slow.** `SCENT_BY_ACTION` and the four outcome tables encode it; `tests/tuning.test.ts` and `tests/creatures.test.ts` assert it band by band.
- **A sent companion never returns.** `sendCompanion` returns exactly `{ sent, targetRoomId, scent }` and a test asserts that key set, so a `returnChance` field cannot appear quietly.
- **Terrain never drifts.** Within a run hazards are exactly where generation put them. If a future change makes the world grow mid-run, the "NEVER changes the terrain" test is the one that will stop it.
- **Hostility lives with the creature, not the room**, so drift carries it.

## Carried forward into 1e

- **`resolve.ts` owns the encounter flag.** `creatures.ts` deliberately does not touch `GameState`. The reducer needs somewhere to record "an encounter is live in this room", set when the player *enters* a creature room and cleared when it resolves or they leave. Drift putting a creature on the player must not set it.
- **`legalActions` must call `encounterOptions(room)`**, not build its own list. GDD §2.17 requires the filtering to happen in the engine, and the hostile gate lives there.
- **Writing `creatureHostile` back is the reducer's job.** `EncounterResult.hostile` says it happened; nothing in `creatures.ts` mutates the room.
- **A tame consumes two turns, so the Wumpus moves twice.** `EncounterResult.turnCost` carries this; `scripts/tame.ts` shows the shape (`moveWumpus` in a loop with a decay between steps).
- **The Heart-carrying multiplier is applied at step 4**, not in the drift pass.
- **`companionUpkeep` and the goblin scrounge are the only step-7 companion effects.** Everything else is a query or a roll-time modifier.
- **Both `SEND` fixes ride along with 1e** — the `TAME_OUTCOMES.strongSuccess.brave` flip, the natural-20 override that structurally needs `resolve.ts`, and the `sendScent` lookup. The exact changes are written out under findings 1 and 2 above; they were decided by the PM session on 17 Sep and are not yet implemented in code.
- **The fight-vs-tame comparison is stale.** The Wumpus start band changed the RNG stream and the lethality; the last sweep read 48% vs 47% escape, which says the placement now dominates the encounter choice entirely. Do not carry the older 80/68 or 75/72 figures forward — re-measure with 1g's heuristic policy.
- **`scripts/tame.ts` reports the adjacency metric** (`runs the stench fired in`). That is the number that says whether the Wumpus was a presence; `mean closest wumpus` alone hid a 63%-unreachable bug for three steps.

## Not yet decided

- Findings 1 and 2 are decided but unimplemented (see above); finding 3 is fixed and closed.
- Whether `RUN.maxHeartDistance = 7` is the right *balance* number. It is currently a correctness floor. The sim in 1g answers this.
- Whether Confused suppressing tells plays tame. The spicier scrambled-tells version is held in reserve (GDD §2.8.2).
- Whether the Tier 4 turn budget of 18 is enough of a difference from 20.
- Whether `DRIFT.creatureMoveChance = 0.25` reads as a living world or as churn. It produces ~1.5–1.9 creature moves per turn across the whole map, but the player only ever sees four rooms. 1g should measure how often an *adjacent* creature moves, which is the only rate that matters.
- Whether a hostile creature should also *attack* each turn the player stays in the room. Currently it just sits there, un-tameable. Considered and deferred — it would add a damage source outside the encounter system.
- Whether the post-fix catch rates are right. A naive route-walker is now caught 48% of the time at Stirring and 67% at Ravening. Those are the tell-ignored floor, not the expectation — a one-line sidestep rule drops them to 35% and 43% — but nobody has yet seen what a competent player scores. 1g's heuristic bot is the arbiter.
