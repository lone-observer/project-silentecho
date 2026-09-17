# Development log

One row per working session. The mirror of `docs/OBSERVABILITY.md`: that one measures what players do, this measures what building the thing costs.

**`docs/dev-log.json` is the source of truth. The tables below are generated — do not hand-edit them.**

```
npm run devlog              regenerate the tables
npm run devlog -- --check   fail if stale (CI)
```

One structured file, two renderings — the same pattern the engine uses. It also means the latentbuild.dev dashboard reads the file directly rather than parsing three months of prose back out.

## The logging habit

**Log any session of an hour or more, on the day it happens.** Shorter sessions are not logged separately — roll them into the next substantial block, or into the nearest one sharing their step. A log with a row for every fifteen-minute fix stops being readable, and stops being kept.

After a session, add one object to `dev-log.json` and run `npm run devlog`. It should take two minutes. **Enter only what git cannot know:**

| Field | Where it comes from |
|---|---|
| `hours` | You. Wall clock, honestly — including the reading and deciding |
| `tokens` | `/usage` in Claude Code; in Cowork, harvested from the session transcript — see below |
| `costUsd` | Usually null. Plan usage is not dollar-metered — see below |
| `tests` | `npm test` before and after |
| `commits` | `git log --oneline` — short SHAs |
| `defects` | Anything real that turned up, and **what found it** |
| `landed`, `label`, `steps` | A sentence, a name, the roadmap steps touched |

Lines changed and totals are derived from the commits. Lockfiles are excluded so generated churn does not drown the real work.

**The `foundBy` field is the one to be honest about.** Values in use: `tests`, `visualiser`, `probe`, `eye`, `tooling`. It is the most interesting data this log collects.

### Getting cost and tokens

The two surfaces do not report the same way, and this shapes the habit:

