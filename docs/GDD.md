# Project Silent Echo — Game Design Document

A cozy-horror, Wumpus-derived solo dungeon crawler.

*Codename: Project Silent Echo. Shipping title undecided.*
*This document is the single source of truth for game rules. Build prompts reference it by section number — keep the numbering stable.*

---

## 2.1 Premise

You are a lanternbearer. You descend into a labyrinth that should not have a bottom, looking for the thing at its heart that will pay your debts. Something down there has your scent and is in no hurry.

The tone is **cozy horror**: warm lamplight, hand-lettered signage, a comforting inventory screen — wrapped around a place that is quietly, patiently wrong. The horror is never a jump scare. It's that the mushrooms are arranged too deliberately, and the carvings on the wall are newer than the wall.

## 2.2 The run loop

One run = one labyrinth crawl, turn-capped per difficulty (§2.2.1). *(18 Sep 2026: the flat 20-turn cap is retired — see the turn column below and `claude/design-decisions.md`.)*

1. **Descend.** Player enters at the mouth of a procedurally generated labyrinth — a **10×10 grid, 100 rooms**, of which only about half are reachable inside half the turn budget.
2. **Explore.** One action per turn. You always see the room you're standing in. Adjacent rooms leak *tells* — and the tells are shown as directional overlays pointing at the doorway they come from (§4).
3. **Find the Heart.** One room contains the treasure. Taking it is loud. The labyrinth notices.
4. **Escape.** Carry the Heart back to the entrance and leave.

**Win:** Exit the entrance carrying the Heart.
**Partial:** **Retreat** — leave alive without the Heart. Not a loss. The map is the prize (§2.11).
**Lose:** Caught by the Wumpus, killed by a hazard, or the turn limit ends without escaping.

**Why 100 rooms when the Heart is never more than 7 away.** This reasoning was derived against the original flat 20-turn cap: a round trip costs at least twice the Heart's distance, so at 20 turns the Heart had to sit in the near third whatever the grid size — the turn budget bound, not the geometry. **Stale as of the 18 Sep turn-cap change (below) — not yet re-derived.** At 45–50 turns a much larger share of the 100-room grid is reachable inside a single run, which may be exactly the point (see the 18 Sep decision — the original complaint was "not enough of the map, most runs feel short"), but the Heart-distance contract (§2.2.1) and the "too-deep region" framing were both tuned against the old budget and have not been re-measured against the new one. Pending 1i.

**Turn pressure is no longer flat across difficulty.** At Drowsing and Stirring the turn cap is now generous on purpose — oil is meant to be the thing you're managing, not the clock. At Hunting and Ravening the cap tightens back down and turn pressure returns as the dominant threat, alongside a faster, more perceptive Wumpus. See §2.2.1 and `claude/design-decisions.md`, 18 Sep.

### 2.2.2 Turn order

`resolve.ts` must follow this exactly. **Two catch checks, not one.**

1. Player acts — the action resolves, the roll lands, the outcome applies
2. **Catch check — the Wumpus is in the room you just entered.** *You walked into it.*
3. Effects: damage, oil, status, Heart pickup and its escalation
4. Scent deposited for the action taken
5. Wumpus moves, if it is due
6. **Catch check — it entered your room.** *It came for you.*
7. World drift (§2.9.1), companion passives, scent decay, oil burn
8. Win/loss evaluation, turn counter

**Why drift precedes passives in step 7.** A grellhound reveals what is in the adjacent rooms. If it reported them before a creature wandered in, it would be describing a world that no longer exists — a companion whose entire job is honest information, lying. Drift first, then passives. See §2.9.1.

**Why step 2 exists.** The hunt visualiser caught a player walking clean through a Wumpus: they moved into its room, it stepped aside the same turn, and a check made only after the Wumpus moved found an empty room. Step 2 also closes the swap case for free — two bodies trading places down a corridor slip past a post-move check, but at step 2 the Wumpus has not moved yet, so it is still there to be found.

### 2.2.1 Difficulty is a contract on generation

Difficulty is not merely a Wumpus tier. It is a set of guarantees the generator must satisfy before a labyrinth is playable.

| Difficulty | Wumpus | Hazard-free routes | Min safe detour | Heart distance | Wumpus start | Turns |
|---|---|---|---|---|---|---|
| Drowsing | 1 | 2 | +2 | 5–6 | 4–6 | **50** |
| Stirring | 2 | 1 | +3 | 6–7 | 5–8 | **45** |
| Hunting | 3 | 0 — an encounter is unavoidable | — | 7 | 5–8 | **40** |
| Ravening | 4 | 0 | — | 7 | 5–8 | **35** |

**Turns changed 18 Sep 2026** — was a flat 20/20/20/18. Starting numbers, explicitly provisional: intent is Drowsing/Stirring to be oil-constrained rather than turn-constrained, Hunting/Ravening to keep real turn pressure. **Not yet retuned against the new cap: Heart distance, hazard-free route counts, min safe detour, and the "first contact around turn 7" claim below** — all were derived against the old 18–20-turn budget. 1i re-measures and adjusts. See `claude/design-decisions.md`, 18 Sep.

**The Wumpus start is a band, and the ceiling is the load-bearing half.** It was once a floor alone — "at least 5 rooms from the entrance" — which on a 10×10 grid put it a mean of 11 rooms away. A Drowsing Wumpus covers 6 rooms in twenty turns, so in 83% of Drowsing seeds and 63% of Stirring ones **it could not reach the player at all**, and the teaching tier could not teach the tell it exists to teach. This is the same failure as a Heart distance specified at one end only (§2.2): a bound that only says *not too close* guarantees *too far*.

The band compensates for how fast each tier moves, so that the thing arrives at all; the **tier** then decides how bad its arrival is. Drowsing is tighter because a tier-1 Wumpus moves once every three turns. The other three share a band and escalate purely through perception radius and move rate — a tier-4 Wumpus placed identically to a tier-2 one is a far worse problem.

Because the start band overlaps the Heart's, the Wumpus tends to begin nearer the prize than the door, and first contact lands around turn 7 — the moment the Heart leaves the plinth. That is the intended shape: **the escape is the hard part, not the approach.**

A **hazard-free route** avoids every hazard *and* every creature. Two routes count as distinct when closing any single room on the first still leaves a way through.

**The minimum safe detour is the point of the whole system.** Without it the safe route is usually free, every player takes it, and hazards stop being a decision. Making safety cost turns turns each run into *fast and risky, or slow and safe* — a choice that bites directly against the turn limit.

**A pit-free route must exist at every difficulty, including Ravening.** See `CLAUDE.md` §3. Pits are instant-loss checks; blooms, snares and creatures cost you without ending you, so those may be forced.

