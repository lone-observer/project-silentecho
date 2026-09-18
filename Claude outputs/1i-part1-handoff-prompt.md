# 1i part 1 — the economy rebuild, then its rebalance

You're rebuilding Silent Echo's resource economy to match the 18 Sep 2026 GDD rewrite, then rebalancing what you built against sim data. Read `CLAUDE.md`, `docs/GDD.md` in full (this step touches §2.2, §2.2.1, §2.6, §2.7, §2.8, §2.8.1, §2.9, §2.9.1, §2.10 — more sections than usual, and they all changed together), `docs/PHASE-1-PROGRESS.md` (the step table, "Carried forward into 1h/1i/1j/1k", and "Not yet decided"), and `claude/design-decisions.md`'s 18 Sep entry (the project doc — read it via whatever gives you the repo's `claude/` directory, it is not under `docs/`). Budget this like 1e/1f/1g, not like 1d: it's wide (touches nearly every table in `tuning.ts`) *and* it's a measurement loop (1g's own lesson — a step that has to be measured to an answer costs turn count on top of context width, not instead of it). If it runs long, that's expected; don't compress the sim-sweep half to make the schedule.

## The situation, so you don't re-litigate settled decisions

The design for this step is **already decided and written into `docs/GDD.md`** — Gautham reasoned through it with a PM session on 18 Sep after his first playtest of 1h, resolved every fork, and the GDD reflects the result. Your job is implementation and measurement, not design. Where the GDD says something is "not yet decided" or "TBD" or "pending 1i," that's a real open question for you to answer *empirically* (sim sweep, same discipline 1g used), not a gap to fill from taste. Where it states a decision plainly, build that — don't propose alternatives to something Gautham already chose.

**What changed, in one paragraph:** health is retired — there's no HP pool anywhere. Every action's oil cost now scales with the margin it rolls (bad roll costs more oil, good roll costs less, great rolls can net oil back). The only two ways a run ends in death are falling in a pit (now strictly binary, no survive band) and the Wumpus catching you. `LISTEN` and `READ` are retired and replaced by `FOCUS`, which resolves a doorway's hazard tell and is capped per room by difficulty (all 4 doorways at Drowsing/Stirring, 1 at Hunting/Ravening) — this replaces the old oil-band tell-range mechanism entirely. Two new verbs: `DISARM` (permanently clears a bloom/snare) and `DROP HEART` (free, cancels the carrying-scent multiplier). Turn caps go from a flat 20/20/20/18 to **50/45/40/35** by difficulty. The Wumpus's mandatory adjacency stench tell widens from radius 1 to radius 2. `SEND`'s decoy duration becomes roll-based (3 turns good, 2 bad) instead of tiered by which creature you tamed. `USE` (an oil flask) becomes rolled instead of a flat +4.

## What exists already, so you don't rebuild it

1g built the hazard-verb machinery this step extends: `VERB_HAZARDS`, `HAZARD_VERB_OUTCOMES`, the hazard-encounter branch in `resolve.ts`, `FORCE`/`ENDURE`/`AVOID`/`DODGE` as real, narrated `ActionKind`s. 1h built the text renderer end to end and it currently works against the *old* economy — that's the main reason this step touches `src/classic/` as well as `src/engine/`, not just the engine. `AgentView` and the sim harness (`npm run sim`, `Policy`, `random`/`heuristic` bots) don't exist yet — that's 1j, still gated behind this step, not a dependency of it.

## Build list — everything the GDD already specified

Work through `src/engine/data/tuning.ts` and `src/engine/types.ts` first; almost everything below is a table or a type, per `CLAUDE.md` §2.4 and §4.

- **Remove health entirely.** `Player.maxHealth`, the `damage` field on outcome rows (FIGHT/TAME/SNEAK/FLEE/pit tables), and everything downstream that reads them. Nothing "hurts" the player anymore — margin scales oil cost instead (GDD §2.6). Grep for `damage` and `health`/`maxHealth` across `src/engine/` and don't leave a dead field or an unreachable branch.
- **Pit becomes strictly binary.** No `mixed`/survivable band. AGI save on entry: pass and you're through unhurt, fail and the run ends (GDD §2.8). This simplifies the pit table, it doesn't complicate it.
- **The oil price table** (GDD §2.8.1) — every action gets a base oil cost, and margin scales it per §2.6's band-to-delta mapping. The starting numbers are in the GDD's price table; the exact per-band deltas are explicitly not set yet (see "What to measure" below) — build the *mechanism* (a margin-scaled cost per action) against placeholder deltas shaped like 1g's old reward-gate logic, then tune the actual numbers from sweep data rather than guessing twice.
- **`FOCUS`** — resolves one doorway's hazard tell (direction + type), replacing `LISTEN` and `READ`. Base lamp gives presence-only tells for free, always. Per-room cap by difficulty (4 doorways at Drowsing/Stirring, 1 at Hunting/Ravening) — this is a new kind of per-turn limit, not an oil cost, so it needs its own piece of state (probably on `Room` or `GameState`, scoped to the current room/turn). Wumpus stench and companion informational passives (grellhound, lumewing) stay exempt from both `FOCUS` and oil level — always free, always automatic (GDD §2.8.1).
- **`DISARM`** — permanently clears a bloom or snare, available alongside the existing verb pair on each. Whether it's stat-gated or stat-agnostic is explicitly undecided in the GDD (leaning stat-agnostic, not settled) — pick one, build it, and say which you picked and why in your close-out; don't leave it ambiguous in the code the way the GDD leaves it ambiguous in prose.
- **`DROP HEART`** — free, unconditional, cancels the carrying-scent multiplier only (not the Wumpus tier jump or the one-turn position reveal from taking the Heart). GDD §2.9.1.
- **`SEARCH`** — a cheaper, weaker `FOCUS`-family sibling: finds loot at lower reliability, doesn't resolve hazard tells. Exact price split is explicitly TBD (GDD §2.7, §2.8.1) — same "build the mechanism, tune the number" approach as the price table above.
- **`REST`** — 0.5 oil, refunded to net 0 on a good roll, lost outright on a bad one. No more flat +1 penalty. The world still turns (creature affinity timers, Wumpus move, drift) — this is a turn spent, not a pause.
- **`FLEE`** — priced like `MOVE`; a botched roll costs extra oil and a scent marker, same shape as a bad `FIGHT`.
- **`ENTER PORTAL`** — the good/bad split is explicitly non-negotiable (GDD §2.8): good roll reseeds into a new labyrinth with oil carried over unchanged and the scent field cleared; bad roll lands you already holding the *new* labyrinth's Heart, no exploration phase, straight into the escape problem. `DROP HEART` is the release valve here — make sure it actually works from this state.
- **`USE` (oil flask)** — now rolled instead of flat: good roll restores 100% of `flaskValue`, bad roll restores 50%.
- **`SEND`** — duration becomes roll-based (3 turns good, 2 bad), replacing the old `COMPANION.sendScent` per-creature tiering entirely. Heart-carrying's existing halving still stacks on top (2/1). This is a real behavior change from what 1e/1d built and tuned — expect `tests/creatures.test.ts` and `tests/resolve.test.ts` assertions that check the old tiered values to need updating, not just extending.
- **Turn caps** — 50/45/40/35 by difficulty (GDD §2.2.1), replacing the flat 20/20/20/18.
- **Wumpus mandatory stench radius** — 1 → 2 (GDD §2.10). This is the CLAUDE.md §3 fairness-guarantee constant; the invariant itself ("a player who holds still is always warned") doesn't change, only the radius does.
- **Ambient oil flasks and starting oil/flask value** — `POPULATION.oilFlasks` (currently 3–5), starting oil (12), and `flaskValue` (4) were all sized against the old passive-burn, health-bearing economy. They're not wrong by default, but they're not re-confirmed either — treat them as a hypothesis to check with the rest of the sweep, not as settled.

**Also in scope, because it breaks otherwise:** `src/classic/` was built in 1h against the old action set and status line. `LISTEN`/`READ` need to come out of the renderer's menu and labels, `FOCUS`/`DISARM`/`DROP HEART` need to go in, and the status line (`GDD §2.17`) needs its health field removed — it was already over-budget before this, so removing a fact is a chance to leave it better than you found it, not a reason to add a replacement fact. Don't add oil-band tell-range UI back in; that mechanism is retired.

## What "done" looks like

- Every item in the build list above is implemented, tested, and the GDD's descriptions of them match what the code actually does (or you've flagged a deliberate deviation, same convention 1g used for `FORCE`).
- `npm test`, `npm run typecheck`, `npm run build` all clean. No dead `health`/`damage` fields, no dead `LISTEN`/`READ` references.
- The classic renderer plays a full run start to finish with the new verb set and no health in the status line.
- The sim sweep below has been run and its numbers are in your close-out — actual numbers, not "should be fine." `CLAUDE.md` §5: never tune toward a target and never present a tuned figure as an observed one.

