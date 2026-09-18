/**
 * Every line of prose the engine can emit, in one table. Step 1f.
 *
 * `CLAUDE.md` 2.4 is the rule this file exists to satisfy: prose lives in data,
 * never inline in code. Before this file, `resolve.ts` carried a sixteen-line
 * `NARRATION` object and a scatter of template literals; both are absorbed here
 * and neither may come back. If you are about to write a string inside the
 * reducer, you are about to add a second source of truth.
 *
 * ---------------------------------------------------------------------------
 * TWO STRINGS PER CELL, NOT ONE
 * ---------------------------------------------------------------------------
 *
 * GDD 2.8.1: "in the dark the prose shifts modality while the information stays
 * identical — the player stops seeing dust motes and starts feeling cold on
 * their face." Only one tell in the whole game is genuinely vision-dependent
 * (the snare's chisel glint); everything else reaches the player by smell,
 * sound or touch. So darkness is free atmosphere, and it is only free if both
 * variants are written at the same time. Retrofitting means re-opening all 432
 * cells.
 *
 * `Beat.lit` and `Beat.dark` must carry the SAME INFORMATION. The dark variant
 * is not vaguer, not shorter and never less honest — "darkness restricts the
 * RANGE of tells, never their honesty" (`CLAUDE.md` 3) applies to outcome prose
 * for exactly the same reason it applies to tells: if the player cannot tell
 * "the warning didn't fire" from "I couldn't read the warning", the
 * tell-ignored metric in `docs/EVALS.md` stops meaning anything.
 *
 * `tests/outcomes.test.ts` enforces the mechanical half of this: no dark
 * variant may contain a vision word. The semantic half is a human's job.
 *
 * ---------------------------------------------------------------------------
 * WHY THE TABLE IS LAYERED RATHER THAN A FULL GRID
 * ---------------------------------------------------------------------------
 *
 * The exit criterion is content for every `(archetype x action x band)` cell.
 * A literal 6 x 12 x 6 grid is 432 cells and 864 strings, and most of them
 * would be padding: a FIGHT reads the same whether the floor is wet or carved,
 * because the creature is the subject of the sentence and the room is backdrop.
 *
 * So the verbs are split by WHAT THE SENTENCE IS ABOUT:
 *
 *   ROOM-LED    MOVE, LISTEN, SEARCH, READ, REST — the room is the subject.
 *               Full archetype x band prose. What you find when you rummage in
 *               a flooded gallery is genuinely not what you find in a fungal
 *               grotto, and `GENERATION.archetypeAffinity` exists precisely so
 *               that this axis carries meaning.
 *
 *   SUBJECT-LED SNEAK, FIGHT, TAME, FLEE, USE, SEND, ENTER PORTAL — the
 *               creature, the item or the portal is the subject. Band-only
 *               prose; the archetype is backdrop.
 *
 * The lookup is total over all 432 cells either way: `outcomeBeat` resolves any
 * triple, and the coverage test asserts both that it does AND that every
 * room-led verb has all six archetypes genuinely filled, so the layering cannot
 * quietly rot into half-written tables.
 *
 * FORCE is absent on purpose and is NOT a hole. It is in GDD 2.7's verb list
 * but `legalActions` never offers it, and the hazard-verb redesign that gives
 * it a job (FORCE/ENDURE on blooms, AVOID/DODGE on snares) is a separate step
 * scheduled after 1f. `DEFERRED_ACTIONS` names it, and the coverage test
 * asserts NARRATED + DEFERRED covers every `ActionKind` — so a new verb added
 * to the type fails the build until someone classifies it rather than silently
 * shipping without prose.
 *
 * ---------------------------------------------------------------------------
 * WHAT THE PROSE MAY NOT PROMISE
 * ---------------------------------------------------------------------------
 *
 * Text parity (`CLAUDE.md` 2.3) runs in this direction too: the event stream is
 * the source of truth, so a line that implies a mechanic which did not fire is
 * the engine lying to the player. GDD 2.6 describes Strong Success as "success
 * plus a small gift", but for MOVE, LISTEN, SEARCH, READ and REST no gift is
 * implemented — those verbs are one- or two-valued mechanically (see the
 * per-verb notes below). The top bands therefore differ in TEXTURE, never in
 * CLAIM: a strong SEARCH may read more confidently than a clean one, but it may
 * not suggest it found anything the clean one did not. Carried forward to 1g as
 * a balance question, not papered over here.
 */

import type {
  ActionKind,
  CompanionLossReason,
  CreatureKind,
  Direction,
  HazardKind,
  NarrationBeat,
  OutcomeBand,
  RoomArchetype,
} from '../types.ts'
import { BAND_ORDER } from '../types.ts'
import { oilBandFor } from './tuning.ts'

// ---------------------------------------------------------------------------
// Shape
// ---------------------------------------------------------------------------

/**
 * One beat, in both modalities. Same fact, different channel.
 * `lit` is what the player reads while the lamp still reaches; `dark` is what
 * they read once it does not.
 */
export interface Beat {
  readonly lit: string
  readonly dark: string
}

/**
 * Where the prose modality switches.
 *
 * Keyed off `OIL_BANDS[].tellRange` rather than a constant of its own, because
 * GDD 2.8.1 already chose that threshold and gave the reason: "Range
 * restriction starts at Ember, not Guttering. The first oil threshold stays
 * purely arithmetic so the deep one lands as a genuine change of state rather
 * than more of the same." The prose shift IS that change of state, so it lands
 * where the range restriction lands.
 *
 * The practical consequence is that this is not a rare state for flavour's
 * sake: oil starts at 12 and burns 1 every 2 turns, so a clean 20-turn run ends
 * at Ember. The last turns of a good run read in the dark register, which is
 * the right shape — the escape is the hard part, and it is the end.
 *
 * Reversible in one line if playtesting says the shift should wait for Dark.
 */
export function isDarkProse(oil: number): boolean {
  return oilBandFor(oil).tellRange === 'facing'
}

/** Picks the variant. The single place the lit/dark choice is made. */
export function say(beat: Beat, dark: boolean): string {
  return dark ? beat.dark : beat.lit
}

// ---------------------------------------------------------------------------
// Slots — noun substitution, not prose generation
// ---------------------------------------------------------------------------

/**
 * A closed set of nouns a beat may name.
 *
 * `CLAUDE.md` 6 rules out "procedural prose generation at runtime", and this is
 * deliberately not that: no sentence is assembled, no clause is chosen, no
 * grammar is computed. A written sentence names one of five things it cannot
 * know at authoring time, and the substitution is a dictionary lookup. The set
 * is closed and typed so it cannot grow into a generator by accident.
 *
 * `fill` throws on an unfilled slot rather than shipping a brace to the player,
 * and `tests/outcomes.test.ts` drives hundreds of seeded runs asserting no
 * emitted line ever contains one.
 */
export interface Slots {
  readonly creature?: CreatureKind
  readonly companion?: CreatureKind
  readonly direction?: Direction
  readonly hazard?: HazardKind
  readonly item?: string
}

export const SLOT_KEYS: readonly (keyof Slots)[] = [
  'creature',
  'companion',
  'direction',
  'hazard',
  'item',
] as const

/** Compass letters read badly in a sentence. GDD 2.4 renders tells by direction. */
export const DIRECTION_WORD: Record<Direction, string> = {
  N: 'north',
  E: 'east',
  S: 'south',
  W: 'west',
}

export const HAZARD_WORD: Record<HazardKind, string> = {
  pit: 'pit',
  sporeBloom: 'spore bloom',
  snareCarving: 'snare-carving',
  portal: 'portal',
}

/** The Quiet One is a name, not a species. It keeps its capitals. */
export const CREATURE_WORD: Record<CreatureKind, string> = {
  goblin: 'goblin',
  lumewing: 'lumewing',
  grellhound: 'grellhound',
  quietOne: 'Quiet One',
}

/**
 * What a room is CALLED. A noun dictionary, not a description.
 *
 * WHY THIS EXISTS, AND WHY IT IS THE ONLY THING 1h ADDED HERE. CLAUDE.md 2.3
 * requires every fact a player can learn from any renderer to be expressible as
 * text. The archetype is such a fact — the diorama shows you that the floor is
 * under water — so the text renderer has to be able to say it, and the three
 * tables above establish that a noun the renderers share lives in this file.
 *
 * It is deliberately NOT a room description. There is no standing "what this
 * chamber looks like" prose anywhere in the engine, and 1h did not write any:
 * that is a real gap (GDD 2.14 lists room description among the five things
 * classic mode renders, and `AgentView.room` is typed `string` for it), but
 * filling it is authoring a new table, which is a content step's job and not a
 * rendering step's. Flagged in PHASE-1-PROGRESS rather than quietly built.
 *
 * No slot names one of these, so it is not in `Slots` and `fill` never reaches
 * it. Title case because it renders as a heading, the way `CREATURE_WORD` keeps
 * the Quiet One's capitals for the opposite reason.
 */
export const ARCHETYPE_WORD: Record<RoomArchetype, string> = {
  hewnChamber: 'Hewn Chamber',
  floodedGallery: 'Flooded Gallery',
  fungalGrotto: 'Fungal Grotto',
  collapsedShrine: 'Collapsed Shrine',
  carvedHall: 'Carved Hall',
  heartChamber: 'The Heart Chamber',
}

const SLOT_PATTERN = /\{([a-zA-Z]+)\}/g

export function fill(text: string, slots: Slots = {}): string {
  return text.replace(SLOT_PATTERN, (_match, key: string) => {
    switch (key) {
      case 'creature':
        if (slots.creature === undefined) break
        return CREATURE_WORD[slots.creature]
      case 'companion':
        if (slots.companion === undefined) break
        return CREATURE_WORD[slots.companion]
      case 'direction':
        if (slots.direction === undefined) break
        return DIRECTION_WORD[slots.direction]
      case 'hazard':
        if (slots.hazard === undefined) break
        return HAZARD_WORD[slots.hazard]
      case 'item':
        if (slots.item === undefined) break
        return slots.item
      default:
        throw new Error(`outcomes: unknown slot {${key}} — SLOT_KEYS is closed`)
    }
    throw new Error(`outcomes: slot {${key}} was not supplied`)
  })
}

// ---------------------------------------------------------------------------
// Which verbs the table narrates, and how
// ---------------------------------------------------------------------------

/** The room is the subject of the sentence. Full archetype x band prose. */
export const ROOM_LED_ACTIONS = ['move', 'listen', 'search', 'read', 'rest'] as const
export type RoomLedAction = (typeof ROOM_LED_ACTIONS)[number]

/**
 * The creature, hazard, item or portal is the subject. Band-only prose.
 *
 * The four hazard verbs joined this list in 1g rather than the room-led one for
 * the same reason `HAZARD_NARRATION` is not archetype-keyed: the bloom is what
 * the sentence is about, and generation already biases each hazard toward its
 * thematic archetype (`ARCHETYPE_FOR_HAZARD`), so an archetype axis here would
 * mostly restate the hazard in a second voice.
 */
export const SUBJECT_LED_ACTIONS = [
  'sneak',
  'fight',
  'tame',
  'flee',
  'use',
  'send',
  'enterPortal',
  'force',
  'endure',
  'avoid',
  'dodge',
] as const
export type SubjectLedAction = (typeof SUBJECT_LED_ACTIONS)[number]

export const NARRATED_ACTIONS: readonly ActionKind[] = [
  ...ROOM_LED_ACTIONS,
  ...SUBJECT_LED_ACTIONS,
]

/**
 * Verbs deliberately left unwritten, with the reason. EMPTY as of 1g.
 *
 * It held exactly one member through 1f — FORCE — and the justification was
 * specific: FORCE was in GDD 2.7's verb list but `legalActions` never offered
 * it, so writing its prose would have been dead content. The test below turns
 * that into a claim rather than a comment: **a deferred verb must be one the
 * player can never choose.**
 *
 * 1g made FORCE choosable. The moment it did, the justification expired — and
 * so, necessarily, did the deferral, because a live verb with no prose is a
 * text-parity failure (CLAUDE.md 2.3) in the direction nobody checks: the
 * player shoulders through a spore bloom and the engine says nothing at all.
 *
 * The 18 Sep decision that 1g writes prose in the same pass as the mechanic
 * named only ENDURE, AVOID and DODGE, and said FORCE stays deferred. That was
 * written before FORCE was known to go live in the same step; its own stated
 * reason — the mechanic is freshest in whoever's context while they are
 * building it — applies to all four identically. FORCE is written. Flagged in
 * PHASE-1-PROGRESS as a deliberate deviation rather than done quietly.
 *
 * Kept as an empty array rather than deleted: the coverage assertion it feeds
 * is what will force the next person who adds an `ActionKind` to either write
 * its prose or write down why they have not.
 */