**The top tiers get harder through pressure, not distance.** Ravening loses two turns rather than gaining two corridors — fewer turns bites on every decision in the run at once, whereas a deeper Heart just adds walking.

## 2.3 Presentation model

The game has **three renderers over one engine**, and all three ship. See `CLAUDE.md` §1.

| Renderer | What it is |
|---|---|
| **Text** | Classic mode. A complete, shipping way to play — §2.14. Ships first. |
| **Diorama** | The main visual presentation, described below. |
| **Agent** | Machine interface: the balance harness and LLM play — §2.15. |

Text parity is a hard invariant: every fact any renderer can convey must be expressible as text from the engine's event stream.

**The diorama.** The screen is dominated by a fixed 3/4 view of the current room, rendered at an internal resolution of **480×270**, integer-scaled up. Your character stands in it at roughly 48×64 px — about a quarter of the frame height. You see the room, the doorways, the hazards, any creature present, and your own lanternbearer.

**Scene layers**, back to front:

1. **Background plate** — the room archetype (see §2.9)
2. **Structure** — doorways, cut into the plate at fixed anchor points for N/E/S/W
3. **Mid props** — hazard-specific set dressing (pit lip, spore cluster, snare carvings, plinth, portal frame)
4. **Actors** — creatures, companion, player character
5. **Tell overlays** — directional particle/FX layers (§4)
6. **Lighting** — lantern radial falloff with a slow 2-frame flicker, radius driven by oil level
7. **Vignette + fog** — teal-black edge falloff; the fog-of-war layer during transitions

**The movement beat.** When you choose a direction: the character walks to that doorway (4-frame walk cycle, ~600ms), the current room fades to black through the doorway, the new room's plate fades up, and the **fog lifts** — an animated dissolve from full teal-black to the lit scene, radiating outward from the doorway you entered by, over ~500ms. Then the character finishes stepping into frame. The whole transition should be ~1.2s and **skippable on click** — you'll watch it hundreds of times.

**Design constraint:** every piece of information in the diorama must also exist in the event log as text. The visual layer is atmosphere and speed; the text layer is the source of truth. This keeps the game playable in the Phase 1 text build, keeps it accessible, and means a rendering bug can never hide a fact from the player.

## 2.4 Tells as directional overlays

This is the biggest presentation upgrade over a classic Wumpus. Instead of "you smell a stench," the stench **drifts out of a specific doorway**. The player reads spatial information directly off the scene.

| Tell | Source | Overlay |
|---|---|---|
| **Stench** | Wumpus adjacent | Pallid violet wisps drifting out of the doorway, slow and heavy. **Ambience drops to near-silence.** Violet is reserved for this and nothing else. |
| **Draft** | Pit adjacent | Dust motes streaming horizontally toward the doorway; the lantern flame visibly leans that way. |
| **Sweetness** | Spore bloom adjacent | Pale pink-gold pollen drifting *upward* near the doorway. Pretty. That's the trap. |
| **Hum** | Portal adjacent | A faint standing-wave shimmer distorting the doorway's edge. |
| **Fresh chisel** | Snare-carving adjacent | A subtle specular glint traveling along a wall section, once every few seconds. |
| **Skittering** | Creature adjacent | Small quick shadow-flickers at the doorway's base. |
| **Metallic** | The Heart, still on its plinth | A taste of iron and old coin on the air. Faint gold at the doorway's edge. Stops the instant the Heart is lifted — it is in your hands then, not through a door. |

**Rules for overlays:**
- Always honest. An overlay never appears for something that isn't there, and never fails to appear for something that is.
- Always directional. If two hazards are adjacent through different doorways, you get two overlays in two places.
- Intensity encodes nothing. Resist the urge to scale opacity with distance — it invites misreading. A thing is adjacent or it isn't.
- **The Heart's call is radius 1, like everything else.** A longer-range beacon would make the search a homing exercise and delete the *retreat* outcome (§2.2), which depends on the Heart being genuinely findable-or-not. One room of warning does not help you search — but it does mean that running at Ember or Dark, where only the doorway you face reports, you can walk straight past the Heart and never know. That consequence is the reason the tell exists.
- Every overlay has a colorblind-safe alternate form (shape/motion-based, not hue-based) behind an accessibility toggle.

## 2.5 Stats

Four stats. Each starts at **8**. Player gets **3 points** after each completed run (win or lose), max 18 per stat.

| Stat | Governs |
|---|---|
| **STR** | Combat, forcing doors, carrying capacity, shoving past a hazard |
| **AGI** | Dodging traps, fleeing, moving quietly, reflex saves |
| **INT** | Reading carvings, recognizing hazards, deciphering portals, **taming**, map memory |
| **LCK** | Does not work like the others — see below |

**Modifier:** `mod = floor((stat - 10) / 2)`. At 8 that's −1; at 18 it's +4. Deliberately tight.

**Luck is different by design.** It does not add to rolls. Instead:
- Grants **Fortune points** per run: `floor(LCK / 4)`. Spend one *after seeing a roll* to reroll it, or to bump a result up one outcome band.
- Raises the floor on loot tables: high LCK shifts treasure quality, not frequency.
- Natural 20s trigger a Luck-scaled bonus roll.

This makes Luck the stat that changes *how you play*, not just your numbers.

## 2.6 The die: outcome spectrum, not pass/fail

Every action rolls **1d20 + relevant stat modifier + situational modifiers** against a **Difficulty Class (DC)**.

Resolve on **margin** (`roll_total − DC`):

| Margin | Band | Meaning |
|---|---|---|
| ≤ −6 | **Critical Failure** | Action fails and the world escalates. Trap springs, noise spikes, the Wumpus advances. |
| −5 to −1 | **Failure** | Action fails. Minor cost: a turn, extra lamp oil. |
| 0 to +3 | **Mixed Success** | You get what you wanted *and* it costs you something. **The game's signature band — write the most interesting outcomes here.** |
| +4 to +7 | **Success** | Clean. What you intended. |
| +8 to +11 | **Strong Success** | Success plus a small gift: a glimpse of the map, a trinket, the Wumpus loses your scent. |
| ≥ +12 | **Critical Success** | Success, treasure, and a lasting advantage. |

**18 Sep 2026 — cost is margin, not injury.** There is no health resource. Every action's oil cost scales with the band it lands in: a bad roll spends more of what you were already spending to attempt it, a good roll spends less (strong/critical success can net you oil back). Nothing about a bad roll "hurts" you — it costs you resource, same currency either way. The only two ways a run ends in death are falling in a pit and the Wumpus catching you (see §2.8, §2.10); every other bad outcome, however bad the roll, is survivable and just costs oil and turns. See `claude/design-decisions.md`, 18 Sep, for the full reasoning and what replaced the old `damage` field.

