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

**Why 100 rooms when the Heart is never more than 7 away.** This reasoning was derived against the original flat 20-turn cap: a round trip costs at least twice the Heart's distance, so at 20 turns the Heart had to sit in the near third whatever the grid size — the turn budget bound, not the geometry.

**MEASURED IN 1i, AND THE FRAMING IS DEAD.** `npm run economy -- contract`: at the new caps, **94.9–100% of the grid is reachable inside half the turn budget**, and a round trip to the Heart leaves **21 to 39 spare turns**. There is no "too-deep region" any more — 0.0 to 5.1 rooms out of 100 sit beyond half the budget, against the ~70 the original reasoning assumed. A player cannot end up too deep by searching the wrong way, because there is no too-deep.

**The Heart was NOT moved deeper, and the reason is the interesting part.** The obvious response to 21 spare turns is a deeper Heart, and 1i swept exactly that: **+2 rooms of depth buys 1.8 more rooms visited per run and costs 6 points of escape rate at Drowsing, 8 at Stirring and 11 at Hunting and Ravening**; at +4 the top two difficulties are close to unwinnable. Every extra room of depth is two more turns inside a labyrinth where something is hunting you. **The turn budget can afford a deeper Heart; the Wumpus cannot.** So the grid is doing something other than what this section says it does, and the honest record is that rather than a re-derived constraint that is no longer load-bearing. Full numbers in `docs/PHASE-1-PROGRESS.md`, 1i finding 4.

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

| Difficulty | Wumpus | Hazard-free routes | Min safe detour | Heart distance | Wumpus start | Turns | Focus/room |
|---|---|---|---|---|---|---|---|
| Drowsing | 1 | 2 | +2 | 5–6 | 4–6 | **50** | 4 |
| Stirring | 2 | 1 | +3 | 6–7 | 5–8 | **45** | 4 |
| Hunting | 3 | 0 — an encounter is unavoidable | — | 7 | 5–8 | **40** | 1 |
| Ravening | 4 | 0 | — | 7 | 5–8 | **35** | 1 |

**Turns changed 18 Sep 2026** — was a flat 20/20/20/18. Intent: Drowsing/Stirring oil-constrained rather than turn-constrained, Hunting/Ravening keeping real turn pressure.

**MEASURED IN 1i. The oil half works; the turn half does not bind at all.** `outOfTurns` is **0.0%** at Stirring, Hunting and Ravening and 7.8% at Drowsing, against mean turns used of 12.3–17.3. Runs end to the Wumpus — 60%+ above Drowsing, around turn 13 — exactly as 1g found under the old caps. **Raising the cap did not make runs longer, because the cap was never what was ending them.** The oil side did land: at `MOVE` 0.5 a Drowsing run spends 18.8% of its turns at Dark and runs dry 13.3% of the time.

The caveat is load-bearing: 1i's sweep policies walk shortest paths and do not evade, so the catch rate is the tell-ignored floor rather than what a competent player scores. **A bot that runs away might turn 50 turns into something.** The caps are left as they are pending 1j rather than tuned against a policy that cannot use them. `heartDistance`, `safeRoutes` and `minSafeDetour` are likewise unchanged — see §2.2's note for why depth was measured and then declined.

**`focusesPerRoom` is new, and it makes difficulty a contract on INFORMATION as well as on generation** (GDD 2.7). Drowsing and Stirring may resolve all four doorways; Hunting and Ravening get one. Measured at 1.6–1.7 focuses per run at the top two difficulties against 2.2 at the bottom two, so the cap binds.

**The information axis has a second expression, and it splits the same way.** The charted map is drawn at Drowsing and Stirring and withheld at Hunting and Ravening (§2.14.1). The two are not the same mechanic — `FOCUS` gates what the game will *tell* you, the map gates whether it *remembers* it for you — but they are the same intent, and a future change to one should ask whether it applies to the other. Neither touches the honesty of a tell; see §2.14.1 for why gating a record is not gating a sense.

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

