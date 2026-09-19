# Phase 1 — progress

Running notes for a phase that spans many sessions. `docs/ROADMAP.md` says what Phase 1 *is*; this says how far in we are and what the next session should pick up.

**Last updated:** 19 Sep 2026 — **a text-renderer legibility pass, ahead of Gate 1.** The companion oil discount is visible on screen, the charted map's difficulty gate is written into GDD 2.14.1 instead of pending, and the menu stopped printing raw union members at the player. Two of the five proposed items turned out to be already done or wrongly premised — see "What the 19 Sep legibility pass landed". 323 tests. **1j** (agent harness) is still the next step.

**Previously:** 19 Sep 2026 — **the Confused/grellhound divergence found in 1i part 2 is decided, not just measured.** Gautham's call: the grellhound's senses (and `revealedHazards`) keep firing through Confused as shipped — a kept design choice, tracked, correct only if it becomes game-breaking. GDD 2.9 and this file's "not yet decided" list both updated. **1j** (agent harness) is the next step and is unblocked.

**Previously:** 18 Sep 2026 — **1i part 2 landed**: the three companion buffs are built and measured. The grellhound warns at three rooms with a direction, the goblin makes `DISARM` free and the lumewing makes `FOCUS` free. 319 tests. The measurement found that the pre-rework hound's entire remaining value came from a GDD-vs-code divergence under Confused (finding 2), and making the beat ledger total found three beats nobody had been verifying (finding 4).

**Previously:** 18 Sep 2026 — **1i part 1 landed**: the economy-unification design is built and measured. Health is gone, oil is priced per action and scaled by margin, `FOCUS`/`DISARM`/`DROP HEART` are live, turn caps are 50/45/40/35, the Wumpus stench reaches two rooms. 310 tests. The sweep answered all five questions it was given and two of the answers are negative results worth reading (findings 1 and 2 below). 1i **part 2** (companion buff rework) and **1j** (agent harness) are both unblocked.

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
| 1h · text (classic) renderer | **done** | `src/classic/` (`Classic.tsx`, `Title.tsx`, `view.ts`, `lines.ts`, `labels.ts`, `classic.css`), `src/state/run.ts`, `tests/classic.test.ts`. The game is playable start to finish in a browser at `npm run dev`. Two small engine additions, both flagged below. `tests/tuning.test.ts`'s vacuous guard fixed. |
| 1i part 1 · economy build + rebalance | **done** | Health retired engine-wide; `OIL_PRICE` × `BAND_OIL_MULTIPLIER` through one `oilCostFor`; pit binary; `FOCUS` (per-room cap by difficulty) replacing `LISTEN`/`READ`; `DISARM` (stat-agnostic, permanent) and `DROP HEART` (free); `SEND` roll-keyed; turn caps 50/45/40/35; stench radius 2; `USE` rolled; `ENTER PORTAL`'s bad roll hands you the Heart. `getTells` returns `DoorwaySense[]`, which closes 1h finding 1. `src/classic/` follows. New visualiser `scripts/economy.ts` (7 panels) produced every number below. |
| 1i part 2 · companion buff rework | **done** | Goblin: `DISARM` free. Lumewing: `FOCUS` free (the per-room cap is untouched). Both are one `COMPANION_FREE_VERB` row and one branch at the single price hook, via `oilCostWith`. Grellhound: an escalating, directional warning at 3/2/1 — `stenchDirections` generalised to take a radius, `wumpusGrowl: boolean` replaced by `wumpusWarning`, two new beats. Measured at 4–7 points of catch rate (Panel H, new). Three stale leftovers fixed; the beat ledger made total, which found three more. 319 tests. |
| 1j · agent harness core | queued | `AgentView` adapter + a "can't see through walls" leakage test, the `Policy` interface (with the Fortune-spend hook — see `docs/EVALS.md`), `random` + `heuristic` policies, run-batch infra |
| 1k · LLM integration + benchmark run | queued | OpenRouter wiring, the fixed prompt (`docs/AGENT-PROMPT.md`), the model roster, scoring/report script, the actual n=100 batches, the human baseline |

**17 Sep, re-split from the old "1g."** Gautham asked to build the hazard-verb redesign next, before the text-renderer-and-agent-harness step that was originally slotted as 1g — and to break that original 1g into session-sized pieces, since it was already flagged (in the cost-per-step note above) as covering more of the engine than one step should. The new 1g is the hazard redesign; the old 1g's scope becomes 1h/1i/1j, split by *what each piece has to hold in context* — text renderer alone, the harness plumbing alone, then the model-facing wiring alone — rather than by file count. This split is a judgement call, not something Gautham has confirmed line-by-line; flag it back if 1h/1i/1j should be cut differently once someone is actually sitting down to open a session for one of them.

**18 Sep, a step inserted after 1g landed.** 1g's own reward numbers came from sim sweeps, not play — and 1g's findings gave real reason to distrust sim-only tuning here: the oil ledger alone can't be made net-negative without a reward smaller than a whole flask (1g's "not yet decided" list), a 12.5-point swing in escape rate went in without anyone having played it, and whether the bloom choice (`FORCE` vs `ENDURE`) is a real decision or noise is explicitly unresolved. Gautham wants to actually play the text-rendered game and get a feel for the actions before locking the reward numbers in further, rather than tuning a second time from sweep data alone. That inserts as **1i**, after 1h (nothing to play before then) and before the agent-harness work (1j, was 1i) — no sense building the harness against reward numbers about to move. The old 1i and 1j shift to 1j and 1k. This is not a reopening of the oil-farming fix from 1g (strongSuccess-or-better already closed that) — it's a second pass with a different kind of evidence.

**18 Sep, later the same day — 1i splits into two parts.** The design-review thread that produced the economy-unification GDD rewrite also surfaced the companion buff reworks (Goblin/Moth/Grellhound) as real, wanted work — but they're additive content changes, not the engine rebuild 1i was already scoped for, and folding them in would make an already-wide step wider for no coupling reason. Gautham split it: **1i part 1** is the economy build (this session's GDD rewrite, turned into code) plus its sim-driven rebalance — the original 1i scope, just bigger than "rebalance numbers" now. **1i part 2** is the companion buff rework, gated on part 1 landing so it isn't rebasing against numbers still in motion. The Skittish→Companion→Brave temperament system and Endless mode stay parked outside both parts — see `claude/design-decisions.md`, 18 Sep, for the full reasoning on what's in which bucket and why.

310 tests. `npm test`, `npm run typecheck`, `npm run build` all clean.

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

**Sixth measurement, from 1h — and the rule predicted it correctly for the first time.** Step 1h ran **234 assistant turns and 58.9M effective tokens: 252k per turn**, against 1g's 293k, 1f's 283k and 1e's 270k. Peak context 370k. The split was 98.2% cache reads, 1.4% cache writes, 0.4% output, 468 raw input tokens. (Harvested at close-out, so the close-out's own turns are partly uncounted — the same convention every figure above uses.)

The rule from 1g said: **width from the number of modules the output must be correct against, turn count from whether the step can be reasoned to an answer or has to be measured to one.** It predicted 1h as "wide but not a loop", and both halves landed. Wide: 1h had to hold `types.ts`, `resolve.ts`'s public surface, `outcomes.ts`'s helpers, `tuning.ts`'s oil bands, `wumpus.ts`'s `getTells` and GDD 2.14/2.17/2.8.1 at once — the same ~190k of source and spec, and per-turn cost duly landed in the same band as 1e/1f/1g. Not a loop: 234 turns against 1g's 272, and the extra over 1f's 193 went on **playing the game and fixing what that turned up**, not on sweeping a parameter.

Per-turn cost is now 270k → 283k → 293k → 252k across four consecutive wide steps. **Treat ~250–300k/turn as the settled rate for a step that must be correct against the whole engine, and predict the bill from the turn count alone.**

**One new cost note, for 1j and 1k.** This session had no shell on the author's machine, so every file crossed the bridge as a staged copy and came back as a commit. That is workable and it is not free: it rules out running `git`, which is why the `commits` field is *still* not closed out (1h finding 4) and why `npm run devlog` could not be run here at all (1h finding 3). **If a step's close-out has to touch git, open that session somewhere with a shell on the repo.**

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

**The `commits` field shipped empty three sessions running (1e, 1f, 1g) — once even after a dedicated follow-up commit meant to fix it. 1h is the first session where it closed out clean, and it took one more step than anyone had written down.** It's a chicken-and-egg problem: you don't know your own commit's hash until after you've made it. The fix is the follow-up commit 1g used — commit the work, then a second small commit that edits `dev-log.json` to record the first commit's hash.

**The step that was missing: read back the TABLE, not the field.** 1g did record its hash, and the field was populated the whole time — but `npm run devlog` was never re-run afterwards, so `DEV-LOG.md` went on showing `—` in session 7's Lines column and the whole exercise looked like it had failed again. Checking `dev-log.json` would have said everything was fine. So the read-back is:

```
npm run devlog
# then look at your own row. The Lines cell must hold a number, and a number
# the right SIZE for the work you just did.
```

The "right size" clause is not padding. `churnOf` swallows every git error and returns zero (1h finding 3), so a hash that does not resolve renders as `—` — **and a hash that resolves to a different session's commit renders as that session's diff**, which is what session 3 did with 1g's work for a day without anything looking wrong. A populated cell is not a correct cell. Only a human comparing the number to the work catches the second case.

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
- **The "compile-time guard" on the action list guarded nothing.** `tests/outcomes.test.ts` declared `const ALL_ACTION_KINDS: readonly ActionKind[] = [...]` and then asserted `ActionKind extends (typeof ALL_ACTION_KINDS)[number]`. Annotating the array as `readonly ActionKind[]` makes that index type evaluate to `ActionKind`, so the guard read `ActionKind extends ActionKind` and held no matter what the list contained. Adding three verbs to the union compiled clean against a list naming none of them. Fixed with `as const` plus a second assertion in the other direction. `tests/tuning.test.ts` had the same pattern and the same hole — **fixed in 1h**, and mutation-checked: dropping `endure`/`avoid`/`dodge` from the list is now a compile error.
- **A finished run explained a bright doorway as a failed lamp.** `npm run dev`, first played run. Once a run ends the renderer carries no standing senses forward — correctly — and the doorway panel then rendered that absence as "beyond your senses" at Lamp 6 of 12. Three more of the same kind in 1h finding 7; the suite was green for all four.
- **A MOVE-only walker deadlocks on a hazard.** Two test policies filtered the menu to `move` and stopped when it came back empty, which is now what standing in a bloom looks like. Trivial to fix in a test; the point is that **1j's heuristic bot cannot be written as "pick the move that reduces distance"** — it has to answer hazards, and choosing between two cost models is a real decision rather than plumbing.
- **A test that passed by luck for two steps.** "binds the encounter to ENTERING a room" asserted unconditionally that a `creatureEncounter` event leaves the flag set. Drift can walk the creature out of the room at step 7 of the same turn, in which case clearing the flag is correct — and 1g changed how many turns an action costs, which moved the RNG, and one seed finally did it. The rule was always conditional; the test just never said so.
- **A suite that was green or red depending on CPU speed.** `tests/outcomes.test.ts`'s source-of-truth sweep drives hundreds of seeded runs and sits just under vitest's 5s default on a fast desktop, over it on slower hardware. `testTimeout` is now 30s in `vite.config.ts`. A test whose result depends on the machine is not measuring what it claims to.