**Natural 1 and natural 20 override the band edges:** a natural 1 always carries a twist of misfortune regardless of modifiers; a natural 20 always carries a gift. Tension stays alive for a maxed character; hope stays alive for a fresh one.

**Standard DCs:** Trivial 5 · Easy 8 · Moderate 12 · Hard 16 · Severe 20 · Near-impossible 25

**Design note:** The Mixed Success band is deliberately the widest of the good bands, so "you got it, but —" is the most common non-failure result.

Sanity-check the starting math before you trust it: a fresh character (stat 8, mod −1) against a Moderate DC 12 needs a natural 13 to reach Mixed — 40% odds of mixed-or-better. That's harsh on purpose for a roguelike with stat growth, but it means **routine actions must be authored at Easy (8) or Trivial (5)**, with Moderate reserved for genuine risk. If early runs feel punishing, the first lever is DC assignment in the content table, not band widths. The Phase 1 sim harness is the arbiter.

## 2.7 Actions

`MOVE <direction>` · `FOCUS` · `SEARCH` · `FORCE` · `ENDURE` · `SNEAK` · `AVOID` · `DODGE` · `DISARM` · `FIGHT` · `TAME` · `FLEE` · `USE <item>` · `SEND <companion> <direction>` · `ENTER PORTAL` · `REST` · `DROP HEART`

**Changed 18 Sep 2026.** `LISTEN` and `READ` are retired, replaced by `FOCUS` (below). `DISARM` and `DROP HEART` are new. Every action is a roll except `DROP HEART`, which is free and unconditional. The verbs stay fixed; the *outcomes* get authored per room type. Make outcomes data, not code (§4).

**`FOCUS` — resolves a doorway's hazard tell.** The base lamp tells you a doorway has *something* nearby (presence only) — `FOCUS` is what tells you what it is and confirms the direction with certainty. This replaces `LISTEN`'s old job (buying back tell range in the dark) and `READ`'s old job (recognizing hazards, deciphering portals). One `FOCUS` resolves one doorway. **Difficulty caps how many doorways can be focused per room, replacing the old oil-band tell-range restriction entirely** — Drowsing and Stirring allow focusing all four; Hunting and Ravening allow exactly one, forcing a real guess on the rest. The Wumpus's stench and any companion informational passive (grellhound, lumewing) are exempt — always free, always automatic, never gated by `FOCUS` or by oil level. See §2.4, §2.8.1, and `claude/design-decisions.md`, 18 Sep.

**`SEARCH`** is a lighter, cheaper pass under the same `FOCUS` family — finds loot at lower reliability, does not resolve hazard tells. Exact split TBD, 1i.

**`DISARM` — clears a bloom or snare permanently**, available alongside `FORCE`/`ENDURE` and `AVOID`/`DODGE` respectively. Where the other options get you past the hazard once, `DISARM` removes it from the room for the rest of the run — useful if you expect to pass through again (e.g. on the way back with the Heart), and meant to cost more up front than just getting past. Whether `DISARM` is stat-gated (joining the per-stat coverage matrix in §2.8) or stat-agnostic (a universal, build-independent option) is **not yet decided** — leaning stat-agnostic so it doesn't disturb the existing "every stat has exactly one hazard it can't touch" design, but not settled. Pending 1i.

**`DROP HEART`** — see §2.9.1.

`FORCE`, `ENDURE`, `AVOID` and `DODGE` are **built** — step 1g, 18 Sep 2026. They are not free verbs: each is offered only while you are standing in the hazard it answers, and while one is offered it is the *whole* menu (see 2.8). Their prose was written in the same pass as the mechanic, per the 18 Sep decision.

**`FORCE`'s prose was written too, which the 18 Sep decision did not ask for.** That decision named only `ENDURE`/`AVOID`/`DODGE` and said `FORCE` stays in `DEFERRED_ACTIONS`; it was taken before it was clear that 1g would make `FORCE` selectable in the same step. Deferring `FORCE` was only ever defensible because `legalActions` never offered it — `tests/outcomes.test.ts` asserts exactly that, *a deferred verb is one the player can never choose* — so the moment a bloom offered it, a deferred `FORCE` meant a player shouldering through a spore bloom and the engine saying nothing, which is a text-parity failure (`CLAUDE.md` 2.3). `DEFERRED_ACTIONS` is now empty. Flagged in `docs/PHASE-1-PROGRESS.md` as a deliberate deviation.

**What `FORCE` is and isn't for.** `FORCE` bypasses a spore bloom outright — it was never meant to open a wall or a door. `Room.exits` has no closed-door state, and inventing one for `FORCE` to clear would mean geometry that changes mid-run, which collides with "terrain never drifts" (§2.9.1). A creature that can chew or dig through terrain (the stone-grub, retired from v1 but slated to return) is a separate, later mechanic — and when it's built, it will face the same terrain-never-drifts tension the within-run bloom-spread question already sits against (see `claude/design-decisions.md`). Decide the two together, not separately.

## 2.8 Hazards

Every hazard but the pit now offers a choice of verb, the same shape as the Creature encounter below (§2.9) — deliberately built so every stat has exactly one hazard type it's weak against, and none is a free pass through all of them:

| Hazard | Weak stat | Options |
|---|---|---|
| Creature | — (all three covered) | `FIGHT` (STR) · `TAME` (INT) · `SNEAK` (AGI) |
| Spore bloom | AGI | `FORCE` (STR) · `ENDURE` (INT) |
| Snare-carving | STR | `AVOID` (INT) · `DODGE` (AGI) |
| Pit | all (absolute, by design) | none |

| Hazard | Behavior |
|---|---|
| **Pits** | Tell: draft. AGI save on entry. **Binary, 18 Sep 2026 — no partial-credit band.** Pass and you're through unhurt; fail and the run ends. No verb options — absolute, by design. Along with the Wumpus catching you, this is one of only two ways a run ends in death (§2.6). |
| **Spore blooms** | Tell: sweetness. Two ways through: `FORCE` (STR) cuts through — margin sets how many turns it costs (2, or 1 on a strong success), but *Confused* always applies regardless of the roll. `ENDURE` (INT) stands through it instead — turn cost is flat at two turns, but margin shortens how long *Confused* lasts, to a floor of one turn that it never goes below. Neither ever fully substitutes for the other; AGI has no option against a bloom. `DISARM` is also available (§2.7) — clears the bloom permanently instead of just getting past it, at a higher up-front cost. *(Force/Endure decided 17 Sep 2026, built 18 Sep. `DISARM` added 18 Sep, magnitudes pending 1i — see `claude/design-decisions.md`.)* |
| **Snare-carvings** | Tell: fresh chisel. Two ways through: `AVOID` (INT) reads the mechanism before it triggers and pays for a misread in **clock** — the snare's own currency, since it delays rather than kills; `DODGE` (AGI) reacts after it fires, which is faster when it works and pays in **blood** when it does not. STR has no answer to a snare, by design. `DISARM` is also available (§2.7) — clears the snare permanently instead of just getting past it, at a higher up-front cost. *(Avoid/Dodge decided 17 Sep 2026, built 18 Sep. `DISARM` added 18 Sep, magnitudes pending 1i — see `claude/design-decisions.md`.)* |
| **Portals** | Tell: hum. INT roll, and the two outcomes are deliberately far apart — **non-negotiable, 18 Sep 2026.** Good roll: reseed into a different labyrinth, map knowledge resets, oil carries over unchanged, Wumpus loses your scent entirely. Bad roll: you land already **holding the new labyrinth's Heart** — no exploration phase, straight into the escape problem, with whatever oil you had left and zero map knowledge. `DROP HEART` (§2.9.1) is the release valve if that's not a fight worth having. |
| **Lamp oil** | An action budget rather than a second clock. Low oil applies a labelled penalty to every roll **and visibly shrinks the lantern radius** — the screen closes in on you. See below. |

