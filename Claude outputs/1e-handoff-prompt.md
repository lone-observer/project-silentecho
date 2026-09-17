Read CLAUDE.md, docs/GDD.md, docs/PHASE-1-PROGRESS.md and docs/EVALS.md.

Execute Phase 1 step 1e — the resolve.ts reducer, turn order per GDD §2.2.2.

Fold in two decided-but-unimplemented fixes from the 1d findings (docs/PHASE-1-PROGRESS.md
has the full reasoning and exact diffs expected; claude/design-decisions.md in the project
has the design rationale if you want it, but the repo docs are self-contained for
implementation purposes):

1. SEND reachability (finding #1). Two changes:
   - src/engine/data/tuning.ts: flip TAME_OUTCOMES.strongSuccess.brave to true. Update the
     stale comment on TameOutcome.brave.
   - In resolve.ts's tame handling: after calling resolveEncounter('tame', band, ...), if the
     roll's natural value is 20 and result.companionGained is not null, force
     companionGained.brave = true before writing it to state. This has to live in resolve.ts,
     not creatures.ts — resolveEncounter only ever receives the resolved band, deliberately,
     so it can't see the natural roll.
   - tests/creatures.test.ts: move the brave-band-gating mutation-check from criticalSuccess
     to strongSuccess. Add a new nat-20-override case to resolve.ts's own test file (not
     creatures.test.ts, for the same reason as above).

2. SEND decoy duration (finding #2). One change:
   - src/engine/data/tuning.ts: replace COMPANION.sendScent = 5 with a lookup keyed off
     TAME_DC — 10 for Easy/Moderate-DC creatures (goblin, lumewing, grellhound), 5 (unchanged)
     for Hard-DC (quietOne). COMPANION.sendDecoyTurns becomes two derived pairs instead of one
     constant. sendCompanion in creatures.ts already has the creature's kind in scope.
   - tests/creatures.test.ts: extend the sendScent/sendDecoyTurns consistency check to both
     tiers and both Heart-carrying states (4 cases instead of 1).

Verify with npm run tame -- <seed> and SWEEP=60 npm run tame -- <seed>: SEND should now fire
a nonzero number of times across the sweep, and the decoy duration numbers should match the
table in docs/PHASE-1-PROGRESS.md's finding #2.

Stop at 1e's exit criteria (the reducer implements GDD §2.2.2's turn order correctly, with
tests). Build a visualiser for the subsystem before writing its tests, per the established
pattern.

Before you touch docs/GDD.md, docs/PHASE-1-PROGRESS.md or docs/ROADMAP.md for anything beyond
a one-line status update, check and set the Doc lock line at the top of
docs/PHASE-1-PROGRESS.md — a PM session may be writing to the same files concurrently, and
whichever session writes last silently overwrites the other with no error.

Standard step close-out: update PHASE-1-PROGRESS.md's step table and carried-forward notes,
add a dev-log.json session entry (hours, tests before/after, commits, defects with what found
them), harvest token counts from the session transcript before the container goes away,
npm run devlog, commit, push.
