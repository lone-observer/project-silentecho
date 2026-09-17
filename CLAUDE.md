# Project Silent Echo

A cozy-horror, Wumpus-derived solo dungeon crawler. Browser-first, TypeScript, shipping free to itch.io.

**Read `docs/GDD.md` before changing anything that touches game rules. Read `docs/ROADMAP.md` before starting a work session.** `docs/EVALS.md` governs the agent harness; `docs/OBSERVABILITY.md` governs telemetry. This file is the constitution — the things that must stay true no matter which phase we're in.

---

## 1. The shape of this thing

One pure rules engine. Three renderers over it.

```
                    ┌─────────────────┐
                    │   src/engine/   │   pure, deterministic, no I/O
                    │  the rules      │
                    └────────┬────────┘
                             │
         ┌───────────────────┼───────────────────┐
         │                   │                   │
    ┌────▼────┐        ┌─────▼─────┐       ┌─────▼─────┐
    │  text   │        │  diorama  │       │   agent   │
    │ classic │        │  main UI  │       │ sim + LLM │
    └─────────┘        └───────────┘       └───────────┘
```

**All three renderers are products, not scaffolding.** The text renderer is a shipping feature (the author loves the 1973 original and Oregon Trail — classic mode is a headline feature, not a stepping stone). The agent renderer is both our balance harness and a public surface that lets an LLM play the game. None of them is throwaway.

This is why the engine constraint below is absolute.

---

## 2. Non-negotiable rules

### 2.1 Engine purity

`src/engine/` imports **nothing** from React, the DOM, PixiJS, Node APIs, or any I/O. No `Date.now()`, no `Math.random()`, no `fetch`, no `console`. It is a library of pure functions over serializable state.

```ts
applyAction(state: GameState, action: Action, rng: Rng): { state: GameState, events: GameEvent[] }
```

There is a build-failing test enforcing this. **If that test ever gets in your way, the code is wrong, not the test.** Never disable, weaken, or add exceptions to it. If you think you need an exception, stop and ask.

### 2.2 Determinism

`(seed, actionList) → identical run, every time, forever.`

RNG state serializes with `GameState`. No wall-clock time, no ambient randomness, no iteration over unordered collections in a way that affects outcomes. Replays, the sim harness, agent play, and any future server-side validation all depend on this.

### 2.3 Text parity

**Every fact the player can learn from any renderer must be expressible as text from the engine's event stream.**

The diorama is atmosphere and speed. The text is truth. If a hazard is only discoverable by looking at a sprite, that's a bug — it breaks classic mode, breaks accessibility, and breaks agent play. Engine events carry meaning; renderers carry presentation.

### 2.4 Content is data, not code

Outcomes, DCs, creature stats, loot tables, prose — all live in `src/engine/data/` as typed data structures. Never inline a rule in a component or a branch in `resolve.ts` that should be a table row. The author tunes balance by editing tables, constantly. If tuning requires a code change, the design is wrong.

### 2.5 State is JSON

`GameState` is plain serializable data. No classes, no `Map`/`Set`, no functions, no cyclic references. It must survive `JSON.parse(JSON.stringify(state))` unchanged.

---

## 3. Design invariants

These are game-design decisions already made and deliberately defended. Do not "improve" them without being asked.

| Invariant | Why |
|---|---|
| **Tells never lie.** An adjacency cue always appears when the thing is adjacent, and never when it isn't. | The fear comes from knowing. A tell that might be wrong makes the game feel arbitrary instead of tense. |
| **The Wumpus cannot be killed.** | Making it killable turns an evasion puzzle into a combat sim and deletes the game. |
| **A sent companion never comes back.** No chance of return, no rescue, no second chance. | It's the emotional core of the taming system and the reason the escape valve has a price. |
| **Fighting is loud and fast; taming is quiet and slow.** | This asymmetry is the entire reason the creature system exists. If one option is ever strictly better, fix the costs — don't remove the choice. |
| **Luck grants Fortune points, never a flat roll bonus.** | Otherwise it's a boring fourth modifier. |
| **Mixed Success is the widest good band.** | "You got it, but —" should be the most common non-failure result. |
| **A pit-free route to the Heart always exists** — at every difficulty, no exceptions. | A pit is an instant-loss check. Forcing one means a run can end to a die roll the player had no way to avoid. Blooms, snares and creatures may be forced, because failing them costs you without ending you. |
| **Darkness restricts the RANGE of tells, never their honesty.** | Unreliable information relocates blame from the player's judgement to the dice, and makes the tell-ignored fairness metric unmeasurable. |