export const DEFERRED_ACTIONS: readonly ActionKind[] = [] as const

export const ARCHETYPES: readonly RoomArchetype[] = [
  'hewnChamber',
  'floodedGallery',
  'fungalGrotto',
  'collapsedShrine',
  'carvedHall',
  'heartChamber',
] as const

type ByBand = Record<OutcomeBand, Beat>
type ByArchetype = Record<RoomArchetype, ByBand>

// ---------------------------------------------------------------------------
// MOVE — GDD 2.7
//
// Narrates the room you ARRIVED IN, never the one you left: the beat is the
// arrival, and `resolve.ts` passes the destination archetype accordingly.
//
// Mechanically MOVE is one-valued. A failed roll still moves you — GDD 2.7 asks
// for "stumble loudly OR take a wrong turn", and pinning the player in place
// would make the turn limit punish a die roll they cannot influence. The band's
// only consequence is noise, and only at the bottom end
// (`SCENT.criticalFailureBonus`). So these six bands describe HOW you arrived
// and may never imply that a good roll bought you anything but a quiet entrance.
// ---------------------------------------------------------------------------

const MOVE: ByArchetype = {
  hewnChamber: {
    criticalFailure: {
      lit: 'You come through the doorway badly and put a boot into loose rock. The clatter goes a long way in a room this square.',
      dark: 'You come through the doorway badly and put a boot into loose rock. The clatter goes out ahead of you and keeps going after you have stopped.',
    },
    failure: {
      lit: 'You misjudge the step down and catch yourself on the cut wall. Not quietly.',
      dark: 'The floor is lower than your foot expected. You catch yourself on cut wall you did not know was there, and not quietly.',
    },
    mixed: {
      lit: 'You get in. Your shoulder finds a tool-mark on the way past, and the room passes that along.',
      dark: 'You get in. Your shoulder finds a tool-mark on the way past, and the room passes that along.',
    },
    success: {
      lit: 'A plain room of cut stone. You step in and the dust barely lifts.',
      dark: 'Flat-cut floor, grit, square air. You step in and the dust barely lifts.',
    },
    strongSuccess: {
      lit: 'You come in clean. The chisel marks all run one way, which tells you which end of this the diggers started from.',
      dark: 'You come in clean. A hand on the wall finds the chisel marks all lying one way, which tells you which end of this the diggers started from.',
    },
    criticalSuccess: {
      lit: 'You are inside before you have decided to be. Squared corners, honest stone, nothing in here that wants anything.',
      dark: 'You are inside before you have decided to be. Squared corners under your palm, honest grit underfoot, nothing in here that wants anything.',
    },
  },
  floodedGallery: {
    criticalFailure: {
      lit: 'Your foot goes in deeper than the water looked and the whole room slaps and rings with it.',
      dark: 'Your foot goes down further than you had braced for. The whole room slaps and rings with it.',
    },
    failure: {
      lit: 'You go in flat-footed. The water takes the sound and spreads it into every corner.',
      dark: 'You go in flat-footed. The water takes the sound and spreads it into every corner.',
    },
    mixed: {
      lit: 'In, up to the ankle, cold all the way through the boot. The ripples keep talking after you stop.',
      dark: 'In, up to the ankle, cold all the way through the boot. The ripples keep talking after you stop.',
    },
    success: {
      lit: 'Standing water, shin-deep at the low end, still as a held breath. You wade in without troubling it much.',
      dark: 'Standing water, shin-deep at the low end, still as a held breath. You wade in without troubling it much.',
    },
    strongSuccess: {
      lit: 'You find the raised course of stone under the water and walk it in. Barely a ring off the walls.',
      dark: 'Your boot finds the raised course of stone under the water and you walk it in. Barely a ring off the walls.',
    },
    criticalSuccess: {
      lit: 'You go through the water the way the water would, and the surface closes behind you as though nothing crossed it.',
      dark: 'You go through the water the way the water would. It closes behind you without a sound to mark that anything crossed.',
    },
  },
  fungalGrotto: {
    criticalFailure: {
      lit: 'You come in through a stand of caps and burst three of them. The air goes thick and the noise is wet and carrying.',
      dark: 'You come in through something soft and burst it. The air goes thick and sweet, and the noise of it is wet and carrying.',
    },
    failure: {
      lit: 'The floor gives more than you expected and you go down on one knee into the growth.',
      dark: 'The floor gives more than you expected and you go down on one knee into something yielding and warm.',
    },
    mixed: {
      lit: 'You get through the stalks. One of them breaks against your hip and lets go a small breath of spores.',
      dark: 'You get through the stalks. One breaks against your hip and lets go a small sweet breath of spores.',
    },
    success: {
      lit: 'Caps to the knee, gills the colour of old paper. You put your feet between them and they let you.',
      dark: 'Soft stalks to the knee, warm rot on the air. You put your feet between them and they let you.',
    },
    strongSuccess: {
      lit: 'You read the growth on the way in — where it is thin is where the floor is sound — and cross without breaking a single cap.',
      dark: 'You read the growth by feel on the way in — where it is thin is where the floor is sound — and cross without breaking a single cap.',
    },
    criticalSuccess: {
      lit: 'You move through it like weather. Nothing bursts, nothing bends, and the room smells afterwards exactly as it did before.',
      dark: 'You move through it like weather. Nothing bursts, nothing bends, and the room smells afterwards exactly as it did before.',
    },
  },
  collapsedShrine: {
    criticalFailure: {
      lit: 'You put your weight on a fallen block that was not finished falling. It goes, and takes half a wall of rubble with it.',
      dark: 'You put your weight on a fallen block that was not finished falling. It goes, and takes half a wall of rubble down with it.',
    },
    failure: {
      lit: 'You come down awkwardly among the broken masonry and something small and carved skitters away from your boot.',
      dark: 'You come down awkwardly among broken masonry. Something small and carved skitters away from your boot into the dark.',
    },
    mixed: {
      lit: 'You pick your way in. A shard goes out from under you and rattles a long way among the offerings.',
      dark: 'You pick your way in. A shard goes out from under you and rattles a long way among things that clink.',
    },
    success: {
      lit: 'Fallen masonry, a face broken off at the jaw, offerings nobody came back for. You step in among them quietly.',
      dark: 'Fallen masonry, and under your hand a face broken off at the jaw. You step in among it all quietly.',
    },
    strongSuccess: {
      lit: 'You come in along the line where the roof fell, which is the only part of this floor that has finished moving.',
      dark: 'You come in along the line where the roof fell, feeling for it — it is the only part of this floor that has finished moving.',
    },
    criticalSuccess: {
      lit: 'You enter the way you would a room with someone sleeping in it, and not one stone shifts to mark that you were here.',
      dark: 'You enter the way you would a room with someone sleeping in it, and not one stone shifts to mark that you were here.',
    },
  },
  carvedHall: {
    criticalFailure: {
      lit: 'You come in off-balance and go into the wall hard. The hall is long and it hands the sound all the way down and back.',
      dark: 'You come in off-balance and go into the wall hard. The hall is long and it hands the sound all the way down and back.',
    },
    failure: {
      lit: 'Your boot skids on worked stone and you finish the step louder than you started it.',
      dark: 'Your boot skids on worked stone, too smooth to be natural, and you finish the step louder than you started it.',
    },
    mixed: {
      lit: 'In, with your pack dragging along the relief the whole way. The hall makes a note of it.',
      dark: 'In, with your pack dragging along the carved wall the whole way. The hall makes a note of it.',
    },
    success: {
      lit: 'A long hall, every surface worked, the carvings newer than the wall they are cut into. You walk in down the middle.',
      dark: 'A long hall. Everything your hand touches has been worked, and the cuts are cleaner than the stone is old. You walk in down the middle.',
    },
    strongSuccess: {
      lit: 'You come in quietly enough to follow the frieze a little way: a procession, all of it walking the direction you just came from.',
      dark: 'You come in quietly enough to follow the frieze a little way by hand: a procession, all of it walking the direction you just came from.',
    },
    criticalSuccess: {
      lit: 'You enter without the hall answering. Whoever cut all this meant it to be walked, and for a moment you are what it was cut for.',
      dark: 'You enter without the hall answering. Whoever cut all this meant it to be walked, and for a moment you are what it was cut for.',
    },
  },
  heartChamber: {
    criticalFailure: {
      lit: 'You come into the chamber wrong, loud, hurried, and everything in it that was still is now aware that it is not.',
      dark: 'You come into the chamber wrong, loud, hurried, and everything in it that was still is now aware that it is not.',
    },
    failure: {
      lit: 'You arrive graceless in the one room that seems to have been expecting better.',
      dark: 'You arrive graceless in the one room that seems to have been expecting better.',
    },
    mixed: {
      lit: 'You make it in. The sound of you goes up into a ceiling you cannot find the top of and takes its time coming down.',
      dark: 'You make it in. The sound of you goes up into a ceiling you cannot find the top of and takes its time coming down.',
    },
    success: {
      lit: 'The air changes. The room is round, and there is a plinth in the middle of it.',
      dark: 'The air changes — colder, taller, and the echo of your boot comes back from much further off. Somewhere ahead of you there is a plinth.',
    },
    strongSuccess: {
      lit: 'You come in softly, and the chamber lets you look at it a moment before it asks you for anything.',
      dark: 'You come in softly, and the chamber lets you stand in it a moment before it asks you for anything.',
    },
    criticalSuccess: {
      lit: 'You arrive without a sound, in a room that has clearly been waiting a great deal longer than you have.',
      dark: 'You arrive without a sound, in a room that has clearly been waiting a great deal longer than you have.',
    },
  },
}

// ---------------------------------------------------------------------------
// LISTEN — GDD 2.8.1
//
// The escape valve: it reveals all four doorways truthfully for the price of a
// turn, whatever the oil, and it costs no extra oil because charging twice
// would close the valve.
//
// Mechanically LISTEN is one-valued. The tell-range override fires regardless
// of band; the roll's only consequence is the critical-failure scent bonus.
// These six bands describe how well you settled to it, and must not imply that
// a good roll heard MORE — what LISTEN returns is the tell list, and the tell
// list is honest at every band (`CLAUDE.md` 3).
// ---------------------------------------------------------------------------