**`npm run dev`** — the game. Not a visualiser and not in the same category as the six above, but it earns a line here for the same reason they do: it found four defects on its first run that 280 green tests did not (1h finding 7), and every one of them was a case of the screen telling the player something untrue. The suite checks that the renderer reproduces what the engine said; only looking at it checks whether what the player *reads* is true.

Build the equivalent tool for each remaining step. It has paid for itself every time. **And for anything with a screen, open the screen.**

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

## What 1h landed

**The game is playable.** `npm run dev`, a seed, a difficulty, and a run start to finish in text — room, doorways with their tells, a numbered menu, the roll broken out, a log, an ending. That is the Phase 1 exit criterion this step existed for, and 1i is unblocked.

- **`src/classic/`** — `Classic.tsx` (the screen), `Title.tsx` (seed + difficulty), `view.ts` (the screen as data: room heading, doorway rows, status chunks, roll parts — no React, so it is assertable), `lines.ts` (`eventsToLines`), `labels.ts` (band names and the signed-number helper), `classic.css`.
- **`src/state/run.ts`** — `startRun` and `takeAction`, both pure, plus a thin zustand store holding one of them. The test drives the same two functions the screen calls; there is no test-only action path.
- **`tests/classic.test.ts`** — 14 tests, taking the suite from 266 to 280. Four assertions mutation-checked: the Wumpus-position leak, the renderer-authored-prose guard, Confused-still-senses, and range-restriction-ignored. The `tuning.test.ts` fix was mutation-checked too — dropping the three 1g verbs from the list is now a compile error where it used to compile clean.
- **`tests/tuning.test.ts`** — the vacuous compile-time guard 1g left for this step, fixed the same way (`as const` plus an assertion in the other direction). It had been silently not checking `endure`, `avoid` and `dodge` against `ACTION_DC` and `SCENT_BY_ACTION` since 1g added them.
- **Two engine additions, both small, both deliberate** — see the next section.

### The two engine changes, and why a rendering step made them

The brief said to flag new prose rather than write it, and that held: **no sentence was added to `data/outcomes.ts` and none was written into the renderer.** Two things were added anyway, and both are load-bearing for text parity rather than convenience.

- **`ARCHETYPE_WORD` in `data/outcomes.ts`.** A room's archetype is a fact the player learns from the diorama by looking at the floor, so CLAUDE.md 2.3 requires text to be able to say it, and there was no way to say it — `HAZARD_WORD`, `CREATURE_WORD` and `DIRECTION_WORD` exist for exactly this and there was no archetype row. Six title-case nouns, no sentences, no slot.
- **`TELL_TEXT` and `tellText` exported from `resolve.ts`.** Already written, already the engine's words; the renderer needs standing tells on turn 1, before any `tell` event exists. Also required by `AgentView.tells`, which is already declared as `{ direction, kind, text }` — a second copy in a renderer would be two tables to drift apart.

### Decisions taken in 1h, all reversible

- **The doorway list IS the tells display.** GDD 2.17 puts information next to the thing it concerns, and `Tell` is direction-keyed, so each exit renders as one row carrying whatever leaks through it. There is no separate "tells" panel and no compass rose.
- **A doorway has three states, not two.** Sensed-and-silent, out of lamp range, and suppressed by Confused are rendered differently. See finding 1 — this is the one place the renderer writes words about the world, and it is because the engine cannot currently express the distinction.
- **The status line is four chunks plus up to three conditional ones.** Oil level and band are one fact (`Lamp 9 · bright`), per GDD 2.17. Companion, carrying-Heart and Confused are absent rather than present-and-empty. Asserted in `tests/classic.test.ts`, not just intended.
- **Nothing on the screen is tinted alarming except a doorway leaking a stench.** GDD 2.17's "exactly one alarming signal". A low lamp and low health are `warn`, a different register. There is a test that `alarming` is set for the stench and for nothing else.
- **The log groups by turn and hides the tell lines.** They are the same four facts the doorway panel already shows, restated every turn. `eventsToLines` still produces them, so the projection stays total over the event union and `AgentView.log` can make its own call.
- **`eventsToLines` is its own module.** It fell out naturally, as the brief guessed it might: `AgentView.log` is `readonly string[]` and wants the identical projection. It is in `src/classic/` for now because it has one consumer; hoist it when it has two.
- **The run record is on the end screen.** `seed + actionLog` as copyable JSON, plus "same labyrinth again". No save system, and 1i's playtest can reproduce anything it finds for the price of a paste.
- **No CRT skin, no `WUMPUS` egg, no epitaph, no map, no agent anything.** All Phase 1.5 or 1j, all left alone.

### The 1h QoL pass — seven items from the first real playtest

Gautham played seed 730339 at stirring, mapped it on paper, mis-mapped it, took the pit route and died carrying the Heart. Seven items came back. Four were built, one was answered with a rendering fix instead of the engine change asked for, and two are open design calls.

**Built:**

- **An opening frame.** `RUN_INTRO` in `data/outcomes.ts` — four paragraphs, collapsible, open by default, above the log. Plain strings rather than a `Beat`, because a run opens at full oil by construction and a dark variant could never fire. **Every claim in it is mechanically true**, checked line by line against the tables; an intro that oversells is the game lying on turn one, before it has any credit to spend. It names three of the seven tells and no numbers — the turn limit is per-difficulty and `Slots` has no number in it.
- **WASD and the arrow keys, bound to the compass.** The real problem was that a *filtered* menu renumbers: "Move N" is 1 in a two-exit room and 3 in another, so the player re-reads the whole list every turn to find the same move. Directions never renumber. Numbers still work and still drive everything with no compass. `actionForDirection` looks up an entry `legalActions` already returned — it is not a second menu (GDD 2.17), and a direction with nothing behind it does nothing, which is what makes a hazard menu read as a wall. **SEND is excluded**: it carries a direction like the others, it is irreversible (CLAUDE.md 3), and binding "throw your friend that way" to the walking key is how someone loses a companion to a keystroke.
- **`(go back)` on the doorway you came in by**, in the menu and as `↩` on the doorway list. Pure label, no new action. The compass is absolute and the player's memory is relative — you walk east and home is now called west, and inverting that every turn is a beat spent on bookkeeping.
- **A charted map**, for drowsing and stirring. See the decision note below; this is the biggest of the seven and it is not a QoL edit.

**Answered rather than built:** MOVE and LISTEN do roll for almost nothing (1f finding 2) — but "dice only for hazards and creatures" would also delete SEARCH's find/don't-find, which is genuinely two-valued, and MOVE's critical failure is the only thing that makes a careless step loud. So the roll stays and the **panel** is now hidden for a MOVE or LISTEN that landed above a critical failure (`RollView.consequential`). The line is still in the log. Cutting the roll itself is a design call and is below.

**Three more defects found by looking at it, none of which a test caught** — same ratio as 1h's first pass, and worth noting the habit keeps paying:

| what | why no test saw it |
|---|---|
| The chart reserved the full 10×10 grid for three charted rooms | Correct output, unreadable panel. Fixed by half-height connector rows, **not** by cropping — see the decision note. |
| `= -3` beside `Agility −1 · Failing lamp −4` | A hyphen-minus for the total against a real minus for the modifiers, on one line. Found by reading a pit death in the log. |
| A direction key could scroll the log out from under the player | An arrow key with no legal action fell through to the browser. Swallowed either way now. |

### The charted map, as a decision rather than a feature

`docs/ROADMAP.md` parked the map render explicitly, and gated it on data: "build it only if telemetry shows players or bots actually getting lost." **That gate is met** — the author got lost, on paper, and died to it. Built for drowsing and stirring only, at Gautham's call.

**It is bigger than it looks, and the part that needs a decision is not the drawing.** GDD 2.2.1 says difficulty is a contract on GENERATION — it decides how the labyrinth is *built*. This adds a second axis: difficulty now also decides how much of what you have seen you are allowed to keep. Whether that belongs in the difficulty contract, or in `tuning.ts` where the diorama and `AgentView` would read the same rule, is open. `MAP_DIFFICULTIES` sits in the renderer until it is settled, because a renderer capability that turns out to be a game rule is cheaper to move than to unpick.

**What it draws, and the two things it refuses to.** Rooms with `visited` set and what is in them; doorways leading out of a charted room, *including into rooms never entered*, because standing in a room the menu offered that exit. Nothing else — an unvisited room's contents never appear, `heartRoomId` is drawn only once stood on, and the Wumpus never appears at all. That last one has a mutation-checked test with a shape worth reusing: **the map is a pure function of the labyrinth and where the player stands, so moving the Wumpus to every room in turn must not change one character.** Add a `W` to the drawing and it fails on the first seed.

A door into the dark renders as a connector to a `?`. That is the most useful thing on it — the list of places you have not been — and it is information the player already had and was tracking by hand.

**The grid is never cropped to the charted area, deliberately.** Cropping would re-frame the map every time exploration reached a new edge, moving every room the player had already placed. Fixed coordinates for the whole run; the empty space is the cheap part.

### 1h findings

**1. The engine computes which doorways it looked at and then throws it away.** `tellsFor` returns the tells it found and nothing about the doorways it did not check, so *"there is nothing through that door"*, *"your lamp does not reach that far"* and *"you are too Confused to tell"* all arrive at every renderer as the same absence.

That distinction is not cosmetic. CLAUDE.md 3 says darkness restricts the RANGE of tells and never their honesty — but a renderer that shows an out-of-range doorway the same way it shows a silent one has broken that at the presentation layer without touching a line of engine code, because the player reads silence as safety. Range and Confused are also different mechanics with different counterplay (LISTEN buys range back for a turn; Confused runs out on its own clock), so collapsing them tells the player to pull the wrong lever.

1h re-derives the sensed set in `view.ts`'s `sensedDirections`, duplicating the `restricted` logic inside `getTells`. **The diorama and `AgentView` will each have to duplicate it again.** The fix is for the engine to emit the set — a field on `tellsFor`'s return, or a `sensed` event — and it is an engine change, so it is here rather than done.

**2. Fortune cannot be spent, by anyone, and the hook 1j is scheduled to add has nothing to attach to.** GDD 2.5 spends Fortune *after seeing a roll*. `dice.ts` has `rerollWithFortune` and `bumpBandWithFortune`. 1e decided the reducer never spends it because that is a two-phase interaction and therefore a renderer concern, and `resolve.ts`'s own comments say 1j's `Policy.spendFortune` "will be handed whatever the reducer produced".

**There is no seam to hand it anything.** `applyAction` rolls at step 1 and resolves the whole turn before returning; the roll is visible only in the events, by which time the outcome is already applied. So the status line shows `Fortune 2` and there is no way to spend it — for a human, a heuristic policy, or an LLM. `docs/EVALS.md` requires "Fortune spend rate and timing" as a metric and it currently has nothing to measure.

This is a reducer API change (a two-phase `beginAction`/`commitAction`, or a spend intent passed in), not a `Policy` change, and it is bigger than the one line 1j's entry implies. **Flagging the size rather than picking the shape** — it touches `applyAction`'s signature, which every test and every visualiser calls.