**18 Sep 2026 — the reward is folded into the margin-scaled cost, not a separate flask on top.** The 17 Sep design (a flat oil price per verb, plus a bonus flask at Strong-Success-or-better, gated there specifically to avoid an oil-farming exploit measured at +1.75 oil per bloom) is superseded by the "cost is margin, not injury" model in §2.6: each band now carries its own net oil delta directly — heavy loss on a critical failure, down through breakeven around mixed/success, to a net gain on strong/critical success. This is the same shape the old two-part model was reaching for (bad rolls cost you, great rolls pay you back a little), collapsed into one number per band instead of a base price plus a conditional bonus. Exact deltas per verb per band are **not yet set** — 1i measures them the same way 1g measured the old ones, via `SWEEP=300 npm run hazard`, and the same oil-farming trap (paying out too generously at too low a bar) applies and needs the same discipline this time.

**What stays true regardless of the exact numbers:** hazards should be net-negative in **turns**, which is the currency that actually decides runs (1g measured a 12.5-point escape-rate cost from the old verb redesign alone — see `docs/PHASE-1-PROGRESS.md`). That finding doesn't get invalidated by the cost-model change; it gets re-measured against the new turn caps (§2.2.1) and the new per-action turn costs once 1i has real numbers.

**Ambient oil flasks were re-sized in the same 1g pass**, because the reward and the loot count are one number wearing two hats. `POPULATION.oilFlasks` went from 8–12 to **3–5**: measured across that range the win rate and the shape of the oil budget are flat, and 3–5 is the first setting where the economy actually leans on *earned* oil rather than found oil. **This was measured against the old passive-burn, health-bearing economy and needs re-checking under the 18 Sep model** — a per-action oil price and a much wider turn budget change how much oil a run actually needs, so 3–5 is a starting point, not a re-confirmed number.

### 2.8.1 Oil — the light budget

Oil is expressed as a **labelled modifier on the roll, never as a hidden DC change.** A raised DC is invisible; `Guttering lamp −2` sitting in the roll breakdown teaches the mechanic for free and honours the labelled-modifier rule in `CLAUDE.md` §4.

| Oil | State | Roll modifier | Lantern radius |
|---|---|---|---|
| 12–7 | Bright | — | 2 |
| 6–3 | Guttering | −2 | 1 |
| 2–1 | Ember | −4 | 1 |
| 0 | Dark | −6 | 0 |

**18 Sep 2026 — oil is spent per action, not burned passively.** The old "start at 12, burn 1 every 2 turns" clock is retired along with health (§2.6). Every action has an oil price, and margin scales it — see the price table below. Starting oil is still **12**; an oil flask still restores **4**, both pending re-check against the new model (§2.8, "ambient oil flasks").

**The price list, starting point — all pending 1i's sim data:**

| Action | Base oil cost | Notes |
|---|---|---|
| `MOVE` | 0.5 (or 0.25 — sim decides) | |
| `FIGHT` / `TAME` / `SNEAK` / `FORCE` / `ENDURE` / `AVOID` / `DODGE` | 1 | Margin scales this up or down — see §2.6. |
| `DISARM` | 1 | Higher effective cost intended once margin scaling is applied; clears the hazard permanently (§2.7). |
| `FOCUS` | 0.5 | Per doorway, capped by difficulty (§2.7). |
| `SEARCH` | lower than `FOCUS` | Weaker find-rate to match. Exact number TBD. |
| `REST` | 0.5 | Refunded to net 0 on a good roll; lost outright on a bad one. No more +1 penalty. |
| `FLEE` | ~ `MOVE` | Clean exit is cheap; a botched one costs extra oil and a scent marker, same shape as a bad `FIGHT`. |
| `ENTER PORTAL` | 0 beyond the roll | Good roll: reseed into a new labyrinth, oil carries over unchanged. Bad roll: you land already holding the new labyrinth's Heart — see §2.9.1. |
| `USE` (an oil flask) | 0 | Now rolled rather than flat: good roll restores 100% of `flaskValue`, bad roll restores 50%. |
| `SEND` | 0 beyond the roll | See §2.9. |
| `DROP HEART` | 0 | Free, unconditional. |

#### Darkness restricts range, never reliability — now via `FOCUS`, not oil band

**Oil never degrades the honesty of a tell,** and this still holds, but the mechanism moved. The old oil-band tell-range restriction (Ember/Dark → facing doorway only) is retired — 1g's own data showed it almost never triggered, since most runs never reach Ember. In its place: the base lamp tells you a doorway has *something*, and `FOCUS` (§2.7) is what resolves what and confirms the direction, capped per room by difficulty rather than by oil level. Zero oil is dangerous — roll penalty maxed, lantern dark — but it is not fatal by itself and it does not touch honesty; see "0 oil is not a third death" below.

Three things carried over from the old design, still true:

- **Probabilistic tells were rejected**, and stay rejected. Whatever `FOCUS` resolves is always true; the cost is in turns and oil to resolve it, never in the reliability of what comes back.
- **The Wumpus's own stench, and any companion informational passive (grellhound, lumewing), are exempt from all of this** — always free, always automatic, never gated by oil or by `FOCUS`. CLAUDE.md §3's mandatory-adjacency guarantee widens to **two rooms**, not one, as of 18 Sep — see §2.10.
- **0 oil is not a third death.** Only the pit and the Wumpus end a run (§2.6). Running out of oil means maximum roll penalty and no light — it makes every other danger more likely to kill you, but it never kills you directly. Making it lethal would recreate the "second death clock" the original 16 Sep oil design explicitly rejected.

#### Darkness changes the channel, not the fact