- **Claude Code** — `/usage` gives a per-session breakdown: tokens per model, a cost estimate, prompt-cache stats, and attribution by skill, subagent, plugin and MCP server. Read it **before closing the session**; the Session block resets on `/clear`. These figures are local to the machine.
- **Cowork and claude.ai chat** — [claude.ai/settings/usage](https://claude.ai/settings/usage) is account-level only: credit balance, month-to-date spend, spend limit. No per-session view in the UI — but the session transcript has exact per-turn counts. See the workaround below.

**The Cowork workaround: harvest the transcript.** Cowork writes exact per-turn usage to the session transcript at `~/.claude/projects/<project>/<session>.jsonl` inside the session container — `input_tokens`, `cache_read_input_tokens`, `cache_creation_input_tokens`, `output_tokens` on every assistant turn. Ask Claude to read it and log the numbers **before the session ends**; the container is ephemeral, so the file goes with it.

Weight the raw counts to get a figure worth comparing across sessions: `effective = input + 0.1 x cacheRead + 2 x cacheWrite + 5 x output`. Cache reads are cheap, cache writes and output are not.

**On dollars: there is no per-session figure, and often no figure at all.** Usage inside a Pro or Max plan allowance is metered against plan limits, not in dollars; a dollar amount exists only while usage credits are being drawn. So `costUsd` will usually stay null, and that is correct rather than missing. Tokens are the comparable number. Never estimate a cost — a null is honest, an invented figure quietly poisons the phase-cost chart this log exists to produce.

<!-- devlog:start -->

## Sessions

| # | Date | Session | Hours | Steps | Tests | Lines | Cost | Defects |
|---|---|---|---|---|---|---|---|---|
| 1 | 2026-09-16 | Phase 0 — scaffold | — | 0 | 0 → 44 (+44) | +2118 / −9 | — | 1 |
| 2 | 2026-09-16 | Phase 1a–1c | — | 1a, 1b, 1b-fix, 1c | 44 → 118 (+74) | +1731 / −31 | — | 7 |
| 3 | 2026-09-17 | Docs and hygiene | — | docs | 118 → 118 | — | — | — |
| 4 | 2026-09-17 | Phase 1d — creatures | 2 h | 1d, 1b-fix | 118 → 180 (+62) | +2631 / −59 | — | 7 |
| | | **Total** | **2.0 h** | | **180** | **+6,480 / −99** | **—** | **15** |

Lines are derived from the commits listed in `dev-log.json`, excluding lockfiles.

## What finds the defects

| Found by | Count | Share |
|---|---|---|
| visualiser | 5 | 33% |
| eye | 5 | 33% |
| probe | 2 | 13% |
| tests | 2 | 13% |
| tooling | 1 | 7% |

| Date | Defect | Found by |
|---|---|---|
| 2026-09-16 | Dependencies two years stale; 5 advisories including a path traversal in @vitest/mocker | tooling |
| 2026-09-16 | 7.1% of seeds placed the Heart too deep to return from — unwinnable before the first action | probe |
| 2026-09-16 | 68.7% of seeds forced the player across a hazard with no alternative route | probe |
| 2026-09-16 | Tier 4 Wumpus walked past a player it could smell, to guard the entrance | visualiser |
| 2026-09-16 | Player walked clean through the Wumpus — one catch check, made after the Wumpus moved | visualiser |
| 2026-09-16 | Fairness invariant mis-specified: 'never caught without warning' is not true, and should not be | tests |
| 2026-09-16 | Vertical doors drawn one column right of their rooms | eye |
| 2026-09-16 | Hunt map drew no hazards or creatures, so the tells had nothing to check against | eye |
| 2026-09-17 | GDD 2.9.1 (world drift) did not exist — referenced by the turn order, the roadmap and a tuning comment, with nine words of spec anywhere | eye |
| 2026-09-17 | Turn order step 7 ran companion passives BEFORE world drift, so a grellhound reported hazards from a labyrinth that no longer existed | eye |
| 2026-09-17 | A brave companion is unobtainable at starting stats — P(critical-success tame) is 0% for every creature at INT 8, and 0% for the Quiet One at every stat. SEND fired 0 times in 150 runs | visualiser |
| 2026-09-17 | SEND's decoy out-smells the player for 1 turn while carrying the Heart, not the 2–3 the GDD promises; COMPANION.sendDecoyTurns = 3 was a number no value of sendScent could honour | visualiser |
| 2026-09-17 | Wumpus start distance had a floor and no ceiling — mean 11 rooms away on a 10x10 against tier reaches of 6–18, so it was unreachable in 83% of Drowsing and 63% of Stirring seeds | visualiser |
| 2026-09-17 | The tame sweep's adjacency metric undercounted: runs that ended in a catch broke before closestWumpus was updated, recording Infinity. Spotted because adjacency (40%) came out below the catch rate (47%), which is impossible | eye |
| 2026-09-17 | First hostility-travel test asserted the vacated room was calm, which fails legitimately when a second hostile creature moves into it during the same drift pass. The test was wrong, not the code | tests |

<!-- devlog:end -->

## What the first measurement showed

36.2M effective tokens across 438 turns, and the shape is the useful part:

| Where it went | Share |
|---|---|
| Re-reading the growing conversation | 79% |
| Fixed instructions and tool list, re-read every turn | 11% |
| Claude's replies | 10% |
| Every tool result from 250 calls | 0.1% |

**The tools cost nothing. The conversation length cost everything.** Context per turn grew from 87k to 678k — the last quarter of the session re-read 68M tokens against the first quarter's 18M, for the same number of turns.

The lever is session length, not tool discipline: a fresh session per step would have cost a fraction of one long conversation covering all of them. This is the strongest practical argument for the step-at-a-time working pattern already in `ROADMAP.md`, and it now has a number behind it.

## The rule this log produced

Seven of the first eight defects were found by looking at output, not by assertions — and the one the test suite caught was a *design* error, not a code bug. That is not an argument against tests; they now hold 118 invariants that would erode silently. But it makes the working rule explicit:

> Build a visualiser for every subsystem before writing its tests. Tests tell you a system is *correct*; only watching it run tells you whether it is *good*.

`scripts/map.ts` and `scripts/hunt.ts` each paid for themselves within an hour of existing. Every remaining Phase 1 step should get one.

## The dashboard — after Gate 1, not before

Deferred on purpose. Gate 1 (14 Oct) decides whether the game is worth another two months; a dashboard built before that might be instrumentation for something that gets cancelled.

**Shape when it is built:**

- **Host:** Cloudflare Pages on a subdomain of `latentbuild.dev`, same account as the game deploy.
- **Auth:** Cloudflare Access in front of it. Zero auth code to write or maintain — an email allowlist and a login page you do not own. For a private dashboard of two tabs, building auth would be the worst available use of the budget.
- **Dev tab:** reads `docs/dev-log.json` at build time. Cost and hours per session, cumulative spend against the 3-month scope, lines and tests over time, defects by `foundBy`, and **actual hours per phase against the `ROADMAP.md` estimate** — that last chart is the only honest way to re-forecast December.
- **Game tab:** reads the telemetry D1 database per `docs/OBSERVABILITY.md`. Turn-of-abandonment, win rate versus sim, action frequency, tame-vs-fight, the tell-ignored fairness metric, and the replay-by-runId viewer.
- **Build:** a static page with the JSON inlined at build time, redeployed by the same GitHub Action that ships the game. No API and no server for the dev half — the data is a file in the repo.

Two tabs, one deploy, and only the game half needs a backend.
