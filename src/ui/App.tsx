/**
 * The shell. Classic mode is the whole of it until the diorama lands in Phase 4
 * — at which point this is where the GDD 2.14 toggle between the two goes, and
 * both read the same engine over the same seed.
 */

import { Classic } from '../classic/Classic.tsx'
import { Title } from '../classic/Title.tsx'
import { useRun } from '../state/run.ts'

export function App(): React.JSX.Element {
  const run = useRun((s) => s.run)
  return run === null ? <Title /> : <Classic run={run} />
}
