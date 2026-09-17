# Phase 1 — progress

Running notes for a phase that spans many sessions. `docs/ROADMAP.md` says what Phase 1 *is*; this says how far in we are and what the next session should pick up.

**Last updated:** 17 Sep 2026, end of step 1c. Sessions are now one per step — see below.

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

## One session per step

**Each step of Phase 1 gets its own fresh session, named for that step** — `SE 1d — creatures`, `SE 1e — resolve`, and so on. The name should match the `label` in `docs/dev-log.json` so the session list and the log line up.

This is measured, not a preference. The first long session covering Phase 0 through 1c ran 438 turns and 36.2M effective tokens, of which **79% was re-reading the growing conversation and 0.1% was every tool result put together**. Context per turn grew from 87k to 678k; the last quarter cost nearly four times the first for the same number of turns. A new session starts at ~87k, so a step-sized session runs roughly 8x cheaper per turn.

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