const LISTEN: ByArchetype = {
  hewnChamber: {
    criticalFailure: {
      lit: 'You hold still to listen and your own pack shifts against the stone, which is the only thing you learn.',
      dark: 'You hold still to listen and your own pack shifts against the stone, which is the only thing you learn.',
    },
    failure: {
      lit: 'You listen. The square room gives you back your own breathing, flattened.',
      dark: 'You listen. The square room gives you back your own breathing, flattened.',
    },
    mixed: {
      lit: 'You listen, and the cut walls hand you the doorways one at a time, a beat late each.',
      dark: 'You listen, and the cut walls hand you the doorways one at a time, a beat late each.',
    },
    success: {
      lit: 'You stand still in the middle of the plain stone and let the four doorways report.',
      dark: 'You stand still in the middle of the plain stone and let the four doorways report.',
    },
    strongSuccess: {
      lit: 'Squared rock carries sound honestly. You get all four doorways clean, and the quiet between them.',
      dark: 'Squared rock carries sound honestly. You get all four doorways clean, and the quiet between them.',
    },
    criticalSuccess: {
      lit: 'You settle into the room until you are part of its acoustics, and it tells you everything it has.',
      dark: 'You settle into the room until you are part of its acoustics, and it tells you everything it has.',
    },
  },
  floodedGallery: {
    criticalFailure: {
      lit: 'You go still to listen, but your own ripples are still crossing the room and they drown the rest.',
      dark: 'You go still to listen, but your own ripples are still crossing the room and they drown the rest.',
    },
    failure: {
      lit: 'Water everywhere, dripping out of time with itself. You sort very little of it.',
      dark: 'Water everywhere, dripping out of time with itself. You sort very little of it.',
    },
    mixed: {
      lit: 'You wait for the surface to settle, and it does, and then the doorways come through under the drips.',
      dark: 'You wait for the surface to settle, and it does, and then the doorways come through under the drips.',
    },
    success: {
      lit: 'You let the water go flat and listen across it. Sound travels well over standing water.',
      dark: 'You let the water go flat and listen across it. Sound travels well over standing water.',
    },
    strongSuccess: {
      lit: 'The gallery is a drum skin and you have stopped hitting it. Every doorway arrives distinct.',
      dark: 'The gallery is a drum skin and you have stopped hitting it. Every doorway arrives distinct.',
    },
    criticalSuccess: {
      lit: 'You hold so still the water forgets you, and then it carries the whole labyrinth to you across its surface.',
      dark: 'You hold so still the water forgets you, and then it carries the whole labyrinth to you across its surface.',
    },
  },
  fungalGrotto: {
    criticalFailure: {
      lit: 'You hold your breath to listen and get a lungful of spores for it. The coughing is the report.',
      dark: 'You hold your breath to listen and get a lungful of spores for it. The coughing is the report.',
    },
    failure: {
      lit: 'The growth eats sound. You strain at it and come away with almost nothing.',
      dark: 'The growth eats sound. You strain at it and come away with almost nothing.',
    },
    mixed: {
      lit: 'You get the doorways, but every one of them arrives muffled through a room packed with soft bodies.',
      dark: 'You get the doorways, but every one of them arrives muffled through a room packed with soft bodies.',
    },
    success: {
      lit: 'You crouch among the caps and listen past them. The grotto muffles, but it does not lie.',
      dark: 'You crouch among the caps and listen past them. The grotto muffles, but it does not lie.',
    },
    strongSuccess: {
      lit: 'You work out which stalks are deadening which direction, listen around them, and get all four clean.',
      dark: 'You work out which stalks are deadening which direction, listen around them, and get all four clean.',
    },
    criticalSuccess: {
      lit: 'You go quiet enough that the grotto stops deadening and starts carrying, and everything arrives at once.',
      dark: 'You go quiet enough that the grotto stops deadening and starts carrying, and everything arrives at once.',
    },
  },
  collapsedShrine: {
    criticalFailure: {
      lit: 'You shift your weight to listen and a shard goes over somewhere behind you, and that is the whole of your turn.',
      dark: 'You shift your weight to listen and a shard goes over somewhere behind you, and that is the whole of your turn.',
    },
    failure: {
      lit: 'The rubble is still settling from a collapse that happened a very long time ago. It talks over everything.',
      dark: 'The rubble is still settling from a collapse that happened a very long time ago. It talks over everything.',
    },
    mixed: {
      lit: 'You listen between the settlings. The doorways come through, in the gaps, when the stone lets them.',
      dark: 'You listen between the settlings. The doorways come through, in the gaps, when the stone lets them.',
    },
    success: {
      lit: 'You find a block that has finished moving, stand on it, and let the four doorways report.',
      dark: 'You find a block that has finished moving, stand on it, and let the four doorways report.',
    },
    strongSuccess: {
      lit: 'You learn the shrine’s own rhythm of small collapses and listen in the spaces. All four, clean.',
      dark: 'You learn the shrine’s own rhythm of small collapses and listen in the spaces. All four, clean.',
    },
    criticalSuccess: {
      lit: 'The rubble goes quiet for you, the way a room does when it decides you are not the thing it was worried about.',
      dark: 'The rubble goes quiet for you, the way a room does when it decides you are not the thing it was worried about.',
    },
  },
  carvedHall: {
    criticalFailure: {
      lit: 'You listen, and the hall gives you back the sound of your own listening, twice, from both ends.',
      dark: 'You listen, and the hall gives you back the sound of your own listening, twice, from both ends.',
    },
    failure: {
      lit: 'Everything echoes here and the echoes arrive out of order. You cannot tell which doorway anything came from.',
      dark: 'Everything echoes here and the echoes arrive out of order. You cannot tell which doorway anything came from.',
    },
    mixed: {
      lit: 'You count the echoes back to their doorways. It works, and it takes the whole turn to do it.',
      dark: 'You count the echoes back to their doorways. It works, and it takes the whole turn to do it.',
    },
    success: {
      lit: 'You stand where the hall narrows, which is where it stops arguing with itself, and listen.',
      dark: 'You stand where the hall narrows, which is where it stops arguing with itself, and listen.',
    },
    strongSuccess: {
      lit: 'You use the hall instead of fighting it. Worked stone throws sound a long way, and all four doorways come in.',
      dark: 'You use the hall instead of fighting it. Worked stone throws sound a long way, and all four doorways come in.',
    },
    criticalSuccess: {
      lit: 'Whoever cut this hall cut it to carry a voice. You stand in the spot they meant and it gives you everything.',
      dark: 'Whoever cut this hall cut it to carry a voice. You stand in the spot they meant and it gives you everything.',
    },
  },
  heartChamber: {
    criticalFailure: {
      lit: 'You listen in a round room and every direction answers at once, which is the same as none of them answering.',
      dark: 'You listen in a round room and every direction answers at once, which is the same as none of them answering.',
    },
    failure: {
      lit: 'The chamber is too big and too still. Whatever you are listening for, it has room to be elsewhere.',
      dark: 'The chamber is too big and too still. Whatever you are listening for, it has room to be elsewhere.',
    },
    mixed: {
      lit: 'You get the doorways. You also get the sense, quite strongly, of being listened back at.',
      dark: 'You get the doorways. You also get the sense, quite strongly, of being listened back at.',
    },
    success: {
      lit: 'You stand off-centre, out of the round of the room, and let the four doorways report.',
      dark: 'You stand off-centre, out of the round of the room, and let the four doorways report.',
    },
    strongSuccess: {
      lit: 'You find the dead spot the curve makes, stand in it, and hear all four ways in with nothing overlapping.',
      dark: 'You find the dead spot the curve makes, stand in it, and hear all four ways in with nothing overlapping.',
    },
    criticalSuccess: {
      lit: 'The chamber holds its breath with you. For one turn you hear this place the way it hears itself.',
      dark: 'The chamber holds its breath with you. For one turn you hear this place the way it hears itself.',
    },
  },
}

// ---------------------------------------------------------------------------
// SEARCH — GDD 2.7, 2.8.1
//
// Costs an extra point of oil, which is what makes oil an action budget rather
// than a second clock: it bites when you dawdle.
//
// Mechanically SEARCH is TWO-valued: mixed-or-better takes the oil flask if the
// room has one, and that is all. There is no trinket, no map glimpse, no LCK
// loot table yet. So the three success bands differ in how the searching FEELS
// and never in what it turns up — a strong SEARCH may not hint at a second
// find, because there is no second find to hint at. The flask, when it exists,
// is announced by its own beat (`foundFlask`).
// ---------------------------------------------------------------------------

const SEARCH: ByArchetype = {
  hewnChamber: {
    criticalFailure: {
      lit: 'You work the room over and knock a course of loose stone out of the wall doing it. Nothing to show, and everything heard you.',
      dark: 'You work the room over by hand and pull a course of loose stone out of the wall doing it. Nothing to show, and everything heard you.',
    },
    failure: {
      lit: 'Cut rock, squared corners, and nowhere in a room like this for anything to hide. You spend the turn confirming it.',
      dark: 'Cut rock, squared corners, and nowhere in a room like this for anything to hide. You spend the turn confirming it by hand.',
    },
    mixed: {
      lit: 'You go through it corner by corner. It gives up what it has, grudgingly, and loudly enough that you stop enjoying the search.',
      dark: 'You go through it corner by corner by feel. It gives up what it has, grudgingly, and loudly enough that you stop enjoying the search.',
    },
    success: {
      lit: 'Four corners, four walls, a floor. You search a plain room plainly.',
      dark: 'Four corners, four walls, a floor. You search a plain room plainly, by hand.',
    },
    strongSuccess: {
      lit: 'You go straight to where the tool marks change, because that is where the diggers stopped and left things.',
      dark: 'You find where the tool marks change under your hand and go straight there, because that is where the diggers stopped and left things.',
    },
    criticalSuccess: {
      lit: 'You take the room apart in your head first and only then with your hands, and it holds nothing back.',
      dark: 'You take the room apart in your head first and only then with your hands, and it holds nothing back.',
    },
  },
  floodedGallery: {
    criticalFailure: {
      lit: 'You go into the water up to the elbow and find the bottom is mostly silt. It clouds, you flounder, and the noise carries.',
      dark: 'You go into the water up to the elbow and find the bottom is mostly silt. You flounder in it, and the noise carries.',
    },
    failure: {
      lit: 'Everything worth having in a flooded room is under the water, and the water is not helping.',
      dark: 'Everything worth having in a flooded room is under the water, and the water is not helping.',
    },
    mixed: {
      lit: 'You sweep the bottom with your boot until something answers it. Getting it up takes more splashing than you wanted.',
      dark: 'You sweep the bottom with your boot until something answers it. Getting it up takes more splashing than you wanted.',
    },
    success: {
      lit: 'You work the shallow edge where things wash up, and take your time about it.',
      dark: 'You work the shallow edge where things wash up, and take your time about it.',
    },
    strongSuccess: {
      lit: 'You read the silt for the places the current stopped, and search those, because that is where a flooded room keeps things.',
      dark: 'You read the silt through your boot for the places the current stopped, and search those, because that is where a flooded room keeps things.',
    },
    criticalSuccess: {
      lit: 'You go over the gallery as carefully as the water did, and between you there is nothing left in it you do not know about.',
      dark: 'You go over the gallery as carefully as the water did, and between you there is nothing left in it you do not know about.',
    },
  },
  fungalGrotto: {
    criticalFailure: {
      lit: 'You pull up a mat of growth and a cloud comes off it. You get very little, and a good deal of it in your throat.',
      dark: 'You pull up a mat of growth and a cloud comes off it, sweet and heavy. You get very little, and a good deal of it in your throat.',
    },
    failure: {
      lit: 'The grotto has grown over whatever it had. You dig at it and it closes behind your hands.',
      dark: 'The grotto has grown over whatever it had. You dig at it and it closes behind your hands.',
    },
    mixed: {
      lit: 'You break through the mat to get at the floor. It costs you a lot of burst caps and a room that now smells of your visit.',
      dark: 'You break through the mat to get at the floor. It costs you a lot of burst caps and a room that now smells of your visit.',
    },
    success: {
      lit: 'You search where the growth is thin, because the growth is thin where something underneath is not soil.',
      dark: 'You search where the growth is thin, because the growth is thin where something underneath is not soil.',
    },
    strongSuccess: {
      lit: 'You let the mushrooms do the finding — they ring anything that is not rock — and go to the rings.',
      dark: 'You let the mushrooms do the finding — they ring anything that is not rock — and follow the rings by hand.',
    },
    criticalSuccess: {
      lit: 'You move through the grotto parting it and closing it behind you, and it gives up everything without losing a single cap.',
      dark: 'You move through the grotto parting it and closing it behind you, and it gives up everything without losing a single cap.',
    },
  },
  collapsedShrine: {
    criticalFailure: {
      lit: 'You lever up a fallen slab looking underneath it, and bring down a good deal more of the shrine than you moved.',
      dark: 'You lever up a fallen slab to get a hand underneath it, and bring down a good deal more of the shrine than you moved.',
    },
    failure: {
      lit: 'Everything here was left for something, and everything left here has been under stone a long time. You get nowhere.',
      dark: 'Everything here was left for something, and everything left here has been under stone a long time. You get nowhere.',
    },
    mixed: {
      lit: 'You go through the offerings. It feels wrong the whole way, and the shrine rattles about it.',
      dark: 'You go through the offerings by touch. It feels wrong the whole way, and the shrine rattles about it.',
    },
    success: {
      lit: 'You search the shrine the way you would a grave you meant no harm by, and it answers in kind.',
      dark: 'You search the shrine the way you would a grave you meant no harm by, and it answers in kind.',
    },
    strongSuccess: {
      lit: 'You work along the base of the fallen statue, because whatever was worth leaving here was left at its feet.',
      dark: 'You work along the base of the fallen statue, because whatever was worth leaving here was left at its feet.',
    },
    criticalSuccess: {
      lit: 'You go through it without disturbing one thing that was placed, and it lets you have what nobody came back for.',
      dark: 'You go through it without disturbing one thing that was placed, and it lets you have what nobody came back for.',
    },
  },
  carvedHall: {
    criticalFailure: {
      lit: 'You go at the carvings looking for a seam and take a piece of one off in your hand. The hall reports it, at length.',
      dark: 'You go at the carvings hunting for a seam and take a piece of one off in your hand. The hall reports it, at length.',
    },
    failure: {
      lit: 'Everything in this hall is surface. You run your hands over all of it and find only more surface.',
      dark: 'Everything in this hall is surface. You run your hands over all of it and find only more surface.',
    },
    mixed: {
      lit: 'There is a cavity behind the relief and you get it open. Worked stone does not open quietly.',
      dark: 'There is a cavity behind the relief and you get it open. Worked stone does not open quietly.',
    },
    success: {
      lit: 'You search along the frieze where the carving changes hands, because that is where the joins are.',
      dark: 'You search along the frieze where the carving changes hands, because that is where the joins are.',
    },
    strongSuccess: {
      lit: 'Someone cut a hiding place into this and then cut a picture over it. You find the picture that does not fit.',
      dark: 'Someone cut a hiding place into this and then cut a picture over it. Your fingers find the panel that does not match its neighbours.',
    },
    criticalSuccess: {
      lit: 'You read the hall as a plan of itself, go to the one place the plan will not account for, and it opens.',
      dark: 'You read the hall as a plan of itself, go to the one place the plan will not account for, and it opens.',
    },
  },
  heartChamber: {
    criticalFailure: {
      lit: 'You search the chamber and the chamber notices. Nothing turns up, and the noise of you goes round and round.',
      dark: 'You search the chamber and the chamber notices. Nothing turns up, and the noise of you goes round and round.',
    },
    failure: {
      lit: 'This room has exactly one thing in it and it is not hidden. Searching for a second finds nothing.',
      dark: 'This room has exactly one thing in it and it is not hidden. Searching for a second finds nothing.',
    },
    mixed: {
      lit: 'You search around the plinth. Whatever else is here, you have to move things to get at it, and things here do not move quietly.',
      dark: 'You search around the plinth. Whatever else is here, you have to move things to get at it, and things here do not move quietly.',
    },
    success: {
      lit: 'You search the floor of the chamber rather than the plinth, which is the only part of this room anyone ever left anything on.',
      dark: 'You search the floor of the chamber rather than the plinth, which is the only part of this room anyone ever left anything on.',
    },
    strongSuccess: {
      lit: 'You go round the plinth once at a distance, which is how you find what the last people to stand here dropped.',
      dark: 'You go round the plinth once at a distance, which is how you find what the last people to stand here dropped.',
    },
    criticalSuccess: {
      lit: 'You search the whole round of it and come back to the plinth having found everything the chamber was keeping but the one thing it is for.',
      dark: 'You search the whole round of it and come back to the plinth having found everything the chamber was keeping but the one thing it is for.',
    },
  },
}