Free atmosphere, no mechanics: only one tell is genuinely vision-dependent (the snare's chisel glint). The rest reach the player by smell, sound, or touch. So in the dark the *prose* shifts modality while the information stays identical — the player stops seeing dust motes and starts feeling cold on their face, stops glimpsing a shadow and only hears it skitter.

Write both variants into the outcome table. It costs nothing and it is the difference between darkness as arithmetic and darkness as a place.

### 2.8.2 Confused — suppression, not misdirection

For **2 turns** after a failed spore-bloom check, the sweetness drowns out everything else and the player receives **no tells at all**.

Confused does **not** scramble movement — a failed `MOVE` roll already does that, so scrambled movement would add nothing the dice don't. And it does not scramble the tells into lies: absence is not falsehood, the player is told plainly that they are Confused, and they know exactly how long it lasts. The invariant survives intact.

**A status does not expire on the turn that applied it.** Statuses land at step 3 and are counted down at step 7 of the same turn, once per turn the action consumed — so before 1g a Confused applied by a two-turn `FORCE` was decremented twice and expired before the player ever read a suppressed tell. `FORCE`'s one unconditional cost cost nothing at four of its six bands, `ENDURE`'s duration mechanic did nothing at any band, and a *better* `FORCE` roll left the player blind where a worse one did not. The turns an action spends applying a status are not turns spent under it: you are in the bloom while it is happening, and the counting starts when you come out. (The off-by-one predated the verbs — a bloom resolving on the `MOVE` that entered it bought one turn of suppression rather than the two specified here. One is not obviously wrong the way zero is, which is why it survived.)

Moving blind for two turns with the Wumpus at large is frightening enough. If playtesting proves it tame, *scrambling* the tell directions is the spicier alternative — but it bends "tells never lie" and should not be reached for first.

## 2.9 Creatures and companions

The labyrinth is inhabited by things that are not the Wumpus. They are not obstacles — they're the game's second system, and its warmth.

**The encounter.** Entering a room with a creature triggers a choice: `FIGHT` (STR) · `TAME` (INT) · `SNEAK` past (AGI) · `FLEE`.

**The core asymmetry, and the reason this system exists:**

> **Fighting is fast and loud. Taming is slow and quiet.**

`FIGHT` resolves in one turn and drops a **heavy scent marker** — you just rang a dinner bell. `TAME` costs **two turns** and drops almost no scent. Against a 20-turn limit with a Wumpus navigating by scent, that's a genuine dilemma every single encounter, and it's the kind that gets more interesting as you get better at the game rather than less.

**Taming outcome bands:**

| Band | Result |
|---|---|
| Critical Failure | It turns hostile, and it *shrieks*. Heavy scent marker, Wumpus advances, you take damage. **It stays in the room and can never be tamed again** — `TAME` leaves the menu, and what remains is to fight it, slip past it, or run. This is the only band that leaves a live, untamed creature standing in front of you. |
| Failure | It bolts, noisily. Moderate scent marker. Turn wasted. |
| Mixed Success | Tamed, but **skittish** — costs lamp oil to keep, and it bolts when you take damage unless you spend a Fortune point. |
| Success | Tamed. Companion joins you. |
| Strong Success | Tamed, and it knows this place — reveals one adjacent room, and it's **brave** enough to send (see below). |
| Critical Success | Tamed and **brave** — this one can be sent to bait the Wumpus (see below). |

**A natural 20 on the tame roll is always brave**, regardless of which band the margin lands in — the same principle as the natural-20-always-carries-a-gift rule above (§2.6), extended one step further so that no creature's difficulty can make the escape valve permanently unreachable. This is the Quiet One's only realistic path to being sendable: its Hard DC rarely clears Strong Success even at high INT, and without this floor the creature GDD names as the reason `SEND` matters most would be the one creature it never works on. *(Decided 17 Sep 2026 — see `claude/design-decisions.md` in the project; revises the original criticalSuccess-only gate from 16 Sep.)*

**One companion slot.** Taming a new creature releases the current one. Choosing which creature to keep is a real decision, and abandoning one should cost you something emotionally — give it a line in the log.

**Companion passives resolve at the start of the turn, before the player chooses.** One rule for all five creatures, no per-creature special cases.

This matters most at an encounter: the grellhound's hazard reveal has to land *before* fight/tame, or it is flavour rather than a decision input. Firing first gives every companion visible tactical value at the moment you are deciding whether to release it — which is what makes "do I give up my grellhound to tame this goblin?" a real question.

**Skittish companions bolt on damage taken, not on a failed roll.** Failed rolls are far too common — over 40% at starting stats — so tying flight to them would make the Mixed Success tame worthless.

The player may **spend a Fortune point to keep a bolting companion.** That is an emotional purchase rather than a mechanical one, it gives Luck a use outside treasure and traps, and it turns a mixed tame into something you can defend rather than a downgraded consolation prize.

**The bestiary (v1 — four creatures):**

| Creature | Passive | Tone |
|---|---|---|
| **Wild goblin** | +2 to `SEARCH`. Scrounges — occasionally finds oil. | Grubby, opportunistic, weirdly loyal once fed. |
| **Lumewing** (cave moth) | Lantern radius +1, so oil lasts longer. | Gentle. Genuinely beautiful. Sits on your shoulder. |
| **Grellhound** (blind hound) | Reveals hazards in adjacent rooms. Growls when the Wumpus reaches radius 2. **Largely superseded 18 Sep** by the universal radius-2 stench floor (§2.10) — this passive needs a rework (longer range, escalating detail) to stay worth taking; parked, not built. | The good one. Players will get attached. |
| **The Quiet One** | Mimics your voice. Passive: reduces your scent output. | This is the cozy-horror one. It is friendly. It should not be. It copies things it has heard you say, and once in a while it says something you haven't said yet. |

**The stone-grub is not tameable and is not in v1.** It returns in a late phase as the labyrinth's **shuffler**: grubs eat walls, so on the higher difficulties the geometry drifts while you are inside it. That explains the changing world diegetically instead of by fiat, and it makes the grub a hazard with a personality rather than a companion with a gimmick.

**`SEND <companion> <direction>` — baiting the Wumpus.** A brave companion can be sent into an adjacent room to make noise. It drops a heavy scent marker there, pulling the Wumpus off your trail.

**Superseded 18 Sep 2026 — every companion's decoy is now equally strong; the roll decides the duration, not which creature you tamed.** A good `SEND` roll buys **3 turns**, a bad one buys **2**, and carrying the Heart still halves whichever you get (2 / 1) — the "hot trail" logic stays load-bearing and stacks with the roll rather than being replaced by it. This retires the 17 Sep `COMPANION.sendScent` tiering (10 for Easy/Moderate-DC creatures, 5 for the Quiet One), which had made the decoy's strength a function of which creature you'd tamed rather than how well you executed the send. Simpler, and it decouples the escape valve from an earlier tame roll's luck. *(See `claude/design-decisions.md`, 18 Sep — supersedes the 17 Sep decision below, kept for its reasoning.)*

**The companion does not come back.**

This is the single most important design beat in the game. It is the escape valve that makes a Tier 4 Wumpus survivable, and it costs you the creature you spent two turns and a good roll earning. Make the log line for it land. Do not soften it, do not add a chance of return, do not let the player un-choose it.

### 2.9.1 World drift — the labyrinth is not a board

**Within a run, exactly two things move: the creatures, and the Wumpus.** A third thing changes you rather than the map.

**The terrain does not drift.** Hazards are fixed at generation and stay where they were put for the whole run. This is deliberate and it is what makes a charted map worth having: what you learn about *where the pits are* stays true, and what decays is the living half of your knowledge — the Wumpus has moved, and the creatures have wandered off. §2.11 promises that a labyrinth you retreat from and return to has "the Wumpus moved, blooms spread and creatures wandered"; **the blooms spreading is the between-runs half of that promise, not a per-turn one.** Between visits the labyrinth grows; inside a visit it only stirs.

That split is what answers the obvious exploit — *map it once, then walk the safe line every time* — without punishing the player for having mapped it. The route you learned is still geometrically sound; what you cannot count on is that it is still empty.

**Open for reconsideration, not settled — do not act on this without data.** Cutting within-run bloom spread was a 1d scope call under deadline, not a verdict that living, growing terrain is the wrong idea; Gautham likes the concept and wants to revisit it once there's real evidence — the 1g sim's balance read, and eventually live playtest telemetry after the week-6 launch. It stays out until then. The reason it's not a quick flip back: `tests/creatures.test.ts` now asserts the whole hazard layout is byte-identical after 60 drift passes at every difficulty, so "terrain never drifts within a run" is a real, load-bearing, tested invariant today, even though it isn't yet in `CLAUDE.md` §3's canonical table (it's deliberately not promoted there while this is still open — canonizing it now and un-canonizing it later would be worse than leaving it as a tested-but-informal rule). Reopening within-run bloom spread means either deliberately revising that invariant, or scoping a narrow, explicit carve-out for blooms specifically — not quietly bending "terrain never drifts" back open. See `claude/design-decisions.md` (project) for the full thread.

