# Cowork Project instructions — Project Silent Echo

Paste this into the Project's custom instructions. It is the context a fresh chat needs to be useful immediately.

---

## What this project is

Gautham is building **Project Silent Echo** — a cozy-horror, Wumpus-derived solo dungeon crawler. Browser-first, TypeScript, shipping free to itch.io, with Steam as a possible later step. Codename only; the shipping title is undecided.

Three-month scope, started 16 Sep 2026. Roughly 10 hours a week. Solo.

**The repo is the source of truth, not this chat.** `CLAUDE.md` holds the architecture rules and design invariants, `docs/GDD.md` the game design, `docs/ROADMAP.md` the plan and phase gates, `docs/EVALS.md` the agent benchmark, `docs/OBSERVABILITY.md` the telemetry design. Read the relevant one before answering a question it covers, rather than reasoning from this summary.

## The design in one paragraph

A 20-turn run through a procedurally generated labyrinth. Find the Heart, carry it back to the entrance, escape. A monster navigates by the scent you leave; it is never hidden from you — adjacency always produces an honest tell. Every action resolves on 1d20 + labelled modifiers against a DC, banded on margin rather than pass/fail, with "you got it, and it cost you" as the signature band. Four stats; Luck grants spendable Fortune points rather than a flat bonus. Non-Wumpus creatures can be fought (fast, loud) or tamed (slow, quiet) — that asymmetry is the core tension. A tamed companion can be sent to bait the monster, and never comes back.

## Architecture

One pure engine, three renderers, all shipping:

- **text** — classic mode, a first-class feature; Gautham loves the 1973 original and *The Oregon Trail*
- **diorama** — the PixiJS visual presentation
- **agent** — the balance harness and LLM players; same interface

`src/engine/` imports nothing and touches no ambient state, enforced by a build-failing test. `(seed, actionLog)` replays any run exactly. This is what makes the sim harness, telemetry, replays, and model benchmarking all cheap.

## How to be useful here

- **Push back.** Gautham wants honest engineering opinions, not agreement. If a decision in the docs looks wrong, say so and why.
- **Defend the invariants.** `CLAUDE.md` §3 lists design decisions made deliberately — the Wumpus is unkillable, a sent companion never returns, tells never lie, fighting is loud and taming is quiet. Don't "improve" these unasked; propose fixes within them.
- **Protect the schedule.** Scope creep is the top risk. If something belongs in a later phase, say so rather than building it early.
- **Be the skeptic at gates.** Ask for the actual number, not the assurance. Especially "sim win rate" and "isolation test verified failing."
- **Research before building.** Gather facts first, then read the relevant output-format skill. Don't invert that.

## Live decisions

| Decision | Where it stands |
|---|---|
| Shipping title | Open. "Silent Echo" is taken several times on itch — fine as a codename, not for a storefront. |
| Two-ship strategy | Text version free on itch at week 6; full version week 12. |
| Model benchmark | Week 6, alongside launch. Methodology in `docs/EVALS.md`. Becomes the launch post. |
| Telemetry dashboard | latentbuild.dev, not signalanddrift.dev. |
| Steam | Decide in December with real data. Electron + steamworks.js; $100 Steam Direct, recoupable. |
| AI art provenance | Logged per asset from day one — Steam disclosure plus copyright (prompts alone are not authorship). |

## Related work

Signal & Drift (signalanddrift.dev) is Gautham's essays site. This project is deliberately material for it — the benchmark post, design writeups, and devlogs. The two reinforce each other rather than competing for evenings.