// ---------------------------------------------------------------------------
// READ — GDD 2.7
//
// The poor cousin of a grellhound: one turn and one point of oil buys, once,
// what the hound gives you every turn for free.
//
// Mechanically READ is TWO-valued — mixed-or-better names the hazards in the
// adjacent rooms. That reveal is its OWN beat (`carvingsWarn`), one per hazard,
// so these lines describe the reading and never the finding. A failed READ must
// not imply the carvings were silent about a hazard that is there: the carvings
// did not lie, you did not manage to read them, and the difference matters
// because "tells never lie" is the invariant this verb sits closest to.
// ---------------------------------------------------------------------------

const READ: ByArchetype = {
  hewnChamber: {
    criticalFailure: {
      lit: 'There is barely anything cut into a room like this, and what you make of the little there is, is nonsense.',
      dark: 'There is barely anything cut into a room like this, and what your fingers make of the little there is, is nonsense.',
    },
    failure: {
      lit: 'Tool marks are not writing, however long you stare at them.',
      dark: 'Tool marks are not writing, however long you work along them.',
    },
    mixed: {
      lit: 'Someone scratched a working note into the stone here. You get it, eventually, and the getting takes the whole turn.',
      dark: 'Someone scratched a working note into the stone here. You get it, eventually, and the getting takes the whole turn.',
    },
    success: {
      lit: 'A digger’s tally, cut where a digger would cut one. You read it.',
      dark: 'A digger’s tally, cut where a digger would cut one. You read it off under your fingers.',
    },
    strongSuccess: {
      lit: 'The marks are a shift record, and a shift record is a map of where the work went. You read it straight through.',
      dark: 'The marks are a shift record, and a shift record is a map of where the work went. You read it straight through by touch.',
    },
    criticalSuccess: {
      lit: 'Plain stone, plainly marked, by people who wanted the next shift to know what they knew. You take all of it.',
      dark: 'Plain stone, plainly marked, by people who wanted the next shift to know what they knew. You take all of it.',
    },
  },
  floodedGallery: {
    criticalFailure: {
      lit: 'The carvings run down below the waterline and what you drag up out of it is illegible and half dissolved.',
      dark: 'The carvings run down below the waterline. What your hands find under there is soft-edged and says nothing.',
    },
    failure: {
      lit: 'Water has been working on this wall longer than you have. Most of the letters are gone.',
      dark: 'Water has been working on this wall longer than you have. Most of the letters are gone from under your fingers.',
    },
    mixed: {
      lit: 'You get the sense of it: a warning, cut by someone standing where you are standing. The words themselves have washed off.',
      dark: 'You get the sense of it: a warning, cut by someone standing where you are standing. The words themselves have washed off.',
    },
    success: {
      lit: 'Above the waterline it is intact. You read the dry half.',
      dark: 'Above the waterline it is intact. You read the dry half by hand.',
    },
    strongSuccess: {
      lit: 'The dry half tells you what the wet half said, because whoever cut it repeated themselves. They were worried.',
      dark: 'The dry half tells you what the wet half said, because whoever cut it repeated themselves. They were worried.',
    },
    criticalSuccess: {
      lit: 'You read it the way it was meant to be read, standing in the water, and it is addressed to exactly the person doing that.',
      dark: 'You read it the way it was meant to be read, standing in the water, and it is addressed to exactly the person doing that.',
    },
  },
  fungalGrotto: {
    criticalFailure: {
      lit: 'You clear the growth off the wall to read it and take the top layer of stone with it. Whatever it said, it does not now.',
      dark: 'You clear the growth off the wall to read it and take the top layer of stone with it. Whatever it said, it does not now.',
    },
    failure: {
      lit: 'The caps have grown into the cuts. You cannot tell the writing from what is eating it.',
      dark: 'The caps have grown into the cuts. Your fingers cannot tell the writing from what is eating it.',
    },
    mixed: {
      lit: 'You scrape enough of it clear to read, and the scraping fills the room with spores and noise.',
      dark: 'You scrape enough of it clear to read, and the scraping fills the room with spores and noise.',
    },
    success: {
      lit: 'The growth has spared the deep cuts. You read what is left.',
      dark: 'The growth has spared the deep cuts. You read what is left under your hands.',
    },
    strongSuccess: {
      lit: 'The mushrooms avoid one panel entirely, which tells you something about the panel before you have read a word of it.',
      dark: 'The mushrooms avoid one panel entirely, which tells you something about the panel before you have read a word of it.',
    },
    criticalSuccess: {
      lit: 'You read it under the growth without disturbing the growth, and it turns out to have been written by someone who also did not want to.',
      dark: 'You read it under the growth without disturbing the growth, and it turns out to have been written by someone who also did not want to.',
    },
  },
  collapsedShrine: {
    criticalFailure: {
      lit: 'The inscription is in four pieces on the floor and you put them together wrong. What you get is worse than nothing.',
      dark: 'The inscription is in four pieces on the floor and you put them together wrong. What you get is worse than nothing.',
    },
    failure: {
      lit: 'Devotional script, and none of it in an order you can follow now the wall it was on is down.',
      dark: 'Devotional script, and none of it in an order you can follow now the wall it was on is down.',
    },
    mixed: {
      lit: 'You get it by hauling pieces of it around until they line up. It is loud work and it is somebody’s prayer.',
      dark: 'You get it by hauling pieces of it around until they line up. It is loud work and it is somebody’s prayer.',
    },
    success: {
      lit: 'You find the piece with the beginning on it and work outward from there.',
      dark: 'You find the piece with the beginning on it and work outward from there.',
    },
    strongSuccess: {
      lit: 'It is a list of what the shrine was for keeping out. You get far enough down it to be glad you read it.',
      dark: 'It is a list of what the shrine was for keeping out. You get far enough down it to be glad you read it.',
    },
    criticalSuccess: {
      lit: 'You read the whole of it, in order, and understand both what they were asking for and that they did not get it.',
      dark: 'You read the whole of it, in order, and understand both what they were asking for and that they did not get it.',
    },
  },
  carvedHall: {
    criticalFailure: {
      lit: 'There is far too much of it and you read the wrong register entirely — a whole wall of something that turns out to be a border.',
      dark: 'There is far too much of it and you read the wrong register entirely — a whole wall of something that turns out to be a border.',
    },
    failure: {
      lit: 'A hall of carvings is a hall of carvings. Knowing where to start is the skill, and you do not have it today.',
      dark: 'A hall of carvings is a hall of carvings. Knowing where to start is the skill, and you do not have it today.',
    },
    mixed: {
      lit: 'You find the register that matters and follow it. Following it means walking the hall, and the hall notes that you did.',
      dark: 'You find the register that matters and follow it. Following it means walking the hall, and the hall notes that you did.',
    },
    success: {
      lit: 'This is the room that was cut to be read. You read it.',
      dark: 'This is the room that was cut to be read. You read it, walking with a hand on the wall.',
    },
    strongSuccess: {
      lit: 'You notice the carvings are newer than the wall, and that changes who you think was warning whom.',
      dark: 'The cuts are sharper than stone this old has any business being. That changes who you think was warning whom.',
    },
    criticalSuccess: {
      lit: 'You take the hall at the pace it was cut for and it gives you the whole account, including the part added later, in a different hand.',
      dark: 'You take the hall at the pace it was cut for and it gives you the whole account, including the part added later, in a different hand.',
    },
  },
  heartChamber: {
    criticalFailure: {
      lit: 'The plinth has writing round its base. You get it badly wrong, and the version you end up with is reassuring.',
      dark: 'The plinth has writing round its base. You get it badly wrong, and the version you end up with is reassuring.',
    },
    failure: {
      lit: 'Whatever is cut round the plinth is not in any hand you know, and it was not cut for you.',
      dark: 'Whatever is cut round the plinth is not in any hand you know, and it was not cut for you.',
    },
    mixed: {
      lit: 'You work your way round the base reading it, which means going round the plinth, which means the chamber hears you do it.',
      dark: 'You work your way round the base reading it, which means going round the plinth, which means the chamber hears you do it.',
    },
    success: {
      lit: 'The inscription round the plinth is instructions. You read them.',
      dark: 'The inscription round the plinth is instructions. You read them off under your fingers.',
    },
    strongSuccess: {
      lit: 'Instructions, and a condition on them. You get both, which is more than the last person to stand here managed.',
      dark: 'Instructions, and a condition on them. You get both, which is more than the last person to stand here managed.',
    },
    criticalSuccess: {
      lit: 'You read every word cut into the plinth, and none of it says the thing on top of it should not be moved. It says who by.',
      dark: 'You read every word cut into the plinth, and none of it says the thing on top of it should not be moved. It says who by.',
    },
  },
}

// ---------------------------------------------------------------------------
// REST — GDD 2.7
//
// Costs an extra point of oil. Mechanically TWO-valued: mixed-or-better
// recovers one point of health, capped at the maximum, and the recovery is its
// own beat (`caughtBreath`) so a REST at full health narrates the rest without
// claiming a heal that did not happen.
//
// Resting is the only thing in the game the player does for its own sake, so
// this is where the cozy half of cozy horror gets its turn. The room is still
// wrong. You sit down in it anyway.
// ---------------------------------------------------------------------------