Drift resolves at **step 7** of the turn order (§2.2.2), the last thing before the next turn's tells are read. That placement is load-bearing: every tell the player ever sees describes the world **after** the most recent drift, so drift can never make a reported tell false. The invariant survives untouched.

#### Wandering creatures

Each untamed creature has a per-turn chance to step into an adjacent room. A creature may only move into a room that is **empty** — no hazard, no other creature, not the entrance, not the Heart's chamber, not the room the Wumpus occupies. One thing per room is what keeps a doorway's tells unambiguous, and drift must not break what generation guarantees.

A creature **may** wander into the room the player is standing in. It does **not** trigger an encounter when it does. The encounter choice (§2.9) stays bound to the player *entering* a room, for two reasons: a forced encounter from drift would consume a turn the player never spent, and the player's turn has already resolved by step 7 — there is nothing left to choose with. The creature is simply there, visible in the room description, and the player decides next turn. A creature that walks in on you is an intrusion, not an ambush.

**The rate is deliberately low.** At a high rate the skittering tell degenerates into noise: knowing a creature is east is worthless if it will not be east when you get there. A quarter-chance per creature per turn means a tell you act on immediately is usually still true, while the map you charted ten turns ago is not.

**Hostility travels with the creature**, never with the room. A goblin that turned on you after a botched tame (§2.9) and then wandered next door is still angry, and the chamber it left is merely empty. A hostile flag stranded in a vacated room is a bug.

#### The Heart-carrying scent multiplier

The other drift is not on the map. Lifting the Heart multiplies every scent deposit the player makes (`HEART.carryScentMultiplier`), and this is what answers *why not simply retrace my steps*: the way out crosses the same rooms but poses a different problem, because you are now laying a hot trail down a corridor the Wumpus is already moving toward. It is applied at step 4 in `resolve.ts`, not in the drift pass — it belongs here because it is the third thing that changes state mid-run, not because it shares an implementation.

**`DROP HEART` — new, 18 Sep 2026.** The player may set the Heart back down, free and unconditional (§2.7). This cancels the carrying scent multiplier — the trail goes cold again — but **not** the Wumpus tier jump or the one-turn exact-position reveal that fired the moment the Heart was first taken (§2.10); the labyrinth having noticed doesn't un-notice just because the Heart is back on the ground. Dropping is a real trade, not a free out: you can pick it back up later, but you may not have the oil left to do the round trip twice. This is also the escape valve for a bad `ENTER PORTAL` roll (§2.8.1) — landing already holding a new labyrinth's Heart is survivable specifically because you can set it down and leave clean instead of being forced into an immediate, unprepared escape.

#### Drift scales with difficulty, and Drowsing does not drift

| Difficulty | Drift |
|---|---|
| Drowsing | **none** |
| Stirring | normal |
| Hunting | normal |
| Ravening | accelerated |

**Drowsing is the teaching tier** (§2.10: "Teaches the tells"). A player learning what *skittering* means cannot learn it in a world where the thing has moved by the time they arrive — the lesson becomes unlearnable and the tells read as arbitrary, which is precisely the failure "tells never lie" exists to prevent. A static world on the first difficulty is not a missing feature; it is the tutorial.

Ravening already loses two turns rather than gaining two corridors (§2.2.1). Accelerated drift is the same idea in a different currency: pressure, not distance.

#### Companion passives, and where they actually resolve

§2.9 says companion passives resolve before the player chooses, so that the grellhound's hazard reveal is a decision input rather than flavour. That reason is right. The implementation is cleaner as a split:

- **Informational passives are queries**, computed at read time alongside the tells — the grellhound's adjacent-hazard reveal and its radius-2 growl, the lumewing's lantern radius. Being derived rather than stored, they cannot go stale, and they are by construction available before any choice.
- **Modifier passives are labelled modifiers** supplied at roll time — the goblin's `+2` to `SEARCH`, the Quiet One's multiplier on scent output.
- **Only state changes are step-7 effects** — the goblin's occasional oil scrounge, and the skittish companion's oil upkeep.

This preserves §2.9's guarantee (the reveal always lands before fight-or-tame) without needing an ordering rule to enforce it. It also removes a live bug: if passives resolved as stored effects *before* drift in step 7, a grellhound would report the pre-drift hazards and then a bloom would spread — a companion whose whole job is honest information, lying. Step 7 is ordered **drift first, then passives**, and the informational half is a query regardless.

## 2.10 The Wumpus

