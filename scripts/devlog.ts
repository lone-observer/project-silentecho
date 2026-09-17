/**
 * Regenerates the tables in docs/DEV-LOG.md from docs/dev-log.json.
 *
 *   npm run devlog              rewrite the tables
 *   npm run devlog -- --check   fail if the tables are stale (for CI)
 *
 * docs/dev-log.json is the source of truth and is also what the latentbuild.dev
 * dashboard will read. Keeping one structured file and generating the prose
 * means three months of logging does not have to be parsed back out later.
 *
 * Lines changed, files touched and totals are DERIVED FROM GIT rather than
 * typed by hand — the habit only survives if logging a session costs two
 * minutes, not twenty. Enter only what git cannot know: hours, tokens, cost,
 * tests, and the defects with what found them.
 */

import { execFileSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'

const LOG_JSON = 'docs/dev-log.json'
const LOG_MD = 'docs/DEV-LOG.md'
const START = '<!-- devlog:start -->'
const END = '<!-- devlog:end -->'

/** Generated files would dwarf real work in the line counts. */
const IGNORED = /(^|\/)(package-lock\.json|pnpm-lock\.yaml|yarn\.lock)$/

interface Session {
  id: number
  date: string
  label: string
  hours: number | null
  surface: string
  steps: string[]
  tests: { before: number; after: number }
  tokens: { input: number | null; output: number | null; cacheRead: number | null }
  costUsd: number | null
  commits: string[]
  landed: string
  defects: { what: string; foundBy: string }[]
}

function git(args: string[]): string {
  try {
    return execFileSync('git', args, { encoding: 'utf8' })
  } catch {
    return ''
  }
}

function churnOf(commits: string[]): { added: number; removed: number; files: number } {
  let added = 0, removed = 0
  const files = new Set<string>()
  for (const sha of commits) {
    const out = git(['show', '--numstat', '--format=', sha])
    for (const line of out.split('\n')) {
      const [a, r, file] = line.split('\t')
      if (!file || IGNORED.test(file)) continue
      files.add(file)
      added += Number(a) || 0
      removed += Number(r) || 0
    }
  }
  return { added, removed, files: files.size }
}

const num = (v: number | null | undefined, suffix = ''): string =>
  v === null || v === undefined ? '—' : `${v.toLocaleString()}${suffix}`

const money = (v: number | null): string => (v === null ? '—' : `$${v.toFixed(2)}`)

function render(sessions: Session[]): string {
  const rows: string[] = []
  let totAdded = 0, totRemoved = 0, totHours = 0, totCost = 0, totDefects = 0
  let anyHours = false, anyCost = false

  for (const s of sessions) {
    const churn = churnOf(s.commits)
    totAdded += churn.added
    totRemoved += churn.removed
    totDefects += s.defects.length
    if (s.hours !== null) { totHours += s.hours; anyHours = true }
    if (s.costUsd !== null) { totCost += s.costUsd; anyCost = true }

    const delta = s.tests.after - s.tests.before
    rows.push(
      `| ${s.id} | ${s.date} | ${s.label} | ${num(s.hours, ' h')} | ` +
      `${s.steps.join(', ')} | ${s.tests.before} → ${s.tests.after}${delta ? ` (+${delta})` : ''} | ` +
      `${churn.added ? `+${churn.added} / −${churn.removed}` : '—'} | ` +
      `${money(s.costUsd)} | ${s.defects.length || '—'} |`,
    )
  }

  const table = [
    '| # | Date | Session | Hours | Steps | Tests | Lines | Cost | Defects |',
    '|---|---|---|---|---|---|---|---|---|',
    ...rows,
    `| | | **Total** | **${anyHours ? `${totHours.toFixed(1)} h` : '—'}** | | ` +
    `**${sessions[sessions.length - 1]?.tests.after ?? 0}** | ` +
    `**+${totAdded.toLocaleString()} / −${totRemoved.toLocaleString()}** | ` +
    `**${anyCost ? `$${totCost.toFixed(2)}` : '—'}** | **${totDefects}** |`,
  ].join('\n')

  // What found the defects — the column that turns out to matter most.
  const bySource = new Map<string, number>()
  for (const s of sessions) for (const d of s.defects) bySource.set(d.foundBy, (bySource.get(d.foundBy) ?? 0) + 1)
  const sourceRows = [...bySource.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([src, n]) => `| ${src} | ${n} | ${((n / totDefects) * 100).toFixed(0)}% |`)

  const defectList = sessions
    .flatMap((s) => s.defects.map((d) => `| ${s.date} | ${d.what} | ${d.foundBy} |`))
    .join('\n')

  return [
    START,
    '',
    '## Sessions',
    '',
    table,
    '',
    'Lines are derived from the commits listed in `dev-log.json`, excluding lockfiles.',
    '',
    '## What finds the defects',
    '',
    '| Found by | Count | Share |',
    '|---|---|---|',
    ...sourceRows,
    '',
    '| Date | Defect | Found by |',
    '|---|---|---|',
    defectList,
    '',
    END,
  ].join('\n')
}

const data = JSON.parse(readFileSync(LOG_JSON, 'utf8')) as { sessions: Session[] }
const generated = render(data.sessions)
const current = readFileSync(LOG_MD, 'utf8')

const a = current.indexOf(START)
const b = current.indexOf(END)
if (a === -1 || b === -1) {
  console.error(`devlog: ${LOG_MD} is missing the ${START} / ${END} markers`)
  process.exit(1)
}

const next = current.slice(0, a) + generated + current.slice(b + END.length)

if (process.argv.includes('--check')) {
  if (next !== current) {
    console.error('devlog: DEV-LOG.md is stale. Run `npm run devlog`.')
    process.exit(1)
  }
  console.log('devlog: up to date')
} else {
  writeFileSync(LOG_MD, next)
  const n = data.sessions.length
  const defects = data.sessions.reduce((t, s) => t + s.defects.length, 0)
  console.log(`devlog: wrote ${LOG_MD} — ${n} sessions, ${defects} defects`)
}