const REST: ByArchetype = {
  hewnChamber: {
    criticalFailure: {
      lit: 'You sit down against the wall and the wall is colder than you are. You get up worse than you sat down.',
      dark: 'You sit down against the wall and the wall is colder than you are. You get up worse than you sat down.',
    },
    failure: {
      lit: 'You stop. Square stone, square air, nothing to settle against. The turn goes by and does nothing for you.',
      dark: 'You stop. Square stone, square air, nothing to settle against. The turn goes by and does nothing for you.',
    },
    mixed: {
      lit: 'You sit in the corner with the lamp at your boot and stop for a while. It helps, and it costs the oil to do it.',
      dark: 'You sit in the corner with the cold lamp at your boot and stop for a while. It helps, and it costs the oil to do it.',
    },
    success: {
      lit: 'Plain rock at your back. There are worse rooms to stop in, and you have been in several of them.',
      dark: 'Plain rock at your back. There are worse rooms to stop in, and you have been in several of them.',
    },
    strongSuccess: {
      lit: 'You wedge yourself into the squared corner, which is the closest thing this place has to a chair, and stop properly.',
      dark: 'You wedge yourself into the squared corner, which is the closest thing this place has to a chair, and stop properly.',
    },
    criticalSuccess: {
      lit: 'Someone cut this room to be a room. You sit in it as one, for a little while, and it does not mind.',
      dark: 'Someone cut this room to be a room. You sit in it as one, for a little while, and it does not mind.',
    },
  },
  floodedGallery: {
    criticalFailure: {
      lit: 'There is nowhere dry. You stop anyway and spend the whole turn getting colder.',
      dark: 'There is nowhere dry. You stop anyway and spend the whole turn getting colder.',
    },
    failure: {
      lit: 'You try to rest standing, because the alternative is sitting in it. Resting standing is not resting.',
      dark: 'You try to rest standing, because the alternative is sitting in it. Resting standing is not resting.',
    },
    mixed: {
      lit: 'You find a ledge above the water and get most of yourself onto it. Most is enough, for a turn.',
      dark: 'You find a ledge above the water and get most of yourself onto it. Most is enough, for a turn.',
    },
    success: {
      lit: 'You sit on the dry course above the flood and let your boots drip. The room drips back, companionably.',
      dark: 'You sit on the dry course above the flood and let your boots drip. The room drips back, companionably.',
    },
    strongSuccess: {
      lit: 'The water is still and the dripping keeps a steady time, and it turns out to be the easiest room yet to stop in.',
      dark: 'The water is still and the dripping keeps a steady time, and it turns out to be the easiest room yet to stop in.',
    },
    criticalSuccess: {
      lit: 'You sit above your own reflection with your hands round the lamp and are, for a moment, almost comfortable.',
      dark: 'You sit above the water with your hands round the cold lamp and are, for a moment, almost comfortable.',
    },
  },
  fungalGrotto: {
    criticalFailure: {
      lit: 'You lie back into the growth and it gives way under you with a sound like something being let out. You do not rest.',
      dark: 'You lie back into the growth and it gives way under you with a sound like something being let out. You do not rest.',
    },
    failure: {
      lit: 'It is warm in here and it smells of things going over, and your body will not settle in it.',
      dark: 'It is warm in here and it smells of things going over, and your body will not settle in it.',
    },
    mixed: {
      lit: 'You clear a space to sit and the clearing costs you caps and quiet. What is left of the turn does you good.',
      dark: 'You clear a space to sit and the clearing costs you caps and quiet. What is left of the turn does you good.',
    },
    success: {
      lit: 'The floor here is soft and warm, which is the first honestly pleasant thing the labyrinth has offered.',
      dark: 'The floor here is soft and warm, which is the first honestly pleasant thing the labyrinth has offered.',
    },
    strongSuccess: {
      lit: 'You sit among the caps and they close a little round you, and you decide not to think too hard about why that is restful.',
      dark: 'You sit among the caps and they close a little round you, and you decide not to think too hard about why that is restful.',
    },
    criticalSuccess: {
      lit: 'Warm floor, still air, a smell like a cellar in autumn. You stop, properly, and the grotto lets you.',
      dark: 'Warm floor, still air, a smell like a cellar in autumn. You stop, properly, and the grotto lets you.',
    },
  },
  collapsedShrine: {
    criticalFailure: {
      lit: 'You sit down on something that turns out not to have finished falling, and get up faster than you sat.',
      dark: 'You sit down on something that turns out not to have finished falling, and get up faster than you sat.',
    },
    failure: {
      lit: 'You cannot get comfortable in a room this broken, and part of you does not want to.',
      dark: 'You cannot get comfortable in a room this broken, and part of you does not want to.',
    },
    mixed: {
      lit: 'You shift enough rubble to sit. The shifting is the noisy part, and the sitting is the part that helps.',
      dark: 'You shift enough rubble to sit. The shifting is the noisy part, and the sitting is the part that helps.',
    },
    success: {
      lit: 'You settle with your back against the fallen statue, which has been holding that position considerably longer.',
      dark: 'You settle with your back against the fallen statue, which has been holding that position considerably longer.',
    },
    strongSuccess: {
      lit: 'You sit in the lee of the collapse, out of the draught, where whoever swept this floor last would have sat too.',
      dark: 'You sit in the lee of the collapse, out of the draught, where whoever swept this floor last would have sat too.',
    },
    criticalSuccess: {
      lit: 'You stop in a place built for stopping in. The shrine has failed at everything else it was for; it still manages this.',
      dark: 'You stop in a place built for stopping in. The shrine has failed at everything else it was for; it still manages this.',
    },
  },
  carvedHall: {
    criticalFailure: {
      lit: 'You sit down under the frieze and the frieze is at your eye level and it is a procession and you get no rest at all.',
      dark: 'You sit down under the frieze, and your shoulder is against a row of carved figures all walking one way, and you get no rest at all.',
    },
    failure: {
      lit: 'There is nowhere in a hall this long that is not overlooked by something cut into a wall.',
      dark: 'There is nowhere in a hall this long that is not within reach of something cut into a wall.',
    },
    mixed: {
      lit: 'You stop halfway down, where the carving thins. It is not restful, exactly, but it is rest.',
      dark: 'You stop halfway down, where the carving thins under your hand. It is not restful, exactly, but it is rest.',
    },
    success: {
      lit: 'You sit in the middle of the hall where nothing can come at you without walking a long way first, and stop.',
      dark: 'You sit in the middle of the hall where nothing can come at you without walking a long way first, and stop.',
    },
    strongSuccess: {
      lit: 'You pick the one blank panel in the whole hall to sit against, and it is a better rest for not having a story on it.',
      dark: 'You pick the one blank panel in the whole hall to sit against, and it is a better rest for not having a story on it.',
    },
    criticalSuccess: {
      lit: 'You rest in a corridor built to be processed down, and for the length of it you are simply someone passing through. It helps more than it should.',
      dark: 'You rest in a corridor built to be processed down, and for the length of it you are simply someone passing through. It helps more than it should.',
    },
  },
  heartChamber: {
    criticalFailure: {
      lit: 'You try to rest with that thing on its plinth behind you, and your back will not stop knowing it is there.',
      dark: 'You try to rest with that thing on its plinth behind you, and your back will not stop knowing it is there.',
    },
    failure: {
      lit: 'Nobody rests in here. You find out why by trying.',
      dark: 'Nobody rests in here. You find out why by trying.',
    },
    mixed: {
      lit: 'You sit with your back to the wall and the plinth in front of you, and take what rest that arrangement allows.',
      dark: 'You sit with your back to the wall and the plinth somewhere in front of you, and take what rest that arrangement allows.',
    },
    success: {
      lit: 'You sit down at the edge of the chamber, well away from the middle of it, and stop.',
      dark: 'You sit down at the edge of the chamber, well away from the middle of it, and stop.',
    },
    strongSuccess: {
      lit: 'You rest at the chamber wall and it is, against every expectation, the quietest room you have been in all day.',
      dark: 'You rest at the chamber wall and it is, against every expectation, the quietest room you have been in all day.',
    },
    criticalSuccess: {
      lit: 'You stop in the room the whole labyrinth is arranged around, and nothing comes, and the not-coming is the rest.',
      dark: 'You stop in the room the whole labyrinth is arranged around, and nothing comes, and the not-coming is the rest.',
    },
  },
}

export const ROOM_LED_OUTCOMES: Record<RoomLedAction, ByArchetype> = {
  move: MOVE,
  listen: LISTEN,
  search: SEARCH,
  read: READ,
  rest: REST,
}

// ---------------------------------------------------------------------------
// Subject-led verbs — the creature, the item or the portal is the subject
//
// Band-only prose. These lines run alongside the mechanical tables in
// `tuning.ts` (`SNEAK_OUTCOMES`, `FIGHT_OUTCOMES`, `TAME_OUTCOMES`,
// `FLEE_OUTCOMES`) and each band's prose must say what that band's row does —
// a TAME failure has the creature BOLT and a TAME critical failure has it turn
// HOSTILE AND STAY, and those are different sentences because they are
// different situations for the player to be standing in.
// ---------------------------------------------------------------------------

/**
 * SNEAK — GDD 2.9. AGI. The third option at an encounter.
 * Mixed and better get you through; failure and critical failure leave you in
 * the room with it. Critical failure also costs a point of health and is as
 * loud as a fight.
 */
const SNEAK: ByBand = {
  criticalFailure: {
    lit: 'You go for the gap and the {creature} is in it before you are. It puts you back where you started, hard, and the whole floor hears about it.',
    dark: 'You go for the gap and the {creature} is in it before you are. It puts you back where you started, hard, and the whole floor hears about it.',
  },
  failure: {
    lit: 'You get two steps into the slip past before the {creature} turns and looks straight at you. You are still here.',
    dark: 'You get two steps into the slip past before the {creature} goes quiet and turns. You are still here.',
  },
  mixed: {
    lit: 'You get past the {creature}. Not cleanly — it knows exactly where you went, and so, now, does everything else.',
    dark: 'You get past the {creature}. Not cleanly — it knows exactly where you went, and so, now, does everything else.',
  },
  success: {
    lit: 'You give the {creature} the wide side of the room and take the doorway while it is busy being somewhere else.',
    dark: 'You give the {creature} the wide side of the room and take the doorway while it is busy being somewhere else.',
  },
  strongSuccess: {
    lit: 'You wait for the {creature} to settle, take one long step, and are through before it has finished settling.',
    dark: 'You wait for the {creature} to settle, take one long step, and are through before it has finished settling.',
  },
  criticalSuccess: {
    lit: 'The {creature} never knows you were in the room with it. That is the best outcome available here and you take it.',
    dark: 'The {creature} never knows you were in the room with it. That is the best outcome available here and you take it.',
  },
}

/**
 * FIGHT — GDD 2.9. STR. FAST AND LOUD; that is the whole point of it.
 * `SCENT_BY_ACTION.fight` is 4, the loudest ordinary action in the game, and a
 * botched one adds 2 on top. Every band at mixed or better drives the creature
 * off in a single turn — the speed is what you are buying, and the noise is
 * what you are paying.
 */
const FIGHT: ByBand = {
  criticalFailure: {
    lit: 'It goes badly from the first swing. The {creature} is still here, you are bleeding, and you have rung a bell you cannot un-ring.',
    dark: 'It goes badly from the first swing. The {creature} is still here, you are bleeding, and you have rung a bell you cannot un-ring.',
  },
  failure: {
    lit: 'You swing, it does not go the way you wanted, and the {creature} makes you pay a little for the attempt. It is still standing.',
    dark: 'You swing, it does not go the way you wanted, and the {creature} makes you pay a little for the attempt. It is still standing.',
  },
  mixed: {
    lit: 'You drive the {creature} off. It takes a piece out of you on its way, and you spent every bit of the quiet you had.',
    dark: 'You drive the {creature} off. It takes a piece out of you on its way, and you spent every bit of the quiet you had.',
  },
  success: {
    lit: 'One turn, one decision, and the {creature} is gone. Loud, but gone.',
    dark: 'One turn, one decision, and the {creature} is gone. Loud, but gone.',
  },
  strongSuccess: {
    lit: 'You put the {creature} off in a single movement. Efficient, and still the noisiest thing you have done all run.',
    dark: 'You put the {creature} off in a single movement. Efficient, and still the noisiest thing you have done all run.',
  },
  criticalSuccess: {
    lit: 'The {creature} decides against it before you have committed to anything, and leaves. It is the cleanest fight there is, and it is not quiet.',
    dark: 'The {creature} decides against it before you have committed to anything, and leaves. It is the cleanest fight there is, and it is not quiet.',
  },
}

/**
 * TAME — GDD 2.9. INT. SLOW AND QUIET: two turns, almost no scent.
 *
 * The bands are not a gradient here, they are five different situations:
 *   criticalFailure  it turns on you, SHRIEKS, and STAYS — untameable now
 *   failure          it bolts, noisily, and is gone from the labyrinth
 *   mixed            tamed but skittish; bolts if you take damage
 *   success          tamed
 *   strongSuccess    tamed, brave, and it shows you one adjacent room
 *   criticalSuccess  tamed and brave
 *
 * The critical-failure line must leave the player knowing the creature is still
 * in front of them — `legalActions` will have dropped TAME from the menu and
 * they need to understand why.
 */
const TAME: ByBand = {
  criticalFailure: {
    lit: 'You reach out and get it exactly wrong. The {creature} shrieks — a long, carrying, personal sound — and settles in to hate you from a distance of about four feet. It will not be talked to again.',
    dark: 'You reach out and get it exactly wrong. The {creature} shrieks — a long, carrying, personal sound — and settles in to hate you from a distance of about four feet. It will not be talked to again.',
  },
  failure: {
    lit: 'The {creature} lets you get close, thinks better of it, and goes. Noisily, and for good. Two turns for nothing.',
    dark: 'The {creature} lets you get close, thinks better of it, and goes. Noisily, and for good. Two turns for nothing.',
  },
  mixed: {
    lit: 'The {creature} comes to you, eventually, and stays near you the way something stays near a fire it does not trust. It will bolt the first time you are hurt.',
    dark: 'The {creature} comes to you, eventually, and stays near you the way something stays near a fire it does not trust. It will bolt the first time you are hurt.',
  },
  success: {
    lit: 'It takes both turns and all your patience, and at the end of them the {creature} has decided you are worth following.',
    dark: 'It takes both turns and all your patience, and at the end of them the {creature} has decided you are worth following.',
  },
  strongSuccess: {
    lit: 'The {creature} comes to you and then keeps going — out to the doorway, and back, wanting you to know what it found. It is not afraid of much.',
    dark: 'The {creature} comes to you and then keeps going — out to the doorway, and back, wanting you to know what it found. It is not afraid of much.',
  },
  criticalSuccess: {
    lit: 'Whatever you did, the {creature} was waiting for someone to do it. It comes to you without hesitating, and it will go where you send it.',
    dark: 'Whatever you did, the {creature} was waiting for someone to do it. It comes to you without hesitating, and it will go where you send it.',
  },
}

