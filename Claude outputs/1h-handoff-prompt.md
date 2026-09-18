# 1h — the classic text renderer

You're building the text (classic) renderer for Project Silent Echo. Read `CLAUDE.md`, `docs/GDD.md` §2.14/§2.15/§2.17, and `docs/PHASE-1-PROGRESS.md` (the step table, and everything under "Carried forward into 1h / 1i / 1j / 1k") before writing anything. This is a wide step — budget it like 1e/1f, not like 1d: it has to read correctly against the whole engine, not just add a table.

## What exists already, so you don't rebuild it

The engine is done for everything this renderer needs to display. 1a–1g built labyrinth generation, the Wumpus AI, creatures/taming/companions/SEND, world drift, the full `(archetype × action × band)` outcome table, and the hazard-verb encounters (`FORCE`/`ENDURE`/`AVOID`/`DODGE`). All thirteen `ActionKind`s have prose. You are not writing game content — every string you need already exists in `data/outcomes.ts` and on `GameEvent`.

Load-bearing shapes already in `src/engine/types.ts`:

- `GameEvent` — a typed union (`narration`, `roll`, `oilChanged`, `wumpusMoved`, `companionLost`, `statusChanged`, `heartTaken`, `graveFound`, `runEnded`, etc.). Narration and oil-change events carry a resolved `text: string` plus a `NarrationBeat` — the sentence is already written, you never assemble or choose one.
- `legalActions: { action: Action; label: string; dc?: number }[]` — the engine already filters this to what's actually available this turn. You render exactly this list, numbered, and nothing else. Never build your own menu, and never show an unavailable verb greyed out — GDD §2.17 is explicit that a menu of thirteen where three apply is a menu of thirteen as far as the player's decision cost goes.
- `RollResult.modifiers` — every modifier carries a human-readable label (`CLAUDE.md` §4). The roll breakdown you show is this list, verbatim; don't collapse it into a single number.
- `AgentView` is declared in `types.ts` already, but the runtime adapter that builds one from `GameState` doesn't exist yet — that's 1j's job, gated on a can't-see-through-walls leakage test. **Don't build it and don't depend on it.** Your renderer reads `GameState`/`GameEvent` directly. Do keep half an eye on the shape, though: 1f's `NarrationBeat` work means your event log and `AgentView.log` will end up wanting the same resolved-string projection, so if a small `eventsToLines(events: GameEvent[]): string[]`-shaped helper falls out of your work naturally, that's worth keeping separate and reusable rather than inlined into your render loop. Don't go out of your way to generalize it — if it doesn't fall out naturally, skip it.

## What "done" looks like

