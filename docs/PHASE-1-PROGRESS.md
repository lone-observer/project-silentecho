# Phase 1 — progress

Running notes for a phase that spans many sessions. `docs/ROADMAP.md` says what Phase 1 *is*; this says how far in we are and what the next session should pick up.

**Last updated:** 18 Sep 2026, end of step 1g (the hazard-verb redesign). Sessions are now one per step — see below.

**Doc lock:** none. *(If this says otherwise, STOP before writing to `docs/GDD.md`, this file, or `docs/ROADMAP.md` — see "Doc lock" below.)*

## Where we are

| Step | State | What landed |
|---|---|---|
| 1a · tuning constants | **done** | `src/engine/data/tuning.ts` — every tunable number, each citing its GDD section |
| 1b · labyrinth generation | **done** | `src/engine/generate.ts`, `scripts/map.ts`, difficulty contracts. Wumpus start became a per-difficulty band in the 1d session — see finding 3 |
| 1c · the Wumpus | **done** | `src/engine/wumpus.ts`, `scripts/hunt.ts` |
| 1d · creatures | **done** | `src/engine/creatures.ts`, `scripts/tame.ts`, GDD §2.9.1 written |
| 1e · resolve | **done** | `src/engine/resolve.ts`, `scripts/turn.ts`, both SEND fixes implemented |
| 1f · outcomes table | **done** | `src/engine/data/outcomes.ts`, `scripts/prose.ts`, `tests/outcomes.test.ts` |
| 1g · hazard-verb redesign | **done** | `src/engine/data/tuning.ts` (`VERB_HAZARDS`, `HAZARD_VERB_OUTCOMES`), `resolve.ts`, `scripts/hazard.ts`, `tests/hazards.test.ts`. Bloom and snare are verb encounters; `FORCE`/`ENDURE`/`AVOID`/`DODGE` are real `ActionKind`s; reward and ambient flask count both measured and set. |
| 1h · text (classic) renderer | **next** | reads the full event stream against every table above; budget it like 1e/1f, not like 1d, per the cost note above |
| 1i · hazard-reward rebalance | queued | human playtest pass on the 1h text renderer, then rebalance the hazard-verb reward magnitudes and turn costs against played feel, not just sim data. Gated on 1h — there is no way to play the game until then. |
| 1j · agent harness core | queued | `AgentView` adapter + a "can't see through walls" leakage test, the `Policy` interface (with the Fortune-spend hook — see `docs/EVALS.md`), `random` + `heuristic` policies, run-batch infra |
| 1k · LLM integration + benchmark run | queued | OpenRouter wiring, the fixed prompt (`docs/AGENT-PROMPT.md`), the model roster, scoring/report script, the actual n=100 batches, the human baseline |

**17 Sep, re-split from the old "1g."** Gautham asked to build the hazard-verb redesign next, before the text-renderer-and-agent-harness step that was originally slotted as 1g — and to break that original 1g into session-sized pieces, since it was already flagged (in the cost-per-step note above) as covering more of the engine than one step should. The new 1g is the hazard redesign; the old 1g's scope becomes 1h/1i/1j, split by *what each piece has to hold in context* — text renderer alone, the harness plumbing alone, then the model-facing wiring alone — rather than by file count. This split is a judgement call, not something Gautham has confirmed line-by-line; flag it back if 1h/1i/1j should be cut differently once someone is actually sitting down to open a session for one of them.

**18 Sep, a step inserted after 1g landed.** 1g's own reward numbers came from sim sweeps, not play — and 1g's findings gave real reason to distrust sim-only tuning here: the oil ledger alone can't be made net-negative without a reward smaller than a whole flask (1g's "not yet decided" list), a 12.5-point swing in escape rate went in without anyone having played it, and whether the bloom choice (`FORCE` vs `ENDURE`) is a real decision or noise is explicitly unresolved. Gautham wants to actually play the text-rendered game and get a feel for the actions before locking the reward numbers in further, rather than tuning a second time from sweep data alone. That inserts as **1i**, after 1h (nothing to play before then) and before the agent-harness work (1j, was 1i) — no sense building the harness against reward numbers about to move. The old 1i and 1j shift to 1j and 1k. This is not a reopening of the oil-farming fix from 1g (strongSuccess-or-better already closed that) — it's a second pass with a different kind of evidence.

266 tests. `npm test`, `npm run typecheck`, both clean.

## One session per step

**Each step of Phase 1 gets its own fresh session, named for that step** — `SE 1d — creatures`, `SE 1e — resolve`, and so on. The name should match the `label` in `docs/dev-log.json` so the session list and the log line up.

This is measured, not a preference. The first long session covering Phase 0 through 1c ran 438 turns and 36.2M effective tokens, of which **79% was re-reading the growing conversation and 0.1% was every tool result put together**. Context per turn grew from 87k to 678k; the last quarter cost nearly four times the first for the same number of turns. A new session starts at ~87k, so a step-sized session runs roughly 8x cheaper per turn.

**Second measurement, from this session.** Step 1d ran 155 assistant turns and **6.78M effective tokens — 43.8k per turn**, against the 678k/turn the long session had climbed to by its end. That is roughly 15x cheaper per turn, and the whole step cost less than a quarter of what the Phase 0–1c session did. The split was 60.5% cache reads, 27% cache writes, 12.5% output; raw input was 310 tokens, which is to say essentially all of the cost is carrying context, not receiving instructions. The claim above is now measured twice rather than once.

**Third measurement, from the 1e session — and it breaks the trend.** Step 1e ran 205 assistant turns and **55.4M effective tokens: 270k per turn**, roughly 6x what 1d cost per turn and 8x the whole-step total. Peak context was 384k. The split was 98.0% cache reads, 1.5% cache writes, 0.5% output, 410 raw input tokens.

Two causes, and only one of them is avoidable:

1. **`resolve.ts` is the module that touches every other module.** Writing it meant holding `types.ts`, `tuning.ts`, `creatures.ts`, `wumpus.ts`, `generate.ts`, `dice.ts` and the whole GDD in context at once — about 190k of source and spec before any work started. 1d could be written against `tuning.ts` and a hand-built band. A reducer cannot. Some steps are simply wider than others, and 1f (one big data table) should be narrow again.
2. **Avoidable: editing files with shell heredocs instead of the editing tool.** Several `python3 - <<'PY'` patches to `tame.ts`, `turn.ts` and `resolve.ts` caused the harness to re-inject the *entire* changed file into the conversation as a change notice — 600 to 1200 lines each, which then rode along in every subsequent turn's cache read. Use the editing tool for edits; reach for a shell patch only for genuinely mechanical multi-site rewrites, and expect to pay for it when you do.

So: **the per-step-session claim holds, but "a step" is not a fixed unit of cost.** Do not read 43.8k/turn as the expected rate; read it as what a narrow step costs. Budget by how much of the engine a step has to hold at once.

**Fourth measurement, from 1f — and it settles which of the two causes above was the real one.** Step 1f ran 193 assistant turns and **54.7M effective tokens: 283k per turn**, against 1e's 270k. Peak context 388k. The split was 97.8% cache reads, 1.7% cache writes, 0.5% output, 386 raw input tokens.

The prediction one paragraph up — "1f (one big data table) should be narrow again" — **was wrong, and wrong by 6x.** 1f wrote almost no logic: one data module, a lookup function, a visualiser, and about thirty lines of change inside `resolve.ts`. It still cost what writing the reducer cost.

