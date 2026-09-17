# Observability — human runs

How we learn what real players actually do, once the game is on itch.io and later Steam.

## The core trick

A run is `seed + actionLog`. The engine is deterministic, so **the server can replay any run from a few hundred bytes** and derive everything else — every roll, every room, every near-miss.

That means we never ship a fat analytics payload. We ship the seed, the actions, and the outcome. The dashboard reconstructs the rest by running the same engine server-side.

```jsonc
// A complete run report. Typically 200–600 bytes.
{
  "v": 1,
  "installId": "a3f1...",        // random UUID, generated locally, never linked to a person
  "runId": "b7c2...",
  "gameVersion": "0.4.2",
  "seed": 20260916,
  "mode": "text",                 // "text" | "diorama"
  "platform": "web",              // "web" | "desktop"
  "actions": ["move:N", "listen", "tame", "move:E", ...],
  "outcome": "caught",
  "turnsTaken": 14,
  "durationMs": 412000,
  "abandoned": false              // true if the tab closed mid-run
}
```

## What we want to know

In rough order of how much it should change the game:

| Question | Metric |
|---|---|
| **Where do people stop playing?** | Turn-of-abandonment histogram. The single most actionable number for a 20-turn game. |
| Does the sim predict reality? | Live win rate vs `npm run sim` at the same version. A large gap means the heuristic policy is not playing like a human, and the balance numbers are fiction. |
| Which content is dead? | Action frequency. An action nobody takes is either useless or badly explained. |
| Is fight-vs-tame a real choice? | Tame:fight ratio, and win rate conditioned on each. If one dominates, the core asymmetry has collapsed. |
| Does anyone use the escape valve? | `SEND` rate, and survival rate after using it. |
| Does the Heart escalation land? | Win rate conditioned on having taken the Heart; turn at which it was taken. |
| Is turn 20 the right number? | Distribution of turns-at-escape for winners. If winners cluster at 11–13, the limit is too generous. |
| Are the tells working? | Rate of walking into a hazard whose tell was displayed on the previous turn. **This is the fairness metric** — if it's high, either the tells aren't legible or players don't trust them. |

**Not yet defined: a "lostness" metric.** Nothing above measures whether a player is wandering without making progress — e.g. a revisit-to-already-visited-rooms rate, or rooms explored per net step of Heart-distance closed. This matters for one specific decision: a known-path map render is deliberately deferred (`docs/PHASE-1-PROGRESS.md`, 17 Sep) and is only worth building if data shows players or bots actually getting lost. Until this metric exists, that decision has nothing to be gated on.

## Privacy model

Small game, no accounts, no reason to collect anything personal. The design is deliberately boring:

- **Random install ID**, generated client-side on first launch, stored locally. Not linked to a name, email, IP (we don't log it), itch account, or Steam ID.
- **No PII, ever.** Nothing typed by the player is transmitted. Epitaph names stay local.
- **Disclosed plainly** in a short line on the itch page and in an in-game Settings panel, in normal English rather than a policy document.
- **Opt-out in Settings**, respected on every platform including desktop builds. Off means off — no payloads, not even a count.
- **Do Not Track and global privacy signals honored** in the web build.
- **Retention:** raw run reports for 90 days, aggregates indefinitely.

Anything that would make this section longer is probably a feature we should not build.

## Stack

Keep it small enough to forget about:

- **Cloudflare Worker** endpoint (`POST /run`), same account as the Pages deploy for the game.
- **D1** for storage. At the volume a first indie release sees, this is comfortably inside the free tier.
- **Batched sends** — queue run reports locally and flush on run end or next launch, so a flaky connection never costs a run or blocks the UI.
- **Fail silent.** Telemetry must never throw into gameplay, never block a transition, never retry aggressively. If the endpoint is down, the player should not be able to tell.
- **Version every payload.** `v` is there so the schema can change without orphaning old data.

## Dashboard

Private, on **latentbuild.dev** rather than signalanddrift.dev — the essays site is a public identity, and mixing a private ops dashboard into it muddles both. A subdomain behind Cloudflare Access is enough; no auth system to build.

Panels, in the order they should appear:

1. Turn-of-abandonment histogram, with the funnel overlaid
2. Win rate over time, annotated with release versions
3. Action frequency, sorted ascending — the dead content floats to the top
4. Loss causes, stacked by Wumpus tier
5. Tame vs fight, with win rate conditioned on each
6. Tell-ignored rate (the fairness metric)
7. A replay viewer: paste a `runId`, watch the run play back

Panel 7 is worth building early. Reading a histogram tells you *that* players quit at turn 6; watching five runs that ended at turn 6 tells you *why*.

## Ordering

Ship telemetry **with** the week-6 text launch, not after. The first two weeks of real play are the highest-information data this project will ever get, and they're unrepeatable — by week 12 the audience is no longer seeing it fresh.
