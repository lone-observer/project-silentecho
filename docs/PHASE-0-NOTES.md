# Phase 0 notes

Built and verified 16 Sep 2026, in a Cowork session, before the repo reached the author's machine.

## What exists

- `src/engine/types.ts` — the full type model. Every type is JSON-serializable: no classes, no `Map`/`Set`, no functions. `GameState` carries `rng`, so a save resumes mid-run on the exact same die.
- `src/engine/rng.ts` — mulberry32, seeded, with `(seed, counter)` as its serializable state. Restoring replays the integer sequence forward, so the state survives JSON with no loss.
- `src/engine/dice.ts` — the roll resolver, band boundaries, natural-1/20 overrides, Fortune reroll and band bump.
- `tests/` — 44 tests. Band boundaries exactly, determinism over 1000 iterations, d20 uniformity over 100k draws, state round-trip through JSON.
- `src/ui/App.tsx` — placeholder.

## The guard, and its verification

`tests/engine-isolation.test.ts` walks `src/engine/`, strips comments, and fails on any bare import or any ambient-state use (`Math.random`, `Date.now`, `fetch`, `console`, browser and Node globals).

**Verified by deliberate violation.** Adding `import React from 'react'` and `Math.random()` to `dice.ts` produced:

```
src/engine/dice.ts: imports "react" — the engine must stay dependency-free
src/engine/dice.ts: uses /\bMath\.random\b/ — use the injected Rng — runs must replay identically
```

Reverted; suite green. An unverified guard is worse than no guard, so re-verify this any time it is touched.

## Decisions made, that the GDD did not settle

1. **Natural 1/20 bound the band rather than replacing it.** A natural 1 can never land better than `failure`; a natural 20 never worse than `success`. So a natural 1 against a trivial DC is still just a failure, not a critical one, and a natural 20 against an impossible DC succeeds without becoming a critical. This preserves "a 1 always stings, a 20 always helps" without making extreme DCs meaningless. Revisit if playtests want a natural 20 to always crit.

2. **Fortune is two distinct operations** — `rerollWithFortune` (draws fresh, advances the RNG) and `bumpBandWithFortune` (shifts one band, no draw). GDD 2.5 implies both; making them separate functions keeps the RNG accounting honest.

3. **`Modifier.source` is validated at runtime**, not just typed. An empty source throws. The GDD's "labelled modifiers" rule is load-bearing for the UI, so it is enforced rather than trusted.

4. **`exactOptionalPropertyTypes` and `noUncheckedIndexedAccess` are on.** Stricter than default. They caught two real bugs in `rng.shuffle` during the build. Leaving them on.

5. **Vitest is configured for `tests/` only**, not colocated tests, so the isolation walker never trips over test files sitting inside `src/engine/`.

## Ambiguities in the GDD worth resolving in Phase 1

- **Oil's effect on DCs is not quantified.** GDD 2.8 says low oil "raises all DCs" without saying by how much or at what threshold. Needs a number in `data/`.
- **Confused** (spore blooms, GDD 2.8) says directions "scramble" for 2 turns — is that a random remap of all four, or a chance per move to go somewhere else? The second is easier to communicate in text.
- **Companion passives during an encounter** — does the grellhound's hazard reveal fire before the player chooses fight/tame, or after? Materially changes the choice.
- **Skittish companions** flee "if the player takes damage" — any damage, or a failed roll?

None block Phase 1; all need a decision recorded when they are implemented.

## Dependency versions — corrected 16 Sep

The first cut of `package.json` pinned Vite 6, Vitest 2 and TypeScript 5 — versions that were current when the scaffold was written but roughly two years stale by now. `npm install` surfaced 5 advisories (path traversal in `@vitest/mocker`, and the esbuild dev-server request issue), all transitive through the outdated dev toolchain and none reachable in a static browser build with no server.

Fixed by moving to current and pinning exactly:

| Package | Now |
|---|---|
| vite | 8.3.0 |
| vitest | 5.0.1 |
| typescript | 7.0.2 |
| @vitejs/plugin-react | 6.1.1 |
| react / react-dom | 19.3.0 |
| zustand | 5.0.15 |

`npm audit` is now clean. TypeScript 7 required `"types": ["node"]` in tsconfig — it no longer picks up `@types/node` implicitly the way 5.x did.

**Versions are pinned exactly, not caret-ranged.** A game whose whole architecture rests on deterministic replay should not have its toolchain drift underneath it between installs. Upgrade deliberately, at phase boundaries, with the full suite green before and after.

## Health check

```
npm test        44 passed
npm run typecheck   clean  (TypeScript 7)
npm audit       0 vulnerabilities
npm run build   dist 220 kB / 68.8 kB gzipped
```

The 69 kB baseline is worth watching. Phase 4's budget is under 1 MB gzipped excluding assets.
