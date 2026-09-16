# Agent evals — can a language model escape the labyrinth?

The engine is pure and deterministic and the game is playable as text, so anything that can read a description and pick an action can play it. That makes a model benchmark nearly free, and it is a legitimate eval rather than a stunt: hidden state, spatial inference from indirect cues, resource management against a hard turn limit, and a standing temptation — `FIGHT` is fast and loud, `TAME` is slow and quiet — whose cost arrives several turns later as an abstract quantity.

This doc is the methodology. **Build the Phase 1 agent interface to these requirements**, or the harness gets rebuilt in November.

## Phase 1 requirements

The sim harness and the LLM harness are the same code. `npm run sim` is one policy among several.

```ts
interface Policy {
  readonly name: string
  chooseAction(view: AgentView): Promise<Action> | Action
}
```

Required from the start:

- **Pluggable policies.** `random`, `heuristic`, and `llm:<model-id>` all satisfy `Policy`. No special-casing.
- **Fixed seed sets.** A run batch takes an explicit list of seeds. Never `Math.random()` at the batch level — every policy plays the identical labyrinths.
- **Full per-turn logging.** For each turn record the exact `AgentView` the policy saw, the action it returned, the resulting `RollResult`, and (for LLM policies) the raw completion. Runs must be auditable after the fact.
- **One context policy, held constant.** Decide whether the model sees the full run log or a fixed window, write it down, and never vary it between models in a batch.
- **No leakage.** `AgentView` contains exactly what a human sees. No true map, no Wumpus position, no seed, no hidden hazards. A model that can see through walls tells us nothing about whether the game is fair.
- **Resumable batches.** A 6-model × 100-run batch should survive an API error without restarting.

## Methodology

Four things that decide whether the writeup is worth anything.

### 1. Fix the seeds

One seed list, identical across every policy. Publish it so anyone can rerun. This is free given determinism, and without it the benchmark measures luck.

### 2. n = 100, not 20

At a true 35% win rate, **n=20 gives a 95% confidence interval of about ±21 percentage points** — a model at 35% and one at 50% are statistically indistinguishable. n=100 brings that to roughly ±9pp, which is still wide but honest.

Runs are 20 turns. Tokens are cheap. Run 100.

Keep a **20-seed shared subset** for the narrative parts of the post — those are the runs you describe individually and embed as replays.

### 3. Baselines, or the numbers mean nothing

Three, all required:

| Baseline | Why |
|---|---|
| **Random legal action** | The floor. Establishes that the game requires play at all. |
| **The heuristic bot** | Fifty lines of if-statements. A model that loses to it is the most interesting result available. |
| **A human (you), 20 runs on the shared seeds** | The ceiling, and the only one that makes the others legible. |

"Model X got 40%" is meaningless. "Model X 40%, heuristic 44%, random 6%, human 55%" is a finding.

### 4. Fix the prompt, and admit what that buys

Prompt sensitivity will move results more than model choice does. Use one prompt across all models and publish it verbatim.

Then run **one secondary condition** — the same models with an added "reason about the tells before choosing" instruction — and report the delta. That number is probably more interesting than the leaderboard itself, and it inoculates the post against the obvious objection.

State plainly: this measures models under one fixed prompt, not model ceilings.

## Report these, not just win rate

Win rate is the least sensitive metric at this sample size and the least interesting. Track:

- **Tame:fight ratio** — patience under a delayed cost
- **`SEND` usage** — willingness to take an irreversible loss for a probabilistic gain
- **Deepest room reached** and **turn at which it turned back** — greed vs discipline
- **Tell-ignored rate** — entered a room whose hazard was announced last turn. Directly comparable to the human figure from telemetry.
- **Fortune spend rate and timing**
- **Loss cause distribution**
- **Turns survived** (a continuous measure, far more sensitive than a binary win at n=100)

## A prediction, recorded before the run

Worth writing down now so it can be wrong in public:

> Models will over-fight and under-tame, because fighting reads as decisive and its cost arrives three turns later as an abstract scent value. Almost none will send a companion, because that is an irreversible loss with a probabilistic payoff. If it holds, it is a small clean result about how models handle delayed, diffuse costs.

## Timing

Runs at **week 5–6**, alongside Ship #1. The benchmark post *is* the launch post — "I made six language models try to escape my dungeon" is a piece people will read, and it carries the game with it. "I made a game" is a much harder sell for something nobody has heard of.

Embed replays. A reader watching a model walk into the pit it was warned about is the thing that gets shared.
