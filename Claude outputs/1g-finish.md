# 1g close-out — the two steps this session could not run

Everything for step 1g is written into `C:\Users\Gautham\code\project-silentecho` and
verified byte-for-byte on disk. What is missing is the git half: this Cowork session had
file access to the folder but **no shell on this machine**, so it could not run `git` or
`npm`. Two commands, then one edit.

## 1. Commit and push

```
cd C:\Users\Gautham\code\project-silentecho
npm test          # expect 266 passed, 10 files
npm run typecheck # expect clean
git add -A
git commit -m "1g: hazard verbs — Force/Endure on blooms, Avoid/Dodge on snares

Bloom and snare stop auto-resolving and become verb encounters, the same
shape as the creature encounter. ENTRY_HAZARDS is now ['pit'] alone.

- FORCE/ENDURE/AVOID/DODGE are real ActionKinds, wired through legalActions
  and resolve.ts. GameState gains hazardRoomId, mirroring encounterRoomId.
- Two inverted cost models: Force's turn cost scales with margin and Confused
  always applies; Endure's turn cost is flat and margin shortens Confused to a
  floor of 1 it never passes.
- HazardOutcome gains statusTurns and rewardFlasks. One flask at strongSuccess+
  for all four verbs and a driven-home FIGHT. POPULATION.oilFlasks 8-12 -> 3-5.
  Both sized against the sweep, not guessed; distributions in PHASE-1-PROGRESS.
- Prose written in the same pass: 24 beats plus hazardBlocks/hazardCleared/
  spoilsTaken. FORCE narrated too, DEFERRED_ACTIONS now empty — a deliberate
  deviation from the 18 Sep decision, flagged in PHASE-1-PROGRESS.
- Fixes a status expiring on the turn that applied it, which had been silently
  deleting Confused after any multi-turn action.

scripts/hazard.ts visualiser (4 panels), tests/hazards.test.ts (27 tests,
11 mutation-checked). Suite 239 -> 266.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01CbUSUTpz5cDR1aFYg6saV1"
git push
```

## 2. Record the hash, then regenerate the log

`docs/dev-log.json` session 7 has `"commits": []` and a `$commitPending` key saying so.
After the commit:

```
git rev-parse --short HEAD
```

Put that sha in session 7's `commits` array, **delete the `$commitPending` key**, then:

```
npm run devlog
git add -A && git commit -m "devlog: record 1g commit" && git push
```

The hash was missed outright for session 6 and had to be repaired afterwards. It is
recorded in the JSON as a blocking marker this time rather than left to memory — but the
durable fix is to capture it from inside whatever makes the commit.

## Worth a look before you commit

```
npm run hazard                          Panel A — the coverage matrix
npm run hazard -- cost                  Panel B — every band's price and its odds
npm run hazard -- run 3 stirring route  Panel C — the transcript that found the bug
SWEEP=300 npm run hazard -- oil stirring   Panel D — the oil economy
```
