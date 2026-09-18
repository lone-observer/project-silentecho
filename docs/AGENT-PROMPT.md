# Agent prompt and heuristic baseline

`docs/EVALS.md` requires two things to be fixed and published verbatim before any model batch runs: the prompt every policy sees, and the heuristic baseline. This doc is the draft of both, written against the game as `docs/GDD.md` and the Phase 1 engine define it. **It is a spec for 1i/1j to implement, not code** — nothing here has been run against a real `AgentView`, because that type doesn't exist yet. Treat every field name below as provisional; reconcile against the actual `AgentView` shape when it's built, and update this doc rather than letting it drift from the implementation.

---

## The fixed prompt

One prompt, unchanged across every model in a batch. Published verbatim alongside the benchmark results, per `docs/EVALS.md` methodology point 4.

### System message

```
You are playing Project Silent Echo, a 20-turn dungeon crawl. Find the Heart,
carry it back to the entrance, and escape before you run out of turns.

Each turn you are shown your situation: the room you're in, what you can sense
in each direction, your stats, your oil supply (a burning resource — when it
runs low, what you can sense narrows), and the exact list of actions you may
take right now.

Two things you can rely on completely:
- A tell (a sound, a smell, a draft) is shown if and only if the thing it
  describes is really adjacent to you. Tells never lie, in either direction.
- Low oil can narrow which tells you're shown. It never makes a shown tell
  false.

On each turn, reply with the number of exactly one action from the legal
action list, and nothing else. {REASONING_CONDITION_ADDENDUM}
```

`{REASONING_CONDITION_ADDENDUM}` is empty in the baseline condition. In the secondary condition (EVALS.md methodology point 4) it is:

```
Before answering, briefly reason step by step about what the tells you can
currently sense imply about what's adjacent to you, then give your action.
```

### Per-turn user message (template)

```
Turn {turn} of {maxTurns}.

Room: {roomArchetype}
Exits and tells: {for each exit — direction, and any tell present}
Oil: {oilBand} ({oilRemaining} remaining)
Stats — STR {strMod}, AGI {agiMod}, INT {intMod}, LCK {lckMod}. Fortune points: {fortunePoints}
Carrying the Heart: {yes/no}
Companion: {none | species, status}
Status effects: {list, or none}

Recent events:
{last N turns of event text — N fixed by the context policy, see below}

Legal actions:
{numbered list, exactly as legalActions() returns them}

Reply with the number of your chosen action.
```

### The context-policy field this template leaves open

EVALS.md already flags "one context policy, held constant" as a required, undecided call. This template's `{Recent events}` block is where that decision lands: either the full run's event log so far, or a fixed trailing window (e.g. last 3–5 turns). Whichever is chosen, it must be the same for every model in a batch — varying it between models measures context-handling, not play quality. See the budget note in `docs/EVALS.md` for why this is also a cost decision, not just a fairness one.

### The Fortune-spend follow-up

Per the Policy interface addition in `docs/EVALS.md` (17 Sep decision — `spendFortune` is now part of the interface, available to every policy, not just a human renderer), a roll eligible for a Fortune spend triggers a second, short exchange rather than folding the choice into the main turn prompt — GDD §2.5 frames this as an *after seeing the roll* decision, so the model needs to actually see the roll before choosing:

```
Your roll: {rollTotal} ({band}). You have {fortunePoints} Fortune point(s).
Spending one lets you {reroll | bump the band by one step — whichever this
roll qualifies for}. Reply SPEND or PASS.
```

A `PASS`, a malformed reply, or a policy that doesn't implement `spendFortune` all resolve identically: the roll stands as-is. This keeps `random` and `heuristic` cheap to write (see below) without giving them an implicit disadvantage baked into the harness.

---

## The heuristic bot (~50 lines, decision order)

Fifty lines of if-statements, per EVALS.md's baseline requirement. Priority order, highest first — this is the whole design, not an outline of a bigger one:

