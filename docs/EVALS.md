# Agent evals — can a language model escape the labyrinth?

The engine is pure and deterministic and the game is playable as text, so anything that can read a description and pick an action can play it. That makes a model benchmark nearly free, and it is a legitimate eval rather than a stunt: hidden state, spatial inference from indirect cues, resource management against a hard turn limit, and a standing temptation — `FIGHT` is fast and loud, `TAME` is slow and quiet — whose cost arrives several turns later as an abstract quantity.

This doc is the methodology. **Build the Phase 1 agent interface to these requirements**, or the harness gets rebuilt in November.

## Phase 1 requirements

The sim harness and the LLM harness are the same code. `npm run sim` is one policy among several.

```ts
interface Policy {
  readonly name: string
  chooseAction(view: AgentView): Promise<Action> | Action

  // Added 17 Sep (PM session). GDD §2.5: spending Fortune is a decision made
  // *after seeing a roll*, so it can't be folded into chooseAction — the
  // policy hasn't seen the roll yet when that's called. Optional so `random`
  // and `heuristic` can ignore it cheaply (see docs/AGENT-PROMPT.md for their
  // pass/50-50 behavior), but every LLM policy should implement it: EVALS'
  // own required metrics include "Fortune spend rate and timing" (below),
  // and that has nothing to measure for a policy that structurally can't be
  // asked. The harness calls this after resolving any roll eligible for a
  // Fortune spend, before finalizing that action's outcome. Not implementing
  // it is equivalent to always returning null.
  spendFortune?(roll: RollResult, view: AgentView): Promise<FortuneSpend | null> | FortuneSpend | null
}
```

Required from the start:

- **Pluggable policies.** `random`, `heuristic`, and `llm:<model-id>` all satisfy `Policy`. No special-casing.
- **Fixed seed sets.** A run batch takes an explicit list of seeds. Never `Math.random()` at the batch level — every policy plays the identical labyrinths.
- **Full per-turn logging.** For each turn record the exact `AgentView` the policy saw, the action it returned, the resulting `RollResult`, and (for LLM policies) the raw completion. Runs must be auditable after the fact.
- **One context policy, held constant.** Decide whether the model sees the full run log or a fixed window, write it down, and never vary it between models in a batch. **This is also a cost decision, not just a fairness one — see Budget below, where it's the single largest lever on the number.**
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

**Sequencing, decided 17 Sep:** play the human baseline *after* the agent harness is built, on the shared seed set, but *before* any broad model batches. Seeing model behavior first would anchor the human baseline; seeing the harness work first just confirms the plumbing.

### 4. Fix the prompt, and admit what that buys

Prompt sensitivity will move results more than model choice does. Use one prompt across all models and publish it verbatim. **The draft prompt, its reasoning-condition variant, and the heuristic bot's decision logic are in `docs/AGENT-PROMPT.md`** — pin those down there rather than duplicating them here as they firm up.

Then run **one secondary condition** — the same models with an added "reason about the tells before choosing" instruction — and report the delta. That number is probably more interesting than the leaderboard itself, and it inoculates the post against the obvious objection.

State plainly: this measures models under one fixed prompt, not model ceilings.

## Model delivery: OpenRouter, no hosted game

Decided 17 Sep. The LLM harness does not call out to a deployed, reachable copy of the game — it doesn't need one. The engine is a pure function and already runs entirely in-process for `npm run sim`; an `llm:<model-id>` policy is the same run-batch loop with one more implementation of `Policy`, calling OpenRouter's chat-completions API once per turn with the fixed prompt plus the serialized `AgentView`, and parsing the reply back into an `Action`. The whole run happens inside the harness process. `latentbuild.dev` is the separate human-telemetry dashboard (`docs/OBSERVABILITY.md`) and plays no role here.

Model selection is a plain list of OpenRouter model IDs handed to the batch runner; each spawns one `llm:<model-id>` policy instance played against the identical seed list. See `docs/AGENT-PROMPT.md` for the delivery detail.

## Budget (an estimate, not a quote — re-price before running)

Worked example against a roster like the one under discussion — three Claude models (Fable, Opus, Sonnet) and three GPT models (Astra, Sol, Terra) — using OpenRouter list pricing pulled 17 Sep 2026. **Re-check current pricing before committing spend; these move.**

Call volume per model: n=100 seeds × 2 conditions (baseline + reasoning) × ~12 average turns/run ≈ **2,400 LLM calls**. Across a 6-model roster, ~14,400 calls total.

| Scenario | Assumption | Rough total (6 models) |
|---|---|---|
| **Fixed context window** | ~750 input + ~150 output tokens/call, held constant every turn | **≈ $110** |
| **Full run log** | context grows every turn; ~3× the average tokens/call by the end of a run | **≈ $300–450+** |

That 3–4× spread is entirely the "one context policy, held constant" decision two sections up — it is worth deciding on its own merits (what does the model need to see to play well?) rather than defaulting to whichever is cheaper, but it should be decided with this range in view.

Not included above, and worth budgeting slack for:

- **OpenRouter's markup** over direct provider pricing, and its prepaid-credit model — not pinned to an exact percentage here.
- **Iteration overhead.** A first working pass, prompt debugging, and fixing a parsing edge case typically cost another 1.3–2× on top of one clean batch before the batch that actually ships in the post.
- The `random` and `heuristic` baselines cost nothing beyond compute — no API calls.

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
