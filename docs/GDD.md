# Project Silent Echo — Game Design Document

A cozy-horror, Wumpus-derived solo dungeon crawler.

*Codename: Project Silent Echo. Shipping title undecided.*
*This document is the single source of truth for game rules. Build prompts reference it by section number — keep the numbering stable.*

---

## 2.1 Premise

You are a lanternbearer. You descend into a labyrinth that should not have a bottom, looking for the thing at its heart that will pay your debts. Something down there has your scent and is in no hurry.

The tone is **cozy horror**: warm lamplight, hand-lettered signage, a comforting inventory screen — wrapped around a place that is quietly, patiently wrong. The horror is never a jump scare. It's that the mushrooms are arranged too deliberately, and the carvings on the wall are newer than the wall.

## 2.2 The run loop

One run = one labyrinth crawl, **20 turns maximum**.

1. **Descend.** Player enters at the mouth of a procedurally generated labyrinth — a **10×10 grid, 100 rooms**, of which only about half are reachable inside half the turn budget.
2. **Explore.** One action per turn. You always see the room you're standing in. Adjacent rooms leak *tells* — and the tells are shown as directional overlays pointing at the doorway they come from (§4).
3. **Find the Heart.** One room contains the treasure. Taking it is loud. The labyrinth notices.
4. **Escape.** Carry the Heart back to the entrance and leave.

**Win:** Exit the entrance carrying the Heart.
**Partial:** **Retreat** — leave alive without the Heart. Not a loss. The map is the prize (§2.11).
**Lose:** Caught by the Wumpus, killed by a hazard, or the turn limit ends without escaping.

**Why 100 rooms when the Heart is never more than 7 away.** A round trip costs at least twice the Heart's distance, so at 20 turns the Heart has to sit in the near third whatever the grid size — the turn budget binds, not the geometry. The other ~70 rooms are the **too-deep region**: you never *choose* to go there, you end up there by searching the wrong direction, and then the turn count decides whether you get back. At 5×5 the whole map could be brute-forced inside the limit and nothing was ever truly unknown.

Turn 20 is a real antagonist. A 5×5 labyrinth is ~8 turns deep and ~8 turns back — the margin is thin, and every detour costs.

### 2.2.1 Difficulty is a contract on generation

Difficulty is not merely a Wumpus tier. It is a set of guarantees the generator must satisfy before a labyrinth is playable.

| Difficulty | Wumpus | Hazard-free routes | Min safe detour | Heart distance | Turns |
|---|---|---|---|---|---|
| Drowsing | 1 | 2 | +2 | 5–6 | 20 |
| Stirring | 2 | 1 | +3 | 6–7 | 20 |
| Hunting | 3 | 0 — an encounter is unavoidable | — | 7 | 20 |
| Ravening | 4 | 0 | — | 7 | 18 |

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

**Rules for overlays:**
- Always honest. An overlay never appears for something that isn't there, and never fails to appear for something that is.
- Always directional. If two hazards are adjacent through different doorways, you get two overlays in two places.
- Intensity encodes nothing. Resist the urge to scale opacity with distance — it invites misreading. A thing is adjacent or it isn't.
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
| −5 to −1 | **Failure** | Action fails. Minor cost: a turn, lamp oil, a point of health. |
| 0 to +3 | **Mixed Success** | You get what you wanted *and* it costs you something. **The game's signature band — write the most interesting outcomes here.** |
| +4 to +7 | **Success** | Clean. What you intended. |
| +8 to +11 | **Strong Success** | Success plus a small gift: a glimpse of the map, a trinket, the Wumpus loses your scent. |
| ≥ +12 | **Critical Success** | Success, treasure, and a lasting advantage. |

**Natural 1 and natural 20 override the band edges:** a natural 1 always carries a twist of misfortune regardless of modifiers; a natural 20 always carries a gift. Tension stays alive for a maxed character; hope stays alive for a fresh one.

**Standard DCs:** Trivial 5 · Easy 8 · Moderate 12 · Hard 16 · Severe 20 · Near-impossible 25

**Design note:** The Mixed Success band is deliberately the widest of the good bands, so "you got it, but —" is the most common non-failure result.

Sanity-check the starting math before you trust it: a fresh character (stat 8, mod −1) against a Moderate DC 12 needs a natural 13 to reach Mixed — 40% odds of mixed-or-better. That's harsh on purpose for a roguelike with stat growth, but it means **routine actions must be authored at Easy (8) or Trivial (5)**, with Moderate reserved for genuine risk. If early runs feel punishing, the first lever is DC assignment in the content table, not band widths. The Phase 1 sim harness is the arbiter.

