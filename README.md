# Project Silent Echo

A cozy-horror, Wumpus-derived solo dungeon crawler. Browser-first, TypeScript, shipping free to itch.io.

You are a lanternbearer. You descend into a labyrinth that should not have a bottom, looking for the thing at its heart that will pay your debts. Something down there has your scent and is in no hurry.

## Quick start

```bash
npm install
npm test        # 44 tests
npm run dev     # http://localhost:5173
```

## Where things are

| Path | What |
|---|---|
| `CLAUDE.md` | The constitution. Architecture rules and design invariants. Read first. |
| `docs/GDD.md` | Game design document. The source of truth for rules. |
| `docs/ROADMAP.md` | 12-week plan with dated phase gates. |
| `docs/EVALS.md` | Agent harness requirements and the model-benchmark methodology. |
| `docs/OBSERVABILITY.md` | Human-run telemetry and the private dashboard. |
| `docs/AI-PROVENANCE.md` | Log of every AI-generated asset. Required for Steam and copyright. |
| `src/engine/` | Pure rules. No React, no DOM, no I/O — enforced by a test. |
| `src/agent/` | Agent interface, sim harness, model policies. |
| `src/render/` | Text renderer, then the PixiJS diorama. |
| `src/classic/` | The 1973 `WUMPUS` easter egg. |

## The one rule

`src/engine/` is a pure, deterministic function library. It imports nothing and touches no ambient state. `tests/engine-isolation.test.ts` fails the build if that changes.

Three renderers depend on it — text, diorama, and the agent interface — along with every replay, save, and sim run. `(seed, actionLog)` reproduces any run exactly, forever.

To convince yourself the guard works, add `import React from 'react'` to any engine file and run `npm test`. Then revert.

## Scripts

```bash
npm test          # vitest
npm run typecheck # tsc --noEmit
npm run dev       # vite dev server
npm run build     # production build
npm run sim       # headless balance harness (Phase 1)
```