**3. `npm run devlog` silently zeroes the churn column when git is unavailable.** `churnOf` shells out to `git show`; `git()` catches every failure and returns `''`. Run it anywhere the repo history is not reachable and every line count becomes `—`, the total becomes `+0 / −0`, and the script exits 0 printing *"devlog: wrote docs/DEV-LOG.md — 7 sessions, 36 defects"*. Found by running it in a container that had the working tree but not `.git`.

This is the same shape as the two close-out failures already recorded — the stale-scratch-path clobber in 1d and the empty `commits` field — **a write that reports success and carries the wrong content.** It should fail loudly on a git error rather than treating "no history" as "no changes".

**4. `DEV-LOG.md` was stale against `dev-log.json`, which is what the empty-`commits` problem had turned into — and behind it, session 3 has been carrying 1g's commit since the day 1g closed.** Both fixed at 1h's close-out; written up because the second one is the more interesting failure and nothing would have found it except reading the table.

The surface problem: the `commits` field was no longer empty — 1e, 1f and 1g all had hashes — but session 7's Lines column still read `—`, because `npm run devlog` was never re-run after the follow-up commit populated the field. **The checklist item caught the field and missed the artefact it feeds.** 1h's close-out therefore adds the read-back to the artefact, not just to the JSON: `npm run devlog`, then look at the row. Session 8 came back `+2311 / −49`, the first populated Lines cell in four sessions.

The problem underneath: **session 3 ("Docs and hygiene") listed `2a25e07`, which is 1g's hazard-verb commit.** Not a hash that failed to resolve — one that resolved to the wrong session's work, which is why nothing ever looked wrong. Session 3 rendered `+2966 / −193` and session 7 rendered `+2987 / −203`; the difference is `+21 / −10`, exactly `00b6cea` (the devlog edit), so session 3's entire churn *was* 1g's diff, and the totals row has been double-counting 1g ever since. Session 3's real commits — the five `Docs:` commits between `ef05f90` and `d4aaa7b` — were recorded nowhere. Now `['ca7b641', 'ead4059', '51e8b32', '2ea5bb5', 'e64e71d']`, and its date corrected from the 17th to the 16th to match them.

**The generalisable part: `churnOf` cannot tell a wrong hash from a right one.** A hash that does not resolve silently contributes zero (1h finding 3); a hash that resolves to someone else's commit silently contributes *their* diff. Both look like a working dev log. The only check that catches either is reading the row and asking whether the number is the right size for the work — which is a human step, and now a written one.

**5. The menu says `Move N` and the doorway above it says `north`.** `legalActions` builds its move labels from the compass letter; `DIRECTION_WORD` exists because, in its own comment, "compass letters read badly in a sentence". Both spellings are now on screen at once, six lines apart. It is small, it is a one-line change in `resolve.ts`, and it is a label rather than prose — left alone because changing an engine-owned label is not a rendering step's call. **Worth settling in 1i, where someone is actually reading the screen.**

**6. `TELL_TEXT` is the one piece of prose still living in code, and no test has ever looked at it.** `tests/outcomes.test.ts`'s source-of-truth sweep reads `narration`, `oilChanged` and `companionLost` events; `tell` events are not in `spokenText`, so their strings have never been checked against any table. Two consequences: the seven tell strings have no lit/dark variants at all, and `stench`'s *"pallid"* and `freshChisel`'s *"fresh chisel marks"* describe an APPEARANCE — which is exactly what 1f's dark-register rule exists to keep out of a lamp-less room. Neither word is in `VISION_WORDS`, so moving the table alone would not catch them. Content step, not a rendering one.

**7. Four defects that only showed up in a browser, none of which a test would have caught.** Recorded because the ratio is the point — the suite was green for all four.

| what | why no test saw it |
|---|---|
| Every doorway read *"beyond your senses"* on the end screen, at Lamp 6 | `takeAction` carries no senses forward past a finished run, correctly; the panel then explained that absence as a failed lamp. The screen was lying about a bright doorway. |
| The roll breakdown rendered `+ Agility −1` | A literal `+` separator in front of a modifier that carries its own sign. The log line had it right from the start; the two panels disagreed. |
| The ending said *"turn 15 of 20"* over a log whose last entry was *"14 · Move S"* | `finish` advances the clock by the action's turn cost before committing (1e), so `state.turn` is one past the turn the run ended on. Both numbers are correct; printing them together is not. |
| `=` and `vs` in the roll breakdown were invisible at normal contrast | `--rule` on `--panel`. CLAUDE.md 4 makes the engine label every modifier *so the player can read them*. |

**Build the equivalent habit for the next renderer: open it and play it.** The suite went 280 green through all four of these.

## What 1i part 1 landed

**The resource model is one mechanism now.** `OIL_PRICE[action] × BAND_OIL_MULTIPLIER[band]`, computed in one function (`oilCostFor`) and charged once, at step 1, before the action is resolved. That single line replaced three separate mechanisms: the passive burn every two turns, `OIL.extraCost` for the quiet verbs, and 1g's flask reward gated at strongSuccess. All three were answering "what does this cost you", in three places, which is exactly the drift `CLAUDE.md` 2.4 exists to stop.

- **`src/engine/types.ts`** — `Player.health`/`maxHealth` gone; `Action` loses `listen`/`read` and gains `focus{direction}`, `disarm`, `dropHeart`; `GameState` gains `focusedByRoom` and `heartTaken`; `Room` gains `hazardCleared`; `GameEvent` loses `damage` and gains `presence`; `NarrationBeat` loses `killedByDamage` and `carvingsWarn`, gains `hazardDisarmed`/`heartDropped`/`heartThrustUpon`. New `DoorwaySense`.
- **`src/engine/data/tuning.ts`** — `OIL_PRICE`, `BAND_OIL_MULTIPLIER`, `OIL_PRICE_OVERRIDE`, `oilCostFor`, `OIL_QUANTUM`/`quantizeOil`, `DARK_PROSE_BAND`/`isDarkBand`, `STAT_AGNOSTIC_ACTIONS`, `SEARCH_FIND_BAND`, `WUMPUS.mandatoryStenchRadius`, `disarmClears`, `DifficultyContract.focusesPerRoom`. `OilBand.tellRange`, `OIL.burnEveryNTurns`, `OIL.extraCost`, `REST.healOnSuccess`, `HazardOutcome.damage`/`oilLoss`/`rewardFlasks`, `FightOutcome.damage`/`rewardFlasks`, `TameOutcome.damage`, `SneakOutcome.damage`, `FleeOutcome.damage` and the `sendTierFor` DC tiering all deleted.
- **`src/engine/wumpus.ts`** — `getTells` returns `DoorwaySense[]`; `stenchDirections` implements the radius-2 floor as *the doorways on a shortest path*; `activeHazardOf` is the one question about what is dangerous now.
- **`src/engine/resolve.ts`** — the price charged once at step 1; `resolveFocus`; DISARM's permanence; DROP HEART; the Heart pickup routed through `heartFromRoomId` and gated on `heartTaken`; the portal's bad-roll branch; `focusableDirections`; both sensing registers emitted.
- **`src/engine/data/outcomes.ts`** — `FOCUS` and `DISARM` written (12 beats each), `PRESENCE` written, `NOTE_LED_ACTIONS` added as a third category for verbs that do not roll. **`LISTEN` and `READ` deleted: 144 strings.** See the note in the file about what that cost.
- **`src/classic/`** — the new verbs in the menu, health out of the status line, `unresolved` in the doorway panel, `formatOil`, directional labels spelled out (1h finding 5, settled with Gautham).
- **`scripts/economy.ts`** — new, seven panels. **`scripts/devlog.ts`** — 1h finding 3 closed, the hard way (see finding 6).
- **310 tests**, up from 288.

### Decisions taken in 1i, all reversible

