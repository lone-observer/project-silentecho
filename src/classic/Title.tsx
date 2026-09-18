/**
 * The title screen.
 *
 * Seed and difficulty are both on it because a run IS `seed + actionLog`
 * (CLAUDE.md 2.2) — being able to type a seed in is what makes "play the one I
 * just lost" and "play the one in the bug report" possible without any save
 * system, which is the cheapest thing this screen can do for 1i's playtest.
 *
 * Typing `WUMPUS` here opens the 1973 homage (GDD 2.14). That module is Phase
 * 1.5 and deliberately separate from this engine, so 1h does not hint at it.
 */

import { useState } from 'react'

import type { Difficulty } from '../engine/types.ts'
import { DIFFICULTY } from '../engine/data/tuning.ts'
import { useRun } from '../state/run.ts'
import { randomSeed } from './Classic.tsx'
import './classic.css'

const DIFFICULTIES = Object.keys(DIFFICULTY) as Difficulty[]

export function Title(): React.JSX.Element {
  const start = useRun((s) => s.start)
  const [seed, setSeed] = useState('')
  const [difficulty, setDifficulty] = useState<Difficulty>('stirring')

  function begin(): void {
    const parsed = Number.parseInt(seed.trim(), 10)
    start(Number.isFinite(parsed) ? parsed : randomSeed(), { difficulty })
  }

  return (
    <div className="centred">
      <form
        className="card"
        onSubmit={(event) => {
          event.preventDefault()
          begin()
        }}
      >
        <h1>Project Silent Echo</h1>
        <p className="sub">classic mode</p>

        <div className="field">
          <label htmlFor="seed">Seed — leave blank for a labyrinth nobody has seen</label>
          <input
            id="seed"
            inputMode="numeric"
            value={seed}
            placeholder="random"
            onChange={(event) => setSeed(event.target.value)}
          />
        </div>

        <div className="field">
          <label htmlFor="difficulty">Difficulty</label>
          <select
            id="difficulty"
            value={difficulty}
            onChange={(event) => setDifficulty(event.target.value as Difficulty)}
          >
            {DIFFICULTIES.map((name) => (
              <option key={name} value={name}>
                {name} · {DIFFICULTY[name].maxTurns} turns
              </option>
            ))}
          </select>
        </div>

        <div className="actions">
          <button type="submit" className="primary">
            Go down
          </button>
        </div>
      </form>
    </div>
  )
}