The reason is the part worth keeping. Cost tracks **how much of the engine a step has to hold in context**, not how much code it produces. Writing prose that must agree with the mechanics means holding the mechanics: `tuning.ts`'s five band tables to know what each band actually does, `resolve.ts` to know where each line is emitted and in what order, `types.ts`, the whole GDD for §2.6's band meanings and §2.8.1's dark-variant rule and §2.17's ending rule, and this file. That is the same ~190k of source and spec 1e needed, for the same reason. Cause 1 from the 1e session ("`resolve.ts` is the module that touches every other module") generalises: **any step whose output must be consistent with the whole engine pays the whole engine's context cost, whether or not it writes code.** Cause 2 (shell heredocs re-injecting whole files) was avoided this session and did not recur; the 6x gap between 1d and 1e was therefore mostly cause 1, not cause 2.

Practical rule for 1g and beyond: **estimate a step's cost from the number of modules its output has to be correct against, not from the number of files it creates.** By that measure 1g — text renderer plus agent harness, both of which read the whole event stream and every one of these tables — should be budgeted like 1e and 1f, not like 1d.

**Fifth measurement, from 1g — and it adds a second cost driver the rule above does not cover.** Step 1g ran **272 assistant turns and 79.8M effective tokens: 293k per turn**, against 1f's 283k and 1e's 270k. Peak context 440k. The split was 98.4% cache reads, 1.3% cache writes, 0.3% output, 544 raw input tokens.

**Per-turn cost barely moved. The turn count moved 41%,** and that is where the extra 25M went. The existing rule — cost tracks how much of the engine a step has to hold at once — predicted the per-turn figure correctly and says nothing about the total, because it is a rule about context *width*.

The new driver is **empirical tuning, which is a loop**. 1g could not pick the reward magnitude by reading a table: it had to write the visualiser, run a sweep, read a number, change one constant, run the sweep again, and do that across two parameters and four difficulties, plus a controlled counterfactual. Each of those is a turn, each turn carries the same ~290k of context, and none of them writes any code. A step that *measures* something costs the width of the engine multiplied by however many times it has to go round.

Practical rule, extending the one above: **estimate context width from the number of modules the output must be correct against, and estimate turn count from whether the step can be reasoned to an answer or has to be measured to one.** 1h (text renderer) is wide but not a loop. 1j and 1k are both — the harness is wide *and* the benchmark is a measurement loop by definition, so budget them above this session rather than at it.

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

