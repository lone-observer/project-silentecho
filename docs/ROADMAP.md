# Project Silent Echo — Roadmap

**Target: 3 months. Start 16 Sep 2026. Ship twice.**

Roughly 10 hours a week of evenings and weekend blocks — about 120 hours total. That is enough for this scope only if the phase gates are respected. The single biggest risk is starting art before the game is proven fun.

## The two-ship strategy

Do not save everything for one launch in December. Ship the text version free on itch.io at **week 6**, while the diorama is still unbuilt.

Reasons this is the right call:

- The text version is a **complete game**, not a prototype. Classic-mode purists are a real audience and the 1973 lineage is the hook.
- Real players find balance problems the sim never will, and they find them while art is still cheap to change.
- Wishlists and followers accumulate from week 6 instead of week 12.
- If life intervenes at week 8, you shipped a game instead of abandoning a repo.

---

## Phase 0 — Scaffold · Week 1 (16–22 Sep)

Types, seeded RNG, dice resolver, engine-isolation guard, empty React shell.

**Exit criteria**
- [ ] `npm test` passes
- [ ] `npm run dev` serves
- [ ] Engine-isolation test **verified failing** by deliberately adding `import React` to an engine file
- [ ] `docs/PHASE-0-NOTES.md` written
- [ ] `docs/AI-PROVENANCE.md` created (empty, with a header row)

---

## Phase 1 — The whole game, in text · Weeks 2–4 (23 Sep – 13 Oct)

The largest phase. Everything except pictures.

Labyrinth generation · Wumpus scent AI (all 4 tiers) · creatures, taming, companions, `SEND` · world drift (GDD §2.9.1: wandering creatures, spreading blooms, the Heart-carrying scent multiplier) · the outcomes data table · **the hazard verbs (`FORCE`/`ENDURE`/`AVOID`/`DODGE`)** · text renderer · **the economy-unification rebuild (health retired, margin-scaled oil, `FOCUS`/`DISARM`/`DROP HEART`, turn caps raised to 50/45/40/35 — GDD, 18 Sep 2026) plus its sim-driven rebalance (1i part 1)** · **companion buff rework (1i part 2, queued behind part 1)** · agent/sim harness.

**18 Sep 2026 — 1i grew from "rebalance the hazard rewards" to "rebuild the resource economy, then rebalance it."** A human playtest pass on 1h's text renderer found the old health/damage model and the LISTEN/READ tell-range model both worth replacing, not just retuning — see `docs/PHASE-1-PROGRESS.md` and `claude/design-decisions.md`, 18 Sep, for the full design thread. The flat 20-turn cap named below is also retired as part of that pass; see GDD §2.2.1.

**`npm run sim` does not exist.** `package.json` has the script and `scripts/sim.ts` has never been written — the exit criterion below and `CLAUDE.md` §5's "run `npm run sim` and report the actual number" both point at a command that errors. The balance reads so far have come from the per-step visualisers (`map`, `hunt`, `tame`, `turn`, `prose`, `hazard`), each of which sweeps but none of which is the harness `docs/EVALS.md` specifies. Noted here rather than quietly fixed: it lands in **1j**, and until it does, "the sim says" means "a visualiser sweep says".

**The agent interface is a Phase 1 deliverable, built to `docs/EVALS.md` requirements** — pluggable policies, fixed seed sets, full per-turn logging, no state leakage, resumable batches. `npm run sim` is one policy among several. Building it as a one-off script means rebuilding it in week 5.

**Exit criteria**
- [ ] A full run is playable start to finish in text
- [x] Every `(archetype × action × band)` outcome has content; coverage test passes — 246 authored cells, total over all 576 triples, `DEFERRED_ACTIONS` empty (1f, 1g)
- [x] Every hazard but the pit offers a verb choice, and every stat has exactly one hazard it cannot answer (GDD §2.8) — 1g
- [ ] `npm run sim` reports win rate, loss causes, band distribution, tame-vs-fight rate
- [ ] Agent harness satisfies every requirement in `docs/EVALS.md` — verified by running a `random` policy batch and a `heuristic` batch over the same fixed seed list
- [ ] `docs/PHASE-1-NOTES.md` written, including the honest weak-points read

---

## Phase 1.5 — Classic mode and echoes · Week 5 (14–20 Oct)

The homage layer. Small, self-contained, high delight-per-hour.