/**
 * FLEE — GDD 2.9. AGI. Back the way you came, which is into your own scent
 * trail; the hunt sweep measured that retreating down your own trail is worse
 * than ignoring the stench entirely. The prose should not pretend otherwise.
 */
const FLEE: ByBand = {
  criticalFailure: {
    lit: 'You turn to go and the {creature} is faster than turning. You end up back in the middle of the room, and worse off.',
    dark: 'You turn to go and the {creature} is faster than turning. You end up back in the middle of the room, and worse off.',
  },
  failure: {
    lit: 'You make it as far as the doorway before the {creature} cuts you off. Still here, and out of breath about it.',
    dark: 'You make it as far as the doorway before the {creature} cuts you off. Still here, and out of breath about it.',
  },
  mixed: {
    lit: 'You get out, back the way you came, catching the door-frame with your shoulder as you go. It costs you.',
    dark: 'You get out, back the way you came, catching the door-frame with your shoulder as you go. It costs you.',
  },
  success: {
    lit: 'You go back the way you came and leave the {creature} to the room. Your own trail is still warm under you.',
    dark: 'You go back the way you came and leave the {creature} to the room. Your own trail is still warm under you.',
  },
  strongSuccess: {
    lit: 'You are out before the {creature} has finished deciding what you are, and back down a corridor you already know.',
    dark: 'You are out before the {creature} has finished deciding what you are, and back down a corridor you already know.',
  },
  criticalSuccess: {
    lit: 'You leave so smoothly the {creature} does not follow, and find yourself back where you started with everything you walked in with.',
    dark: 'You leave so smoothly the {creature} does not follow, and find yourself back where you started with everything you walked in with.',
  },
}

/**
 * USE — GDD 2.7.
 *
 * ONE-VALUED. `applyActionOutcome` consumes the item and applies its effect
 * regardless of band; nothing in the roll changes the result. The only item in
 * v1 is the oil flask, and its effect is announced by `lampBrightens`. So these
 * six lines describe the handling and may not imply that a good roll got more
 * out of the flask — it did not. Flagged for 1g: a verb whose roll cannot
 * matter should probably not roll.
 */
const USE: ByBand = {
  criticalFailure: {
    lit: 'You get the {item} open clumsily and wear some of it. What goes where it was meant to go, goes.',
    dark: 'You get the {item} open clumsily and wear some of it. What goes where it was meant to go, goes.',
  },
  failure: {
    lit: 'It takes both hands and longer than it should, but the {item} does what it is for.',
    dark: 'It takes both hands and longer than it should, but the {item} does what it is for.',
  },
  mixed: {
    lit: 'You use the {item} standing up, in a hurry, in a place you would rather not have had to.',
    dark: 'You use the {item} standing up, in a hurry, in a place you would rather not have had to.',
  },
  success: {
    lit: 'You use the {item}.',
    dark: 'You use the {item}, by touch, which is how you have done everything for a while now.',
  },
  strongSuccess: {
    lit: 'You use the {item} without breaking stride, the way you would if you had done this a hundred times. You have.',
    dark: 'You use the {item} without breaking stride, the way you would if you had done this a hundred times. You have.',
  },
  criticalSuccess: {
    lit: 'You use the {item} neatly enough that you stow what is left of it, which is the difference between a lanternbearer and a tourist.',
    dark: 'You use the {item} neatly enough that you stow what is left of it, which is the difference between a lanternbearer and a tourist.',
  },
}

/**
 * SEND — GDD 2.9. THE COMPANION DOES NOT COME BACK.
 *
 * ONE-VALUED. `resolveSend` ignores the band entirely: the decoy lands, the
 * slot clears, and nothing about the roll changes either. Flagged for 1g
 * alongside USE.
 *
 * `CLAUDE.md` 3 is explicit that this beat has to land and must not be
 * softened. These lines cover the MANNER of the going; the going itself is
 * `companionSent`, and neither may leave room for a return.
 */
const SEND: ByBand = {
  criticalFailure: {
    lit: 'The {companion} does not understand, and then it does, and it goes anyway. That is worse.',
    dark: 'The {companion} does not understand, and then it does, and it goes anyway. That is worse.',
  },
  failure: {
    lit: 'You have to push it. It goes because you made it go, and it keeps checking behind itself as it does.',
    dark: 'You have to push it. It goes because you made it go, and it keeps stopping to check behind itself as it does.',
  },
  mixed: {
    lit: 'It takes a moment to understand what you are asking. Then it goes, and it is loud, and you have what you wanted.',
    dark: 'It takes a moment to understand what you are asking. Then it goes, and it is loud, and you have what you wanted.',
  },
  success: {
    lit: 'You point, and the {companion} goes, because you asked it to.',
    dark: 'You point it, and the {companion} goes, because you asked it to.',
  },
  strongSuccess: {
    lit: 'It goes straight, fast and noisy, exactly as far as you needed and not one room further.',
    dark: 'It goes straight, fast and noisy, exactly as far as you needed and not one room further.',
  },
  criticalSuccess: {
    lit: 'The {companion} goes the instant you ask, without once looking back at you, which you will think about later.',
    dark: 'The {companion} goes the instant you ask, without once stopping, which you will think about later.',
  },
}

/**
 * ENTER PORTAL — GDD 2.8. INT, Hard DC.
 *
 * TWO-VALUED: the band decides how deep in the NEW labyrinth you surface —
 * mixed-or-better lands you in the near half of the candidate rooms, worse in
 * the far half — and never whether you arrive. A portal that could strand you
 * would be a second instant-loss check and the design has room for one.
 *
 * Everything charted is gone, and so is every trail you laid. That is the trade.
 */
const ENTER_PORTAL: ByBand = {
  criticalFailure: {
    lit: 'You go in with no idea what you are reading and it puts you down a long way from anywhere, in a labyrinth that is not the one you learned.',
    dark: 'You go in with no idea what you are reading and it puts you down a long way from anywhere, in a labyrinth that is not the one you learned.',
  },
  failure: {
    lit: 'The hum takes you and does not consult you about where. You surface deep, and everything you had charted is worthless.',
    dark: 'The hum takes you and does not consult you about where. You surface deep, and everything you had charted is worthless.',
  },
  mixed: {
    lit: 'You read enough of it to aim. You come out nearer the way out than you went in, in a place you know nothing else about.',
    dark: 'You read enough of it to aim. You come out nearer the way out than you went in, in a place you know nothing else about.',
  },
  success: {
    lit: 'You read the hum, step through on the turn of it, and surface in the shallows of somewhere new.',
    dark: 'You read the hum, step through on the turn of it, and surface in the shallows of somewhere new.',
  },
  strongSuccess: {
    lit: 'You take it the way it wants to be taken and come up close to a door you have never been through, carrying nothing you knew.',
    dark: 'You take it the way it wants to be taken and come up close to a door you have never been through, carrying nothing you knew.',
  },
  criticalSuccess: {
    lit: 'You understand the portal for about a second and a half, which is exactly long enough. You arrive where you would have chosen.',
    dark: 'You understand the portal for about a second and a half, which is exactly long enough. You arrive where you would have chosen.',
  },
}

// ---------------------------------------------------------------------------
// The hazard verbs — GDD 2.8, written in 1g alongside the mechanic
//
// Four verbs, two hazards, one decision each. Read the pairs together, because
// the writing has to carry the difference the tables encode:
//
//   FORCE  / ENDURE   answer a spore bloom.  FORCE is loud and buys TIME back
//                     on a good roll; Confused lands whatever you roll. ENDURE
//                     is silent, always costs the same two turns, and what a
//                     good roll buys is a SHORTER Confused — never none.
//   AVOID  / DODGE    answer a snare-carving. AVOID reads the mechanism before
//                     it fires and pays in clock when it misreads. DODGE reacts
//                     after it fires and pays in blood.
//
// THE CONSTRAINT THAT SHAPED THESE LINES: `HAZARD_VERB_OUTCOMES` is the truth
// and the prose may not out-promise it. A FORCE at criticalSuccess is
// mechanically identical to a FORCE at strongSuccess — same turn, same Confused
// — so those two lines differ in TEXTURE and never in claim. The same
// constraint 1f hit on SEARCH and MOVE, in a place where it bites harder,
// because forcing feels like it ought to scale and it does not.
//
// Confused is named by its own beat (`confusedSettles`) and its duration rides
// on the `statusChanged` event, so these lines do not all have to end in "You
// are Confused" — which, across twelve bloom cells, is exactly the six-bands-
// one-sentence failure Panel B of the prose visualiser exists to catch. What
// they DO carry is the SHAPE of it: the three-turn rows read longer and worse.
// ---------------------------------------------------------------------------

/**
 * FORCE — STR, loud, against a spore bloom.
 *
 * Confused in every row, at full duration, whatever the die says. The variable
 * is the clock: two turns, or one from strongSuccess up.
 */
const FORCE: ByBand = {
  criticalFailure: {
    lit: 'You put your shoulder into a wall of caps and the wall puts itself into you. It is a long time before the sweetness thins enough to tell up from along.',
    dark: 'You put your shoulder into a wall of caps and the wall puts itself into you. It is a long time before the sweetness thins enough to tell up from along.',
  },
  failure: {
    lit: 'You go in swinging and the bloom goes up around you in a slow gold ruin. The lamp drinks some of it and likes it no better than you do.',
    dark: 'You go in swinging and the bloom goes up around you, thick and slow against your arms. The lamp drinks some of it and likes it no better than you do.',
  },
  mixed: {
    lit: 'You break a line through it and come out the far side wearing most of what you broke. It takes two turns you did not have, and the air is sweet for a while after.',
    dark: 'You break a line through it by feel and come out the far side wearing most of what you broke. It takes two turns you did not have, and the air is sweet for a while after.',
  },
  success: {
    lit: 'You go through the {hazard} the short way, which is straight, and it costs what going straight costs: the time, and a head full of sugar.',
    dark: 'You go through the {hazard} the short way, which is straight, and it costs what going straight costs: the time, and a head full of sugar.',
  },
  // From here up, one turn instead of two — and nothing else changes. No line
  // below may imply a cleaner head than the two above it.
  strongSuccess: {
    lit: 'You pick the thin place and drive through it in one movement. Half the time it should have taken; all of the sweetness.',
    dark: 'You find the thin place with your hands and drive through it in one movement. Half the time it should have taken; all of the sweetness.',
  },
  criticalSuccess: {
    lit: 'You cross it like a man crossing a stream on known stones, fast and without ceremony. The spores get you anyway. They always do.',
    dark: 'You cross it like a man crossing a stream on known stones, fast and without ceremony. The spores get you anyway. They always do.',
  },
}

/**
 * ENDURE — INT, silent, against a spore bloom.
 *
 * The clock is flat in every row: standing through a bloom never gets quicker.
 * What the die buys is how long the sweetness holds you afterwards, and it
 * never buys all of it. A clean Endure still walks out of the room impaired —
 * the deliberate answer to INT otherwise having no weak matchup in the whole
 * coverage matrix. See `HAZARD_VERB_OUTCOMES`.
 */
const ENDURE: ByBand = {
  criticalFailure: {
    lit: 'You decide to wait it out and the bloom decides otherwise. It goes off at chest height and you breathe the whole of it, and the whole of it stays.',
    dark: 'You decide to wait it out and the bloom decides otherwise. It goes off at chest height and you breathe the whole of it, and the whole of it stays.',
  },
  failure: {
    lit: 'Standing still was right and standing there was wrong. You hold your ground in the thick of it, and the thick of it is in you a long while.',
    dark: 'Standing still was right and standing there was wrong. You hold your ground in the thick of it, and the thick of it is in you a long while.',
  },
  mixed: {
    lit: 'You go still, breathe shallow, and let it happen to you. It happens to you for two turns, and some of it comes along afterwards.',
    dark: 'You go still, breathe shallow, and let it happen to you. It happens to you for two turns, and some of it comes along afterwards.',
  },
  success: {
    lit: 'You know what it is and what it does, so you stand in it and do neither of the things that would make it worse. It still gets in. Knowing is not a filter.',
    dark: 'You know what it is and what it does, so you stand in it and do neither of the things that would make it worse. It still gets in. Knowing is not a filter.',
  },
  // From here up the sweetness lifts a turn sooner. Never sooner than that.
  strongSuccess: {
    lit: 'You breathe against the back of your own hand and count it out, and the count is right. It clears early. Early, not clean.',
    dark: 'You breathe against the back of your own hand and count it out, and the count is right. It clears early. Early, not clean.',
  },
  criticalSuccess: {
    lit: 'You read the bloom exactly — what it wants, how long it has, when it is spent — and you give it the least of yourself it will accept. It takes that much and no more.',
    dark: 'You read the bloom exactly — what it wants, how long it has, when it is spent — and you give it the least of yourself it will accept. It takes that much and no more.',
  },
}