**The `commits` field has shipped empty three sessions running (1e, 1f, 1g) — once even after a dedicated follow-up commit meant to fix it.** It's a chicken-and-egg problem: you don't know your own commit's hash until after you've made it. The fix is the follow-up commit 1g used (commit the work, then a second small commit that edits `dev-log.json` to record the first commit's hash) — but **that follow-up commit has to end with `git log -1 --oneline` or an equivalent read-back, confirmed against the actual file content, not just against what the commit message claims to have done.** A commit message saying "record 1g commit" is not evidence the field changed; only reading the merged file back is. Until this stops recurring, treat it as a checklist item that needs verifying, not one that's done once written.

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

**`npm run tame -- <seed> [difficulty] [tier] [policy]`** — runs the identical seed twice, once fighting everything and once taming everything, and puts the two columns side by side. `SWEEP=n npm run tame -- <seed> …` aggregates over `n` seeds instead of printing runs. Panels A and B are static tables (the band-by-band cost of each option; the exact d20 probability of each tame band per creature per INT) and cost nothing to read. Since 1e the sweep also prints **which seeds produced a brave companion and which fired `SEND`** — an aggregate gives you a rate, but only a seed number lets you go and watch the beat, and `SEND` is now rare enough that guessing which of 300 seeds to open is hopeless.

**`npm run prose -- [mode]`** — the outcomes table. Four panels. **A** is the coverage matrix and is the cheap one. **B** prints one `(action × archetype)` as six bands with lit above dark, which is the only way to see that six bands read as one sentence rewritten six times — the specific failure mode of authoring 222 cells in a sitting, and one no coverage test can detect. **C** drives a real run and prints every line the engine emitted, in order, tagged with its beat id; ordering defects are invisible in the table and obvious in a transcript. **D** is the lint, and it shares its rules with `tests/outcomes.test.ts` rather than restating them.

**`npm run hazard -- [mode]`** — the hazard verbs. Four panels. **A** is the coverage matrix (which stat each hazard has no answer for) and is the one that would have caught the INT-covers-everything gap this step was designed around. **B** prices every band and attaches the exact d20 odds of reaching it per stat, plus the expected oil value of one attempt — that is where "reward on mixed-or-better pays +1.75 oil per bloom" showed up as a number rather than a hunch. **C** is the ordering panel and it found the Confused defect below. **D** is the oil economy sweep: `SWEEP=n npm run hazard -- oil [difficulty]`, three policies, every figure read off the event stream rather than recomputed from the tables.

**`npm run turn -- <seed> [difficulty] [policy]`** — a whole run driven through `applyAction`, with every turn broken back out into the eight steps of GDD §2.2.2. `SWEEP=n` aggregates. The panel that earns its keep is the one printing each event's **step number**: they must ascend within a turn, so a reducer that ever emits out of order shows it on every turn you look at rather than only in the cases a test enumerated. It also splits "caught" into **which** catch check fired, re-checks replay determinism and JSON round-tripping on every run it prints, and compares a tell-ignoring policy against a fifty-character one that refuses to step toward a draft or a stench.

What they found:
- **Generation produced unwinnable seeds.** No cap on Heart distance meant 7.1% of maps needed a round trip longer than the turn limit. Fixed with a distance *band*; there is now a test named "never generates an arithmetically unwinnable run".
- **68.7% of seeds forced the player across a hazard** with no alternative. Fixed with the place/measure/repair pass and the difficulty contracts.
- **A Tier 4 Wumpus walked past a player it could smell** to go and guard the entrance. Guarding now only applies when it has lost the trail.
- **The player walked clean through the Wumpus.** One catch check after the Wumpus moves is not enough — GDD §2.2.2 now specifies two.
- **A brave companion is unobtainable at starting stats, so `SEND` has never once fired.** See the 1d findings below.
- **The Wumpus started too far away to reach you** in 83% of Drowsing seeds and 63% of Stirring ones — a start distance with a floor and no ceiling. Fixed with a per-difficulty band; the numbers are below.
- **Retreating the way you came is worse than ignoring the stench.** Measured, not assumed. The braid loops are the counterplay.
- **A hazard save was being reported to the player as a MOVE roll.** `scripts/turn.ts`, first run. Entering a snare room rolled INT against DC 8 and emitted it as `roll move` — text parity means the event stream is the source of truth, and it was telling the player something untrue about why they had just lost a point of health. `GameEvent.roll` gained an optional `hazard` field.
- **Panel B of `tame.ts` would have kept printing the old, broken brave odds.** It hardcoded `.criticalSuccess`, so the moment 1e moved the gate the visualiser would have gone on reporting 0% for the exact thing the session had just fixed. It now derives the brave bands from `TAME_OUTCOMES`. Worth generalising: **a visualiser that hardcodes the rule it is watching is a visualiser that lies on the day the rule changes**, which is the only day you are looking at it.
- **Three events the player could not be told about.** `creatureEncounter`, `heartTaken` and `statusChanged` carried no text at all — the reducer emitted a bare event and left the renderer to invent the sentence. That is a text-parity failure (`CLAUDE.md` §2.3) in the direction nobody checks: not a renderer hiding a fact, but the event stream being unable to express one. Taking the Heart is the loudest moment in the game and it said nothing. Found by reading Panel C of `prose.ts`, not by any test — every test passed before and after.
- **`scripts/turn.ts` identified oil events and catch checks by comparing prose.** It worked until 1f gave every beat a second variant, at which point it would have kept working in the lamplight and silently started mislabelling every oil event in the run the moment the player's lamp got low. Same lesson as Panel B above, one layer down: identity belongs on an id, not on an appearance. Events now carry `NarrationBeat`.

- **A status expired on the turn that applied it.** `scripts/hazard.ts` Panel C, first run. Statuses land at step 3 and are ticked at step 7 of the same turn, once per turn consumed — so a Confused applied by a two-turn `FORCE` was decremented twice and gone before the player read a single suppressed tell. `FORCE`'s one unconditional cost cost nothing at four of six bands; `ENDURE`'s entire margin-shortens-the-duration mechanic did nothing at any band; and a strongSuccess `FORCE` (one turn) left the player blind where a plain success (two turns) did not — **a better roll punished**. Every test passed before and after. The transcript printed `confused for 2 turn(s)` and `confused for 0 turn(s)` back to back, one line apart, which is the entire diagnosis.
- **The "compile-time guard" on the action list guarded nothing.** `tests/outcomes.test.ts` declared `const ALL_ACTION_KINDS: readonly ActionKind[] = [...]` and then asserted `ActionKind extends (typeof ALL_ACTION_KINDS)[number]`. Annotating the array as `readonly ActionKind[]` makes that index type evaluate to `ActionKind`, so the guard read `ActionKind extends ActionKind` and held no matter what the list contained. Adding three verbs to the union compiled clean against a list naming none of them. Fixed with `as const` plus a second assertion in the other direction. `tests/tuning.test.ts` has the same pattern and the same hole — **left for whoever opens 1h**, noted below.
- **A MOVE-only walker deadlocks on a hazard.** Two test policies filtered the menu to `move` and stopped when it came back empty, which is now what standing in a bloom looks like. Trivial to fix in a test; the point is that **1j's heuristic bot cannot be written as "pick the move that reduces distance"** — it has to answer hazards, and choosing between two cost models is a real decision rather than plumbing.
- **A test that passed by luck for two steps.** "binds the encounter to ENTERING a room" asserted unconditionally that a `creatureEncounter` event leaves the flag set. Drift can walk the creature out of the room at step 7 of the same turn, in which case clearing the flag is correct — and 1g changed how many turns an action costs, which moved the RNG, and one seed finally did it. The rule was always conditional; the test just never said so.
- **A suite that was green or red depending on CPU speed.** `tests/outcomes.test.ts`'s source-of-truth sweep drives hundreds of seeded runs and sits just under vitest's 5s default on a fast desktop, over it on slower hardware. `testTimeout` is now 30s in `vite.config.ts`. A test whose result depends on the machine is not measuring what it claims to.

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
- **Within a run, only creatures move. The terrain is fixed.** Hazards stay where generation put them, so a charted map keeps telling the truth about where the pits are; what decays is the living half. Blooms spreading is the *between-runs* half of the §2.11 promise, not a per-turn one. A test asserts the whole hazard layout is byte-identical after 60 drift passes at every difficulty, which subsumes the pit-free invariant — drift cannot create a pit because it cannot create any hazard. **This was a scope call under deadline, not a verdict — see "Not yet decided" below and `docs/GDD.md` §2.9.1. Gautham wants within-run bloom spread reconsidered once 1g/playtest data exists; it's flagged as potentially tenet-breaking against the drift-invariant test just described, so it isn't a quiet flip back.**
- **Drowsing does not drift at all**, and draws no randomness doing it. It is the teaching tier; a world that moves while you are learning what a tell means makes the lesson unlearnable.
- **Step 7 is reordered: drift first, then companion passives.** A grellhound resolving before a creature wandered in would report a labyrinth that no longer exists — a companion whose whole job is honest information, lying. GDD §2.2.2 updated.
- **Informational passives are queries, not stored effects** (grellhound reveal and growl, lumewing radius). This satisfies §2.9's "must land before the player chooses" by construction rather than by an ordering rule. It does split §2.9's "one rule for all five creatures" — flagged, not hidden.
- **Hostility is persistent, and it travels with the creature.** A critically failed tame sets `Room.creatureHostile`, and `encounterOptions()` then drops `TAME` from the menu — fight it, slip past it, or run. `driftWorld` carries the flag along when the creature wanders; a hostile flag stranded in a vacated room would be a bug, and there is a test that follows one angry goblin around the map asserting exactly one room is ever flagged. This is the only band that leaves a live, untamed creature standing in front of you: plain `failure` bolts it, `mixed` and up tame it, and every `FIGHT` at mixed-or-better drives it off.

## What 1e landed

- **`src/engine/resolve.ts`** — `applyAction(state, action, rng)`, the eight steps of GDD §2.2.2 numbered in the code exactly as the GDD numbers them. Plus `createRun`, `legalActions`, `replayRun` and `tellsFor`, because a reducer with nothing to reduce and no way to replay is half a deliverable.
- **`scripts/turn.ts`** — the visualiser, with a `SWEEP=n` mode. See "the two tools" above; it is four now.
- **`tests/resolve.test.ts`** — 37 tests, taking the suite from 180 to 217. Six invariant assertions were mutation-checked and all fail when the code is deliberately broken: the step-2 catch check, the corridor swap case, a two-turn tame costing two Wumpus moves, the natural-20 brave override, the `creatureHostile` write-back, and `legalActions` deferring to `encounterOptions`. Two more mutations were checked against `tuning.ts` — reverting the brave band and flattening `sendScent` — and both fail as they should.
- **Both SEND fixes**, under findings 1 and 2 above, with their measured results.
- **Type changes, all three of them.** `GameState` gained `encounterRoomId`. `Player.statuses` went from `StatusEffect[]` to `Partial<Record<StatusEffect, number>>` so a status carries its own clock, rather than a list plus a parallel duration table that can disagree. `GameEvent.roll` gained an optional `hazard`, because a hazard save was being reported to the player as a MOVE roll.
- **`tuning.ts` gained** `ACTION_STAT`, `HAZARD_DC`/`HAZARD_STAT`/`HAZARD_OUTCOMES`/`ENTRY_HAZARDS`, `PORTAL`, `REST`, and the `sendScent` lookup. The mechanical consequence of a hazard band lives there; 1f layers prose on top, exactly as 1d did for encounters.

### Decisions taken in 1e, all reversible

- **Step 7 runs once per consumed turn, not once per action.** Drift, scent decay, companion upkeep and the oil schedule all scale with `turnCost`, so a two-turn tame drifts the world twice and feeds a skittish companion twice. The carried-forward note from 1d only specified the Wumpus moving twice; extending it to the rest of step 7 is the consistent reading, but it does make a tame slightly more expensive than 1d costed it. **`scripts/tame.ts` still drifts once per action**, so its sweep numbers and the reducer's differ a little. 1g's sim uses the reducer and is the one that counts.
- **Leaving by the entrance ends the run**, and it is evaluated *before* the turn limit so a run that walks out on its last turn escapes rather than timing out on the doorstep. There is no explicit `leave` verb — moving into the entrance is the choice. Starting there does not trigger it, because nothing moved.
- **A failed MOVE still moves you.** GDD §2.7 asks for "stumble loudly *or* take a wrong turn", and pinning the player in place would make the turn limit punish a die roll they cannot influence. The band's consequence is noise: `SCENT.criticalFailureBonus` already existed and now applies to every action's critical failure, which meant no new `MOVE_OUTCOMES` table.
- **Hazard saves are a separate roll from the action that triggered them.** The move's band says how loudly you arrived; the hazard's says whether you survive it. Folding them would make a clean move a free pass over a pit.
- **`FORCE` is not offered by `legalActions`.** It is in GDD §2.7's verb list, but `Room.exits` has no closed-door state and inventing one would mean geometry changing mid-run, which §2.9.1 forbids. This is a real GDD-vs-code gap and is flagged below rather than papered over — a test asserts FORCE is never offered, so if someone adds door state they have to say so.
- **Fortune is not spent by the reducer.** `rerollWithFortune` and `bumpBandWithFortune` exist in `dice.ts`, but spending happens *after seeing a roll* (GDD §2.5), which is a two-phase interaction and therefore a renderer concern. The reducer never spends it for the player, including to save a bolting skittish companion. Carried forward to 1g.
- **`ENTER PORTAL` regenerates the labyrinth**, clears the scent field entirely, and lands you at least `PORTAL.minLandingDistance` from the new entrance — never on it, or a portal would be a free ride home. The INT band decides how deep you surface, never whether you arrive; a portal that could strand you would be a second instant-loss check and the design has room for one.
- **Prose lives in a `NARRATION` table** at the top of `resolve.ts` rather than inline, per CLAUDE.md §2.4. It is small and 1f absorbs it by moving one object. `scripts/turn.ts` keys off those constants to work out which catch check fired, so improving the wording cannot silently break the panel.

## What 1f landed

- **`src/engine/data/outcomes.ts`** — every line of prose the engine can emit. 266 beats, 532 strings. `resolve.ts`'s `NARRATION` object is gone, absorbed wholesale, along with every template literal that was scattered through its switch statements. There is no prose left in the reducer and a test fails the build if any comes back.
- **`scripts/prose.ts`** — the visualiser, four panels. See "the two tools" above; it is five now.
- **`tests/outcomes.test.ts`** — 22 tests, taking the suite from 217 to 239. Seven assertions mutation-checked.
- **`GameEvent` changes, three of them.** `narration` and `oilChanged` gained a required `beat: NarrationBeat`. `companionLost` gained `text` and its `reason` became a typed `CompanionLossReason` instead of a free string.

### The table's shape, and why it is layered rather than a full grid

A literal 6 × 12 × 6 grid is 432 cells and 864 strings, and most of them would be padding — a FIGHT reads the same whether the floor is wet or carved, because the creature is the subject of the sentence and the room is backdrop. So the verbs are split by **what the sentence is about**:

| | verbs | cells |
|---|---|---|
| **room-led** | MOVE, LISTEN, SEARCH, READ, REST | 6 archetypes × 5 × 6 bands = 180 |
| **subject-led** | SNEAK, FIGHT, TAME, FLEE, USE, SEND, ENTER PORTAL | 7 × 6 = 42 |
| hazards | pit, spore bloom, snare-carving | 3 × 6 = 18 |
| endings + notes + companion loss | | 26 |

The lookup is **total over all 432 triples** either way — subject-led verbs answer the same line for every archetype, which is the layering, not a gap. The coverage test asserts both halves: that every triple resolves, *and* that every room-led verb has all six archetypes genuinely filled, so the layering cannot quietly rot into half-written tables.

**FORCE is deliberately unwritten** and is not a hole. `DEFERRED_ACTIONS` names it, and a test asserts `NARRATED ∪ DEFERRED` covers every `ActionKind` — so when the hazard-verb step adds ENDURE, AVOID and DODGE, the build fails until someone has either written their prose or written down why they have not. A second test drives 100 runs and asserts no deferred verb is ever offered, which is what makes deferring it defensible rather than a gap.

### Decisions taken in 1f, all reversible

- **The dark-variant threshold is Ember, not Dark.** `isDarkProse` reads `OIL_BANDS[].tellRange === 'facing'` rather than defining a constant, so the prose register changes exactly where GDD §2.8.1 already puts the range restriction and its stated reason ("the first oil threshold stays purely arithmetic so the deep one lands as a genuine change of state") covers both. The practical consequence is that this is not a rare state written for flavour: oil starts at 12 and burns 1 every 2 turns, so **a clean 20-turn run ends at Ember**, and the last turns of a good run read in the dark register. One line to change if playtesting says it should wait for Dark.
- **A cell whose lit variant is already non-visual may share its string with dark.** GDD §2.8.1's own argument is that only one tell in the game is genuinely vision-dependent; most of this writing already reaches the player by sound, smell and touch. So the enforceable invariant is not "lit ≠ dark" — which would force gratuitous rewording — but the pair the tests actually assert: no dark variant may contain a vision word, and any lit variant that *does* contain one must have a different dark variant. That pair caught three defects in the prose as it was being written.
- **Slots are a closed, typed set of five nouns** (`creature`, `companion`, `direction`, `hazard`, `item`) and `fill` throws rather than shipping a brace. `CLAUDE.md` §6 rules out "procedural prose generation at runtime" and this is deliberately not that: nothing is assembled, no clause is chosen, a written sentence names one of five things it cannot know at authoring time. The set is closed so it cannot grow into a generator by accident.
- **Endings are not archetype-keyed**, and this is a scope line rather than a judgement. A death beat that knows which room it happened in is exactly the writing GDD §2.17 argues for — but endings are not in the `(archetype × action × band)` product this step is gated on, and the epitaph (§2.16), which §2.17 calls the literal last thing a failed run produces, is not built either. Do the two together. Carried forward.
- **Hazard prose is keyed by hazard and band, not archetype.** Generation already biases each hazard toward its thematic archetype (`ARCHETYPE_FOR_HAZARD`), so an archetype axis here would mostly restate the hazard.
- **`companionLost` carries its own text instead of being paired with a narration event.** The four reasons resolve at three different steps of the turn order — released and sent at step 1, bolted at step 3, starved at step 7 — so a narration emitted alongside would have to be attributed to whichever step its partner landed in, and `scripts/turn.ts`'s step-ordering panel would have started reporting false out-of-order emissions.

### 1f findings

**1. Three events had no prose at all, and taking the Heart was one of them.** `creatureEncounter`, `heartTaken` and `statusChanged` emitted bare events. Found by reading Panel C. All three now have beats; `confusedSettles` and `confusedLifts` matter beyond atmosphere, because GDD §2.8.2 is explicit that Confused is suppression *the player knows about*, and a status that expired in silence left them unable to tell "the doorways said nothing" from "I still cannot hear the doorways".

**2. Five verbs roll a d20 whose band changes almost nothing.** Measured against `resolve.ts`, not assumed:

| verb | what the band actually does |
|---|---|
| MOVE | nothing, except `SCENT.criticalFailureBonus` at the bottom |
| LISTEN | nothing, except the same critical-failure noise |
| USE | **nothing at all** — the item is consumed and its effect applied regardless |
| SEND | **nothing at all** — `resolveSend` never reads the band |
| SEARCH / READ / REST | two-valued: `isSuccess(band)` or not |

GDD §2.6 describes Strong Success as "success plus a small gift: a glimpse of the map, a trinket, the Wumpus loses your scent" — and for all five of these there is no gift implemented. **This constrained the prose:** the top bands had to differ in texture and never in claim, because a strong SEARCH implying a second find would be the engine lying about a mechanic (`CLAUDE.md` §2.3 runs in this direction too). It is a real design gap and 1f is the wrong place to close it — adding gifts is mechanics, not content. **For 1g's sim: either the top bands earn something, or the widest good band is doing all the work and four verbs could stop rolling.** A verb whose roll cannot matter probably should not roll.

**3. A mutation check passed, and that was the interesting result.** Replacing the grellhound's growl with a raw string literal did *not* trip the source-of-truth assertion. The test was fine; the mutation was unreachable — 160 runs of a doorway-cycling policy never once had a grellhound companion standing within radius 2 of the Wumpus. Fixing it meant adding a second policy that walks to the Heart and back, which then revealed that **`heartTaken`, `wumpusEscalates` and the entire `escaped` ending had also been going unverified** by a test whose whole claim is that the reducer only speaks from the table. The test now records which beats its sweeps reach and asserts the six it does not, so the gap is a ledger rather than an assumption.

**Four of those six need a companion.** Neither policy ever tames anything, which makes the companion system the least-exercised part of the reducer. That is the same encounter-density number from the 1d findings (0.6 per run) turning up for a third time, now as a *test coverage* problem rather than a design one. 1g's heuristic policy should tame deliberately, or a whole subsystem stays unexercised by anything but its own unit tests.

**4. The step-ordering panel was two changes away from lying.** `scripts/turn.ts` identified oil events and catch checks by comparing `event.text` against prose constants. Adding a second variant per beat broke that silently and conditionally — it would have kept working at full oil and started mislabelling every oil event once the lamp got low, which is precisely when you are reading the panel. Events now carry a `NarrationBeat` id and the panel keys off that.

## What 1g landed

- **`src/engine/data/tuning.ts`** — `VERB_HAZARDS`, `VERBS_FOR_HAZARD`, `HAZARD_VERB_STAT`, `HAZARD_VERB_OUTCOMES`. `ENTRY_HAZARDS` is now `['pit']` and nothing else. `HazardOutcome` gained two fields: `statusTurns` (so a status carries the duration whatever applied it, rather than reading one constant) and `rewardFlasks` (the first GAIN that struct has ever carried — until now a hazard could only cost you something). `FightOutcome` gained `rewardFlasks` too.
- **`src/engine/resolve.ts`** — a hazard encounter, built as the exact mirror of the creature encounter: `GameState.hazardRoomId`, `liveHazardKind`, a branch at the top of `legalActions`, `resolveHazardVerb`, and `meetHazard` splitting arrival into the two shapes. Both arrival paths (`enterRoom` and `resolvePortal`) go through the one helper so they cannot disagree.
- **`src/engine/data/outcomes.ts`** — 24 new beats, 48 strings: `FORCE`, `ENDURE`, `AVOID`, `DODGE` as subject-led tables, plus `hazardBlocks`, `hazardCleared` and `spoilsTaken`. `HAZARD_NARRATION`'s bloom and snare rows are **deleted** — they described a saving throw that no longer exists, and twelve beats nothing can emit is dead content that `allBeats()` and the lint would have reported forever. `EntryHazard` narrows to `'pit'`.
- **`scripts/hazard.ts`** — the visualiser, four panels. See "the two tools" above; it is six now.
- **`tests/hazards.test.ts`** — 27 tests, taking the suite from 239 to 266. **Eleven assertions mutation-checked**, each verified to fail when the named line is deliberately broken: ENTRY_HAZARDS regaining a bloom, the pit gaining a verb, Force's turn cost flattened, Force's top band ceasing to Confuse, Endure cancelling Confused, Endure's turn cost starting to scale, step 3 reverting to the `STATUS` constant, the `appliedThisTurn` guard removed, Endure made loud, the bloom given an AGI answer, and the reward gate moved to an unreachable band.
- **`vite.config.ts`** — `testTimeout: 30_000`.

### Decisions taken in 1g, all reversible

- **A hazard's menu is the hazard's two verbs and nothing else.** No MOVE, no FLEE. A creature encounter offers a way out because you can slip past a creature; a bloom fills the chamber. This is also what keeps the coverage matrix honest — if a hazard could be walked away from, the "stat with no option" column would cost nothing.
- **Both options on a hazard share one DC (Easy 8).** The choice is between two COST MODELS, never between an easy option and a hard one; a cheaper roll *as well as* a cheaper price would collapse the decision into one right answer per build. `FORCE` moved from Moderate to Easy — its Moderate was a placeholder for a door-forcing verb that never existed.
- **The hazard stays in the room after you answer it.** What clears is the encounter, not the world. Terrain never drifts within a run, and a bloom you walked through is still a bloom on the way back.
- **`FORCE`'s prose was written, and `DEFERRED_ACTIONS` is now empty.** A deviation from the 18 Sep decision, which named only `ENDURE`/`AVOID`/`DODGE` — see the flag below.
- **A status applied this turn is not ticked this turn.** The fix for the defect above, and a rule rather than a patch: the turns an action spends applying a status are not turns spent under it.

### The one deliberate deviation from the handoff — `FORCE` is narrated

The 18 Sep decision said 1g writes prose for `ENDURE`, `AVOID` and `DODGE`, and that `FORCE` stays in `DEFERRED_ACTIONS`. It was written before anyone had established that 1g would also make `FORCE` *selectable*, which it necessarily does — `FORCE` is one of the bloom's two verbs.

Deferring `FORCE` was only ever defensible on one claim, and `tests/outcomes.test.ts` states it out loud: **a deferred verb must be one the player can never choose.** Honouring the letter of the decision would therefore have meant shipping one of three things — a failing test, a player who shoulders through a spore bloom while the engine says nothing (a text-parity failure, `CLAUDE.md` 2.3), or a verb in the menu that cannot fire. The 18 Sep reasoning for writing prose alongside the mechanic ("freshest in whoever's context while they're building it") applies to `FORCE` identically.

So `FORCE` is written and `DEFERRED_ACTIONS` is `[]`, kept as an empty array rather than deleted so the coverage assertion still forces the next person who adds an `ActionKind` to write its prose or write down why not. **If Gautham wants `FORCE` deferred anyway, the way to do it is to not offer it** — which means cutting `FORCE` from the bloom and leaving blooms to `ENDURE` alone, and that is a design change (STR loses its only hazard answer, and the coverage matrix loses a column), not a content one.

### The empirical read — the oil economy, measured

This is the part 1g was asked to answer rather than guess. Everything below is `SWEEP=300 npm run hazard -- oil <difficulty>`, three policies, every figure read off the event stream rather than recomputed from the tables.

**The per-attempt expectation, at starting stats, in oil** (`npm run hazard -- cost`). Turns are priced at the game's own rate — one oil per `OIL.burnEveryNTurns`. Damage and Confused are reported separately because there is no honest exchange rate between a point of health and a point of oil:

| verb | cost | reward @ mixed+ | net | reward @ strong+ | net | damage | Confused turns |
|---|---|---|---|---|---|---|---|
| FORCE | 0.65 | 2.40 | **+1.75** | 0.80 | +0.15 | 0.15 | 2.15 |
| ENDURE | 0.75 | 2.40 | **+1.65** | 0.80 | +0.05 | 0.15 | 2.20 |
| AVOID | 0.48 | 2.40 | **+1.92** | 0.80 | +0.33 | 0.15 | — |
| DODGE | 0.20 | 2.40 | **+2.20** | 0.80 | +0.60 | 0.75 | — |

Paying at the band where a clearing actually happens makes every hazard in the labyrinth an oil farm. That is the finding; the gate moved to strongSuccess-or-better because of it.

**The ambient-flask sweep**, stirring, n=300, forager policy (the only one that searches — a router never picks an ambient flask up at all, so its earned share is 100% at every setting):

| `POPULATION.oilFlasks` | found/run | earned/run | **earned share** | escape % | oil left, runs reaching turn 18+ |
|---|---|---|---|---|---|
| 8–12 (was) | 0.47 | 0.22 | 32.0% | 18.7% | 4.83 |
| 5–8 | 0.31 | 0.23 | 42.5% | 20.0% | 4.77 |
| **3–5 (is)** | 0.18 | 0.23 | **55.7%** | 20.3% | 4.24 |

Win rate and the shape of the oil budget are flat across the whole range — the cut is free at n=300, and what it changes is where oil comes from, not how much of it there is. 3–5 is the first setting where the economy leans on earned oil, which is what was asked for.

**The final settings, across all four difficulties**, route policy, n=300:

| difficulty | escaped | caught | killed | out of turns | hazards met/run | net oil/run | oil left, 18+ turn runs |
|---|---|---|---|---|---|---|---|
| drowsing | 54.7% | 31.3% | 13.7% | 0.3% | 1.10 | 5.08 | 4.45 (n=11) |
| stirring | 23.3% | 61.0% | 12.0% | 3.7% | 1.61 | 5.08 | 3.51 (n=61) |
| hunting | 17.0% | 61.0% | 18.0% | 4.0% | 1.16 | 4.53 | 4.08 (n=61) |
| ravening | 16.7% | 57.0% | 17.7% | 8.7% | 1.05 | 4.28 | 3.84 (n=55) |

### 1g findings

**1. The redesign costs 12.5 points of escape rate, and it costs them in turns.** Measured as a controlled counterfactual: the same seeds and policy with every hazard verb set to zero extra turns and zero reward, against the shipped tables.

| | escaped | caught | out of turns |
|---|---|---|---|
| hazard verbs free | 34.0% | 53.5% | 0.5% |
| as shipped | 21.5% | 61.0% | 5.5% |

The arithmetic is unsurprising once stated: a bloom used to cost one turn (walk in, it resolves itself, walk out was the next turn). It now costs **four** — arrive, answer it over two turns, leave — and a snare costs three. At 1.55 hazards per run that is roughly 2.3 turns off a 20-turn budget, and turns are what the Wumpus eats.

**This is not presented as a problem to fix.** Hazards are supposed to hurt, and before 1g they barely did. It is presented because a 12.5-point swing is a large thing to introduce without anyone writing the number down, and because **it is the real answer to "are hazards net-negative in expectation"** — the oil ledger says +0.15, the turn ledger says −12.5 points of win rate, and the second is the one that decides runs. If the swing reads as too harsh in play, the cheapest lever is `ENDURE`'s flat cost (two turns) before anything structural.

**2. The bloom choice does not measurably matter yet.** The `quiet` policy takes `ENDURE` over `FORCE` on every bloom; `route` takes `FORCE` on every bloom. Across 300 seeds at stirring their outcomes are within noise of each other (23.3% vs 23.3% escaped, 61.0% vs 60.0% caught) and their Confused totals differ by 0.00–0.04 turns per run. `FORCE` is twelve times louder and buys a turn back one time in five; neither shows up.

Two readings and they are not exclusive. One: the difference is real but too small to see against a 60% catch rate driven by everything else — which is an argument for measuring it again once 1j's bot plays well enough that marginal decisions matter. Two: it genuinely is not a choice yet at starting stats, and the lever would be the scent weights rather than the cost models. **Do not act on this before 1j**; a sim result that says "nothing you do matters" usually means the policy, not the game.

**3. `DODGE` was never once chosen, and `ENDURE` only when a policy was written to want it.** The first version of the sweep had one hazard rule — best expected oil — and it picked `FORCE` and `AVOID` 164 times out of 164. That is not a finding about the verbs; it is a finding about the metric. A value function denominated in oil cannot see what `ENDURE` and `DODGE` are for (a shorter Confused, speed over caution), so it proves only that it is an oil-maximising policy while half the mechanic goes unmeasured. The `quiet` policy exists because of this and it is worth carrying into 1i: **the heuristic bot needs a second axis or it will silently benchmark one third of the action space.** (`DODGE` is still unchosen by all three policies, because `AVOID` ties it on scent and beats it on oil.)

**4. A clean run ends at Guttering, not Ember — 1f's dark-prose assumption is off by a band.** 1f chose the Ember threshold for the dark prose register on the reasoning that "a clean 20-turn run ends at Ember", which was arithmetic, not a measurement. Measured, the runs that reach turn 18+ end at **3.5 to 5.2 oil** — the middle of Guttering. So the dark register is rarer than 1f expected, and the last turns of a good run read in the lamplight after all. That is not obviously wrong, but it is not what was decided, and the decision was made on the number.

**5. `npm run sim` has never existed.** `package.json` declares `"sim": "tsx scripts/sim.ts"`; that file is not in the repo and never has been. `CLAUDE.md` §5 tells every session that touches balance to "run `npm run sim` and report the actual number", and `docs/ROADMAP.md`'s Phase 1 exit criteria list its output — both point at a command that errors. Every balance read through 1b–1g has come from a per-step visualiser sweep instead, which is a different and weaker thing: the visualisers read the true map, none of them is the pluggable-policy harness `docs/EVALS.md` specifies, and two of them disagree with the reducer about step 7. **Not fixed here** — the harness is 1i's whole job, and writing a stub `sim.ts` now would make the instruction technically true and substantively worse. Until 1i, read "the sim says" in any of these notes as "a visualiser sweep says".

**6. Oil is not a binding constraint at any difficulty, and the reason is that runs do not last.** Mean net consumption is 4.3–5.1 against a 12-point lamp; 0–2% of runs ever reach Dark; ~40–50% never leave Bright. But mean survival is 10.8–12.6 turns, because 57–64% of runs end with the Wumpus. **Oil is correctly sized for a run that lasts 20 turns and almost no run does.** Any future read of the oil numbers has to say which population it is describing, or it is measuring how early runs end.

## 1d findings — three real defects, none of them in 1d's own code

**All three are now fixed.** Finding 3 landed in `generate.ts` during the 1d session; findings 1 and 2 were decided by the PM session on 17 Sep and implemented in the 1e session the same day. What follows is kept as the reasoning, with the measured after-numbers appended to each.

Numbers are from `SWEEP=60 npm run tame`, scripted shortest-route player, starting stats.

**1. `SEND` has never fired. Not once, in 150 runs.** *(Decided 17 Sep 2026; IMPLEMENTED in 1e — see "what actually changed" below.)*

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

**What actually changed, and what it bought.** Both levers landed: `TAME_OUTCOMES.strongSuccess.brave` is now `true`, and `resolve.ts` floors a natural 20 on any successful tame to brave. P(brave) at starting stats went from a flat **0% on every creature** to 25% on a goblin, 5% on the other three, with a 5% floor that no DC can take away — the Quiet One is sendable at last.

The measured result, `SWEEP=300 npm run tame -- 1`, scripted shortest-route player, starting stats:

| | before | after |
|---|---|---|
| runs producing a brave companion (stirring) | 0/300 | **10/300** |
| runs producing a brave companion (ravening) | 0/300 | **8/300** |
| runs where `SEND` fired (stirring) | 0/300 | 1/300 |
| runs where `SEND` fired (ravening) | 0/300 | 2/300 |

**Read that second pair honestly: the gate is fixed and `SEND` is still nearly never used.** It was structurally impossible before and is merely rare now, which is a real change — but the bottleneck has moved rather than gone, and it has moved onto something already on this list. The chain is `encounter → tame → brave → stench fires while you still hold it`, and the first link is the weak one: `tame.ts` measures **0.6 encounters per run**, so ~10% of runs ever produce a brave companion and only a tenth of those get to spend it. That is the "the encounter fires about once per run" observation two sections down, now load-bearing for a second system. Fixing `SEND` usage properly means fixing encounter density; nothing further in the band tables will move it.

For what it is worth the reducer's own sweep is kinder — `SWEEP=60 npm run turn -- 1` fires `SEND` once per policy in 60 seeds, against 0 in 60 for `tame.ts` — because `turn.ts` walks a full route through `applyAction` and meets slightly more creatures. Both are the same finding at different sample sizes.

Settled separately: `SEND` is *not* a tutorial mechanic. At Drowsing the Wumpus moves once every three turns and starts ~10 rooms away, so there is nothing to bait, and teaching the irreversible button in a context where it accomplishes nothing trains players to read it as routine. Fix reachability globally, not for Drowsing.

**2. `SEND` is weakest exactly when it is needed.** *(Decided 17 Sep 2026; IMPLEMENTED in 1e.)*

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

**Implemented, and the table verifies itself now.** `COMPANION.sendScent` is a two-value record keyed by `sendTierFor(creature)`, which reads off `TAME_DC` rather than listing creature names — a fifth creature inherits a decoy strength instead of forgetting one. `sendDecoyTurns` became two derived pairs. `npm run tame` prints the claim and the decay arithmetic side by side with a ✓ or ✗ per cell, and `tests/creatures.test.ts` asserts all four:

| creature | DC | `sendScent` | alone | with Heart |
|---|---|---|---|---|
| goblin | 8 | 10 | 3t ✓ | 2t ✓ |
| lumewing | 12 | 10 | 3t ✓ | 2t ✓ |
| grellhound | 12 | 10 | 3t ✓ | 2t ✓ |
| quietOne | 16 | 5 | 2t ✓ | 1t ✓ |

Exactly the table this finding specified.

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
- **NEW — the pit has no verbs.** `VERBS_FOR_HAZARD` has no `pit` row and `ENTRY_HAZARDS` is exactly `['pit']`. It is the only instant-loss check in the game and a pit-free route is guaranteed; giving it a verb would make the one absolute thing in the labyrinth negotiable. Tested both ways, including that the reducer refuses a hazard flag set on a pit by hand.
- **NEW — every verb hazard leaves a stat with no answer.** Bloom is STR/INT, snare is INT/AGI, and the test asserts the specific pairs rather than "some stat is missing somewhere" — which a matrix that walls the same stat out of everything would also satisfy.
- **NEW — `ENDURE` never cancels Confused.** The floor of one turn is the only thing stopping INT being the safe generalist stat: INT already owns taming, and as first specified it also answered both verb hazards cleanly.
- **NEW — a hazard roll is an ordinary action roll.** Same `ACTION_DC`/`ACTION_STAT` path, one `RollResult`, no `hazard` field, modifiers assembled in `rollForAction` with everything else. This is what lets 1j's `Policy.spendFortune` pick them up for free; a hazard roll built in its own branch would be invisible to it, and that retrofit is not budgeted.

## Carried forward into 1h / 1i / 1j / 1k

1g's own inherited list is done: bloom and snare are verb encounters, the four verbs exist and are narrated, the reward and the ambient flask count are both measured and set. What the next sessions inherit — **1g additions are marked NEW**:

- **`AgentView` is still unbuilt.** `legalActions` already returns `{ action, label, dc }`, which is the shape `AgentView.legalActions` wants, so 1g's adapter is thin — but `docs/EVALS.md` requires no leakage, and `GameState` contains the true map and the Wumpus position. The adapter is the boundary and needs a test that it cannot see through walls. **1f makes `AgentView.log` nearly free:** every narration now carries a `NarrationBeat`, so the log is a typed stream rather than strings to be reassembled, and the text renderer and the agent view read the same beats.
- **The text renderer must not write prose.** Everything it needs is in `data/outcomes.ts`, and `tests/outcomes.test.ts` fails the build if a sentence appears in the engine. The same rule should hold for the renderer: if a line is missing, add a beat, do not inline a string.
- **Five verbs roll for nothing** — see 1f finding 2. Either the top bands earn a gift or four verbs stop rolling. Deliberately untouched by 1g (it was scoped out of this step); it is 1j/1k's sim to arbitrate. Note that 1g has now built the machinery a gift would use — `rewardFlasks` on an outcome row — so the cheap version of this is a data change rather than a mechanic.
- **The pit DC is still a correctness floor, not a balance number.** Easy kills a starting character 40% of the time on entry. A pit-free route is guaranteed and the draft tell is honest, so it is defensible — but nobody has measured it. (The bloom and snare DCs are no longer "hazard DCs" at all: they are the verbs' `ACTION_DC` entries, and 1g measured what they produce.)
- **`scripts/tame.ts` and `resolve.ts` disagree slightly about step 7** (see the 1e decisions). If a 1g sim number contradicts a 1d sweep number, this is the first place to look.
- **The fight-vs-tame comparison is still stale**, for the reason 1d gave plus the reducer's differing step-7 accounting. Re-measure with 1g's heuristic policy, not with either visualiser.
- **1j's heuristic policy must tame AND fight deliberately.** Six of the *seven* beats no test sweep reaches now need a companion or a fight — `spoilsTaken`, 1g's FIGHT oil reward, joined the list the day it was written, because neither sweep policy ever engages a creature. The whole encounter subsystem is verified by nothing but its own unit tests.
- **NEW — 1j's heuristic bot cannot be "pick the move that reduces distance".** It has to answer hazards, and two of the four verbs are invisible to any value function denominated in oil (1g finding 3). A bot with one axis will silently benchmark a third of the action space at zero. It also needs a second axis to be *measured* against: `scripts/hazard.ts`'s `route` and `quiet` policies are the minimum shape.
- **NEW — the FIGHT oil reward is the one number in 1g that nothing measured.** `earned driving off a creature` came back 0.00 per run at every difficulty and every setting tried, because no policy fights. Its gate was aligned with the hazard verbs' (strongSuccess+) as the conservative choice, not an observed one. The argument for mixed+ instead is that TAME pays its companion from mixed up, so a FIGHT that pays a band later is worse exactly where most wins happen — and that is the asymmetry the reward was added to correct. Settle it with a bot that fights.
- **NEW — `tests/tuning.test.ts` has a compile-time guard that guards nothing.** Same bug fixed in `tests/outcomes.test.ts` this session: `const ALL_ACTIONS: readonly ActionKind[] = [...]` makes `(typeof ALL_ACTIONS)[number]` evaluate to `ActionKind`, so the guard reads `ActionKind extends ActionKind` and is vacuously true. Adding three verbs to the union compiled clean against a list naming none of them. One-line fix (`as const`, plus an assertion in the other direction); left undone only to keep 1g's diff to its own subject.
- **Archetype-specific death beats, together with the epitaph.** GDD §2.17 argues the last line of a run carries more weight than any line inside it, and §2.16's epitaph is the literal last thing a failed run produces. Neither exists yet. Scope them as one piece of work, not two.

## Not yet decided

- All three 1d findings are now fixed and closed.
- **Whether the top three bands should earn anything for MOVE, LISTEN, SEARCH, READ, REST, USE and SEND.** GDD §2.6 promises "a small gift" at Strong Success and none of these implement one; USE and SEND do not read the band at all. 1f wrote the prose honestly around this (texture, never claim) rather than papering it. 1g's sim decides whether to add the gifts or stop rolling. See 1f finding 2.
- **Whether the prose register should shift at Ember or at Dark.** 1f chose Ember, deriving it from `OIL_BANDS[].tellRange` so it moves with the range restriction. The consequence is that a clean 20-turn run ends in the dark register, which reads as the right shape but has not been played.
- **Whether endings should be archetype-aware**, decided together with the epitaph (GDD §2.16, §2.17).
- ~~**`FORCE` is resolved — decided in shape, scheduled as step 1g, not yet built.**~~ **Built, 1g.** Kept below for the reasoning. One deviation: `FORCE`'s prose was written and `DEFERRED_ACTIONS` is empty — see "the one deliberate deviation from the handoff" above.
- **`FORCE` — the original entry.** 17 Sep PM session: `FORCE` was never meant for doors or walls, only for bypassing a spore bloom. Bloom and Snare both move from auto-resolving `ENTRY_HAZARDS` to a verb choice, mirroring the Creature encounter — `FORCE`(STR)/`ENDURE`(INT) on blooms, `AVOID`(INT)/`DODGE`(AGI) on snares — deliberately built so every stat has exactly one hazard type it can't touch. See `claude/design-decisions.md`, 17 Sep, for the full reasoning, the Endure-cost-model decision, and the oil-reward addition that rides along with it. **This is a new mechanic, not content.** **18 Sep, two more gaps closed directly by Gautham before 1g opens:** scent-marker loudness (`FORCE` loud like `FIGHT`; `ENDURE`/`AVOID`/`DODGE` quiet like `SNEAK`/`TAME` — written into GDD §2.10) and prose timing (1g writes the prose itself, unlike `FORCE` in 1f — `ENDURE`/`AVOID`/`DODGE` join `NARRATED_ACTIONS`, not `DEFERRED_ACTIONS`). The reward magnitude and the ambient oil-flask count are deliberately left open for 1g to answer empirically from its own sweep data, not decided in advance — see `claude/design-decisions.md`, 18 Sep.
- **Whether `SEND` being used in ~0.5% of runs is acceptable.** Unchanged by the above — this is encounter density, not hazard mechanics. The gate is fixed; the rate is now bound by encounter density (0.6 encounters per run), not by anything in the band tables. Raising it means raising encounter frequency, which is the entry two bullets below. Worth settling together: they are the same number.
- Whether a skittish companion should charge upkeep on the very turn you tame it. It does, twice, because a tame consumes two turns and 1e made step 7 scale with `turnCost`. Defensible, slightly mean, and a one-line change either way.
- ~~Whether the reducer should spend Fortune at all, or whether every Fortune decision belongs to the renderer~~ **Resolved, 17 Sep PM session.** 1e's assumption stands — the reducer never spends Fortune — but `Policy` gets an explicit after-roll spend hook, and it's available to every policy, not just a human renderer: an LLM playing the game needs to be able to spend Fortune too, or `docs/EVALS.md`'s required "Fortune spend rate and timing" metric has nothing to measure for non-human policies. See `docs/EVALS.md`'s Phase 1 requirements section for the interface shape. Scheduled for 1j.
- ~~**The hazard-success oil reward's magnitude**~~ and ~~**ambient oil-flask counts**~~ **Resolved, 1g, measured.** Reward: one flask at strongSuccess-or-better, for all four hazard verbs and a driven-home FIGHT. Ambient: `POPULATION.oilFlasks` 8–12 → **3–5**. Both sized in one pass against the sweep; full distributions under "the empirical read" above. **One part of the brief could not be met and is flagged rather than fudged:** "reward smaller than the average failure cost" is unsatisfiable while the reward is a whole flask — 4 oil is a third of the lamp and an average hazard failure costs under one oil-equivalent, so the only way to appear to satisfy it was to pick a band nobody reaches. Hazards are net-negative in turns instead, by 12.5 points of escape rate (1g finding 1). If Gautham wants the oil ledger itself negative, the lever is `OIL.flaskValue` or a sub-flask reward unit, and both are bigger changes than 1g's remit.
- **NEW — whether the redesign's 12.5-point turn cost is the right price.** A bloom went from costing one turn to costing four. Measured, not modelled (1g finding 1). Hazards *should* hurt and before 1g they barely did, so this may simply be correct — but nobody has played it. The cheapest lever if it reads harsh is `ENDURE`'s flat two-turn cost.
- **NEW — whether the bloom choice is a choice.** `FORCE` and `ENDURE` produce outcomes within noise of each other over 300 seeds (1g finding 2). Either the difference is real and drowned out by a 60% catch rate, or it is not a decision yet at starting stats. Re-measure with 1j's bot before touching the scent weights; "nothing you do matters" from a sim usually indicts the policy.
- **NEW — whether the dark prose register should move to Guttering.** 1f chose Ember on the arithmetic that a clean 20-turn run ends there. Measured, runs reaching turn 18+ end at 3.5–5.2 oil, which is Guttering (1g finding 4). The decision was made on a number and the number is wrong; the choice may still be right.
- **NEW — whether oil should bind at all.** 0–2% of runs reach Dark, 40–50% never leave Bright, and the reason is that 57–64% of runs end with the Wumpus around turn 12 (1g finding 6). Oil is sized for a run that lasts and almost none do. Either that is fine — oil is the *dawdling* tax and dawdlers die to the Wumpus first — or the lamp is decorative below Guttering. Needs human play to answer, not a sim.

**These four bullets — the turn-cost price, the bloom-choice question, the dark-register threshold, and whether oil binds — are what step 1i exists to answer.** All four say "needs human play" or "nobody has played it"; none of them are 1j/1k's to arbitrate first.
- **A genuinely INT-weak trap** (a mimic or fake-treasure-room — forceable by STR, dodgeable by AGI, a real cost for an INT build trusting its read of the room), to fully close the per-stat coverage matrix the hazard redesign above sets up. New content, deferred alongside creature difficulty tiers — not part of the hazard-verb step.
- **The stone-grub's chew/dig-through-terrain mechanic**, retired from v1 but slated to return. Separate from `FORCE`. Whenever it's built, it will hit the same "terrain never drifts within a run" tension the bloom-spread question above is already parked against — decide the two together, not separately.
- **A known-path map render — explicitly deferred.** Prompted by a look at a reference game (Wumpin, itch.io) that pairs its text with a force-directed node-graph of discovered rooms. The graph-layout approach is wrong for this game (it's a real grid with real directions, not an arbitrary topology), but a fixed-grid render of *only what's been discovered* is a plausible text-renderer nice-to-have — not now, not for 1.5. Gate it on data: build it only if telemetry shows players or bots actually getting lost. That requires a "lostness" metric that doesn't exist yet — see `docs/OBSERVABILITY.md`.
- Whether `RUN.maxHeartDistance = 7` is the right *balance* number. It is currently a correctness floor. Stale cross-reference fixed 18 Sep: this was written before the roadmap split — `npm run sim` still doesn't exist (1g finding 5), so it's 1j's harness that answers this, not 1g.
- Whether Confused suppressing tells plays tame. The spicier scrambled-tells version is held in reserve (GDD §2.8.2).
- Whether the Tier 4 turn budget of 18 is enough of a difference from 20.
- Whether `DRIFT.creatureMoveChance = 0.25` reads as a living world or as churn. It produces ~1.5–1.9 creature moves per turn across the whole map, but the player only ever sees four rooms. 1g should measure how often an *adjacent* creature moves, which is the only rate that matters.
- Whether a hostile creature should also *attack* each turn the player stays in the room. Currently it just sits there, un-tameable. Considered and deferred — it would add a damage source outside the encounter system.
- Whether the post-fix catch rates are right. A naive route-walker is now caught 48% of the time at Stirring and 67% at Ravening. Those are the tell-ignored floor, not the expectation — a one-line sidestep rule drops them to 35% and 43% — but nobody has yet seen what a competent player scores. 1g's heuristic bot is the arbiter.
- **Whether within-run bloom spread should come back.** Cut in 1d for schedule reasons, not because the concept is wrong — Gautham wants it reconsidered once there's real data: 1g's sim read, and playtest telemetry after the week-6 launch. Not before. Flagged as potentially tenet-breaking: `tests/creatures.test.ts` now asserts the whole hazard layout is byte-identical after 60 drift passes at every difficulty, so "terrain never drifts within a run" is a real, tested invariant today, even though it's deliberately not yet promoted into `CLAUDE.md` §3's canonical table while this stays open. Reopening this means a deliberate revision of that invariant or an explicit, narrow carve-out for blooms — not a quiet flip of one constant. Full reasoning in `claude/design-decisions.md` (project); spec-level note in `docs/GDD.md` §2.9.1.
