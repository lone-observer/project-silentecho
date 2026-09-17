/**
 * Public surface of the rules engine.
 *
 * Everything here is pure and deterministic. Nothing under src/engine/ may import
 * React, the DOM, PixiJS, Node APIs, or perform any I/O — see CLAUDE.md 2.1 and
 * tests/engine-isolation.test.ts, which fails the build if that is violated.
 */

export * from './types.ts'
export * from './rng.ts'
export * from './dice.ts'
export * from './generate.ts'
export * from './wumpus.ts'