## 2.7 Actions

`MOVE <direction>` · `LISTEN` · `SEARCH` · `FORCE` · `SNEAK` · `FIGHT` · `TAME` · `FLEE` · `USE <item>` · `SEND <companion> <direction>` · `READ` · `ENTER PORTAL` · `REST`

Every action is a roll, including `MOVE` — a bad move roll means you stumble loudly or take a wrong turn. The verbs stay fixed; the *outcomes* get authored per room type. Make outcomes data, not code (§4).

## 2.8 Hazards

| Hazard | Behavior |
|---|---|
| **Pits** | Tell: draft. AGI save on entry. Failure ends the run; mixed success costs health and the lamp gutters. |
| **Spore blooms** | Tell: sweetness. INT to recognize, AGI to pass. Failure applies *Confused* — see below. |
| **Snare-carvings** | Tell: fresh chisel. INT to spot, STR to break free. |
| **Portals** | Tell: hum. Entering shuffles you into a *different* labyrinth — map knowledge resets, but you may land closer to a Heart, and the Wumpus loses your scent entirely. INT to read where it goes. |
| **Lamp oil** | An action budget rather than a second clock. Low oil applies a labelled penalty to every roll **and visibly shrinks the lantern radius** — the screen closes in on you. See below. |

### 2.8.1 Oil — the light budget

Oil is expressed as a **labelled modifier on the roll, never as a hidden DC change.** A raised DC is invisible; `Guttering lamp −2` sitting in the roll breakdown teaches the mechanic for free and honours the labelled-modifier rule in `CLAUDE.md` §4.

| Oil | State | Roll modifier | Lantern radius | Tell range |
|---|---|---|---|---|
| 12–7 | Bright | — | 2 | all four doorways |
| 6–3 | Guttering | −2 | 1 | all four doorways |
| 2–1 | Ember | −4 | 1 | **facing doorway only** |
| 0 | Dark | −6 | 0 | **facing doorway only** |

- Start a run with **12**. Burn **1 every 2 turns**, so a clean 20-turn run finishes with a little left.
- `SEARCH`, `READ` and `REST` burn **1 extra**. This is what makes oil an action budget: it only bites if you dawdle, which is exactly the right pressure against the turn limit.
- An oil flask restores **4**.

#### Darkness restricts range, never reliability

**Oil never degrades the honesty of a tell.** What the player receives is always true. In the dark they simply receive *less* of it: at Ember and below, only the doorway they last moved through leaks anything.

`LISTEN` reveals all four doorways, truthfully, for the price of one turn.

That is the whole mechanic: **in the dark, information costs turns.** With the Wumpus loose and four turns left, spending one to listen is a real decision — and it is the first thing in the design that gives `LISTEN` a reason to exist.

Three deliberate choices here:

- **Probabilistic tells were rejected.** They compound with the −2/−4/−6 penalty into an unrecoverable state (worse at everything *and* blind), they relocate blame from the player's judgement to the dice, and they make the tell-ignored metric in `docs/EVALS.md` and `docs/OBSERVABILITY.md` unmeasurable — you could no longer tell "ignored the warning" apart from "the warning didn't fire."
- **Range restriction starts at Ember, not Guttering.** The first oil threshold stays purely arithmetic so the deep one lands as a genuine change of state rather than more of the same.
- **`LISTEN` costs no extra oil.** It is the escape valve; charging for it twice would close the valve.

#### Darkness changes the channel, not the fact