## What to measure (the actual rebalance)

Same tool, same discipline as 1g: extend `scripts/hazard.ts` and/or `scripts/turn.ts` (or write a new visualiser if the economy has outgrown them — your call, but don't let this be invisible) and run `SWEEP=n` sweeps across policies and difficulties. `npm run sim` still doesn't exist (1j's job) — don't build it here, a visualiser sweep is the right tool at this scope, same as every step before it.

The questions actually worth the sweep budget, in the order they gate each other:

1. **The oil price table's per-band deltas.** This is the one genuinely new number — 1g's old model (flat price + bonus flask at strongSuccess+) is gone; every band now needs its own net delta. Same oil-farming trap 1g found (paying out too generously at too low a bar) applies here with a new mechanism, so check it the same way: sweep, read the number, don't eyeball it.
2. **Whether hazards are still net-negative in turns**, which 1g found is what actually decides runs (a 12.5-point escape-rate cost, not the oil ledger). Re-measure against the new turn caps and per-action turn costs — the finding shouldn't be assumed to transfer just because the shape of the change is similar.
3. **The bloom choice (`FORCE` vs `ENDURE`)** — 1g found these were statistically indistinguishable over 300 seeds. Re-check under the new cost model before concluding anything about the scent-weight tuning; a result that says "still no difference" here is still not evidence to act on without 1j's bot (per 1g's own finding 2), but it's worth knowing if the new prices moved the needle at all.
4. **Heart distance, hazard-free-route counts, and min safe detour** (GDD §2.2.1) — sized against the old ~18–20 turn budget, not yet re-derived for 45–50. This is a generation-contract question, not a per-action price, and it's the one most likely to explain whether "only reaching 10–12 rooms" actually improves.
5. **Whether MOVE should cost 0.5 or 0.25.** The GDD flags this as sim-decided. Worth noting for context: 0.5 risks re-tightening oil into a binding constraint at low difficulties, which would undercut the whole point of raising the turn cap — that's not a reason to pick 0.25 by default, but it's the failure mode to watch for in the sweep.

**Deliberately not this step's job to answer**, even though they're flagged "pending 1i" or similar nearby in the docs — these are taste calls for Gautham, not sim questions, and asking him directly is cheaper than sweeping for them:

- Whether `PLAYER.startingStat` should move from 8 to 10 (GDD/PHASE-1-PROGRESS flags this as a felt-difficulty call, not a measured one).
- Whether the charted-map-by-difficulty rule (`MAP_DIFFICULTIES`) needs settling now or can keep living in the renderer.
- The move-label-vs-doorway-label wording mismatch (1h finding 5) — a one-line copy fix, do it if you're in the file, don't sweep it.

## Explicitly out of scope

- **1i part 2 — the companion buff rework** (Goblin/Moth/Grellhound passive reworks). Split out at Gautham's request on 18 Sep specifically so this step stays about the economy rebuild, not content changes. See `docs/PHASE-1-PROGRESS.md`'s carried-forward section for what's sketched so far — none of it is spec'd to build yet.
- **The Skittish→Companion→Brave temperament system and Endless mode.** Both parked in the same 18 Sep thread, neither scheduled.
- **The agent harness, `AgentView`, `npm run sim`, anything sim-*infrastructure*.** That's 1j. You're extending the existing visualiser pattern for this step's measurement, not building the harness.
- **Archetype-aware endings and the epitaph.** Still Phase 1.5, unchanged by this step.

If something here turns out to need a design decision the GDD doesn't already make plainly, stop and flag it rather than deciding it yourself — same rule as every step before this one, and this one has more surface area than most to get wrong quietly.

## Close-out

Same ritual as prior steps: update `docs/PHASE-1-PROGRESS.md`'s step table and carried-forward notes, log every design-adjacent decision you had to make (DISARM's stat-gating, the exact price-table numbers, anything that turned out ambiguous in the GDD) to `claude/design-decisions.md`, and run `npm run devlog` before you close — read back the actual table, not just the field, per the close-out checklist this file already has written down. Check the doc lock at the top of `docs/PHASE-1-PROGRESS.md` before you start a multi-file doc edit, and clear it when you're done.

1i part 2 (companion buffs) and 1j (agent harness) are both gated on this step landing with real numbers, not placeholder ones.