Four stats. Each starts at **10** *(raised from 8 in 1i, Gautham's call — at 8 every starting modifier was −1, so a first-time player's roll breakdown was nothing but negative numbers on the one screen whose job is teaching them how the dice work. It shifts every DC's felt difficulty by a point, which is why it is a balance change rather than a cosmetic one)*. Player gets **3 points** after each completed run (win or lose), max 18 per stat.

| Stat | Governs |
|---|---|
| **STR** | Combat, forcing doors, carrying capacity, shoving past a hazard |
| **AGI** | Dodging traps, fleeing, moving quietly, reflex saves |
| **INT** | Reading carvings, recognizing hazards, deciphering portals, **taming**, map memory |
| **LCK** | Does not work like the others — see below |

**Modifier:** `mod = floor((stat - 10) / 2)`. At 10 that's 0; at 18 it's +4. Deliberately tight.

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

Sanity-check the starting math before you trust it: a fresh character (stat 10, mod 0) against a Moderate DC 12 needs a natural 12 to reach Mixed — 45% odds of mixed-or-better. *(Was 40% at the old starting stat of 8; raising it to 10 in 1i shifted every DC's felt difficulty by a point.)* Still harsh on purpose for a roguelike with stat growth, and it still means **routine actions must be authored at Easy (8) or Trivial (5)**, with Moderate reserved for genuine risk.

**That rule has a second edge nobody had noticed, and 1i found it the expensive way.** Routine actions at a Trivial DC mean a high-stat character lands in the top bands most of the time — so any per-band reward that scales with the roll pays out most often on exactly the actions authored to be easy. That is how `MOVE` briefly became an oil farm (§2.8). The rule is right; anything that pays on a band has to be checked against it.

## 2.7 Actions

`MOVE <direction>` · `FOCUS` · `SEARCH` · `FORCE` · `ENDURE` · `SNEAK` · `AVOID` · `DODGE` · `DISARM` · `FIGHT` · `TAME` · `FLEE` · `USE <item>` · `SEND <companion> <direction>` · `ENTER PORTAL` · `REST` · `DROP HEART`

**Changed 18 Sep 2026.** `LISTEN` and `READ` are retired, replaced by `FOCUS` (below). `DISARM` and `DROP HEART` are new. Every action is a roll except `DROP HEART`, which is free and unconditional. The verbs stay fixed; the *outcomes* get authored per room type. Make outcomes data, not code (§4).

**`FOCUS` — resolves a doorway's tells.** *(Built 1i. It carries a direction — it resolves a doorway, not a room, which is the whole difference from the `LISTEN` it replaces and is why difficulty can cap how many of them a room is worth. It resolves EVERYTHING through that doorway, not only hazards: the base lamp's presence signal covers creatures and the Heart's call too, so resolving only hazards would leave a doorway half-answered. And it ALWAYS resolves — the band scales what the looking cost in oil, never what came back, because a `FOCUS` that sometimes returned nothing would be the probabilistic tell §2.8.1 rejects, wearing a hat. It is withdrawn from the menu entirely while Confused, rather than offered and made to fail: §2.17 filters `legalActions` to what is actually available, and a verb that provably cannot work is a trap dressed as a choice.)* The base lamp tells you a doorway has *something* nearby (presence only) — `FOCUS` is what tells you what it is and confirms the direction with certainty. This replaces `LISTEN`'s old job (buying back tell range in the dark) and `READ`'s old job (recognizing hazards, deciphering portals). One `FOCUS` resolves one doorway. **Difficulty caps how many doorways can be focused per room, replacing the old oil-band tell-range restriction entirely** — Drowsing and Stirring allow focusing all four; Hunting and Ravening allow exactly one, forcing a real guess on the rest. The Wumpus's stench and any companion informational passive (grellhound, lumewing) are exempt — always free, always automatic, never gated by `FOCUS` or by oil level. See §2.4, §2.8.1, and `claude/design-decisions.md`, 18 Sep.

**How `FOCUS` is issued.** It resolves ONE doorway, so it always needs a direction: a bare key cannot complete it. In classic mode `F` arms the pad and the next direction spends it (`F` again or `Esc` puts it down); the same scheme at every difficulty, because the verb is identical at all four and only the allowance differs. *(19 Sep 2026. Before this, `FOCUS` shared its compass key with `MOVE` and the key always resolved to the MOVE — the verb was unreachable from the keyboard and the menu displayed a key that did something else.)*

**`SEARCH`** is a lighter, cheaper pass under the same `FOCUS` family — finds loot at lower reliability, does not resolve hazard tells. **Set in 1i:** `SEARCH` costs 0.25 against `FOCUS`'s 0.5, and pays out at **success-or-better** where everything else in the game clears at mixed-or-better (`SEARCH_FIND_BAND`). That is the "lower reliability" — 45% at the starting stat against a DC 8, where mixed-or-better would be 65%.

**`DISARM` — clears a bloom or snare permanently**, available alongside `FORCE`/`ENDURE` and `AVOID`/`DODGE` respectively. Where the other options get you past the hazard once, `DISARM` removes it from the room for the rest of the run — useful if you expect to pass through again (e.g. on the way back with the Heart), and meant to cost more up front than just getting past. **Settled in 1i: `DISARM` is stat-agnostic, and that means it takes NO stat modifier at all.** In a d20 game that is the only reading that actually delivers what "build-independent" was reaching for — any stat would hand one build a universal answer to both verb hazards, which is exactly the coverage-matrix break §2.8 exists to prevent. It is the only such roll in the game (`STAT_AGNOSTIC_ACTIONS`).

Its counterweight is the DC: **Moderate, where every other hazard verb is Easy.** Without that, carrying no modifier would mean strictly better odds than the verb you were supposed to be choosing between. At starting stats its ceiling is a plain Success — it cannot hand oil back at all until the player has invested in stats, which is the "priced higher than the pass-through options" this section asks for, delivered by the band distribution rather than by a bigger number in a table.

*The alternative that was considered and declined: `DISARM` testing the stat the hazard has NO answer for — AGI on blooms, STR on snares — which closes the coverage matrix elegantly at a higher price. It is a deliberate revision of a tested invariant, and 1i was scoped not to make those on its own. See `claude/design-decisions.md`.*

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

**18 Sep 2026 — the reward is folded into the margin-scaled cost, not a separate flask on top.** The 17 Sep design (a flat oil price per verb, plus a bonus flask at Strong-Success-or-better, gated there specifically to avoid an oil-farming exploit measured at +1.75 oil per bloom) is superseded by the "cost is margin, not injury" model in §2.6: each band now carries its own net oil delta directly — heavy loss on a critical failure, down through breakeven around mixed/success, to a net gain on strong/critical success. This is the same shape the old two-part model was reaching for (bad rolls cost you, great rolls pay you back a little), collapsed into one number per band instead of a base price plus a conditional bonus.

**SET IN 1i, AND THE FARM TRAP DID RECUR — in a shape no gate would have caught.** The multipliers are **3 / 2 / 1 / 0.5 / −0.25 / −0.5**, and the asymmetry at the top is the whole finding. The first version was symmetric (−0.5 and −1, the exact negatives of `success` and `mixed`), and against a Trivial DC — where `MOVE` and `FOCUS` are authored on purpose, per §2.6 — a character at stat 16 or 18 lands in the paying bands often enough that the *expected* value of the action turns positive: **+0.07 oil per move at stat 18**, so a maxed lanternbearer refilled the lamp by walking around.

1g's farm was a gate set at too low a band and closing it meant moving the gate. This one was not a gate at all — it was a payout curve beating its own cost curve once the dice stop being fair. Halving the two paying bands makes the expectation negative for every verb at every stat while keeping what this section promises: a great roll still hands you something back. The property is now asserted structurally (`tests/tuning.test.ts`: no action's best band may return more than its base price) rather than defended by a chosen band.

**What stays true regardless of the exact numbers:** hazards should be net-negative in **turns**, which is the currency that actually decides runs.

**RE-MEASURED IN 1i, AND THE 12.5-POINT FIGURE DOES NOT TRANSFER.** The same controlled counterfactual now measures the verbs' cost at **1.4 to 3.6 points** of escape rate. Hazards are still net-negative, which is what this paragraph requires — but the magnitude collapsed by a factor of four to nine, for a reason that is arithmetic rather than mysterious: a bloom costing four turns out of twenty is 20% of the run, and out of forty-five it is 9%.

The consequence is worth stating plainly rather than leaving implied: at roughly one hazard per run and a two-to-three point swing, **the verb subsystem barely reaches the outcome.** That is not an argument for making hazards harsher — it is the context for any future conversation about `HAZARD_COUNTS` or the minimum safe detour, and it means the 12.5-point number should stop being quoted.

**Ambient oil flasks were re-sized in the same 1g pass**, because the reward and the loot count are one number wearing two hats. `POPULATION.oilFlasks` went from 8–12 to **3–5**: measured across that range the win rate and the shape of the oil budget are flat, and 3–5 is the first setting where the economy actually leans on *earned* oil rather than found oil.

**Left at 3–5 in 1i, and the reason it was not re-swept is worth recording.** Under the new model "earned oil" no longer means flasks at all — it means the oil a good band hands back, which every verb now does. So the number this setting was tuned against has stopped existing, and re-sweeping it in the same pass that redefined it would have measured the wrong thing. What 1i did measure is the thing the setting exists to protect: runs end with 6.4–7.7 oil left and run dry 3.3–13.3% of the time, so the lamp is neither decorative nor a second death clock. **The honest caveat from 1g survives and is now sharper**: `SEARCH` pays out a band later than it used to (§2.7), and blind searching over a 100-room map already found almost nothing. If `SEARCH` stops being worth a turn, this is the first number to look at.

### 2.8.1 Oil — the light budget

Oil is expressed as a **labelled modifier on the roll, never as a hidden DC change.** A raised DC is invisible; `Guttering lamp −2` sitting in the roll breakdown teaches the mechanic for free and honours the labelled-modifier rule in `CLAUDE.md` §4.

| Oil | State | Roll modifier | Lantern radius |
|---|---|---|---|
| 12–7 | Bright | — | 2 |
| 6–3 | Guttering | −2 | 1 |
| 2–1 | Ember | −4 | 1 |
| 0 | Dark | −6 | 0 |

**18 Sep 2026 — oil is spent per action, not burned passively.** The old "start at 12, burn 1 every 2 turns" clock is retired along with health (§2.6). Every action has an oil price, and margin scales it — see the price table below. Starting oil is still **12**; an oil flask still restores **4**, both pending re-check against the new model (§2.8, "ambient oil flasks").

**The price list. Set in 1i from `npm run economy`; the reasoning for each number is in `docs/PHASE-1-PROGRESS.md`.**

| Action | Base oil cost | Notes |
|---|---|---|
| `MOVE` | **0.5** | Sim-decided in 1i — see below the table. |
| `FIGHT` / `TAME` / `SNEAK` / `FORCE` / `ENDURE` | 1 | Margin scales this up or down — see §2.6. |
| `AVOID` / `DODGE` | **0.75 / 1.25** | Split apart in 1i. Health was the only thing distinguishing them ("pays in clock" vs "pays in blood"), and retiring it would have collapsed `DODGE` into "AVOID but worse" — 1g had already measured it as never once chosen. The split moved into the price: AVOID pays a misread in clock, DODGE in oil. |
| `DISARM` | 1 | Its higher effective cost comes from the **band distribution**, not the base: Moderate DC and no stat modifier put its ceiling at a plain Success for a fresh character, so it cannot return oil until stats are invested. Expected cost −1.69 at every stat (§2.7). |
| `FOCUS` | 0.5 | Per doorway, capped by difficulty (§2.7). |
| `SEARCH` | **0.25** | Weaker find-rate to match: pays at success-or-better, a band later than anything else (§2.7). |
| `REST` | 0.5 | Refunded to net 0 on a good roll; lost outright on a bad one. No more +1 penalty. |
| `FLEE` | ~ `MOVE` | Clean exit is cheap; a botched one costs extra oil and a scent marker, same shape as a bad `FIGHT`. |
| `ENTER PORTAL` | 0 beyond the roll | Good roll: reseed into a new labyrinth, oil carries over unchanged. Bad roll: you land already holding the new labyrinth's Heart — see §2.9.1. |
| `USE` (an oil flask) | 0 | Now rolled rather than flat: good roll restores 100% of `flaskValue`, bad roll restores 50%. The flask is spent either way. |
| `SEND` | 0 beyond the roll | See §2.9. |
| `DROP HEART` | 0 | Free, unconditional, and the only action in the game that does not roll. |

**`MOVE` is 0.5, and it was the closest call in the table.** It is the most-taken action in the game, so its price is the shape of the economy rather than one row. Swept at both values across 120 seeds × 3 policies × 4 difficulties: **escape rates are inside the noise either way** (47.5% vs 47.5% at Drowsing, 25.6% vs 23.3% at Stirring). The tie-break is which price leaves oil doing anything — at 0.5, Drowsing spends 18.8% of its turns at Dark and runs dry 13.3% of the time; at 0.25 the lamp is decorative. §2.2.1 asks for Drowsing and Stirring to be oil-constrained, and 0.5 is the price that delivers it.

**Oil is quantized to `OIL_QUANTUM`.** A base of 0.5 times a multiplier of 0.25 is an eighth, and a run printing `+0.125 oil` at a player whose status line reads `Lamp 11.5` is offering a precision the decision does not need. The load-bearing half is determinism: accumulating binary fractions reaches `7.749999999999999` eventually, and `GameState` must survive a JSON round trip unchanged (`CLAUDE.md` 2.5) and replay bit-identically from `(seed, actionLog)` (2.2).

#### The information model, as built

**Two registers, both honest.** The base lamp reports PRESENCE — a doorway either has something behind it or it does not, and that answer is complete and free. `FOCUS` buys IDENTITY, one doorway at a time. So a doorway is in one of four states and every renderer is handed all four (`DoorwaySense`): resolved with tells, resolved and genuinely empty, unresolved, or suppressed by Confused.

**Silence is now a fact rather than an absence**, which is the part worth noticing. Under the old model an empty doorway and an out-of-range one looked alike, and "nothing" carried almost no weight; a doorway reporting nothing is now a complete answer about that doorway, and the only thing on the panel a player can act on without spending a turn. It is also what closes the gap 1h found at the presentation layer — a renderer that cannot tell "nothing is there" from "I have not looked" lets the player read silence as safety, and the engine now makes the distinction by construction instead of asking three renderers to remember it.

#### Darkness restricts range, never reliability — now via `FOCUS`, not oil band

**Oil never degrades the honesty of a tell,** and this still holds, but the mechanism moved. The old oil-band tell-range restriction (Ember/Dark → facing doorway only) is retired — 1g's own data showed it almost never triggered, since most runs never reach Ember. In its place: the base lamp tells you a doorway has *something*, and `FOCUS` (§2.7) is what resolves what and confirms the direction, capped per room by difficulty rather than by oil level. Zero oil is dangerous — roll penalty maxed, lantern dark — but it is not fatal by itself and it does not touch honesty; see "0 oil is not a third death" below.

Three things carried over from the old design, still true:

- **Probabilistic tells were rejected**, and stay rejected. Whatever `FOCUS` resolves is always true; the cost is in turns and oil to resolve it, never in the reliability of what comes back.
- **The Wumpus's own stench, and any companion informational passive (grellhound, lumewing), are exempt from all of this** — always free, always automatic, never gated by oil or by `FOCUS`. CLAUDE.md §3's mandatory-adjacency guarantee widens to **two rooms**, not one, as of 18 Sep — see §2.10. *(Built 1i. The exemption means a doorway can carry a resolved stench AND an unresolved remainder at the same time, which is a real state the renderers have to handle: the stench is printed first, because a panel that showed the unresolved marker and stopped would swallow the one tell `CLAUDE.md` 3 says may never be hidden, on exactly the turns it matters most.)*
- **Confused is the one thing that suppresses the stench too.** §2.8.2 is explicit that a Confused player receives no tells at all, and that is unchanged — the exemption above is from oil and from `FOCUS`, not from the spores. The player is told plainly that they are Confused and for how long, so the absence is legible rather than mistakable for safety.
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

`FIGHT` resolves in one turn and drops a **heavy scent marker** — you just rang a dinner bell. `TAME` costs **two turns** and drops almost no scent. Against a turn limit with a Wumpus navigating by scent, that's a genuine dilemma every single encounter, and it's the kind that gets more interesting as you get better at the game rather than less.

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

**Skittish companions bolt on a CRITICAL FAILURE, not on any failed roll.** *(Changed in 1i, Gautham's call.)* The rule was "bolts on damage taken", and damage stopped existing on 18 Sep (§2.6) — a trigger nothing can fire is worse than no trigger, because this document goes on claiming the mechanic is there. The critical band is the nearest thing the new economy has to the old trigger's meaning: §2.6 already defines it as the one where the world escalates.

The reasoning for the original choice is why the replacement is the *critical* band rather than any failure: ordinary failed rolls are far too common — over a third even at the new starting stat of 10 — so tying flight to them would make the Mixed Success tame worthless.

The player may **spend a Fortune point to keep a bolting companion.** That is an emotional purchase rather than a mechanical one, it gives Luck a use outside treasure and traps, and it turns a mixed tame into something you can defend rather than a downgraded consolation prize.

**The bestiary (v1 — four creatures):**

| Creature | Passive | Tone |
|---|---|---|
| **Wild goblin** | +2 to `SEARCH`. Scrounges — occasionally finds oil. **`DISARM` costs no oil while it follows you** (1i part 2). | Grubby, opportunistic, weirdly loyal once fed. |
| **Lumewing** (cave moth) | Lantern radius +1, so oil lasts longer. **`FOCUS` costs no oil while it follows you** (1i part 2). The per-room `FOCUS` allowance (§2.7) is unchanged — it pays for the looking, it does not buy extra looks. | Gentle. Genuinely beautiful. Sits on your shoulder. |
| **Grellhound** (blind hound) | Reveals hazards in adjacent rooms. **Warns about the Wumpus at three rooms, escalating as it closes** — raised ears at 3, a low growl at 2, an urgent bark at 1 — and every band names the doorway (1i part 2). Only the outer band is new information: the universal stench floor (§2.10) already reaches two rooms and already gives the direction. | The good one. Players will get attached. |
| **The Quiet One** | Mimics your voice. Passive: reduces your scent output. | This is the cozy-horror one. It is friendly. It should not be. It copies things it has heard you say, and once in a while it says something you haven't said yet. |

**The companion buffs, built 18 Sep 2026 (1i part 2), and what they each cost.**

`DISARM` with a goblin and `FOCUS` with a lumewing are **free at every band, including the two that pay oil back.** Read that as a waived charge rather than a waived payout: waiving only the losing bands would leave a verb that can gain and cannot lose, and the expected value of attempting it turns positive — the oil farm 1i part 1 found in the band multipliers, rebuilt out of a companion. A bloom can be `DISARM`ed over and over. Flat zero cannot farm anything, and it costs the player only the small top-band return they would rarely have reached. Neither buff touches the roll, the DC, or `DISARM`'s stat-agnostic status: they discount the price, never the odds.

The grellhound's warning is the one that needed new engine surface, and the reason is the mandatory stench floor. That floor already reaches two rooms and already names the doorway (§2.10), for every player, companion or not — so the hound's old radius-2 growl was a bare yes/no restating something free and directional. **The value is entirely at three rooms**, one past where the floor reaches at all; the two inner bands are the same fact arriving earlier and with more urgency, which is worth having and is narration rather than information.

**Measured, 300 seeds × 4 difficulties, a policy that has a hound and sidesteps what it is warned about** (`npm run economy -- warning`): the radius-3 warning **cuts the catch rate by 4 to 7 points**, in the same direction at every difficulty, significant on a paired test at three of the four (p = 0.0005 to 0.011; stirring is marginal at 0.08). It does not raise the escape rate, because that policy also walks out of the entrance more often once it starts dodging — a fact about a one-line sidestep rule, not about the warning. See `docs/PHASE-1-PROGRESS.md` for the full read.

**Decided, 19 Sep 2026: the grellhound's senses keep firing through Confused, on purpose.** §2.8.1 says the companion passives are exempt from oil and from `FOCUS`, and §2.8.2 says a Confused player receives no tells at all — `getTells` implements the latter; `companionSenses` does not, so the free stench goes silent under spores and the grellhound (and its `revealedHazards`) does not. Measured, this divergence is what the pre-rework hound's entire remaining value rested on: 13 to 21 runs in 300 saved from being caught, all of it on Confused turns. Gautham's explicit call rather than a default: leave the divergence as shipped. Track it; correct only if it reads as game-breaking rather than merely generous. See `claude/design-decisions.md`, 19 Sep.

**The stone-grub is not tameable and is not in v1.** It returns in a late phase as the labyrinth's **shuffler**: grubs eat walls, so on the higher difficulties the geometry drifts while you are inside it. That explains the changing world diegetically instead of by fiat, and it makes the grub a hazard with a personality rather than a companion with a gimmick.

**`SEND <companion> <direction>` — baiting the Wumpus.** A brave companion can be sent into an adjacent room to make noise. It drops a heavy scent marker there, pulling the Wumpus off your trail.

**Built in 1i. Superseded 18 Sep 2026 — every companion's decoy is now equally strong; the roll decides the duration, not which creature you tamed.** A good `SEND` roll buys **3 turns**, a bad one buys **2**, and carrying the Heart still halves whichever you get (2 / 1) — the "hot trail" logic stays load-bearing and stacks with the roll rather than being replaced by it. This retires the 17 Sep `COMPANION.sendScent` tiering (10 for Easy/Moderate-DC creatures, 5 for the Quiet One), which had made the decoy's strength a function of which creature you'd tamed rather than how well you executed the send. Simpler, and it decouples the escape valve from an earlier tame roll's luck. *(See `claude/design-decisions.md`, 18 Sep — supersedes the 17 Sep decision below, kept for its reasoning.)*

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

**Widened 18 Sep 2026 — the mandatory stench tell now fires at two rooms, not one.** This is a presentation-layer floor, independent of a tier's own Perception stat (below) — it fires regardless of whether the Wumpus itself has actually noticed you yet. Compensates directly for §2.8.1's `FOCUS` rework, which makes the base game blinder by default than the old always-on directional tells were; without a wider floor, the new information economy would make first contact feel unfair rather than tense. It does *not* mean you can never be caught unwarned — move into a room that happens to be adjacent to the Wumpus and nothing leaked at your previous room, because it was three away, not two. That is the cost of exploring blind, and it is what the **grellhound** now adds *on top of* the baseline rather than uniquely providing — its existing radius-2 growl (§2.9) now duplicates part of the universal floor, so its value proposition shrinks to whatever warning it still gives beyond two rooms. **Built 18 Sep 2026 (1i part 2):** the grellhound's growl is now an escalating, directional warning at three rooms, two and one (§2.9), so what it adds beyond the floor is the outer band — one room further than this guarantee reaches. Measured at 4 to 7 points of catch rate for a player who acts on it. Tests in `tests/wumpus.test.ts` assert both halves; the radius constant moves, the shape of the guarantee does not.

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

### 2.14.1 The charted map, and why difficulty gates it

**Drowsing and Stirring draw a charted map; Hunting and Ravening do not.** *(Built 1h, promoted from a pending renderer flag to a rule 19 Sep 2026.)*

The map is a fixed grid of what the player has already been told: rooms they have entered and what was in them, plus every doorway leading out of such a room — including doorways into rooms they have never entered, because standing in a room the menu offered them that exit. It never shows an unvisited room's contents, never shows the Heart before they have stood on it, and never shows the Wumpus at all. It is a *record*, not a sense: it adds no fact the player did not already receive, it only stops them having to hold all of it in their head at once.

**That is why gating it by difficulty does not touch `CLAUDE.md` §3.** The darkness invariant governs what the game *tells* you — a tell fires when the thing is adjacent and never when it is not, and §2.8.1's `FOCUS` decides how much of that you can resolve. A map is a convenience layer over facts already delivered under those rules. Withholding it at the top two difficulties asks the player to do their own bookkeeping; it never makes the game say something false, and it never withholds a tell.

**It is the second thing difficulty gates on the information axis, not the first.** §2.2.1's `focusesPerRoom` already made difficulty a contract on information as well as on generation — Drowsing and Stirring resolve all four doorways, Hunting and Ravening get one. The map follows the same split for the same reason and should be read as one rule with two expressions: **the lower two difficulties help you know where you are; the upper two make knowing it your problem.**

The grid is never cropped to the charted area. Cropping would re-frame the map each time exploration reached a new edge, moving every room the player had already placed, which is the opposite of what an orientation aid is for — fixed coordinates for the whole run, empty space and all.

*(Gate: `docs/ROADMAP.md` deferred a map render pending evidence that players get lost. The evidence is the author mapping seed 730339 on paper, mis-mapping it, taking the pit route and dying carrying the Heart.)*

**The `WUMPUS` easter egg.** Typing `WUMPUS` at the title screen opens a faithful implementation of the 1973 original: 20-room dodecahedron, superbats, bottomless pits, five crooked arrows, the original phrasing. It is a separate small module with its own state, deliberately *not* wired into the main engine — an homage, not a game mode. Leave the original's difficulty and prose alone.

## 2.15 Agent play

The engine is pure and deterministic, so anything that can read text and choose an action can play this game. That makes the machine interface worth treating as a product surface rather than test scaffolding.

**One interface, three consumers:**

```ts
interface AgentView {                 // what a player-agent sees
  room: string                        // prose description
  // One entry per DOORWAY, not one per tell — `DoorwaySense`, as of 1i. A model
  // handed only the tells that fired cannot tell an empty doorway from one
  // nobody has looked at, which is 1h's renderer defect in a second place and
  // would make FOCUS unplayable for an agent: nothing to decide on.
  doorways: { direction: Dir, tells: { kind: TellKind, text: string }[],
              unresolved: boolean, suppressed: boolean, focusable: boolean }[]
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

**One argued exception: a compass is not a verb list.** *(19 Sep 2026.)* The text renderer draws a fixed four-cell pad for the directional verbs, with a dark cell where there is no doorway. That looks like the greyed-out list this section forbids, and it is not, because the cost being protected here is **reading cost** — scanning a long list for the few live rows. A compass is one fact about the room (which walls have doorways in them), it is already stated in the doorway panel, and it never changes length. The fixed shape is the point: a cross with one lit arm reads as a dead end at a glance, which a list that shrinks to one row does not.

The exception is narrow and does not generalise. **Everything that is a verb rather than a direction stays in the numbered list**, that list is still `legalActions` verbatim in the engine's order, and it still shows only what is available. A renderer may draw the room's shape; it may not draw a menu of what it cannot do.

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