The Phase 1 exit criterion this step exists to satisfy: **a full run is playable start to finish in text.** Concretely, per GDD §2.14: room description, directional tells listed per doorway, a numbered action menu, the roll breakdown, and an event log — served through `npm run dev` (the Phase 0 React shell is already scaffolded and empty; this is what fills it for now, since diorama doesn't exist until Phase 4). It should run a complete game: start a seeded run, take actions turn by turn, resolve encounters and hazards, and reach a `runEnded` outcome cleanly, win or lose.

This is a **shipping feature**, not a dev harness — `CLAUDE.md` §1 and GDD §2.14 are both explicit that classic mode is a headline feature (Gautham's own words: he loves the 1973 original and *The Oregon Trail*), and it's the whole of what ships free to itch.io at week 6. Build it like a real UI, not a console.log loop.

## Explicitly out of scope — do not build these here

Everything below reads like it belongs next to a text renderer. It doesn't, this phase. Each one is named in the roadmap for a later phase; pulling any of them into 1h is exactly the scope creep `CLAUDE.md` §5 and the roadmap's own risk note both call out.

- **The green-phosphor/amber CRT skin.** GDD §2.14 mentions it in the same breath as classic mode, but `docs/ROADMAP.md` schedules it explicitly for **Phase 1.5** ("Green-phosphor skin for text mode"), not Phase 1. Ship plain text now.
- **The `WUMPUS` easter egg** (the standalone 1973 homage module). Also Phase 1.5, also explicitly a separate module never wired into the main engine. Don't touch it.
- **Echoes / the epitaph** (GDD §2.16). Also Phase 1.5. `PHASE-1-PROGRESS.md` already flags that archetype-aware endings and the epitaph don't exist yet and are scoped together as one future piece of work — that's correct, leave it alone. Your run endings are generic (not archetype-keyed) today; render whatever `runEnded`/`graveFound` events the engine actually emits, don't add richness the engine doesn't have yet.
- **The agent harness, `AgentView`, or anything sim-related.** That's 1j. Don't build a bot, don't build a batch runner, don't reach for `npm run sim` — it doesn't exist (1g finding 5) and building it isn't this step's job either.
- **The known-path map render.** Explicitly parked in `PHASE-1-PROGRESS.md`'s carried-forward list, gated on telemetry showing players actually get lost. Not now.

If you find yourself writing new prose, a new outcome table entry, or a new game rule to make the renderer's job easier — stop. That's an engine change and belongs in a design decision, not a rendering step. Flag it in your close-out instead of quietly building it.

## One small piece of unrelated housekeeping, worth folding in

`tests/tuning.test.ts` has the same vacuous compile-time guard `tests/outcomes.test.ts` had before 1g fixed it: `const ALL_ACTIONS: readonly ActionKind[] = [...]` makes `(typeof ALL_ACTIONS)[number]` evaluate to `ActionKind` itself, so the coverage assertion is always true regardless of what's actually listed. 1g found this and deliberately left it to keep its own diff scoped to hazards. It's a one-line fix (`as const`, plus an assertion in the other direction — mirror whatever 1g did in `outcomes.test.ts`). Since you'll already be touching the action-kind surface to build the menu, this is cheap to close out now rather than carry forward again.

## Notes GDD gives you for free

- **Prose lives in data, not in your code.** `tests/outcomes.test.ts` fails the build if a sentence appears in the engine, and the same discipline should hold here: if a line is missing for some state, that's a missing beat in `data/outcomes.ts`, not a string you write inline in the renderer. Flag any gap you find rather than papering over it.
- **The status budget is already over-budget** (GDD §2.17): turn count, oil level+band as one fact, health, Fortune, companion, carrying-Heart, active statuses, before the four tells. Chunk aggressively; don't design a new status line from scratch, follow the "oil level and band are one fact" chunking rule GDD already gives you.
- **Tells are direction-keyed** (`{ direction, kind }`) so they render identically in every renderer by construction — you're not choosing what to show, just formatting what `tells` already contains.
- A run replays exactly from `seed + actionLog` (`CLAUDE.md` §2.2) — useful for your own testing (script a fixed action sequence and confirm identical output twice) and worth keeping in mind for how you structure input handling, but building a replay viewer is not this step (that's Phase 4).

## Tests

No new game-rule tests are expected — you're not changing engine behavior. Worth having: something that drives a full run through your renderer's own action-resolution path end-to-end (a scripted legal-action sequence, not randomized — that's 1j's territory) and asserts it reaches `runEnded` without throwing. That's a renderer-correctness smoke test, not a balance measurement; keep it that way.

## Close-out

Same ritual as prior steps: update `docs/PHASE-1-PROGRESS.md`'s step table, log anything you find that reads like a design decision (not a rendering detail) to `claude/design-decisions.md`, and run `npm run devlog` before you close — check the `commits` field actually landed; it has silently shipped empty three sessions running (1e, 1f, 1g) and the fix for that is now a required read-back step in the closing checklist, not a suggestion.

`1i` (hazard-reward rebalance) is gated directly on you — Gautham can't playtest a single hazard-verb tradeoff until this step ships something he can actually run. Don't let "it's just a renderer" make this feel lower-stakes than 1a–1g; it's the step everything after it is waiting on.
