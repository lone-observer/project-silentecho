Read CLAUDE.md, docs/GDD.md, docs/PHASE-1-PROGRESS.md and docs/EVALS.md. Also read the `claude/design-decisions.md` project doc's last three entries (17 Sep — the hazard-verb redesign and the Fortune-hook addition; 18 Sep — scent loudness and prose timing) — the reasoning behind this step lives there, not just the spec in GDD.

Execute Phase 1 step **1g: the hazard-verb redesign.** Stop at its exit criteria. Build a visualiser for the subsystem before writing its tests (same discipline as 1d/1e/1f — `scripts/hazard.ts` or extend `scripts/turn.ts`, your call).

## Scope

Bloom and Snare currently auto-resolve as `ENTRY_HAZARDS` — one fixed stat, one roll, no player choice, on entry. Turn both into verb-choice encounters, the same shape as Creature (`FIGHT`/`TAME`/`SNEAK`):

- **Spore bloom:** `FORCE` (STR) or `ENDURE` (INT). `FORCE` cuts through — margin sets turn cost (2, or 1 on a strong success) — but Confused always applies regardless of the roll. `ENDURE` stands through it — turn cost is flat — but margin instead shortens how long Confused lasts; it never fully cancels it. AGI has no option against a bloom, by design.
- **Snare-carving:** `AVOID` (INT, reads the mechanism before it triggers) or `DODGE` (AGI, wriggles free after). STR has no option, by design.
- **Pit:** unchanged. No options, absolute, for now.
- **Scent-marker loudness (decided 18 Sep):** `FORCE` is loud, same as `FIGHT`. `ENDURE`, `AVOID` and `DODGE` are quiet, same as `SNEAK`/`TAME`. Already written into GDD §2.10's scent paragraph — just implement it, don't re-derive it.
- **Prose (decided 18 Sep):** 1g writes it. `ENDURE`, `AVOID` and `DODGE` join `NARRATED_ACTIONS`, not `DEFERRED_ACTIONS` — `FORCE` stays deferred, that's unchanged. Write the outcome text for the two new hazard rows while the mechanic is fresh in context, same discipline 1f used for everything else, just folded into this step instead of a separate one.

GDD §2.7 and §2.8 already have the full spec written (verb list, the coverage-matrix table, both hazard rows) — this is not ambiguous, it's unbuilt. Full exit criteria:

- [ ] `ENTRY_HAZARDS` auto-resolve is gone for bloom and snare; both dispatch through an encounter/`legalActions()` path the way Creature does
- [ ] `FORCE`, `ENDURE`, `AVOID`, `DODGE` exist as real `ActionKind`s, wired into `legalActions()` and `resolve.ts`
- [ ] Force's turn-cost-scales-with-margin and Endure's Confused-duration-scales-with-margin are both implemented and each has a mutation-checked test (same standard as 1d/1e/1e's invariant assertions)
- [ ] `HazardOutcome` gains a reward field; a successful Force/Endure/Avoid/Dodge (and a successful Fight) pays out an oil flask
- [ ] Pit stays untouched and its "no options" test still passes
- [ ] `tests/outcomes.test.ts`'s `NARRATED ∪ DEFERRED = every ActionKind` coverage assertion still passes — `ENDURE`/`AVOID`/`DODGE` join `NARRATED_ACTIONS`, `FORCE` stays in `DEFERRED_ACTIONS`
- [ ] `ENDURE`/`AVOID`/`DODGE` prose written for both hazard rows, same visual/dark-variant discipline 1f used everywhere else
- [ ] Tests green, `npm run typecheck` clean

## The one thing GDD still leaves for this session to answer empirically

**Reward magnitude and the ambient oil-flask count, together — deliberately not pre-decided.** Gautham wants this measured, not guessed: build or extend the sweep visualiser to get a real oil-burn baseline under the new hazard verbs, then size the reward against it. Converge toward *reward smaller than the average failure cost*, so hazards stay net-negative in expectation. Reconsider `POPULATION.oilFlasks` (ambient loot) in the same pass, not separately — the economy should lean on earned oil over found oil, and sizing the two numbers one at a time risks solving for one while breaking the other. Report the actual distribution you measured (not just the final numbers you picked) in the close-out notes — that's the empirical read Gautham is asking for, not just an outcome.

## One thing that is explicitly not 1g's job

The Fortune-spend hook (`Policy.spendFortune`, added to `docs/EVALS.md` 17 Sep) is agent-harness scope — it doesn't exist as code yet, and won't until 1i builds `Policy`. Nothing in 1g should try to wire it. The only thing worth keeping in mind: make sure the new hazard rolls go through the same roll-resolution path (`RollResult`) every other action already uses, with nothing hazard-specific bolted on. If Force/Endure/Avoid/Dodge rolls look like every other roll to the rest of the reducer, 1i's Fortune hook picks them up for free later. If they don't, that's a retrofit nobody's budgeted for.

## Loose ends this step should NOT try to close (park them, don't build them)

- A genuinely INT-weak trap (mimic / fake-treasure-room) — new content, not this step.
- The stone-grub's chew/dig-through-terrain mechanic — separate feature, later.
- Creature difficulty tiers with differentiated rewards — Gautham's own deferred call.
- Whether the top three roll bands should earn anything for MOVE/LISTEN/SEARCH/READ/REST/USE/SEND (1f finding 2) — that's 1i/1j's sim to arbitrate, not 1g's.
- 1i's heuristic bot should tame deliberately (1f finding 3/4) — noted for whoever opens 1i, not something 1g needs to touch.

## Before you write to GDD.md, PHASE-1-PROGRESS.md, or ROADMAP.md

Check the **Doc lock** line at the top of `PHASE-1-PROGRESS.md` first. It's `none` as of this handoff, but a PM session's edit to this exact file was silently reverted by a code session's own close-out write during 1f — twice, with no error either time. Set the lock before your close-out sequence, and when you write, **stage each revision to a fresh path and read the file back afterward to confirm your own text landed** — see "Doc lock, for concurrent sessions" in `PHASE-1-PROGRESS.md` for the full incident writeup.

## Closing, same as every step

1. Update `PHASE-1-PROGRESS.md`'s step table (1g → done) and carried-forward notes — including the measured oil-burn baseline, the reward and ambient-flask numbers you land on, and why.
2. Add the session to `docs/dev-log.json`: hours, tests before/after, **the actual commit hash** (this got missed for session 6 and had to be fixed after the fact — don't let it happen a third time), and every defect with what found it.
3. Harvest token counts from the session transcript before the container goes away.
4. `npm run devlog`, commit, push.