It is not a monster that chases you. It is a **weather system with intent**. The design goal: *the player should always be able to tell it's coming, and should still sometimes get caught.*

**Core mechanic — the scent trail.** The player leaves scent in each room they occupy; scent decays over 3 turns. The Wumpus navigates toward the strongest scent within its perception radius. Loud actions (`FORCE`, `FIGHT`, a critical failure, a sent companion) drop much stronger markers. `SNEAK` and `TAME` drop very little — and `ENDURE`, `AVOID` and `DODGE` join them in the quiet half, the same fast-and-loud-vs-slow-and-quiet split as Fight/Tame. *(Decided 18 Sep 2026, built the same day — see `claude/design-decisions.md`.)* `FORCE` sits between `FLEE` and `FIGHT`: louder than running, quieter than a brawl, because a bloom does not shriek back.

**What the fairness guarantee actually is.** The Wumpus never crosses more than one room to reach you, so it is always adjacent before it catches you. That means **a player who holds still is always warned**: the stench arrives a full turn before the thing does.

**Widened 18 Sep 2026 — the mandatory stench tell now fires at two rooms, not one.** This is a presentation-layer floor, independent of a tier's own Perception stat (below) — it fires regardless of whether the Wumpus itself has actually noticed you yet. Compensates directly for §2.8.1's `FOCUS` rework, which makes the base game blinder by default than the old always-on directional tells were; without a wider floor, the new information economy would make first contact feel unfair rather than tense. It does *not* mean you can never be caught unwarned — move into a room that happens to be adjacent to the Wumpus and nothing leaked at your previous room, because it was three away, not two. That is the cost of exploring blind, and it is what the **grellhound** now adds *on top of* the baseline rather than uniquely providing — its existing radius-2 growl (§2.9) now duplicates part of the universal floor, so its value proposition shrinks to whatever warning it still gives beyond two rooms. An escalating, longer-range version of the grellhound's growl is parked in the companion-rework backlog (not built, not scheduled) and would restore its differentiation if it lands. Tests in `tests/wumpus.test.ts` assert both halves; the radius constant moves, the shape of the guarantee does not.

**Adjacency tells are mandatory and always honest** — the violet stench overlay plus the ambience dropout (§4). *Never* hide this. The fear comes from knowing.

| Tier | Name | Move rate | Perception | Behavior |
|---|---|---|---|---|
| 1 | **Drowsing** | 1 room / 3 turns | Adjacent only | Random walk. Avoids loud rooms. Teaches the tells. |
| 2 | **Stirring** | 1 room / 2 turns | Radius 2 | Moves toward strongest scent. Ignores stale trails. |
| 3 | **Hunting** | 1 room / turn | Radius 3 | Pathfinds to freshest scent. Remembers last known position for 3 turns. |
| 4 | **Ravening** | 1 room / turn | Radius 4 | Pathfinds, takes portals, and moves toward the *entrance* when you carry the Heart. |

**Taking the Heart is the escalation trigger.** The moment it leaves the plinth, the Wumpus jumps one tier (capped at 4) and gains your exact position for one turn. The escape is meant to be the hardest part of the run.

**The Wumpus cannot be killed in v1.** You evade it, mislead it, bait it, or you don't. Making it killable turns the game into a combat sim — resist this.

## 2.11 Meta-progression

Between runs, in the **Lanternhouse** hub:

- Distribute 3 stat points.
- Review a run journal: what killed you, what you found, which companion you lost and where, the seed.
- Unlock **Marks** — modest permanent modifiers earned by milestones ("Escaped at Tier 3", "Tamed all five", "Sent a companion and still got out"). They should tune a run, never trivialize it.
- Choose the next labyrinth from 2–3 offers with visible Wumpus tier and rumored Heart value.
- **Return to a labyrinth you mapped.** Retreating alive without the Heart preserves the seed and everything you charted. The Lanternhouse then offers that labyrinth back alongside fresh ones — you keep the map, but the Wumpus has moved, blooms have spread and creatures have wandered. This is what makes retreat a strategy rather than a consolation, and what makes a 100-room map worth having: no single run can chart it, so charting becomes something you do across runs.
- A **bestiary page** that fills in as you tame each creature — a quiet collection reward that costs nothing to build and gives players a reason to try taming things they'd normally fight.

**Parked, 18 Sep 2026 — an "Endless" mode:** pure exploration and charting, no Wumpus, cozy rather than tense. Not scoped, not scheduled, noted here so it isn't lost.

## 2.12 Art direction

**Stardew Valley's warmth, rendering Lovecraft's subjects.** The technique is cozy; the content is wrong. Nothing is drawn in a scary style — everything is warm, hand-made, slightly rounded pixel art. Then you draw things that shouldn't exist that way.

- **Internal resolution:** 480×270, integer-scaled. Character and creatures ~48×64.
- **Palette:** ~28 colors locked in a single `palette.gpl` before any asset is generated. Anchors: *amber lamplight* `#F2B155`, *warm ember* `#D97642`, *deep teal shadow* `#1B3A3D`, *near-black moss* `#0E1A1C`, *sickly moss green* `#6F8F4A`, *bone ivory* `#EDE3CC`, *dried maroon* `#7A2E35`, *pallid violet* `#9B7FA8` — **violet is reserved exclusively for Wumpus tells.**
- **Lighting is the whole atmosphere.** Everything outside the lantern radius is teal-black silhouette. Radius shrinks with oil. Slow 2-frame flicker.
- **Dithering:** soft, ordered, at light boundaries. Never harsh noise.
- **The Wumpus is never shown fully.** Silhouette, partial occlusion, one detail at a time. The full sprite is the reward for losing.
- **UI:** parchment and dark wood, hand-lettered bitmap font. The inventory should feel genuinely nice to open.

**The layered-composition rule — this is what keeps the art budget sane.** A diorama view tempts you into illustrating 20 unique rooms. Don't. Build **6 background archetypes** and composite everything else on top as reusable layers. A flooded gallery with a pit and a spore bloom is the flooded-gallery plate + the pit prop + the bloom prop, not a bespoke drawing. You get visual variety from combination, not from volume.

**Asset manifest (v1):**

- **Background plates (6):** hewn chamber · flooded gallery · fungal grotto · collapsed shrine · carved hall · the Heart chamber. Each with four doorway anchor points (N/E/S/W) and a doorway-closed variant.
- **Mid props (~12):** pit lip, spore cluster, snare carvings, plinth (full/empty), portal frame (6-frame animation), oil flask, rubble, roots, water pool, mushroom ring, bones, hanging chain.
- **Player (5 sets):** idle, walk 4-frame, stumble, carry-Heart variant, low-oil hunched variant.
- **Creatures (5 × 3):** goblin, lumewing, grellhound, stone-grub, Quiet One — each idle + reaction + companion-follow pose.
- **Wumpus:** 4 silhouette poses + 1 full reveal.
- **Overlay FX (6):** violet wisps, dust motes, pollen, portal shimmer, chisel glint, shadow-skitter. Each as a small looping particle sheet.
- **UI:** d20 die faces, 4 stat icons, panel frames, companion portrait frames, bestiary card frames.