Free atmosphere, no mechanics: only one tell is genuinely vision-dependent (the snare's chisel glint). The rest reach the player by smell, sound, or touch. So in the dark the *prose* shifts modality while the information stays identical — the player stops seeing dust motes and starts feeling cold on their face, stops glimpsing a shadow and only hears it skitter.

Write both variants into the outcome table. It costs nothing and it is the difference between darkness as arithmetic and darkness as a place.

### 2.8.2 Confused — suppression, not misdirection

For **2 turns** after a failed spore-bloom check, the sweetness drowns out everything else and the player receives **no tells at all**.

Confused does **not** scramble movement — a failed `MOVE` roll already does that, so scrambled movement would add nothing the dice don't. And it does not scramble the tells into lies: absence is not falsehood, the player is told plainly that they are Confused, and they know exactly how long it lasts. The invariant survives intact.

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
| Critical Failure | It turns hostile, and it *shrieks*. Heavy scent marker, Wumpus advances, you take damage. |
| Failure | It bolts, noisily. Moderate scent marker. Turn wasted. |
| Mixed Success | Tamed, but **skittish** — costs lamp oil to keep, and it bolts when you take damage unless you spend a Fortune point. |
| Success | Tamed. Companion joins you. |
| Strong Success | Tamed, and it knows this place — reveals one adjacent room. |
| Critical Success | Tamed and **brave** — this one can be sent to bait the Wumpus (see below). |

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
| **Grellhound** (blind hound) | Reveals hazards in adjacent rooms. Growls when the Wumpus reaches radius 2 — an extra turn of warning. | The good one. Players will get attached. |
| **The Quiet One** | Mimics your voice. Passive: reduces your scent output. | This is the cozy-horror one. It is friendly. It should not be. It copies things it has heard you say, and once in a while it says something you haven't said yet. |

**The stone-grub is not tameable and is not in v1.** It returns in a late phase as the labyrinth's **shuffler**: grubs eat walls, so on the higher difficulties the geometry drifts while you are inside it. That explains the changing world diegetically instead of by fiat, and it makes the grub a hazard with a personality rather than a companion with a gimmick.

**`SEND <companion> <direction>` — baiting the Wumpus.** A brave companion can be sent into an adjacent room to make noise. It drops a heavy scent marker there, pulling the Wumpus off your trail for 2–3 turns.

**The companion does not come back.**

This is the single most important design beat in the game. It is the escape valve that makes a Tier 4 Wumpus survivable, and it costs you the creature you spent two turns and a good roll earning. Make the log line for it land. Do not soften it, do not add a chance of return, do not let the player un-choose it.

## 2.9.1 The world does not hold still

**The problem.** Once you have the Heart, the obvious play is to retrace your steps: you already cleared that route, you already know what is on it. The inbound journey is exploration; the outbound would be mere execution. Half of every run would be less interesting than the other half.

**The principle, and it is the same one that governs oil (§2.8.1):**

> **The world changes. Your senses never lie. What goes stale is your memory, not your perception.**

This rules out shuffling the labyrinth when the Heart is lifted — that silently invalidates knowledge which was true when it was earned, and arbitrary reversals are the feeling this design keeps refusing. Instead the world drifts *continuously, from turn one*, so your map ages predictably and every tell still fires honestly when you arrive.

Three mechanisms, in increasing cost:

### The Heart is loud

Carrying the Heart multiplies the player's scent output (`COMPANION`-style constant in `tuning.ts`). Retracing your route now means laying a hot trail down a corridor the Wumpus is already moving toward — and at Tier 4 it is moving toward your exit anyway.

This is the cheapest of the three and probably the most important. The return trip crosses the same rooms but poses a different problem: you are no longer solving a labyrinth, you are being tracked through one.

### Creatures wander

Untamed creatures move a room every few turns. The goblin you sneaked past is not reliably where you left it, and a corridor you cleared can be occupied on the way back. Cheap, and it makes the place feel inhabited rather than placed.

### Spore blooms spread

A bloom has a chance every few turns to propagate into an adjacent empty room. The clean corridor you came in by may not be clean on the way out.

Critically, **the tell still fires**: you smell the new sweetness from the doorway exactly as you would an original bloom. This is a changing world, not a gotcha. It is also why the mechanism works at all — if blooms spread *and* the tells were unreliable, the player could not plan; because the tells stay honest, a spreading bloom is information rather than ambush.

### Deferred: the stone-grub as shuffler

Late phase, high difficulty. Grubs eat walls, so the geometry itself drifts while you are inside it — the diegetic explanation for a changing world, and the reason the grub exists at all. It mutates `Labyrinth` mid-run, which ripples into the map view, the agent view and anything caching paths, so it is deliberately held until after Gate 1. If the Heart-scent multiplier and wandering creatures already make the escape tense, this is a week saved.

## 2.10 The Wumpus

It is not a monster that chases you. It is a **weather system with intent**. The design goal: *the player should always be able to tell it's coming, and should still sometimes get caught.*

**Core mechanic — the scent trail.** The player leaves scent in each room they occupy; scent decays over 3 turns. The Wumpus navigates toward the strongest scent within its perception radius. Loud actions (`FORCE`, `FIGHT`, a critical failure, a sent companion) drop much stronger markers. `SNEAK` and `TAME` drop very little.

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
  status: { turn: number, health: number, oil: number,
            fortune: number, companion: string | null, carryingHeart: boolean }
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

