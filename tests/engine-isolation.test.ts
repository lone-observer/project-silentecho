/**
 * THE GUARD.
 *
 * src/engine/ is the pure rules library. It must not reach into React, the DOM,
 * PixiJS, Node, or any source of ambient state — because three renderers (text,
 * diorama, agent) and every replay, save and sim run depend on it being a pure
 * function of (state, action, rng).
 *
 * If this test is in your way, the code is wrong, not the test.
 * Do not weaken it, allowlist around it, or skip it. See CLAUDE.md 2.1.
 *
 * To verify it actually works, add `import React from 'react'` to any file under
 * src/engine/ and confirm this fails. Then revert.
 */

import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'

const ENGINE_DIR = join(process.cwd(), 'src', 'engine')

/** Bare specifiers the engine is allowed to import. Adding to this is almost always wrong. */
const ALLOWED_BARE_IMPORTS: readonly string[] = []

/**
 * Ambient state and I/O. The engine gets its randomness from the injected Rng and
 * its time from explicit arguments — never from the environment.
 */
const BANNED_GLOBALS: readonly { pattern: RegExp; why: string }[] = [
  { pattern: /\bMath\.random\b/, why: 'use the injected Rng — runs must replay identically' },
  { pattern: /\bDate\.now\b/, why: 'no wall-clock time in the engine; pass timestamps in' },
  { pattern: /\bnew Date\b/, why: 'no wall-clock time in the engine; pass timestamps in' },
  { pattern: /\bperformance\.now\b/, why: 'no wall-clock time in the engine' },
  { pattern: /\bfetch\s*\(/, why: 'no I/O in the engine' },
  { pattern: /\bconsole\./, why: 'no I/O in the engine; return events instead' },
  { pattern: /\bwindow\b/, why: 'no browser globals in the engine' },
  { pattern: /\bdocument\b/, why: 'no browser globals in the engine' },
  { pattern: /\blocalStorage\b/, why: 'no browser globals in the engine' },
  { pattern: /\bsessionStorage\b/, why: 'no browser globals in the engine' },
  { pattern: /\bindexedDB\b/, why: 'no browser globals in the engine' },
  { pattern: /\bprocess\./, why: 'no Node globals in the engine' },
  { pattern: /\bcrypto\./, why: 'use the injected Rng' },
]

function walk(dir: string): string[] {
  const out: string[] = []
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) out.push(...walk(full))
    else if (/\.(ts|tsx)$/.test(entry)) out.push(full)
  }
  return out
}

/** Strips comments so documentation mentioning a banned name doesn't trip the scan. */
function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '')
}

function importSpecifiers(source: string): string[] {
  const specs: string[] = []
  const staticImport = /^\s*(?:import|export)\b[^'"]*?from\s*['"]([^'"]+)['"]/gm
  const bareImport = /^\s*import\s*['"]([^'"]+)['"]/gm
  const dynamicImport = /\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g
  const require_ = /\brequire\s*\(\s*['"]([^'"]+)['"]\s*\)/g
  for (const re of [staticImport, bareImport, dynamicImport, require_]) {
    for (const match of source.matchAll(re)) if (match[1]) specs.push(match[1])
  }
  return specs
}

describe('engine isolation', () => {
  const files = walk(ENGINE_DIR)

  it('finds engine source files to check', () => {
    expect(files.length).toBeGreaterThan(0)
  })

  it('imports nothing outside src/engine/', () => {
    const violations: string[] = []

    for (const file of files) {
      const source = stripComments(readFileSync(file, 'utf8'))
      const rel = relative(process.cwd(), file)

      for (const spec of importSpecifiers(source)) {
        const isRelative = spec.startsWith('./') || spec.startsWith('../')
        if (isRelative) {
          if (spec.includes('../')) {
            const climbsOut = !join(file, '..', spec).includes(join('src', 'engine'))
            if (climbsOut) violations.push(`${rel}: imports "${spec}" from outside src/engine/`)
          }
          continue
        }
        if (!ALLOWED_BARE_IMPORTS.includes(spec)) {
          violations.push(`${rel}: imports "${spec}" — the engine must stay dependency-free`)
        }
      }
    }

    expect(violations, `\n${violations.join('\n')}\n`).toEqual([])
  })

  it('uses no ambient state or I/O', () => {
    const violations: string[] = []

    for (const file of files) {
      const source = stripComments(readFileSync(file, 'utf8'))
      const rel = relative(process.cwd(), file)
      for (const { pattern, why } of BANNED_GLOBALS) {
        if (pattern.test(source)) {
          violations.push(`${rel}: uses ${String(pattern)} — ${why}`)
        }
      }
    }

    expect(violations, `\n${violations.join('\n')}\n`).toEqual([])
  })
})