If a sim run or playtest suggests one of these is broken, report it and propose a fix **within** the invariant. Don't discard the invariant.

---

## 4. Conventions

- TypeScript strict. No `any`. No non-null assertions without a comment saying why.
- Pure functions in the engine; no mutation, return new state.
- Every modifier on a roll carries a human-readable source label — the UI shows the player exactly why they rolled what they rolled. Never produce an unlabeled modifier.
- Vitest for tests. Engine changes ship with tests in the same commit.
- Prose lives in data tables, never in code.
- Prefer boring code. This is a solo project with a hard deadline; cleverness is a liability.

---

## 5. How to work in this repo

**Before you start:** read `docs/ROADMAP.md` for the current phase and its exit criteria. Do not implement anything from a later phase, even if it seems easy while you're in the file. Scope creep is the top risk to a 3-month timeline.

**Before changing rules:** read the relevant `docs/GDD.md` section. If the GDD and the code disagree, the GDD wins — or the GDD is out of date and you should say so rather than silently diverging.

**When you finish a phase:** write `docs/PHASE-N-NOTES.md` covering what you built, decisions you made, anything in the GDD that was ambiguous, and your honest read on what feels weak. Do not write a triumphant summary — write the notes you'd want if you were picking this up cold in six weeks.

**When balance is involved:** run `npm run sim` and report the actual number. Never tune toward a target number on your own initiative and never present a tuned figure as an observed one.

**Agent harness and telemetry:** the agent interface is built to `docs/EVALS.md` from Phase 1 — pluggable policies, fixed seed sets, full per-turn logging, no state leakage. Telemetry follows `docs/OBSERVABILITY.md`: run reports are `seed + actionLog`, the server replays them, and nothing personal is ever collected. Telemetry must fail silent and never block gameplay.

**AI-generated assets:** every generated asset gets a row in `docs/AI-PROVENANCE.md` — tool, date, prompt reference, what a human changed afterward. This is required for Steam's disclosure rules and for any copyright registration. No exceptions, no catching up later.

**When you're unsure:** ask. A wrong assumption that survives three phases costs more than a question.

**Concurrent sessions and docs:** a PM session and a code session can be open at the same time, and both write to `docs/GDD.md`, `docs/PHASE-1-PROGRESS.md` and `docs/ROADMAP.md`. Neither merges — the later write wins and silently discards the earlier one, even mid-paragraph, with no error. Before a multi-edit doc-writing sequence on any of those three files, check and set the **Doc lock** line at the top of `docs/PHASE-1-PROGRESS.md` — see that file for the protocol. A one-line update doesn't need it.

---

## 6. Things that are not in scope

Not for v1, no matter how natural they seem while you're in the code:

- Multiplayer or any server component
- A killable Wumpus
- Persistent creature collection across runs (companions are run-only)
- A tameable stone-grub — retired from the v1 bestiary; it returns in a late phase as the labyrinth's *shuffler* (it eats walls, so the geometry drifts), which is a high-difficulty mechanic, not a companion
- Real-time movement or combat
- Procedural prose generation at runtime
- Accounts, auth, or cloud saves
- Mobile app builds
- Any telemetry beyond an anonymous run report (see `docs/OBSERVABILITY.md` — if a change would lengthen its privacy section, don't make it)

Some of these are planned for after v1 ships. None of them belong in the first three months.