- **`WUMPUS`** typed at the title screen → a faithful 1973 Hunt the Wumpus: 20-room dodecahedron, superbats, bottomless pits, crooked arrows. Separate tiny module, not wired into the main engine.
- **Green-phosphor skin** for text mode — CRT scanlines, amber or green monochrome, toggleable.
- **Echoes.** On death, the run generates an epitaph in the Oregon Trail tombstone register. Later runs find those graves in the labyrinth — *your own* previous deaths, read back to you. Local-only, no backend. It costs almost nothing and it is the single best fit between the game's name, its tone, and its ancestry.

---

## ▲ GATE 1 — Is it fun? · End of week 5

**Stop. Play ten real runs. Answer honestly.**

1. Is the turn cap tense, or just annoying? (**50/45/40/35** by difficulty as of 18 Sep 2026 — was a flat 20/20/20/18; see GDD §2.2.1.)
2. Do the tells change your decisions, or do you ignore them and move anyway?
3. Is fight-vs-tame ever a genuine choice, or is one option always right?

Two or more failures → fix `data/outcomes.ts` and the DC assignments before going further. This costs hours now and weeks after the art exists.

**Do not proceed to Phase 2 until this gate passes.**

---

## Phase 2 — SHIP #1 · Week 6 (21–27 Oct)

Text version, free, on itch.io.

- [ ] Telemetry shipped **with** the launch, per `docs/OBSERVABILITY.md` — Worker + D1 endpoint, opt-out in Settings, disclosure line on the itch page. The first two weeks of real play are the highest-information data this project will ever get and they are unrepeatable.
- [ ] Deploy to Cloudflare Pages
- [ ] itch.io page: description, 3–4 screenshots (text mode screenshots are fine and on-brand), a short devlog post
- [ ] "This is an early version — tell me what's boring" framing, with a feedback link
- [ ] Post to r/roguelikes, r/incremental_games, and the itch community; write the first Signal & Drift essay about the design problem

**Then watch.** Where do people quit? Which actions never get used? Is the win rate in the wild anything like the sim's?

---

## Phase 2.5 — The model benchmark · Week 6, in parallel (21–27 Oct)

Six or so models, 100 runs each, fixed seed list, three baselines (random, heuristic, you). Full methodology in `docs/EVALS.md` — follow it exactly; the post is worthless if the method is sloppy.

**This is the launch post.** "I made six language models try to escape my dungeon" carries the game with it in a way "I made a game" does not.

**Exit criteria**
- [ ] Batch complete, all policies on identical seeds
- [ ] Baselines run (random, heuristic, human ×20)
- [ ] Secondary prompt condition run and its delta reported
- [ ] Prediction from `docs/EVALS.md` scored honestly, including if it was wrong
- [ ] Replays embedded; seed list and prompt published
- [ ] Signal & Drift post live, linking the itch page

---

## Phase 3 — Art · Weeks 7–9 (28 Oct – 17 Nov)

Highest risk of overrun. Timebox it hard.

Palette lock → **six background plates** (approval gate — these carry the whole look) → props → overlay FX → creatures → player → Wumpus → UI.

**Exit criteria**
- [ ] Palette approved and locked
- [ ] Six plates approved
- [ ] `scripts/validate-assets.ts` passes on everything
- [ ] Every asset has a `docs/AI-PROVENANCE.md` row

---

## Phase 4 — Diorama, meta, agents · Weeks 10–11 (18 Nov – 1 Dec)

- PixiJS room view: layers, lantern falloff, directional tell overlays, walk + fog-lift transition
- Lanternhouse hub, stat allocation, Marks, bestiary, IndexedDB persistence
- **Agent mode public surface:** a small MCP server over the Phase 1 agent interface (`new_run` / `get_state` / `take_action`), so anyone can point an LLM at it. Plus the public replay viewer.
- **Telemetry dashboard** on latentbuild.dev per `docs/OBSERVABILITY.md` — build panel 7 (replay by runId) first; watching five runs that ended at turn 6 beats any histogram.
- Audio, accessibility, onboarding

---

## Phase 5 — SHIP #2 · Week 12 (2–8 Dec)

Full version to itch.io. Devlog. Second Signal & Drift essay. Decide then, with real data, whether Steam is worth the next six months.

---

## If you fall behind, cut in this order

1. Audio
2. The Lanternhouse hub (ship with a plain between-run stat screen)
3. Marks
4. Two of the six background plates (ship with four archetypes)
5. One of the four creatures — **keep the goblin, the grellhound and the Quiet One** (the stone-grub is already out of v1)
6. The MCP agent surface (delightful, but a bonus)
7. Dashboard panels 4–6 — keep the funnel, the win-rate trend and the replay viewer

**Never cut:** the agent harness, text parity, the engine-isolation guard, run telemetry at launch, or `docs/AI-PROVENANCE.md`. All cheap to keep and ruinous to retrofit.