```
function heuristicChooseAction(view):

  # 1. Survival overrides everything. The Wumpus can't be fought or tamed —
  #    the only good move is not being adjacent to it.
  if wumpusTellAdjacent(view):
    if canMoveAwayFromWumpus(view):
      return MOVE(directionAwayFromWumpus(view))
    return bestAvailableEscape(view)   # a portal if one's known, else the
                                        # exit with the faintest Wumpus tell

  # 2. Finish the job once it's in reach.
  if view.room.hasHeart and not view.carryingHeart:
    return TAKE_HEART
  if view.carryingHeart and view.room.isEntrance:
    return LEAVE
  if view.carryingHeart:
    return MOVE(towardEntranceOnKnownPath(view))

  # 3. Creature encounters. Tame deliberately at low-to-moderate difficulty —
  #    1f's own findings note that neither of its test policies ever tamed,
  #    which left the companion system the least-exercised part of the
  #    reducer. A heuristic that never tames repeats that gap in 1g's sim.
  if TAME in view.legalActions and creatureTier(view) <= MODERATE:
    return TAME
  elif FIGHT in view.legalActions and oilBand(view) in [BRIGHT, GUTTERING]:
    return FIGHT       # only commit to loud when there's oil to spare
  elif SNEAK in view.legalActions:
    return SNEAK
  elif FLEE in view.legalActions:
    return FLEE

  # 4. Hazards needing a verb choice (once 1g ships FORCE/ENDURE/AVOID/DODGE).
  #    Play to whichever stat is stronger; there's no dominant choice by
  #    design (see claude/design-decisions.md, 17 Sep — coverage matrix).
  if hazardIsBloom(view):
    return ENDURE if intMod(view) >= strMod(view) else FORCE
  if hazardIsSnare(view):
    return AVOID if intMod(view) >= agiMod(view) else DODGE
  # Pit: no verb options exist. Nothing to decide — the encounter itself
  # already only fires on a route that had a pit-free alternative.

  # 5. Resource management.
  if oilBand(view) in [EMBER, DARK] and USE in view.legalActions and hasOilFlask(view):
    return USE(oilFlask)

  # 6. Exploration default.
  if unvisitedExitExists(view):
    return MOVE(towardLeastVisitedExit(view))

  # 7. Nothing better on offer.
  return LISTEN
```

Fortune spending: pass every eligible roll, always. A heuristic bot spending Fortune optimally would need lookahead this design deliberately doesn't have — passing keeps it a legible floor, not a second policy in disguise. `random`'s Fortune calls: uniform 50/50 SPEND/PASS when eligible.

**Open question this draft doesn't resolve:** difficulty-tier thresholds (`MODERATE`, oil-band gates) are guesses, not measured. Tune them once `npm run sim`-equivalent data exists for the heuristic policy itself — the same rule CLAUDE.md §5 applies to balance numbers generally applies to the bot that measures them.

---

## OpenRouter delivery — no hosted game required

The harness does not need a deployed, reachable game server for a model to "play against." The engine (`applyAction(state, action, rng)`) is a pure function; `npm run sim` already runs entirely in-process today. An `llm:<model-id>` policy is the same run-batch loop with one more `Policy` implementation: for each turn, serialize the current `AgentView` into the template above and call OpenRouter's chat-completions endpoint for that model, then parse the numbered reply back into an `Action`. The whole run — labyrinth, state, prompt construction, the API call, and scoring — happens inside the harness process. There's nothing for OpenRouter or the model to reach over the network except the OpenRouter API itself.

`latentbuild.dev` is unrelated to this — it's the private dashboard for *human* telemetry from the itch.io release (`docs/OBSERVABILITY.md`), not a game server, and nothing in the benchmark needs it.

Model selection is just a list of OpenRouter model IDs passed into the batch runner; each spawns one `llm:<model-id>` policy instance against the identical fixed seed list. Roster size and mix are a free choice, bounded only by the budget below.
