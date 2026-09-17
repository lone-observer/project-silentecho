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
| `costUsd`, `tokens` | `/usage` in Claude Code; Cowork and chat are account-level only — see below |
| `tests` | `npm test` before and after |
| `commits` | `git log --oneline` — short SHAs |
| `defects` | Anything real that turned up, and **what found it** |
| `landed`, `label`, `steps` | A sentence, a name, the roadmap steps touched |

Lines changed and totals are derived from the commits. Lockfiles are excluded so generated churn does not drown the real work.

**The `foundBy` field is the one to be honest about.** Values in use: `tests`, `visualiser`, `probe`, `eye`, `tooling`. It is the most interesting data this log collects.

### Getting cost and tokens

The two surfaces do not report the same way, and this shapes the habit:

- **Claude Code** — `/usage` gives a per-session breakdown: tokens per model, a cost estimate, prompt-cache stats, and attribution by skill, subagent, plugin and MCP server. Read it **before closing the session**; the Session block resets on `/clear`. These figures are local to the machine.
- **Cowork and claude.ai chat** — [claude.ai/settings/usage](https://claude.ai/settings/usage) is account-level: credit balance, month-to-date spend, spend limit. **There is no per-session figure.** A Cowork session's cost can only be recovered as the delta in month-to-date spend across it, which means reading the number at the start and again at the end.

So: for Cowork sessions, note month-to-date spend when you begin and when you stop, and log the difference. For anything logged after the fact with no reading, leave `costUsd` null rather than guessing — a null is honest, an invented number quietly poisons the phase-cost chart this log exists to produce.

<!-- devlog:start -->

## Sessions

| # | Date | Session | Hours | Steps | Tests | Lines | Cost | Defects |
|---|---|---|---|---|---|---|---|---|
| 1 | 2026-09-16 | Phase 0 — scaffold | — | 0 | 0 → 44 (+44) | +2118 / −9 | — | 1 |
| 2 | 2026-09-16 | Phase 1a–1c | — | 1a, 1b, 1b-fix, 1c | 44 → 118 (+74) | +1731 / −31 | — | 7 |
| 3 | 2026-09-17 | Docs and hygiene | — | docs | 118 → 118 | — | — | — |
| | | **Total** | **—** | | **118** | **+3,849 / −40** | **—** | **8** |

Lines are derived from the commits listed in `dev-log.json`, excluding lockfiles.

## What finds the defects

| Found by | Count | Share |
|---|---|---|
| probe | 2 | 25% |
| visualiser | 2 | 25% |
| eye | 2 | 25% |
| tooling | 1 | 13% |
| tests | 1 | 13% |

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

<!-- devlog:end -->

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