That's roughly 70 assets — more than v1's 40, but the layering means it reads as far more than 70 rooms.

## 2.13 Audio

Ambient bed: low drone, irregular drips, distant settling. **Silence when the Wumpus is at radius 2 — the absence of ambience is the tell**, paired with the violet overlay. Dice roll gets a physical, satisfying clatter. Each creature gets one small vocalization; the Quiet One's is your own footstep sound, played back slightly wrong. Phase 4, not before.

---

## 2.14 Classic mode

The 1973 original and *The Oregon Trail* are this game's direct ancestors, and the text renderer is a first-class way to play — not a development stepping stone and not an accessibility fallback.

**Classic mode** is a toggle available from the main menu at all times. It renders the full game as text: room description, directional tells listed per doorway, numbered action menu, roll breakdown, event log. Optional green-phosphor or amber CRT skin with scanlines.

Everything playable in the diorama is playable here, with no information withheld and no outcome altered. Same engine, same seeds, same runs — a run started in one mode can be finished in the other.

**The `WUMPUS` easter egg.** Typing `WUMPUS` at the title screen opens a faithful implementation of the 1973 original: 20-room dodecahedron, superbats, bottomless pits, five crooked arrows, the original phrasing. It is a separate small module with its own state, deliberately *not* wired into the main engine — an homage, not a game mode. Leave the original's difficulty and prose alone.

## 2.15 Agent play

The engine is pure and deterministic, so anything that can read text and choose an action can play this game. That makes the machine interface worth treating as a product surface rather than test scaffolding.

**One interface, three consumers:**

```ts
interface AgentView {                 // what a player-agent sees
  room: string                        // prose description
  tells: { direction: Dir, tell: TellKind, text: string }[]
  legalActions: { action: Action, label: string, dc?: number }[]
  status: { turn: number, oil: number,
            fortune: number, companion: string | null, carryingHeart: boolean }
            // health removed, 18 Sep 2026 — see §2.6
  log: string[]                       // recent events
}

takeAction(runId: string, action: Action): AgentView
```

1. **The sim harness** (`npm run sim`) drives it with a heuristic policy for balance testing.
2. **LLM players** drive it through an MCP server exposing `new_run`, `get_state`, `take_action`. Any MCP client can then play a real run.
3. **The replay viewer** renders a completed agent run for a human to watch.

Because runs are `seed + actionLog`, an agent run replays exactly — which makes "watch an LLM try to escape" a shareable artifact, and makes a future human-vs-model leaderboard a small addition rather than a new system.

**Design constraint:** the agent view must contain exactly what a human player can see, and nothing more. No true map, no Wumpus position, no hidden-hazard leakage. An agent that can see through walls tells you nothing about whether the game is fair.

## 2.16 Echoes

When a run ends in death, it writes an **epitaph** — Oregon Trail's tombstone register, in this game's voice:

> *Here lies GAUTHAM, lanternbearer.*
> *Taken by the Gnawing on the fourteenth turn.*
> *She had the Heart in her hands.*

Later runs find those graves in the labyrinth. Entering the room gives you the epitaph, and sometimes a scrap of what that run was carrying.

**In v1 these are your own previous deaths only** — stored locally, no backend, no accounts. That is deliberate: a solo roguelike where the ruins are entirely your own failures is more affecting than a crowdsourced message board, and it costs a table and a render path instead of a server.

This is the mechanic the project is named for. A sent companion, a lost run, a voice the Quiet One copied — the labyrinth keeps everything and gives none of it back intact.


## 2.17 The information model

The engine owns **what the player knows**. Renderers own **how it looks**. Every constraint below is a property of the engine, which is why each one holds identically in text, in the diorama, and in the agent view — and why none of them can drift between the three.

### One model, three renderings

`Tell` is direction-keyed — `{ direction, kind }` — so the same fact renders as "North: a violet stench", as wisps at the north doorway, and as a tuple in `AgentView`. Proximity (information attached to the thing it concerns) is enforced by the data shape rather than by each renderer remembering to do it.

The same rule governs actions. `legalActions` is computed **in the engine**, filtered to what is actually available this turn. No renderer may build its own list, and none may show the full thirteen verbs with the unavailable ones greyed out — a menu of thirteen where three apply is a menu of thirteen as far as the player's decision cost is concerned.

### The status budget

A player can hold about seven things in working memory. The run currently asks them to track: turn count, oil level, oil band, Fortune, companion, carrying-Heart, active statuses — **before** the four directional tells. **Health dropped from this list 18 Sep 2026** (§2.6) — one fewer thing to track, for free.

That is over budget, and every phase adds to it. So:

- **Chunk before adding.** Oil level and oil band are one fact presented together, never two lines.
- **Anything that can be derived is not tracked.** If the player can see it in the room description, it does not also belong in the status line.
- **A new status effect must displace something**, or justify why the budget grew.

This applies to `AgentView.status` for the same reason in a different currency: human working memory and model context pressure both reward the same discipline.

### Exactly one alarming signal

Pallid violet, and the stench it renders, belong to the Wumpus alone. This is what makes it readable at a glance across a busy room — it is the *only* thing that looks like that.

The corollary is a standing constraint on everything added later: **no second signal may compete for that register.** The metallic Heart call is the near miss to watch — it is also singular, so it must read as warm and inviting where the stench reads as wrong. If two things in the palette feel like alarms, neither is one.

### Endings carry the run

What a player remembers of a run is its hardest moment and its last one. The design already puts those together: the escape is the hardest part by construction, and it is the end.

Two consequences for the outcome table:

- **Every ending needs a beat**, including the quiet ones. *Retreat* — leaving alive without the Heart — is the second-best outcome in the game and currently has no closing line at all, so it would read as the run simply stopping. It needs writing with the same care as the escape.
- **The epitaph is the literal last thing** a failed run produces (§2.16). It carries more weight than any single turn inside that run.

### What is deliberately not applied

Most published game-UX guidance is about real-time execution: input buffering, coyote time, aim assist, sub-100ms hit feedback, cursor travel distance, radial menus.

**None of it applies here, and adding it would be a mistake.** Complexity in this game lives entirely in *decision* — which doorway, fight or tame, spend the turn listening or not — and none of it in *execution*. There is no timing, no aim, no dexterity to forgive. A future session reaching for those techniques is solving a problem this design does not have.

The exception is response time in the diorama, which is handled where it belongs: the movement transition is skippable (§2.3).