- **`DISARM` is stat-agnostic, and that means NO stat modifier at all.** GDD 2.7 left this open and leaned agnostic "so it doesn't disturb the existing every-stat-has-exactly-one-hazard-it-can't-touch design". In a d20 game that is the only reading that actually delivers it: any stat would hand one build a universal answer to both verb hazards. Its counterweight is a Moderate DC where every other hazard verb is Easy — so it trades a worse roll for permanence rather than buying it with a better one, and at starting stats its ceiling is a plain `success` (it cannot return oil until the player has invested). **The tempting alternative was considered and declined**: DISARM testing the stat the hazard has *no* answer for (AGI on blooms, STR on snares) is genuinely nice design, and it is a deliberate revision of a `CLAUDE.md`-adjacent invariant, which this step was told not to make on its own.
- **`FOCUS` always resolves its doorway.** The band scales what the looking cost and never what came back. GDD 2.8.1 rejects probabilistic tells outright and a FOCUS that sometimes returned nothing would be one wearing a hat.
- **The FOCUS allowance is per room for the whole run**, not per visit. Walking out of a Ravening room and back in does not buy a second look — "capped per room" read literally. What is stored is the *permission*, never the answer; what is through a doorway is recomputed every turn, so a creature that wanders off cannot leave a remembered tell behind to become a lie.
- **FOCUS is withdrawn while Confused**, rather than offered and made to fail. GDD 2.17 filters `legalActions` to what is actually available; a verb that provably cannot work is a trap dressed as a choice.
- **`hazardCleared` is a flag, not a nulled `hazard`.** Generation's contracts — the pit-free route, the hazard-free route counts, the minimum safe detour — are claims about what was *built*, and they have to stay checkable after a player has been through.
- **The skittish bolt trigger moved to a critical failure** (Gautham's call). "Bolts on damage taken" could no longer fire at all.
- **`PLAYER.startingStat` 8 → 10** (Gautham's call). Every starting modifier is now 0 rather than −1.
- **`SEARCH_FIND_BAND` is success-or-better**, a band later than everything else — GDD 2.7's "finds loot at lower reliability", the price of being FOCUS's cheap sibling.
- **`DARK_PROSE_BAND` stays at Ember.** 1g measured that runs reaching turn 18+ ended in Guttering, which is the case for moving it — but this step changed the whole economy underneath that measurement, so 1g's number now describes a game that no longer exists. Re-ask it against the numbers below.

### The empirical read — every number from `npm run economy`

**Panel A, the price table.** Base × band, one number per band:

| action | base | critFail | fail | mixed | success | strong | crit |
|---|---|---|---|---|---|---|---|
| `MOVE` / `FOCUS` / `FLEE` | 0.5 | −1.5 | −1.0 | −0.5 | −0.25 | +0.25 | +0.5 |
| `FIGHT` / `TAME` / `SNEAK` / `FORCE` / `ENDURE` / `DISARM` | 1 | −3.0 | −2.0 | −1.0 | −0.5 | +0.5 | +1.0 |
| `AVOID` | 0.75 | −2.25 | −1.5 | −0.75 | −0.4 | +0.4 | +0.75 |
| `DODGE` | 1.25 | −3.75 | −2.5 | −1.25 | −0.65 | +0.65 | +1.25 |
| `SEARCH` | 0.25 | −0.75 | −0.5 | −0.25 | −0.15 | +0.15 | +0.25 |
| `REST` | 0.5 | −0.5 | −0.5 | 0 | 0 | 0 | 0 |
| `USE` / `SEND` / `ENTER PORTAL` / `DROP HEART` | 0 | — | — | — | — | — | — |

Multipliers are 3 / 2 / 1 / 0.5 / **−0.25** / **−0.5**. The payout side is deliberately smaller than its mirror and that asymmetry was found by measurement, not chosen — see finding 1.

Expected oil of one attempt, by stat, after the fix — negative everywhere, which is the anti-farming property stated as a number rather than as a gate:

| action | stat 10 | stat 12 | stat 14 | stat 16 | stat 18 |
|---|---|---|---|---|---|
| `MOVE` / `FOCUS` | −0.28 | −0.21 | −0.15 | −0.09 | −0.05 |
| `FORCE` / `ENDURE` / `SNEAK` | −1.03 | −0.85 | −0.67 | −0.55 | −0.42 |
| `AVOID` | −0.77 | −0.64 | −0.51 | −0.41 | −0.32 |
| `DODGE` | −1.28 | −1.06 | −0.84 | −0.69 | −0.53 |
| `DISARM` | −1.69 | −1.69 | −1.69 | −1.69 | −1.69 |
| `FIGHT` / `TAME` | −1.69 | −1.53 | −1.36 | −1.20 | −1.03 |

`DISARM` is flat across the row because it takes no stat modifier. That flatness *is* the mechanic.

**Panel C, what actually ends runs** (n=120 seeds × 3 policies, per difficulty):

| difficulty | cap | escaped | caught | killed | outOfTurns | turns used | rooms | oil left | ran dry |
|---|---|---|---|---|---|---|---|---|---|
| drowsing | 50 | 47.5% | 30.0% | 13.1% | 7.8% | 17.3 | 6.4 | 6.36 | 13.3% |
| stirring | 45 | 25.6% | 62.5% | 11.1% | **0.0%** | 14.3 | 7.1 | 7.49 | 3.3% |
| hunting | 40 | 20.3% | 63.1% | 16.1% | **0.0%** | 13.4 | 7.0 | 7.11 | 11.1% |
| ravening | 35 | 19.4% | 62.2% | 18.3% | **0.0%** | 12.3 | 6.6 | 7.67 | 4.7% |

**Panel B, the MOVE price** (the one number GDD 2.8.1 hands to the sim):

| | drowsing esc. | stirring esc. | hunting esc. | ravening esc. | ran dry (range) | oil left (range) |
|---|---|---|---|---|---|---|
| MOVE 0.5 | 47.5% | 25.6% | 20.3% | 19.4% | 3.3–13.3% | 6.36–7.67 |
| MOVE 0.25 | 47.5% | 23.3% | 19.7% | 19.2% | 0.8–10.3% | 7.61–8.86 |

**Settled at 0.5.** Escape rates are inside the noise either way, so the tie-break is which price leaves oil doing anything at all: at 0.5 a Drowsing run spends 18.8% of its turns at Dark and runs dry 13.3% of the time; at 0.25 the lamp is decorative. GDD 2.2.1 asks for Drowsing and Stirring to be oil-constrained, and 0.5 is the price that delivers it.

**Panel G, the hazard-cost counterfactual** — 1g finding 1, re-run:

| difficulty | as shipped | hazard verbs free | swing | hazards/run |
|---|---|---|---|---|
| drowsing | 47.5% | 48.9% | **−1.4** | 0.93 |
| stirring | 25.6% | 29.2% | **−3.6** | 1.29 |
| hunting | 20.3% | 21.7% | **−1.4** | 1.01 |
| ravening | 19.4% | 21.4% | **−1.9** | 0.89 |

**Panel F, the Heart-distance sweep** — every difficulty's band shifted by the same amount:

| shift | drowsing esc. | stirring esc. | hunting esc. | ravening esc. | rooms (drowsing) |
|---|---|---|---|---|---|
| +0 (shipped) | 46.1% | 25.0% | 21.7% | 24.4% | 6.2 |
| +2 | 40.0% | 16.7% | 10.6% | 10.6% | 8.0 |
| +4 | 32.8% | 15.0% | 7.8% | 2.2% | 9.5 |
| +6 | 28.3% | 8.9% | 1.7% | 1.1% | 11.3 |

**Panel D, the generation contract** against the new caps: mean Heart distance 5.6 / 6.5 / 7.0 / 7.0, round trip 11.2–14.0 turns, **21 to 39 spare turns**, and a "too-deep region" of **0.0 to 5.1 rooms out of 100**.

**Panel E, the two-verb choices**, expected oil at stat 10: `FORCE` −1.03 and `ENDURE` −1.03 — **0.00 apart**. `AVOID` −0.77 and `DODGE` −1.28 — **0.51 apart**.

### 1i findings

**1. The band curve was an oil farm at high stats, and it was found in the first panel run.** The first version of `BAND_OIL_MULTIPLIER` was symmetric: −0.5 and −1, the exact negatives of `success` and `mixed`. Against a Trivial DC — which is where `MOVE` and `FOCUS` are authored, on purpose, per GDD 2.6 — a character at stat 16 or 18 lands in the paying bands often enough that the *expected* value of the action turns positive. **+0.07 oil per move at stat 18.** A maxed lanternbearer refilled the lamp by walking around.

This is 1g's oil farm in a new mechanism, and it is exactly the trap the 1i brief said would recur. What is worth recording is that it recurred in a *different shape*: 1g's was a gate set at too low a band, and closing it meant moving the gate. This one was not a gate at all — it was a payout curve that beats its own cost curve once the dice stop being fair, which no gate would have caught. **Halving the two paying bands fixes it structurally**, and the fix is now asserted in two places rather than described: `tests/tuning.test.ts` checks that no action's best band returns more than its base price, and Panel A prints the whole stat grid so the next person to touch a multiplier sees the expectation go positive before they commit it.

**2. 1g's 12.5-point hazard swing does NOT transfer. It is now 1.4 to 3.6 points.** Hazards are still net-negative in turns, which is the thing GDD 2.8 says must stay true — but the magnitude has collapsed by a factor of four to nine, and the reason is arithmetic rather than mysterious: a bloom costing four turns out of a twenty-turn budget is 20% of the run, and out of forty-five it is 9%. The brief was right not to let this be assumed.

**The consequence is worth stating plainly: hazards barely matter to the outcome now.** At roughly one hazard per run and a two-to-three point swing, the verb redesign 1g spent a whole step on is close to invisible in the win rate. That is not an argument for making them harsher — 1g's own warning about tuning toward a target applies — but it is the context for any future conversation about hazard density (`HAZARD_COUNTS`) or the minimum safe detour, and it means the 12.5-point figure should stop being quoted.

**3. The turn caps are not binding, at all, and raising them did not make runs longer.** `outOfTurns` is **0.0%** at stirring, hunting and ravening, and 7.8% at drowsing. Mean turns used is 12.3–17.3 against caps of 35–50. Runs end where 1g said they ended: the Wumpus, at 60%+ at three of four difficulties, around turn 13.

The 18 Sep design entry predicted this and said so — "the turn-cap change and the Wumpus-radius widening are the two levers actually aimed at 'only 10–12 rooms', and they need to be measured as such". Measured: **the turn-cap lever did not move the thing it was aimed at.** Rooms visited is 6.4–7.1, and it is not bounded by the clock.

The honest caveat, and it is a real one: these policies walk the shortest path and do not evade. The catch rate is the tell-ignored floor, not what a competent player scores — the same caveat `PHASE-1-PROGRESS` already carries about the 48%/67% figures. **A bot that evades could turn a 50-turn budget into something.** Nothing here says the caps are wrong; it says they are not yet doing anything, and that 1j is what will find out.

**4. The turn budget can afford a deeper Heart. The Wumpus cannot.** This was the most promising lever on "runs feel short" — Panel D shows 21–39 spare turns and a too-deep region of essentially zero rooms, so the Heart band looked plainly stale. Panel F priced it: **+2 rooms of depth buys 1.8 more rooms visited and costs 6 points of escape at Drowsing, 8 at Stirring and 11 at Hunting and Ravening.** At +4 the top two difficulties are near-unwinnable (7.8% and 2.2%).

**Left unchanged, deliberately.** Every extra room of depth is two more turns inside a labyrinth where something is hunting you, and the catch rate is already the dominant failure mode. The reason the contract *looked* stale — spare turns — turns out not to be the reason it was set. Same caveat as finding 3: a non-evading policy makes depth look maximally expensive, so this is worth re-asking once 1j has a bot that runs away. It is not worth acting on now.

**The framing in GDD 2.2 is dead, though, and that is recorded rather than quietly left.** "100 rooms because a round trip binds at 20 turns" and the "too-deep region the player never chooses to enter" were both true of the old cap and are not true now: 94.9–100% of the grid is reachable inside half the budget. `tests/generate.test.ts` used to assert the opposite and now asserts the current state with the reasoning attached.

**5. The new cost model did not separate `FORCE` from `ENDURE`, and did separate `AVOID` from `DODGE`.** The bloom pair is **0.00 oil apart** in expectation — identical base price, identical band table apart from `statusTurns` and `extraTurns` — so 1g finding 2 stands exactly as written, and so does its instruction: *do not act on this before 1j's bot*. A sim saying "nothing you do matters" usually indicts the policy.

The snare pair moved because this step moved it. Health was the only thing distinguishing `AVOID` from `DODGE` ("pays in clock" vs "pays in blood"), and retiring health would have collapsed them into "AVOID but worse" — 1g had already measured `DODGE` as never once chosen. The split moved into the price (`AVOID` 0.75, `DODGE` 1.25), so the snare is **0.51 oil apart** and the clock difference survives on top. Whether that is enough to make it a real choice is 1j's question too, but it is at least a difference now.

**6. `npm run devlog` did not just zero the churn column — the first fix made it destroy the data.** 1h finding 3 said the script silently renders `—` when git is unreachable. The first attempt here warned loudly and **wrote anyway**, which replaced eight sessions of correct churn figures with zeros and then explained why the zeros were meaningless. The warning is read once; the damaged file is committed forever.

It now probes git *before* rendering anything and exits non-zero rather than writing. That is the third time this project has been bitten by the same shape — the stale-scratch-path clobber in 1d, the double-counted session 3 in 1h, this — and the shape is always **a close-out step that reports success and carries the wrong content**. Worth promoting to a habit rather than a third bullet: in a close-out, a write that cannot verify its own inputs should refuse, not degrade.

**7. Four defects that only reading or playing found, none of which a test caught first.** Same ratio as 1g and 1h, and the habit keeps paying.

| what | why no test saw it |
|---|---|
| The doorway panel hid the Wumpus's **stench** behind the unresolved marker | The stench is exempt from FOCUS, so a doorway can carry a resolved tell *and* an unresolved remainder. The ternary chain showed the marker first and returned — swallowing the one tell CLAUDE.md 3 says may never be hidden, on the turns it matters most. Found by reading the render path while wiring it. |
| `isDarkProse` turned **lit again at zero oil** | Rewritten to compare the band name for equality; `OIL_BANDS` is ordered brightest-first, so only `ember` matched and a player in total darkness read prose about what they could see. Caught by a monotonicity assertion added in the same pass — the test was written because the shape looked fragile, not because anything had failed. |
| `hazardCleared` became a **beat nothing could emit** | Removing the flask reward removed its only trigger. Caught by `tests/outcomes.test.ts`'s unreached-beat ledger, which is the one thing in the suite that notices coverage moving in either direction. |
| The log printed **`+0.125 oil`** against a status line reading `Lamp 11.5` | Two precisions for one resource on one screen — the same class as 1h finding 7's hyphen-minus. Only visible by playing a run. Oil is quantized in the engine now (which also closes a replay-determinism hole: accumulated binary fractions reach `7.749999999999999` eventually, and `GameState` must JSON round-trip unchanged). |

**8. Deleting `LISTEN` and `READ` cost 144 authored strings, and it is worth naming what went with them.** Both verbs are retired, so both tables were dead content — the same call 1g made on `HAZARD_NARRATION`'s bloom and snare rows, and prose no player can reach is content `allBeats()` and the lint report forever. But `LISTEN`'s table was the one place the six archetypes each got to *sound* like themselves: a flooded gallery carrying sound across still water, a fungal grotto eating it. `FOCUS` is subject-led and has twelve beats where `LISTEN` had seventy-two, because the sentence is now about a doorway rather than a room.

**If the archetypes feel thinner in play, that is where they went**, and the fix is to give `FOCUS` an archetype axis rather than to bring `LISTEN` back. Noted in `data/outcomes.ts` at the deletion site as well as here.

## What 1i part 2 landed

**Three companion buffs, and only one of them needed the engine.** The goblin's free `DISARM` and the lumewing's free `FOCUS` are one data row and one branch at the single place oil is charged. The grellhound's escalating warning needed new surface in `wumpus.ts`, and the reason is worth keeping: its old passive was a bare yes/no at the same radius as the free, already-directional mandatory stench floor, so making it worth a companion slot meant reaching *past* that floor — which meant asking `stenchDirections` a question it could only answer at one fixed radius.

- **`src/engine/data/tuning.ts`** — `COMPANION_FREE_VERB` (`{ goblin: 'disarm', lumewing: 'focus' }`) and `companionWaivesOil`; `GrellhoundWarningBand`, `GRELLHOUND_WARNING` (3 / 2 / 1) and `grellhoundWarningFor`. `COMPANION.grellhoundWarningRadius` is now *derived* from the table's outermost band rather than being a second number describing the same thing.
- **`src/engine/wumpus.ts`** — `stenchDirections` takes a `radius` (defaulting to the mandatory floor, so every existing call site is untouched) and is exported; new `wumpusDistance`.
- **`src/engine/creatures.ts`** — `CompanionSenses.wumpusGrowl: boolean` becomes `wumpusWarning: { band, directions } | null`. The local `withinRadius` is gone: both halves now come from `wumpus.ts`, so "which doorway leads toward it" has one implementation instead of two.
- **`src/engine/resolve.ts`** — `oilCostWith`, used at **both** places that ask what an action costs; the banded warning emitted at step 7, one narration per doorway, the same shape `revealedHazards` has had since 1d.
- **`src/engine/data/outcomes.ts`** — `grellhoundEars` and `grellhoundBarks` written; `grellhoundGrowls` rewritten to carry `{direction}`, which it never did.
- **`src/classic/view.ts`, `src/engine/types.ts`, `docs/ROADMAP.md`** — the three stale leftovers, below.
- **319 tests**, up from 310. `npm test`, `npm run typecheck`, `npm run build` all clean.

### Decisions taken in 1i part 2, all reversible

- **A waived verb is free at EVERY band, including the two that pay oil back.** The brief said "0 oil regardless of band" and the literal reading is also the only safe one: `min(0, oilCostFor(...))` would keep the payouts while removing every way to lose, which turns the verb's expectation positive — 1i finding 1's oil farm rebuilt out of a companion instead of a multiplier, and a bloom can be `DISARM`ed repeatedly. The cost is that a top-band `DISARM` with a goblin forgoes the +0.25/+0.5 it would have returned. Mutation-checked in `tests/resolve.test.ts`: the `min(0, …)` version fails two assertions.
- **`oilCostWith` rather than two lines at the charge site**, because there are two callers. The second is the spoils beat in `resolveHazardVerb`, which asks "did this hand oil back" to decide whether to say so — and asked of the price *list* it says yes at a top band even when the companion waived the charge, narrating a payout nobody received. A text-parity failure (CLAUDE.md 2.3), avoided by construction rather than by remembering.
- **`grellhoundGrowls` kept its name and became the middle band.** The two new beats are the escalation either side. Cheaper than renaming a beat every visualiser keys off, and the middle band is the one the old passive actually was.
- **One narration per warned doorway**, not one sentence listing them. `Slots` is a closed set of five nouns with no list in it, and assembling a clause is the procedural-prose line CLAUDE.md 6 rules out. Two doorways toward one Wumpus is uncommon and honest when it happens.
- **The lumewing does NOT lift the per-room `FOCUS` cap**, per the brief. It pays for the looking; it does not buy extra looks.

### The measurement — `npm run economy -- warning`, Panel H, n=300 per cell

The other two buffs are flat discounts on individually cheap verbs and companions are one-at-a-time (`Player.companion` is singular), so the three never stack and only the grellhound had a balance question.

**The policy is new and is named `houndhandler`**: it routes like `router` and refuses to step through a doorway it has been warned about — 1d's "sidesteps into a loop" rule, which 1d measured as worth about a third of the catch rate. Where the warning *comes from* is the experiment. The grellhound is granted on turn 1, which is a **counterfactual and is labelled as one**: encounter density is ~0.6 per run and a quarter of creatures are hounds, so measuring through natural acquisition would measure encounter density with a radius attached. A grellhound draws no randomness at step 7, so all three rows walk the same seeds through the same labyrinths.

| difficulty | channel | escaped | caught | killed | retreated | warned/run | new info |
|---|---|---|---|---|---|---|---|
| drowsing | no hound | 57.3% | 19.0% | 15.7% | 2.7% | 2.76 | 0.00 |
| | hound @ 2 | 60.7% | 12.3% | 18.0% | 3.7% | 3.47 | 0.40 |
| | **hound @ 3** | 51.3% | **7.0%** | 15.7% | 19.0% | 4.55 | 3.35 |
| stirring | no hound | 38.0% | 42.0% | 14.7% | 5.3% | 3.83 | 0.00 |
| | hound @ 2 | 41.0% | 35.3% | 17.0% | 6.7% | 5.06 | 0.57 |
| | **hound @ 3** | 40.7% | **31.3%** | 16.7% | 10.7% | 6.24 | 3.10 |
| hunting | no hound | 26.0% | 48.3% | 20.7% | 4.7% | 3.54 | 0.00 |
| | hound @ 2 | 27.0% | 43.7% | 22.7% | 4.7% | 4.72 | 0.58 |
| | **hound @ 3** | 25.3% | **38.0%** | 24.7% | 9.3% | 6.27 | 2.46 |
| ravening | no hound | 24.7% | 46.7% | 22.3% | 6.0% | 3.50 | 0.00 |
| | hound @ 2 | 26.0% | 42.3% | 22.7% | 7.3% | 4.56 | 0.57 |
| | **hound @ 3** | 25.7% | **35.0%** | 25.7% | 11.7% | 5.46 | 2.26 |

**The paired test is the one that counts**, because every row walks the same seeds: a 5-point difference between two proportions at n=300 sits close to one standard error and nothing could be concluded from the rates alone. Discordant pairs only, exact two-sided binomial:

| difficulty | caught @2 only | caught @3 only | p |
|---|---|---|---|
| drowsing | 26 | 10 | 0.0113 |
| stirring | 26 | 14 | 0.0807 |
| hunting | 28 | 11 | 0.0095 |
| ravening | 30 | 8 | 0.0005 |

### 1i part 2 findings

**1. The radius-3 warning is worth 4 to 7 points of catch rate, and it is not inside noise.** Same direction at all four difficulties, p ≤ 0.011 at three of them; stirring is marginal (0.08) and is the one to re-check rather than quote. The mechanism engages: the outer band fires 2.3 to 3.4 times per run, which is `new info` minus what the floor already gave.

**It does NOT raise the escape rate, and the reason is the policy rather than the buff.** `retreated` climbs 3 to 15 points wherever dodging rises — the sidestep rule will happily walk out of the entrance without the Heart, which ends the run. Pits go up a little too, for the same reason: dodging puts you in rooms you did not plan to enter. Both are facts about a one-line policy. **Do not read the escaped column here**; read `caught`, which is what the warning can actually act on. A bot that knows not to leave empty-handed is 1j's.

**2. The pre-rework grellhound was NOT worth nothing — and everything it was worth came from a divergence between the GDD and the code.** Rows 1 and 2 above were predicted to be *identical*: inside two rooms the hound reports the doorways the free floor already gives away, so a hound at radius 2 should change nothing. They are not identical, and the paired test on them is close to one-directional:

| difficulty | caught, no hound | caught, hound @2 | p |
|---|---|---|---|
| drowsing | 21 | 1 | 0.0000 |
| stirring | 20 | 0 | 0.0000 |
| hunting | 14 | 0 | 0.0001 |
| ravening | 13 | 0 | 0.0002 |

Thirteen to twenty-one runs in three hundred saved from the Wumpus, and almost none lost. **Every one of those turns is a Confused turn — measured directly, 65 of 65.** GDD 2.8.1 says the companion passives are exempt from oil and from `FOCUS` but *not* from the spores, and 2.8.2 says a Confused player receives no tells at all. `getTells` implements that; `companionSenses` does not. So the free stench goes silent under a lungful of spores and the hound keeps talking, and that gap is the whole of what the "largely superseded" passive was still buying.

**Decided, 19 Sep, directly by Gautham: leave it.** The grellhound's senses (and `revealedHazards`) keep firing through Confused rather than going silent with the stench. Explicit call, not a default — track it, and revisit only if it reads as game-breaking rather than merely generous. GDD 2.9 updated to describe this as the shipped behaviour rather than an open question.

**3. Oil-free `DISARM` and `FOCUS` cannot reopen the oil farm, and the reason is structural rather than empirical.** They waive a charge; they never change a payout. `oilCostWith` returns exactly 0 for a waived verb at every band, so the best possible outcome of attempting one is that it cost nothing — an expectation of 0 against the −1.69 and −0.28 the price table gives them unassisted. No sequence of good rolls on either verb is a source of oil, which is the property `tests/tuning.test.ts` has asserted by shape since part 1 and which `tests/resolve.test.ts` now asserts through the reducer. The version that *would* have farmed is written down in both the code comment and the mutation check, because it is the obvious implementation and someone will reach for it.

**4. The beat ledger was one-directional, and it had already let three things through.** `tests/outcomes.test.ts` records which narration beats a sweep reaches. Part 1's close-out recorded `grellhoundGrowls` as having come *off* the unreached list — "50 turns instead of 20 means a grellhound tamed early is still alive when the Wumpus closes". Re-measured at the start of this step against part 1's own committed code: it is not reached, and it had not been. Nothing failed, because the assertion only checked that *listed* beats stay unreached; a beat that stops being reached, or never started, was invisible. The previous comment said so in as many words — "only one of those two gets noticed if the list is not asserted in both directions" — and then did not assert it.

The ledger is now **total**: every beat the engine can speak is either seen by the sweep or named in the list with a reason, asserted both ways. Making it total immediately added two more:

- **`heartThrustUpon`** — the bad `ENTER PORTAL` branch, written in part 1, unverified since the day it was written. Neither sweep policy enters a portal.
- **`lampBurnsDown`** — not merely unreached but **unreachable**. Nothing in the reducer emits it; it was the passive burn's line, part 1 retired the burn and kept the beat deliberately ("a flask spilling and a lamp guttering still need words"), and `tests/resolve.test.ts` asserts a multi-turn action does *not* emit it. By the standard 1g applied to `HAZARD_NARRATION`'s dead rows that is dead content. Kept, because part 1 kept it on purpose and deleting prose is a content call — but it is now on a list that says out loud that it is unverified.

This is the same shape as 1h finding 4 and 1i finding 6, one layer up: **a check that reports success while carrying less coverage than it claims.** The fix is the same one — make it verify its own inputs, or refuse.

**5. Three stale leftovers, all found by reading rather than by any test.** None is a design question.

| what | why no test saw it |
|---|---|
| `INERT_ABOVE_CRIT_FAIL` in `src/classic/view.ts` still read `['move', 'listen']` | `LISTEN` was retired in part 1, so the second entry matched no action any renderer could be handed — and every `FOCUS` therefore got a full roll-breakdown panel for a roll whose band only moves the price. **The test passed the whole time**, because it was checking `move`/`listen` too: it agreed with the stale constant rather than with the game. Both now say `focus`, and the test counts the FOCUS rolls it saw so a sweep that never focuses cannot pass by vacuity. |
| `Companion.skittish` in `src/engine/types.ts` read "they flee if the player takes damage" | Health was retired on 18 Sep and the trigger moved to a critical failure in part 1; the comment did not move with it. Comment-only. A doc comment describing a mechanic that cannot fire is worse than none, because the type is where the next person looks first. |
| `docs/ROADMAP.md` claimed **246 authored cells** | Re-counted from `npm run prose` Panel A: it is **186** (108 room-led + 78 subject-led), still total over all 576 triples, `DEFERRED_ACTIONS` still empty. The criterion is met; the number moved because retiring `LISTEN`/`READ` took 144 strings and `FOCUS` gave 12 back, and 1g had already cut the hazard axis to the pit alone. The roadmap's visualiser list also gained `economy`. The "a full run is playable start to finish in text" checkbox is untouched — nobody played one in this session. |

**6. The bridge carried a stale file twice, and reported success both times.** Two of the files written to the repo from this session — `scripts/economy.ts` and `tests/outcomes.test.ts` — landed as an *earlier* revision than the one that was sent, with the write reporting success. Caught by checksumming every written file against the source, not by anything failing: the economy script failed to compile in a way that pointed at it, and `tests/outcomes.test.ts` had silently gone on running its old assertions, so the totality ledger in finding 4 was "verified" against a copy that did not contain it and had to be re-run.

This is the 1d clobber exactly (`PHASE-1-PROGRESS`, "Doc lock" — *"the copy can read the previous contents of that path rather than the bytes just written to it"*), and the documented fix works: **stage each revision to a fresh path and read it back.** Everything after that point in this session was written to a numbered path and checksum-verified on the far side. Worth promoting from a docs-only warning to a general one — it is not specific to `docs/`, and a test file that silently reverts is a worse failure than a doc that does, because the suite goes green.

## What the 19 Sep legibility pass landed

**A screen pass before Gate 1, not a balance pass.** No DC, price, oil cost or turn cap moved. Gate 1 asks ten human runs whether the turn cap is tense, whether tells change decisions and whether fight-vs-tame is a real choice — and none of those answers is trustworthy if the screen teaching the player to play is itself the confusing thing. Five items were proposed; **two were already done, one was declined, two were built, and looking at the result found a third defect nobody had listed.**

### What was built

- **The companion oil discount is visible, on two surfaces.** `oilCostWith` has waived `DISARM` with a goblin and `FOCUS` with a lumewing since part 2, and nothing said so — a player could only learn it by noticing the oil number had not moved. The Companion status row now names the verb (`lumewing · brave · free Focus`) and the menu marks the entry itself (`no oil`). Both read `waivedVerb`, which reads `COMPANION_FREE_VERB` — the same table the reducer charges from, so a renderer-side list cannot drift from the rule.
- **Two surfaces rather than one, deliberately.** They answer different questions at different moments. The status row answers *is this companion worth keeping*, which is asked once, at the tame. The menu marker answers *what does this cost me right now*, which is asked every turn a bloom is in the way. The brief offered a status row **or** a one-time note on first use; the one-time note loses to both, because it fires once and is gone by the turn the player needs it.
- **It says `no oil`, not `free`.** See the finding below — the menu shows no prices at all, so "free" would be free of something the screen never mentions.
- **`ACTION_LABEL` is exported from `resolve.ts`** so the status line can name a verb outside the menu. One word, same shape as 1h's `TELL_TEXT` export, and it avoids a second verb dictionary in `src/classic/`.

### What was declined, and why

**A flavour line at `DISARM`'s top two bands.** The proposal was that a Strong or Critical `DISARM` with a goblin "reads flat — the same nothing-happened text as a plain Success". **The premise does not hold: the four top bands already carry four distinct strings**, written in part 1, and the table's own header comment states the rule they were written to ("the bottom two lines must not sound like a clearing, and the top four must").

What is actually flat is the **oil ledger**, and prose must not paper over that. A top-band `DISARM` with a goblin returns nothing because the companion already waived the charge — correct by construction, since anything else rebuilds part 1's oil farm out of a companion (part 2 finding 3). Writing richer prose at those bands would make the renderer imply a better mechanical outcome than the engine delivers, which is precisely the failure 1f finding 2 identified and wrote the entire outcomes table around: *"the top bands had to differ in texture and never in claim."* Adding it would make the screen less honest, not more.

**The legibility fix is the answer to the same complaint.** Now that the player can see the goblin is paying, a top band returning nothing reads as *the discount already applied* rather than as the band doing nothing. Whether that closes it is a play question, and the bullet stays open for Gate 1.

### What was already done

**`PLAYER.startingStat` 8 → 10 landed in 1i part 1** (`0f827c3`), listed in that step's own decisions. It was proposed again on 19 Sep because **it was never struck off the "Not yet decided" list** — and the proposal was entirely reasonable, because the original reasoning is still correct and nothing on the bullet said the work had happened.

Worth stating as a rule rather than an anecdote: **a resolved item left on an open list will be re-proposed, and it will sound right when it is.** The cost here was one item in one brief. The cost of the general case is a session that redoes settled work and reports it as new. Closing the bullet is part of doing the thing.

**And the consequence the brief asked to have flagged is real, it just already shipped.** Every starting modifier is 0 rather than −1, which shifts every DC's felt difficulty by one point in the player's favour across the whole game. 1i part 1 recorded the change but not that framing. Gate 1 is playing a game that is one point easier everywhere than anything measured before 1i, and no sweep in this document straddles that change.

### The map rule is decided, not pending

`MAP_DIFFICULTIES` carried a "pending Gautham's call" flag from 1h through all of 1i. **Written into GDD 2.14.1**, cross-referenced from 2.2.1.

The question largely answered itself once 1i landed: difficulty was *already* allowed an information axis, because `focusesPerRoom` is one. So the map is that axis's second expression rather than a new kind of rule — Drowsing and Stirring resolve all four doorways and get a map; Hunting and Ravening get one look and their own bookkeeping. **And gating it never touches `CLAUDE.md` 3**, because a map is a *record* of facts already delivered under the tell rules, not a sense of its own: it adds nothing the player was not told, it only stops them holding all of it in their head.

**Still open, and much narrower: placement.** `focusesPerRoom` is a `DifficultyContract` field in `tuning.ts`; `MAP_DIFFICULTIES` is a renderer constant. One renderer can carry that. The moment a second wants a map — the diorama, or `AgentView` deciding what a bot may remember — the rule has to live where both read it, and `focusesPerRoom` is the precedent for where. Not moved on spec: it would add a field to the difficulty contract and touch the generation tests, for no consumer that exists yet.

### The controller pass, same day — and the bug that prompted it

**`FOCUS` was unreachable from the keyboard, and the menu displayed a key that did something else.** `Move north` and `Focus north` both rendered `W`; `W` always fired the MOVE, because `actionForDirection` returns its move branch first. Found by Gautham playing, not by the suite.

**The binding was correct when it was written.** 1h added compass keys when MOVE was the only directional verb in the normal menu — SNEAK and FLEE appear only in encounters, where MOVE is absent, so "the directional action for this way" was unambiguous by construction. **1i added `FOCUS` as a second directional verb in the same menu and silently invalidated that**, and nothing failed, because 1h's test asserted the binding was *valid* (it resolves to something `legalActions` returned) and never that it was *unambiguous*. A verb added in one step broke an input rule established in another, with no overlap between the two steps' diffs.

Two fixes, and the first matters more than the feature:

- **The displayed key now asks the binding what it would do** and claims the compass key only when the answer is that exact row; anything else falls back to its number. It cannot display a mismatched key again, whatever verbs are added later. `(go back)` is narrowed to MOVE — focusing through the doorway you came in by is looking, not going.
- **A control pad**, with `F` arming FOCUS and the next direction spending it. One scheme at every difficulty: the verb is identical at all four and only `focusesPerRoom` differs, so splitting the input by difficulty would cost muscle memory for no design payoff. `E` searches, `R` rests. Everything that is a verb rather than a direction keeps its number and its row.

**The pad is an argued exception to GDD 2.17, now written into that section.** A four-cell compass with a dark cell where a wall is looks like the greyed-out verb list 2.17 forbids. It is not: the cost that rule protects is reading cost — scanning a long list for the few live rows — and a compass is one fact about the room, already in the doorway panel, that never changes length. The fixed shape is the point; a cross with one lit arm reads as a dead end at a glance. The exception is narrow and says so: verbs stay in the list, the list stays `legalActions` verbatim.

**Two layout changes.** The opening frame is its own tile below the title rather than the top of the scrolling log, where it was pushed off-screen by turn three; it folds itself away once the run is under way, once, and is the player's toggle after that. And **the controller sits above the charted map** — the one place this deviates from Gautham's sketch, because the map's grid is fixed-size and mostly empty early (deliberately), so with it in between, the pad started the run below the fold. Vertical order by frequency of use: the pad is touched every turn.

### Findings

**1. The menu has never shown what anything costs.** `LegalAction` carries `{ action, label, dc }` and no price, so in a game whose entire resource model is *per-action oil scaled by band* (`OIL_PRICE` × `BAND_OIL_MULTIPLIER`), the player picks a verb without being told its price and learns it afterwards from the oil line. This is the root cause the companion-discount item is a symptom of: a discount is invisible partly because **the thing being discounted is invisible**.

Not fixed here, because it is a judgement call rather than an oversight. The exact cost is not knowable before the roll — the band sets the multiplier — so the menu could only show the *base* price, which is the vocabulary GDD 2.8.1's own price table uses. That is honest and teachable, but it is a new column on every row of the primary screen and it deserves to be chosen rather than slipped in under a legibility pass. **The `no oil` marker is written to survive either answer**: it names the currency, so it reads correctly with or without a price column.

**2. The menu printed raw union members where every other surface printed the creature's name.** `legalActions` built `Send the ${companion.kind}` and `${ACTION_LABEL[option]} the ${creature}`, so the Quiet One appeared as **`Send the quietOne east`** and `Fight the quietOne` — beside a status line that correctly said `Quiet One` and prose that has always used `CREATURE_WORD`. Three surfaces, two spellings, one of them an identifier.

**Found by printing the menu, not by any test**, and no test could have caught it as written: every renderer assertion in `tests/classic.test.ts` checks that the menu *is* `legalActions(state)`, which is true of a menu full of identifiers. `CREATURE_WORD` exists for exactly this and `resolve.ts` already imported its siblings. Fixed at both sites.

**3. The habit keeps paying, and it is now three passes in a row.** 1h's first pass found four defects with a green suite; the QoL pass found three more; this one found two. Every one was the screen saying something untrue or unreadable while every assertion passed, because the tests check that the renderer faithfully reproduces the engine — and a faithful reproduction of an identifier is still an identifier. **The suite cannot tell you that a true sentence reads wrong.**

### Verified

`npm run typecheck`, `npm test` (**323**, up from 319) and `npm run build` all clean, run on the repo rather than reported from a copy. Two of the four new assertions mutation-checked: dropping the waiver from the status row fails, and hardcoding `waivedVerb` to a fixed verb fails three tests. **The menu marker's JSX condition is not covered** — the renderer tests assert `view.ts`, not React, so a broken condition there would pass. Verified by eye instead, in a layout harness and in a printed hazard menu; stated rather than implied.

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

1g's own inherited list is done. 1h's is done too. **1i part 1 closed three of the items below and added four; its additions are marked NEW-1i.** What the next sessions inherit:

- ~~**NEW-1h — the engine cannot say which doorways it looked at**~~ **Closed, 1i.** `tellsFor` returns `DoorwaySense[]` — one entry per doorway carrying its resolved tells, an `unresolved` flag, a `suppressed` flag and a `focusable` flag — and `view.ts`'s `sensedDirections` is deleted. It was going to be fixed here whatever: `FOCUS` makes the distinction load-bearing rather than merely untidy, because a renderer that shows an unresolved doorway the way it shows an empty one has no way to tell the player which doorway is worth a turn. The open question in "Not yet decided" was *where* it should live — a field on `tellsFor`'s return, or an event. **The answer turned out to be both**, and for different reasons: the return value is what three renderers read, and a `presence` event is what text parity requires (CLAUDE.md 2.3 — presence is a fact the player learns, so the event stream has to be able to say it).
- **NEW-1i — nothing binds except the Wumpus** (findings 2, 3, 4). Turn caps do not bind (0.0% `outOfTurns` at three difficulties), hazards swing the win rate by 1.4–3.6 points, and a deeper Heart costs more escape rate than it buys rooms. Runs end to the Wumpus at ~60%, around turn 13, at every difficulty above Drowsing. **Every lever this step had was measured and none of them is the lever.** That points squarely at 1j: the sweep policies do not evade, so the catch rate is the tell-ignored floor rather than a balance figure, and nobody has yet seen what a competent player scores. Re-ask findings 3 and 4 with a bot that runs away before touching turn caps or Heart distance again.
- **NEW-1i — `FOCUS` is unmeasured as a decision.** The `scholar` policy focuses the doorway it is about to walk through, which is a reasonable human habit and is *not* play: it never weighs looking against walking, never saves its Ravening single look for a moment that matters, never declines to look. Focuses per run came in at 2.2 (Drowsing/Stirring) and 1.6–1.7 (Hunting/Ravening), so the difficulty cap is biting — but whether the information economy is *interesting* is exactly the kind of question 1g finding 3 warns a one-axis value function cannot answer. **1j's heuristic bot needs an information axis**, the way 1g said it needs a second cost axis.
- **NEW-1i — `DISARM` has no measured case for existing.** It is built, tested and priced, and no sweep policy ever chooses it, because its value is entirely in a *return trip* through a room and none of these policies model one. That is the same hole `SEND` sat in through 1d–1f. It is not evidence the verb is wrong; it is the absence of evidence either way.
- **NEW-1i — a close-out write that cannot verify its inputs should refuse, not degrade** (finding 6). Third occurrence of the shape. Worth promoting from a finding to a rule the next close-out reads.
- **NEW-1h — Fortune is unspendable and `Policy.spendFortune` has nothing to attach to** (1h finding 2). `applyAction` resolves the whole turn in one call; there is no seam between the roll landing and the outcome applying. 1j's entry below describes this as a hook on `Policy`; it is a change to `applyAction`'s signature, which every test and visualiser calls. **Budget it as reducer work, and decide the shape before 1j opens.** `docs/EVALS.md`'s "Fortune spend rate and timing" metric has nothing to measure until it exists.
- **NEW-1h — `eventsToLines` is the projection `AgentView.log` wants.** It lives in `src/classic/lines.ts`. It is total over the `GameEvent` union and ends in a `never` check, and its `wumpusMoved` case is the one that matters: that event carries the Wumpus's true room id, so **`AgentView.log` cannot be `events.map(e => e.text)`**. There is already a mutation-checked test that no line ever contains the Wumpus's room. Hoist the module out of `classic/` when the agent view becomes its second consumer.
- **NEW-1h — `TELL_TEXT` is untested prose in `resolve.ts`** (1h finding 6), with no dark variants and two appearance words in it. Content step.
- **NEW-1i — the 1i decision entry is in `claude/design-decisions-1i.md`, not appended to the main log.** The Projects tool has no append, so editing `claude/design-decisions.md` means rewriting all ~30KB of it out of a tool result — which is the same class of risk as 1i finding 6 (a close-out write that reports success and carries the wrong content), applied to five sessions of design history. The continuation file says where it belongs; merging it is a copy-paste and should be done somewhere the whole doc is in hand.
- ~~**NEW-1h — the move label and the doorway label disagree on screen**~~ **Closed, 1i**, with the screen in front of us and Gautham's call: `directionalLabel` spells the compass out, so the menu reads `Move north` beside a doorway list that says `north`.
- ~~**NEW-1h — `npm run devlog` zeroes the churn column instead of failing when git is unreachable**~~ **Closed, 1i, and it bit on the way out** — see finding 6. The script now probes git before rendering and exits rather than writing. **The second half of 1h finding 4 is still open and is not fixable in the script**: `churnOf` cannot tell a hash that resolves to *another session's* commit from one that resolves to yours, and both render as a working dev log. Only a human comparing the number to the work catches that, which is why the read-back step says "a number the right SIZE".
- **NEW-1h — three noun dictionaries now live in three files.** `ACTION_LABEL` in `resolve.ts`, `ARCHETYPE_WORD`/`CREATURE_WORD`/`HAZARD_WORD`/`DIRECTION_WORD` in `data/outcomes.ts`, `BAND_LABEL` in `src/classic/labels.ts`. One renderer can live with that; the diorama will want all three, and that is when it stops being a preference.
- **NEW-1i — `AgentView.doorways` replaced `AgentView.tells` in the type, and 1j inherits the new shape.** One entry per doorway rather than one per tell, because a model handed only the tells that fired cannot tell an empty doorway from an unresolved one — the same defect as 1h finding 1, and it would make `FOCUS` unplayable for an agent since there would be nothing to decide which doorway is worth the turn.
- **`AgentView` is still unbuilt.** `legalActions` already returns `{ action, label, dc }`, which is the shape `AgentView.legalActions` wants, so the adapter is thin — but `docs/EVALS.md` requires no leakage, and `GameState` contains the true map and the Wumpus position. The adapter is the boundary and needs a test that it cannot see through walls. **1f makes `AgentView.log` nearly free:** every narration now carries a `NarrationBeat`, so the log is a typed stream rather than strings to be reassembled, and the text renderer and the agent view read the same beats.
- ~~**The text renderer must not write prose.**~~ **Held, 1h.** No sentence was added to `data/outcomes.ts` and none was inlined in the renderer. `tests/classic.test.ts` now asserts the other direction too: every narration on screen is character-for-character the string the engine emitted. The two exceptions are named in 1h finding 1 and both exist because the engine cannot express the fact at all.
- ~~**Five verbs roll for nothing**~~ **Partly closed, 1i.** Every verb's band now carries its own oil delta (`oilCostFor`), so `MOVE`, `SEARCH`, `REST`, `USE` and `SEND` all have a mechanical consequence at every band where they previously had none — the top bands hand oil back and the bottom bands cost more. `SEND` additionally gained a real band effect (the decoy duration). **What remains open is `USE` and `SEND` not reading the band for anything else**, and GDD 2.6's "a small gift" at Strong Success is now satisfied in oil rather than in treasure, which may or may not be what it meant. Original entry below for the reasoning.
- **Five verbs roll for nothing** — see 1f finding 2. Either the top bands earn a gift or four verbs stop rolling. Deliberately untouched by 1g (it was scoped out of this step); it is 1j/1k's sim to arbitrate. Note that 1g has now built the machinery a gift would use — `rewardFlasks` on an outcome row — so the cheap version of this is a data change rather than a mechanic.
- **The pit DC is still a correctness floor, not a balance number.** Easy kills a starting character 40% of the time on entry. A pit-free route is guaranteed and the draft tell is honest, so it is defensible — but nobody has measured it. (The bloom and snare DCs are no longer "hazard DCs" at all: they are the verbs' `ACTION_DC` entries, and 1g measured what they produce.)
- **`scripts/tame.ts` and `resolve.ts` disagree slightly about step 7** (see the 1e decisions). If a 1g sim number contradicts a 1d sweep number, this is the first place to look.
- **The fight-vs-tame comparison is still stale**, for the reason 1d gave plus the reducer's differing step-7 accounting. Re-measure with 1g's heuristic policy, not with either visualiser.
- **1j's heuristic policy must tame AND fight deliberately.** Six of the *seven* beats no test sweep reaches now need a companion or a fight — `spoilsTaken`, 1g's FIGHT oil reward, joined the list the day it was written, because neither sweep policy ever engages a creature. The whole encounter subsystem is verified by nothing but its own unit tests.
- **NEW — 1j's heuristic bot cannot be "pick the move that reduces distance".** It has to answer hazards, and two of the four verbs are invisible to any value function denominated in oil (1g finding 3). A bot with one axis will silently benchmark a third of the action space at zero. It also needs a second axis to be *measured* against: `scripts/hazard.ts`'s `route` and `quiet` policies are the minimum shape.
- ~~**NEW — the FIGHT oil reward is the one number in 1g that nothing measured.**~~ **Dissolved, 1i.** The question was whether FIGHT should pay a band earlier than the hazard verbs, since TAME pays its companion from mixed up. Folding the reward into the per-band oil delta makes FIGHT and TAME the same curve, so there is no longer a gate to disagree about; the fight/tame asymmetry lives where CLAUDE.md 3 wants it, in the turn cost and the scent. Original entry below.
- **NEW — the FIGHT oil reward is the one number in 1g that nothing measured.** `earned driving off a creature` came back 0.00 per run at every difficulty and every setting tried, because no policy fights. Its gate was aligned with the hazard verbs' (strongSuccess+) as the conservative choice, not an observed one. The argument for mixed+ instead is that TAME pays its companion from mixed up, so a FIGHT that pays a band later is worse exactly where most wins happen — and that is the asymmetry the reward was added to correct. Settle it with a bot that fights.
- **NEW — `tests/tuning.test.ts` has a compile-time guard that guards nothing.** Same bug fixed in `tests/outcomes.test.ts` this session: `const ALL_ACTIONS: readonly ActionKind[] = [...]` makes `(typeof ALL_ACTIONS)[number]` evaluate to `ActionKind`, so the guard reads `ActionKind extends ActionKind` and is vacuously true. Adding three verbs to the union compiled clean against a list naming none of them. One-line fix (`as const`, plus an assertion in the other direction); left undone only to keep 1g's diff to its own subject.
- ~~**NEW — 1i part 2's scope, sketched but not written down anywhere else.**~~ **Closed, 1i part 2** — and two of the three guesses in it were right. The goblin's dismantle-charge idea did NOT turn out to be already answered by `DISARM` existing; it became a discount ON `DISARM`, which is a different thing. The lumewing's proposed tell-range extension was checked against the current lantern-radius passive as instructed and deliberately not built: the moth pays for looking, and lifting the per-room `FOCUS` cap is the larger decision the brief ring-fenced. The grellhound was correctly identified as the one clearly still open, and the reason given — "its passive having been mostly subsumed by the universal radius-2 stench floor" — was right on paper and wrong in fact; see finding 2. Original entry below.

- **NEW — 1i part 2's scope, sketched but not written down anywhere else.** From the same 18 Sep design thread: the Goblin's dismantle-charge idea is now naturally `DISARM` (§2.7) once that verb exists, so it may already be answered rather than needing its own rework. The Moth's (lumewing) proposed tell-range extension was raised but never confirmed against the current lantern-radius passive — check before building. The Grellhound's escalating-warning rework (radius 3/2/1, more detail as the Wumpus closes) is the one clearly still open, and it's now also the fix for the Grellhound's passive having been mostly subsumed by the universal radius-2 stench floor (§2.10) — without this rework the Grellhound's tame is a weaker pick than it used to be. None of this is spec'd to build yet; write the actual scope when part 2 opens.
- ~~**NEW-1i-part-2 — a Confused player's companion keeps talking, and that divergence was the grellhound's only remaining value.**~~ **Decided, 19 Sep.** GDD 2.8.1 says the companion informational passives are exempt from oil and from `FOCUS` but not from the spores; `getTells` implements that and `companionSenses` does not. Measured at 13–21 runs in 300 saved from the Wumpus, entirely on Confused turns (finding 2). Gautham's call: keep the divergence as shipped — track it, correct only if it becomes game-breaking. Not a patch, a kept design choice.
- **NEW-1i-part-2 — `lampBurnsDown` is a beat nothing can emit.** Part 1 kept it on purpose when the passive burn was retired. By the standard 1g applied to `HAZARD_NARRATION`'s dead rows it is dead content; it is now on the unreached ledger saying so out loud. Emit it or cut it, next time someone is in `data/outcomes.ts`.
- **NEW-1i-part-2 — `heartThrustUpon` has never been verified by any sweep.** Written in part 1, reached by neither sweep policy, because neither enters a portal. It is the bad `ENTER PORTAL` branch, which is the one place the game hands the player the Heart without being asked — exactly the branch you would want a sweep to have walked. **1j's heuristic bot should take a portal.**
- **NEW-1i-part-2 — the grellhound is now measurably worth a companion slot, and nothing measures how often you get one.** The warning is worth 4–7 points of catch rate to a player who HAS a hound; Panel H grants one on turn 1 because encounter density (~0.6 per run, a quarter of them hounds) would otherwise be the thing being measured. That is the same hole `SEND` sat in through 1d–1f and `DISARM` sits in now. It is not evidence the buff is wrong; it is the absence of any run-level estimate of what it is worth in practice.
- **NEW-1i-part-2 — a bridge write reported success and carried an older revision, twice** (finding 6). The 1d fix — stage each revision to a fresh path, read it back — works and was used for the rest of the session. Worth reading as a general rule rather than a docs-only one: a test file that silently reverts is worse than a doc that does, because the suite goes green over it.

- **Archetype-specific death beats, together with the epitaph.** GDD §2.17 argues the last line of a run carries more weight than any line inside it, and §2.16's epitaph is the literal last thing a failed run produces. Neither exists yet. Scope them as one piece of work, not two.

## Not yet decided

- **NEW-1i-part-2 — does a top-band `DISARM` with a goblin feel like a buff?** It is free rather than profitable, so it forgoes the +0.25/+0.5 the band would have paid. Correct by construction (anything else farms — finding 3) and slightly odd to read, since the best possible roll and a plain success cost the same nothing. Nobody has played it. **Sharpened 19 Sep, and one proposed fix ruled out:** what is flat is the OIL LEDGER, not the prose — `DISARM`'s four top bands already carry four distinct strings, written in part 1, and its table comment already states the rule they follow ("the bottom two lines must not sound like a clearing, and the top four must"). A flavour line at the top two bands was proposed to give the buff texture and is **declined**: prose that implies a better outcome where the mechanics deliver an identical one is the engine lying about a mechanic, which is the exact failure 1f finding 2 documents and wrote the whole table around ("the top bands had to differ in texture and never in claim"). The legibility answer is the 19 Sep pass instead — the player now sees that the goblin is paying, so a top band returning nothing reads as *the discount already applied* rather than as the band doing nothing. Whether that is enough is still a play question.

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

- **NEW-1h — what shape the Fortune seam takes.** 1h finding 2: Fortune is unspendable by anyone because `applyAction` resolves a whole turn in one call. Two candidate shapes — a two-phase `beginAction`/`commitAction`, or a spend intent passed into `applyAction` — and they differ in what they cost everything that already calls the reducer. **Decide before 1j opens**, because `docs/EVALS.md`'s Fortune metric depends on it and the retrofit gets more expensive with every test written against the current signature.
- **NEW-1h — whether the engine should emit the sensed doorway set.** 1h finding 1. Today every renderer re-derives it and the darkness invariant is only as safe as the last renderer to get it right. The question is not whether to fix it but where: a field on `tellsFor`'s return, or an event.
- **NEW-1h — whether `Move N` should read `Move north`.** 1h finding 5. A one-line label change in `resolve.ts`; on screen next to a doorway list that says "north". Left for whoever is reading the screen in 1i. *Partly overtaken by the QoL pass: the menu now shows a compass KEY rather than a number for directional entries, so the letter is doing double duty.*
- **NEW-1h/QoL — whether MOVE and LISTEN should roll at all.** Raised by Gautham on first play: "why am I rolling for walking?" He is right that five of six bands do nothing. The roll stays for now and the breakdown panel is hidden instead. **The real cost of cutting it** is that `SCENT.criticalFailureBonus` is the only thing making a careless step loud — delete the roll and clumsy movement stops feeding the Wumpus — plus 72 strings of MOVE prose become dead content. Note the precise scope: MOVE and LISTEN, *not* "hazards and creatures only", because SEARCH/READ/REST are genuinely two-valued.
- ~~**NEW-1h/QoL — whether `PLAYER.startingStat` should be 10 rather than 8.**~~ **Done in 1i part 1** (`0f827c3`), as one of that step's listed decisions; every starting modifier is 0 rather than −1. Left sitting in this list afterwards, which is how the 19 Sep legibility brief came to propose it a second time. Kept struck through rather than deleted, because the trap is worth naming: **a resolved item that stays on the open list will be re-proposed, and the proposal will sound reasonable** — the original reasoning is still correct, and nothing about it says the work has already happened. Closing a bullet is part of doing the thing.
- ~~**NEW-1h/QoL — where the map-vs-difficulty rule lives**, and whether difficulty is allowed an information axis at all.~~ **Decided 19 Sep 2026 and written into GDD 2.14.1**, cross-referenced from 2.2.1. Difficulty was *already* allowed an information axis — 1i's `focusesPerRoom` is one — so the map is that axis's second expression rather than a new kind of rule, and the question answered itself once 1i landed. A map is a record of facts already delivered under the tell rules, not a sense, so gating it never touches `CLAUDE.md` 3. **Still open, and narrower: placement.** `focusesPerRoom` is a `DifficultyContract` field; `MAP_DIFFICULTIES` is a renderer constant. One renderer can carry that. The second one that wants a map — the diorama, or `AgentView` deciding what a bot may remember — needs the rule somewhere both read.

~~**These four bullets — the turn-cost price, the bloom-choice question, the dark-register threshold, and whether oil binds — are what step 1i exists to answer.**~~ **Answered, 1i, three of four — and the fourth is answered differently than expected.**

- **The turn-cost price**: hazards now swing the win rate by 1.4–3.6 points, not 12.5 (finding 2). The redesign is no longer expensive; if anything it is close to invisible.
- **The bloom choice**: still 0.00 oil apart (finding 5). 1g's instruction stands unchanged — do not act before 1j's bot.
- **Whether oil binds**: yes at `MOVE` 0.5, and that is why 0.5 was chosen. 3.3–13.3% of runs run dry and Drowsing spends 18.8% of its turns at Dark; at 0.25 the lamp is decorative (Panel B).
- **The dark-register threshold**: **deliberately not answered.** 1g's measurement (runs reaching turn 18+ end in Guttering) was the case for moving it, and this step replaced the economy that measurement describes. Re-ask it against the 1i oil distribution rather than acting on a number about a game that no longer exists.

**Still open, and now sharper: nobody has PLAYED the rebuilt economy.** 1i was a build-and-measure step; every figure above comes from policies that walk shortest paths and do not evade. The four questions this list was written to hold have moved, but the reason they were on it — "needs human play" — has not been retired by anything here.

### NEW-1i — open after the rebuild

- **Whether the turn caps should come back down.** They do not bind (finding 3). Either they are correct and waiting for a player who uses them, or 50 is a number with nothing behind it. Do not touch before 1j.
- **Whether hazard density should rise.** At ~1 hazard per run and a 2–3 point swing, the whole verb subsystem barely reaches the outcome (finding 2). `HAZARD_COUNTS` and `minSafeDetour` are the levers; neither should move on sim data alone.
- **Whether the `FOCUS` cap of 1 at Hunting/Ravening is the right shape.** It binds (1.6–1.7 focuses per run against a cap of 1 per room), which is what it was for. Whether it reads as tense or as arbitrary is a play question.
- **Whether `DISARM` earns its slot** (carried-forward above). Nothing measures a verb whose value is in a return trip.
- **Whether the `metallic` Heart tell should be exempt from `FOCUS`** like the stench is. It is currently *not* — an unfocused doorway with the Heart behind it reads as `something, unlooked at`. That is consistent and it is also the one case where the presence signal is a reward rather than a risk, which may want its own answer.
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