/**
 * AVOID — INT, silent, against a snare-carving.
 *
 * Reading the mechanism before it triggers. The snare's currency is the clock,
 * not blood (`HAZARD_VERB_OUTCOMES`), so a misread costs turns and the bottom
 * of the table costs both.
 */
const AVOID: ByBand = {
  criticalFailure: {
    lit: 'You read the marks confidently and read them wrong, and step on the exact stone they were cut to warn about. Getting out of it takes everything the next two turns had in them.',
    dark: 'You read the marks under your fingers confidently and read them wrong, and step on the exact stone they were cut to warn about. Getting out of it takes everything the next two turns had in them.',
  },
  failure: {
    lit: 'You work out what the chisel was for a moment after your foot has already answered the question. Working loose eats the turn.',
    dark: 'You work out what the chisel was for a moment after your foot has already answered the question. Working loose eats the turn.',
  },
  mixed: {
    lit: 'You find the trigger stone before it finds you, and go round it — round it being past the lamp bracket, which does not survive the manoeuvre.',
    dark: 'You find the trigger stone before it finds you, and go round it — round it being past a jut of rock that takes the lamp with it as you pass.',
  },
  success: {
    lit: 'The {hazard} is a piece of engineering and you read it as one: here is the plate, here is the arm, here is the part of the floor to be somewhere else than.',
    dark: 'The {hazard} is a piece of engineering and you read it as one, by hand: here is the plate, here is the arm, here is the part of the floor to be somewhere else than.',
  },
  strongSuccess: {
    lit: 'You follow the fresh cuts back to the hand that made them and walk the line that hand walked, which is the only safe line in the room.',
    dark: 'You follow the fresh cuts back by touch to the hand that made them and walk the line that hand walked, which is the only safe line in the room.',
  },
  criticalSuccess: {
    lit: 'Whoever set this left themselves a way through and marked it, because they had to come back too. You take their way, unhurried.',
    dark: 'Whoever set this left themselves a way through and marked it, because they had to come back too. You find the marks and take their way, unhurried.',
  },
}

/**
 * DODGE — AGI, silent, against a snare-carving.
 *
 * Answering the snare AFTER it has committed. Faster than reading round it when
 * it works, and the failures are the only place in either snare column where
 * the price is paid in blood rather than in clock.
 */
const DODGE: ByBand = {
  criticalFailure: {
    lit: 'It comes up out of the floor faster than you and takes you somewhere below the knee, hard, twice. You get free of it. You do not get free of it cheaply.',
    dark: 'It comes up out of the floor faster than you and takes you somewhere below the knee, hard, twice. You get free of it. You do not get free of it cheaply.',
  },
  failure: {
    lit: 'You move the instant it does and it is still the quicker of you. It has a piece before you are out of its reach, and the reach was longer than it had any right to be.',
    dark: 'You move the instant it does and it is still the quicker of you. It has a piece before you are out of its reach, and the reach was longer than it had any right to be.',
  },
  mixed: {
    lit: 'You throw yourself clear, mostly. The part of you that is not clear when it closes is a small part, and it hurts out of all proportion to its size.',
    dark: 'You throw yourself clear, mostly. The part of you that is not clear when it closes is a small part, and it hurts out of all proportion to its size.',
  },
  success: {
    lit: 'The floor gives and you are already going the other way. It shuts on the place you were standing a half-beat ago.',
    dark: 'The floor gives and you are already going the other way. It shuts on the place you were standing a half-beat ago.',
  },
  strongSuccess: {
    lit: 'You feel it start under your heel and go with the start of it instead of against, and it throws you clear of itself. Ungraceful, entirely effective.',
    dark: 'You feel it start under your heel and go with the start of it instead of against, and it throws you clear of itself. Ungraceful, entirely effective.',
  },
  criticalSuccess: {
    lit: 'It fires and you are not in it, and you are not in it so early that for a moment it is unclear which of you moved first. The {hazard} closes on nothing at all.',
    dark: 'It fires and you are not in it, and you are not in it so early that for a moment it is unclear which of you moved first. The {hazard} closes on nothing at all.',
  },
}

export const SUBJECT_LED_OUTCOMES: Record<SubjectLedAction, ByBand> = {
  sneak: SNEAK,
  fight: FIGHT,
  tame: TAME,
  flee: FLEE,
  use: USE,
  send: SEND,
  enterPortal: ENTER_PORTAL,
  force: FORCE,
  endure: ENDURE,
  avoid: AVOID,
  dodge: DODGE,
}

// ---------------------------------------------------------------------------
// Hazards — GDD 2.8
//
// The saving throw a hazard demands on entry, narrated band by band alongside
// `HAZARD_OUTCOMES` in `tuning.ts`, which says what each band DOES. The two
// tables must agree: a pit at `failure` is fatal, so the failure line has to
// end the run, and the bloom's `confused` bands have to tell the player plainly
// that they are Confused, because GDD 2.8.2 is explicit that the status is
// suppression the player knows about and not misdirection they do not.
//
// Deliberately NOT archetype-keyed. The hazard is the subject and generation
// already biases each hazard toward its thematic archetype
// (`ARCHETYPE_FOR_HAZARD`), so an archetype axis here would mostly restate the
// hazard. PORTAL is absent for the same reason it is absent from
// `ENTRY_HAZARDS`: standing in a portal room does nothing to you.
// ---------------------------------------------------------------------------

/**
 * Hazards that still resolve themselves the moment you walk in. Pit only.
 *
 * Bloom and snare had rows here through 1f, written for a saving throw that no
 * longer exists: since 1g they offer a verb, and the verb's own prose (FORCE /
 * ENDURE / AVOID / DODGE in `SUBJECT_LED_OUTCOMES`) is what the player reads.
 * Keeping the old rows would leave twelve beats that nothing can emit — dead
 * content that `allBeats()` and the lint would report forever, and that a later
 * session would eventually "fix" back into the reducer.
 */
export type EntryHazard = 'pit'

export const HAZARD_NARRATION: Record<EntryHazard, ByBand> = {
  pit: {
    criticalFailure: {
      lit: 'There is no floor. There was a draft and there was a doorway and now there is neither, and the fall goes on a long time.',
      dark: 'There is no floor. There was a draft and there was a doorway and now there is neither, and the fall goes on a long time.',
    },
    failure: {
      lit: 'The edge is further in than you had any way of guessing. You go over it.',
      dark: 'The edge is further in than you had any way of guessing. You go over it.',
    },
    mixed: {
      lit: 'You go in as far as the chest and stop there, on your arms, with the lamp swinging and the cold coming up past you out of it.',
      dark: 'You go in as far as the chest and stop there, on your arms, with the cold coming up past you out of it.',
    },
    success: {
      lit: 'Your boot finds nothing and you put your weight back where it came from. The draft was honest.',
      dark: 'Your boot finds nothing and you put your weight back where it came from. The draft was honest.',
    },
    strongSuccess: {
      lit: 'You catch the lip a full stride out and go round it. It is a long way down and you do not need to know how far.',
      dark: 'You catch the change in the draft a full stride out and go round it. It is a long way down and you do not need to know how far.',
    },
    criticalSuccess: {
      lit: 'You were never going to walk into it. You skirt the pit the way you would a hole in a floor you owned.',
      dark: 'You were never going to walk into it. You skirt the pit the way you would a hole in a floor you owned.',
    },
  },
}

// ---------------------------------------------------------------------------
// Endings — GDD 2.17
//
// "What a player remembers of a run is its hardest moment and its last one. The
// design already puts those together: the escape is the hardest part by
// construction, and it is the end."
//
// EVERY ENDING NEEDS A BEAT, including the quiet ones. Retreat especially:
// leaving alive without the Heart is the second-best outcome in the game and it
// shipped as a placeholder line through 1e, which made it read as the run
// simply stopping. What retreat actually buys is the seed and the map (GDD
// 2.11), and the line has to carry that or the Lanternhouse offering the
// labyrinth back will come as a surprise.
//
// Deliberately NOT archetype-keyed, and this is a scope line rather than a
// judgement: a death beat that knows which room it happened in is exactly the
// kind of last-line-of-the-run writing 2.17 argues for, but endings are not in
// the `(archetype x action x band)` product this step is gated on, and the
// epitaph (GDD 2.16) — the literal last thing a failed run produces — is not
// built yet either. Do the two together. Carried forward.
// ---------------------------------------------------------------------------

export type EndingBeat = Extract<
  NarrationBeat,
  | 'caughtWalkedInto'
  | 'caughtCameForYou'
  | 'killedByHazard'
  | 'killedByDamage'
  | 'outOfTurns'
  | 'escaped'
  | 'retreated'
>

export const ENDINGS: Record<EndingBeat, Beat> = {
  // Step 2 of the turn order. You moved into the room it was already standing in.
  caughtWalkedInto: {
    lit: 'It was already in there. You had one step of warning and you spent it walking. It was already in there, and you walked into it.',
    dark: 'It was already in there. You had one step of warning and you spent it walking. It was already in there, and you walked into it.',
  },
  // Step 6. It crossed into your room. The stench was honest; you stayed anyway.
  caughtCameForYou: {
    lit: 'The stench thickens until it is not a smell any more. It did not hurry. It never has to. It came for you.',
    dark: 'The stench thickens until it is not a smell any more. It did not hurry. It never has to. It came for you.',
  },
  killedByHazard: {
    lit: 'The floor was never there. The lamp goes with you, and the dark takes you both.',
    dark: 'The floor was never there. The lamp goes with you, and the dark takes you both.',
  },
  killedByDamage: {
    lit: 'You sit down to get your breath and find that getting it is no longer something you do. You do not get up.',
    dark: 'You sit down to get your breath and find that getting it is no longer something you do. You do not get up.',
  },
  outOfTurns: {
    lit: 'The dark closes over the way you came, and then over the way you were going, and then over the rest of it.',
    dark: 'The dark closes over the way you came, and then over the way you were going, and then over the rest of it.',
  },
  escaped: {
    lit: 'Daylight, and the weight of it in your arms, and behind you a labyrinth that has stopped mattering. You do not look back down. Nobody does, the first time.',
    dark: 'Daylight, and the weight of it in your arms, and behind you a labyrinth that has stopped mattering. You do not turn round. Nobody does, the first time.',
  },
  // Not a loss. GDD 2.2, 2.11 — the map is the prize, and it is the only prize
  // in this game that keeps between runs.
  retreated: {
    lit: 'Daylight. Your hands are empty and your lamp is nearly out, and you find you do not mind as much as you expected to. You know where the pits are now. You know which way the carvings face. The labyrinth is still down there and it is still the same one, and next time you will not be walking into it blind.',
    dark: 'Daylight. Your hands are empty and your lamp is out, and you find you do not mind as much as you expected to. You know where the pits are now. You know which way the carvings face. The labyrinth is still down there and it is still the same one, and next time you will not be walking into it blind.',
  },
}

// ---------------------------------------------------------------------------
// Notes — everything else the reducer says
// ---------------------------------------------------------------------------

/**
 * Losing a companion is not a note: its prose lives in `COMPANION_LOSS` and
 * rides on the `companionLost` event itself, keyed by the typed reason.
 */
export type NoteBeat = Exclude<NarrationBeat, EndingBeat | 'actionOutcome' | 'hazardOutcome'>

