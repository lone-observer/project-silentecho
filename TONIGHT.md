# Tonight — before signing off

About 30–40 minutes. Phase 0 is already built and green; tonight is verifying it on your machine and setting up the container around it.

## 1 · Get it running · ~10 min

- [ ] Unzip into where you keep projects, as `project-silentecho/`
- [ ] `npm install` — expect **0 vulnerabilities**
- [ ] `npm test` — expect **44 passed**
- [ ] `npm run typecheck` — expect clean
- [ ] `npm run dev`, open it, see "Project Silent Echo" in amber on near-black

## 2 · Verify the guard yourself · ~5 min

Don't take my word for it. This test is the load-bearing one for the whole architecture.

- [ ] Add `import React from 'react'` as the first line of `src/engine/dice.ts`
- [ ] `npm test` — expect **2 failures**, naming `react` and the isolation rule
- [ ] Revert the line
- [ ] `npm test` — green again

If it doesn't fail, stop and tell me. An unverified guard is worse than none.

## 3 · Repo and first commit · ~5 min

- [ ] `git init && git add -A`
- [ ] `git commit -m "Phase 0: engine core, dice resolver, isolation guard"`
- [ ] `git tag phase-0`
- [ ] Create the GitHub repo — **public** (mechanics aren't protectable, and it's material for Signal & Drift)
- [ ] `git remote add origin … && git push -u origin main --tags`

## 4 · Cowork Project · ~10 min

- [ ] Create a new Cowork Project: **Project Silent Echo**
- [ ] Paste `PROJECT-INSTRUCTIONS.md` into the Project's custom instructions
- [ ] Connect the repo folder to the Project so sessions can read the docs directly
- [ ] Move this chat into the Project

## 5 · Read one thing · ~5 min

- [ ] `docs/PHASE-0-NOTES.md`, specifically the four GDD ambiguities at the bottom — oil's DC penalty, how Confused scrambles directions, when companion passives fire, what makes a skittish companion flee. None block Phase 1, but you'll want opinions ready when Claude Code asks.

## 6 · Kick off Phase 1 · optional, if you have energy

Phase 1 is 2–3 weeks of work; starting it tonight just means starting.

```
Read CLAUDE.md, docs/GDD.md, docs/ROADMAP.md and docs/EVALS.md.
Execute Phase 1. Stop at its exit criteria.
Build the agent interface to docs/EVALS.md requirements from the start —
pluggable policies, fixed seed sets, full per-turn logging, no state leakage.
```

---

## Not tonight

Resist these. All are later phases and all are cheaper after Gate 1:

- Generating any art
- The telemetry endpoint (ships with week 6, not before)
- The MCP server
- Naming the game

## The only date that matters

**Gate 1, end of week 5.** Ten runs, three questions, honest answers: is turn 20 tense or annoying, do the tells change your decisions, is fight-vs-tame ever a real choice. Everything before it is cheap to change. Everything after it is not.
