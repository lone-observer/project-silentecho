# Phase 1f handoff — outcomes table

Paste this as the opening message of a fresh Cowork session.

---

Read `CLAUDE.md`, `docs/GDD.md`, `docs/PHASE-1-PROGRESS.md` and `docs/EVALS.md`.

Execute Phase 1 step **1f: the `(archetype × action × band)` outcomes table**. Stop at its exit criteria (`docs/ROADMAP.md`, Phase 1 section): every `(archetype × action × band)` outcome has content, and a coverage test passes.

This step should be narrow — it's data and prose layered onto a reducer that already exists, not new mechanics. Don't let it grow into a 1g task.

**What you're building on:**
- `src/engine/resolve.ts` has a `NARRATION` table at the top (per `CLAUDE.md` §2.4 — prose stays out of the reducer body). It's deliberately minimal right now: ~16 lines covering endings, oil, and a few discoveries. Absorb it wholesale into the new table rather than leaving two prose sources.
- `tuning.ts`'s `HAZARD_OUTCOMES` is mechanics with no prose yet — same shape as 1d's `TAME_OUTCOMES` before 1d wrote it up. Same treatment here.
- `NARRATION.retreated` is a placeholder line, not a written one. GDD §2.17 wants a beat for every ending, retreat included — don't ship it as filler.

**GDD §2.8.1 requirement, easy to miss:** every tell and outcome needs a **dark variant** — same information, shifted modality, for when the player is out of light. That's two strings per cell, not one. Write both at the same time; retrofitting later means re-touching every cell.

**Known disagreement to leave alone, not fix:** `scripts/tame.ts` and `resolve.ts` account for step 7 slightly differently (see the 1e decisions in `docs/PHASE-1-PROGRESS.md`). If a 1g sim number looks off, that's the first place to check — but it's not 1f's job to reconcile it.

**Not in scope for 1f** (flagging so you don't scope-creep into them): the hazard DCs are correctness floors, not tuned balance numbers — that's 1g's sim, not this step. The fight-vs-tame comparison is stale — re-measure in 1g. `AgentView` is unbuilt — that's 1g too.

Build a visualiser for the subsystem before writing its tests, same as every prior step.

**Before ending the session:**
1. Update `docs/PHASE-1-PROGRESS.md`'s step table and carried-forward notes. Check the **Doc lock** line first (see that file's "Doc lock, for concurrent sessions" section) — set it before a multi-edit doc pass, clear it after.
2. Add a session object to `docs/dev-log.json`: hours, tests before/after, commits (fill these in yourself if you have shell access this session — 1e didn't and it had to be backfilled), and every defect with what found it.
3. Harvest token counts from the session transcript before the container closes — they're unrecoverable after.
4. `npm run devlog`, commit, push.
