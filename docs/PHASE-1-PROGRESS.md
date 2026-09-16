# Phase 1 — progress

Running notes for a phase that spans many sessions. `docs/ROADMAP.md` says what Phase 1 *is*; this says how far in we are and what the next session should pick up.

**Last updated:** 16 Sep 2026, end of step 1c.

## Where we are

| Step | State | What landed |
|---|---|---|
| 1a · tuning constants | **done** | `src/engine/data/tuning.ts` — every tunable number, each citing its GDD section |
| 1b · labyrinth generation | **done** | `src/engine/generate.ts`, `scripts/map.ts`, difficulty contracts |
| 1c · the Wumpus | **done** | `src/engine/wumpus.ts`, `scripts/hunt.ts` |
| 1d · creatures | **next** | encounters, taming, companions, `SEND`, world drift |
| 1e · resolve | pending | the reducer — turn order is already specified in GDD §2.2.2 |
| 1f · outcomes table | pending | `(archetype × action × band)`, with a coverage test |
| 1g · text renderer + agent harness | pending | built to `docs/EVALS.md` requirements |

118 tests. `npm test`, `npm run typecheck`, both clean.

## The two tools, and what they are for

Neither is a toy. Each caught a real defect that tests did not.

**`npm run map -- <seed> <count> [difficulty]`** — a labyrinth as ASCII, with its difficulty contract checked at the bottom. Reading ten of these is how you judge whether generation is *interesting*, which no assertion can tell you.

**`npm run hunt -- <seed> <tier> [difficulty]`** — a scripted player walks to the Heart and back while the scent field decays and the Wumpus closes. Cells are `[what is there][how it smells]`.

What they found:
- **Generation produced unwinnable seeds.** No cap on Heart distance meant 7.1% of maps needed a round trip longer than the turn limit. Fixed with a distance *band*; there is now a test named "never generates an arithmetically unwinnable run".
- **68.7% of seeds forced the player across a hazard** with no alternative. Fixed with the place/measure/repair pass and the difficulty contracts.
- **A Tier 4 Wumpus walked past a player it could smell** to go and guard the entrance. Guarding now only applies when it has lost the trail.
- **The player walked clean through the Wumpus.** One catch check after the Wumpus moves is not enough — GDD §2.2.2 now specifies two.

Build the equivalent tool for each remaining step. It has paid for itself every time.

## Carried forward into 1d

- **World drift (GDD §2.9.1)** — wandering creatures and spreading blooms belong in `creatures.ts`. The Heart-carrying scent multiplier (`HEART.carryScentMultiplier`, already in tuning) is applied in `resolve.ts`.
- **The grellhound is load-bearing.** The fairness guarantee is only that a player who *holds still* is warned; moving into a room adjacent to the Wumpus gets no warning. The grellhound's radius-2 growl is the counterplay, so it is not an optional nicety.
- **The stone-grub is out of v1** and out of `CreatureKind` entirely. It returns late as the labyrinth's shuffler.
- **Four creatures**, not five: goblin, lumewing, grellhound, quietOne.

## Invariants the next session must not quietly break

All in `CLAUDE.md` §3, but these three have been tested against and are easy to erode:

- **Tells never lie.** Darkness restricts *range*; Confused *suppresses*. Neither ever makes a reported tell false.
- **A pit-free route to the Heart always exists**, at every difficulty.
- **Fighting is loud and fast; taming is quiet and slow.** `SCENT_BY_ACTION` and `ENCOUNTER` encode it; `tests/tuning.test.ts` asserts it.

## Not yet decided

- Whether `RUN.maxHeartDistance = 7` is the right *balance* number. It is currently a correctness floor. The sim in 1g answers this.
- Whether Confused suppressing tells plays tame. The spicier scrambled-tells version is held in reserve (GDD §2.8.2).
- Whether the Tier 4 turn budget of 18 is enough of a difference from 20.