export const NOTES: Record<NoteBeat, Beat> = {
  lampBurnsDown: {
    lit: 'The lamp burns down.',
    dark: 'The lamp burns down.',
  },
  lampBrightens: {
    lit: 'The lamp takes the oil and stands up straight again.',
    dark: 'The lamp takes the oil, catches, and the room comes back.',
  },
  lampGutters: {
    lit: 'The lamp gutters.',
    dark: 'The lamp gutters, which you feel rather than anything else.',
  },
  goblinScrounges: {
    lit: 'The goblin turns up a little oil and is extremely pleased about it.',
    dark: 'The goblin presses a little oil into your hand and is extremely pleased about it.',
  },
  skittishUpkeep: {
    lit: 'Keeping it calm costs oil.',
    dark: 'Keeping it calm costs oil.',
  },
  foundFlask: {
    lit: 'An oil flask, half full, wedged under the stone.',
    dark: 'Your hand closes on a flask, half full, wedged under the stone.',
  },
  caughtBreath: {
    lit: 'You catch your breath.',
    dark: 'You catch your breath.',
  },
  grellhoundGrowls: {
    lit: 'The grellhound growls, low and steady, and does not stop.',
    dark: 'The grellhound growls, low and steady, and does not stop.',
  },
  // Radius 1, honest, and available before the player chooses — GDD 2.9.1.
  grellhoundReveals: {
    lit: 'The grellhound points itself {direction} and will not settle. There is a {hazard} that way.',
    dark: 'The grellhound points itself {direction} and will not settle. There is a {hazard} that way.',
  },
  carvingsWarn: {
    lit: 'The carvings warn of a {hazard} to the {direction}.',
    dark: 'Under your fingers the carvings warn of a {hazard} to the {direction}.',
  },
  companionReveals: {
    lit: 'It goes to the doorway and back, and you understand it is telling you about the room to the {direction}.',
    dark: 'It goes to the doorway and back, and you understand it is telling you about the room to the {direction}.',
  },
  // The natural-20 brave override. GDD 2.6, 2.9.
  braveOverride: {
    lit: 'The {creature} looks at you and does not flinch. Whatever you send it at, it will go.',
    dark: 'The {creature} comes right up against your hand and does not flinch. Whatever you send it at, it will go.',
  },
  /**
   * Entering a room that has something in it. This is the encounter opening,
   * and it had no prose at all until 1f — the engine emitted a bare
   * `creatureEncounter` event and left the renderer to invent the sentence,
   * which is the text-parity rule (CLAUDE.md 2.3) failing in the direction
   * nobody checks: a fact the player can learn that the event stream cannot
   * express. Found by reading a run in Panel C, not by a test.
   */
  creatureFound: {
    lit: 'There is a {creature} in here, and it has stopped what it was doing.',
    dark: 'Something in here stops what it was doing. A {creature}, close enough to touch.',
  },
  /**
   * The hazard has the room and will not be walked around. GDD 2.8: bloom and
   * snare offer a verb, and this is the line that tells the player the menu has
   * become that choice. It has to read as a WALL rather than as an injury —
   * nothing has happened to them yet, which is the whole difference between a
   * verb hazard and a pit.
   */
  hazardBlocks: {
    lit: 'The {hazard} has the room, corner to corner, and there is no edge of it to walk along. Whatever you do about it, you do it here.',
    dark: 'The {hazard} has the room, corner to corner, and your hands find no edge of it to walk along. Whatever you do about it, you do it here.',
  },
  /**
   * The hazard reward (GDD 2.8). Written to make the flask DIEGETIC rather than
   * a prize dispensed for a good roll: a bloom grows on what the labyrinth has
   * already taken, and a snare is set over something worth setting it over. The
   * player earned it by clearing the room, not by winning a lottery.
   */
  hazardCleared: {
    lit: 'On the far side of the {hazard}, where nobody has had reason to stand in a long time, there is a flask. Somebody else got this far.',
    dark: 'On the far side of the {hazard}, where nobody has had reason to stand in a long time, your hand finds a flask. Somebody else got this far.',
  },
  /** A driven-off creature leaves its scrapings behind. See FightOutcome. */
  spoilsTaken: {
    lit: 'The {creature} leaves in a hurry and leaves its hoard with it — a flask among the bones and the bottle caps.',
    dark: 'The {creature} leaves in a hurry and leaves its hoard with it. You go through it by hand and come up with a flask.',
  },
  /**
   * The loudest thing in the game (`SCENT.heartTaken` = 6) and the escalation
   * trigger: the Wumpus jumps a tier and learns exactly where you are for one
   * turn. GDD 2.10 — the escape is meant to be the hardest part of the run, and
   * this is the line where the run changes shape.
   */
  heartTaken: {
    lit: 'You lift it off the plinth. It is heavier than a thing that size should be, and the whole labyrinth goes very quiet, the way a room does when someone has stopped talking to listen.',
    dark: 'You lift it off the plinth. It is heavier than a thing that size should be, and the whole labyrinth goes very quiet, the way a room does when someone has stopped talking to listen.',
  },
  wumpusEscalates: {
    lit: 'Somewhere below you, something that was taking its time stops taking its time.',
    dark: 'Somewhere below you, something that was taking its time stops taking its time.',
  },
  /**
   * GDD 2.8.2: Confused is SUPPRESSION the player knows about, not misdirection
   * they do not. Both lines say plainly what is happening and for how long —
   * "absence is not falsehood, the player is told plainly that they are
   * Confused, and they know exactly how long it lasts."
   */
  confusedSettles: {
    lit: 'The sweetness settles over everything else. For the next two turns the doorways will tell you nothing at all — not because there is nothing, but because you cannot get past the smell of it.',
    dark: 'The sweetness settles over everything else. For the next two turns the doorways will tell you nothing at all — not because there is nothing, but because you cannot get past the smell of it.',
  },
  confusedLifts: {
    lit: 'The sweetness thins, and the doorways start reporting again.',
    dark: 'The sweetness thins, and the doorways start reporting again.',
  },
  // An intrusion, not an ambush — GDD 2.9.1. No encounter is triggered.
  creatureWanders: {
    lit: 'A {creature} wanders into the room, notices you, and carries on being where it is.',
    dark: 'Something comes in through the far doorway, notices you, and carries on being where it is. A {creature}, by the sound of it.',
  },
  portalCrossed: {
    lit: 'The hum swallows you, and lets you out somewhere that is not where you were. Everything you had learned was about a different labyrinth.',
    dark: 'The hum swallows you, and lets you out somewhere that is not where you were. Everything you had learned was about a different labyrinth.',
  },
  // Deliberately says nothing about WHICH action. The specifics live in
  // `legalActions`, which every renderer and `AgentView` already has; echoing
  // the verb here would mean an `{action}` slot whose only job is to restate
  // something the caller is holding.
  actionUnavailable: {
    lit: 'That is not something you can do from where you are standing.',
    dark: 'That is not something you can do from where you are standing.',
  },
}

/**
 * Why a companion left. A typed reason rather than a prose string on the event,
 * for the same reason `NarrationBeat` exists: the renderer picks the words.
 */
export const COMPANION_LOSS: Record<CompanionLossReason, Beat> = {
  bolted: {
    lit: 'The {companion} is gone before you have finished being hit. It was never going to stay for that.',
    dark: 'The {companion} is gone before you have finished being hit. It was never going to stay for that.',
  },
  released: {
    lit: 'You let the {companion} go. It waits a moment to see whether you meant it, and then it goes.',
    dark: 'You let the {companion} go. It waits a moment, in case you did not mean it, and then it goes.',
  },
  sent: {
    lit: 'The {companion} is somewhere off {direction}, making noise, and it is not coming back.',
    dark: 'The {companion} is somewhere off {direction}, making noise, and it is not coming back.',
  },
  starved: {
    lit: 'The lamp ran dry and the {companion} would not stay in the dark with you.',
    dark: 'The lamp ran dry and the {companion} would not stay in the dark with you.',
  },
}

// ---------------------------------------------------------------------------
// Lookups — the whole public surface the reducer uses
// ---------------------------------------------------------------------------

function isRoomLed(action: ActionKind): action is RoomLedAction {
  return (ROOM_LED_ACTIONS as readonly ActionKind[]).includes(action)
}

function isSubjectLed(action: ActionKind): action is SubjectLedAction {
  return (SUBJECT_LED_ACTIONS as readonly ActionKind[]).includes(action)
}

/**
 * The `(archetype x action x band)` lookup. TOTAL over every triple whose
 * action is narrated: room-led verbs resolve through the archetype layer,
 * subject-led verbs ignore the archetype and resolve band-only.
 *
 * Returns null ONLY for a deferred verb (FORCE). A caller that gets null has
 * asked about a verb with no prose, which today means a verb that cannot fire —
 * `tests/outcomes.test.ts` asserts that set is exactly `DEFERRED_ACTIONS`.
 */
export function outcomeBeat(
  archetype: RoomArchetype,
  action: ActionKind,
  band: OutcomeBand,
): Beat | null {
  if (isRoomLed(action)) return ROOM_LED_OUTCOMES[action][archetype][band]
  if (isSubjectLed(action)) return SUBJECT_LED_OUTCOMES[action][band]
  return null
}

export function outcomeText(
  archetype: RoomArchetype,
  action: ActionKind,
  band: OutcomeBand,
  dark: boolean,
  slots: Slots = {},
): string | null {
  const beat = outcomeBeat(archetype, action, band)
  return beat === null ? null : fill(say(beat, dark), slots)
}

export function hazardBeat(hazard: HazardKind, band: OutcomeBand): Beat | null {
  const table = HAZARD_NARRATION[hazard as EntryHazard]
  return table === undefined ? null : table[band]
}

export function hazardText(hazard: HazardKind, band: OutcomeBand, dark: boolean): string | null {
  const beat = hazardBeat(hazard, band)
  return beat === null ? null : say(beat, dark)
}

export function endingText(beat: EndingBeat, dark: boolean): string {
  return say(ENDINGS[beat], dark)
}

export function noteText(beat: NoteBeat, dark: boolean, slots: Slots = {}): string {
  return fill(say(NOTES[beat], dark), slots)
}

export function companionLossText(
  reason: CompanionLossReason,
  dark: boolean,
  slots: Slots = {},
): string {
  return fill(say(COMPANION_LOSS[reason], dark), slots)
}

/**
 * Every beat in every table, flattened. Exists for the coverage test and the
 * `prose` visualiser, which must walk the tables rather than restate them —
 * a visualiser that hardcodes the rule it is watching is a visualiser that
 * lies on the day the rule changes, which is the only day you are looking at it.
 */
export function allBeats(): { path: string; beat: Beat }[] {
  const out: { path: string; beat: Beat }[] = []
  for (const action of ROOM_LED_ACTIONS) {
    for (const archetype of ARCHETYPES) {
      for (const band of BAND_ORDER) {
        out.push({
          path: `${action}.${archetype}.${band}`,
          beat: ROOM_LED_OUTCOMES[action][archetype][band],
        })
      }
    }
  }
  for (const action of SUBJECT_LED_ACTIONS) {
    for (const band of BAND_ORDER) {
      out.push({ path: `${action}.${band}`, beat: SUBJECT_LED_OUTCOMES[action][band] })
    }
  }
  for (const hazard of Object.keys(HAZARD_NARRATION) as EntryHazard[]) {
    for (const band of BAND_ORDER) {
      out.push({ path: `hazard.${hazard}.${band}`, beat: HAZARD_NARRATION[hazard][band] })
    }
  }
  for (const key of Object.keys(ENDINGS) as EndingBeat[]) {
    out.push({ path: `ending.${key}`, beat: ENDINGS[key] })
  }
  for (const key of Object.keys(NOTES) as NoteBeat[]) {
    out.push({ path: `note.${key}`, beat: NOTES[key] })
  }
  for (const key of Object.keys(COMPANION_LOSS) as CompanionLossReason[]) {
    out.push({ path: `companionLost.${key}`, beat: COMPANION_LOSS[key] })
  }
  return out
}

/**
 * Words that mean the player used their eyes.
 *
 * A dark variant containing one of these is a bug, not a style question: GDD
 * 2.8.1's whole claim is that darkness changes the CHANNEL and not the FACT, so
 * a line that tells a player with no lantern what they saw is the engine
 * describing a sense they do not currently have. Kept here rather than in the
 * test file because the visualiser lints against it too, and two copies of this
 * list would drift.
 */
export const VISION_WORDS: readonly string[] = [
  'see', 'sees', 'seen', 'saw', 'seeing',
  'look', 'looks', 'looked', 'looking',
  'watch', 'watches', 'watched', 'watching',
  'glimpse', 'glimpsed', 'glance', 'glanced',
  'glint', 'glints', 'gleam', 'gleams', 'glitter', 'shimmer', 'sparkle',
  'visible', 'sight', 'eye', 'eyes',
  'colour', 'color', 'coloured', 'colored',
  'lamplight', 'silhouette', 'shadow', 'shadows', 'bright',
] as const

export function visionWordsIn(text: string): string[] {
  const words = text.toLowerCase().match(/[a-z]+/g) ?? []
  return [...new Set(words.filter((w) => VISION_WORDS.includes(w)))]
}
