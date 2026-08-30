# 4YQQ: Side Quest Expansion — Beyond the Library Doors (Draft 3)

> **Supersedes** [`2026-08-29-4yqq-side-quest-expansion-design.md`](2026-08-29-4yqq-side-quest-expansion-design.md).
> That draft specified twelve flat quests. This one specifies **ten branching quests**.
> The engineering findings in the older doc (R4 blueprint plumbing, R5 render catch-up)
> are still correct and are carried forward here.

**Source:** maintainer design artifact "Beyond the Library Doors", Draft 3.
**Implementation plan:** [`../plans/2026-08-30-4yqq-side-quest-expansion.md`](../plans/2026-08-30-4yqq-side-quest-expansion.md)

## Summary

The side quest deck is exhausted — eight quests shipped, all eight completed, so
`SideQuestDeckService.getAvailableSideQuests()` returns an empty array every month and the
Clubs suit draws nothing.

This spec adds **ten side quests** set **outside** the Grand Library, across four locales,
carrying **33 distinct branch prompts** and **five new items**. Bringing the pool to eighteen.

The original eight side quests all happen indoors and all ask the same kind of question:
*what is this book about?* These ten ask different questions — *where did this book come from,
who chose it, what shape is it, and what did you do afterward?* That shift is what keeps them
from colliding with the dungeon rooms and restoration projects already built.

**Zero Ink Drops.** Not one quest, not one branch, not one item, not one stake. Ink is in
surplus per the 8MFG currency contract.

## How branches work

Every quest here is **one book**, but it forks before you pick the book. You arrive at a
locale, the quest presents two to four branches, and you either choose one or roll for it —
each branch carries its own prompt and its own payout. That gives a quest a replay life of
three or four runs before it goes stale, without ever asking you to commit to a multi-book
chain.

**Choice branches** are used where you'd need to know your own shelves to pick well.
**Roll branches** are used where the fun *is* the loss of control.

### Suggested draw order

Roll a d4 for the locale first, then a coin or d4 for which quest at that locale. Rolling
*where you're going* before *what you're doing* makes the outside world feel like a map
rather than a list.

## Scope decisions (agreed with the maintainer, 2026-08-30)

| Area | Decision |
|---|---|
| Branches | **Full branch-aware UI.** Schema, resolver, and a branch picker on the drawn card. |
| Stakes | **Deferred.** `stake` data lands in the JSON but is inert. Full mechanic tracked as its own bead. |
| Country register | **Implemented.** New persistent state key, schema migration, and register UI. |
| Unlock gate | **None.** All ten quests are drawable the moment the data lands. |

---

## Locale I · The Ninefold Bazaar

> A market that assembles at the library gates on no announced schedule and is gone by the
> third morning. Nine rows of stalls. Nothing here is sold at the asking price, and nothing
> here is sold new.

### SQ 09 · Haggler's Row — *item reward*

> The stallkeepers know your face by now, and not one of them will take full price from a
> Keeper. It would be an insult to try.

**Branch type:** choice — *choose your bargain. You know how your own books arrived.*

| Key | Name | Prompt | Payout |
|---|---|---|---|
| A | The Loan | Read a book you borrowed — a library copy, a friend's shelf, an app hold, an interlibrary request. | The Haggler's Ledger, +10 Blueprints |
| B | The Second Hand | Read a book you bought used — thrift store, used bookshop, library sale, a reseller. | The Haggler's Ledger, +15 Blueprints |
| C | The Gift | Read a book you neither chose nor paid for — given to you, a Little Free Library find, a subscription box pick you'd never have bought. (Books that came with the house belong to the Lending Cart, not here.) | The Haggler's Ledger, +20 Blueprints |

**Stake · Haggle** *(deferred — data only)* — Declare before you start. Finish the book and
rate it 4 stars or higher: **double the Blueprints**. Rate it under 3: **−10 Blueprints**,
floor of zero. The item is never at risk.

### SQ 10 · The Blind Stall — *XP · Scraps · Blueprints*

> The merchant at the end of the ninth row sells her books wrapped in butcher's paper and
> string. She will tell you exactly one thing about each, and she will not tell you which thing.

**Branch type:** roll — *roll a d6 to see which parcel she puts in your hands.*

| Roll | Name | Prompt | Payout |
|---|---|---|---|
| 1–2 | Sold by title alone | Pick a book from its title only. No blurb, no cover, no reviews, no one's opinion. Commit before you look at anything else. | +40 XP, +10 Scraps |
| 3 | Sold by the spine | Stand at a shelf — yours, a store's, a library's — and choose a book touching nothing but spines. No pulling it out to read the back first. | +45 XP, +15 Scraps |
| 4–5 | Sold by the first line | Read the opening sentence of a book and nothing else — not the blurb, not the cover copy, not the second sentence. Commit or walk away on that one line. | +50 XP, +10 Scraps |
| 6 | Sold in a lot | She won't split the bundle. Read two short works by the same author, or a book plus its companion novella. | +80 XP, +20 Scraps |

**Stake · The wrapper's terms** *(deferred — data only)* — Finish what you unwrapped and take
**+15 Blueprints** on top, whatever you thought of it. Set it down unfinished and you keep the
Paper Scraps but forfeit the XP — no further penalty.

---

## Locale II · The Festival of Turning

> The town holds it whenever something turns — a harvest, a treaty, a birth, the end of a long
> rain. There is no season attached to it and asking which turning is being marked is
> considered rude.

### SQ 11 · The Masked Procession — *item reward*

> At the gate they hand you a mask and take your name for the evening. Until the lanterns burn
> out you are permitted to be someone you are not, and expected to try.

**Branch type:** choice — *choose a mask.*

| Key | Name | Prompt | Payout |
|---|---|---|---|
| A | The Stranger's Face | Read in a genre you actively avoid or have simply never tried. Not a genre you read rarely — one you've decided isn't for you. | The Reveler's Mask, +25 XP |
| B | The Other Life | Read a book whose narrator's ordinary day has nothing in common with yours — different work, different body, different century, different belief about what a day is for. | The Reveler's Mask, +20 XP, +5 Scraps |
| C | The Opposing Voice | Read a book that argues for something you're inclined to disagree with — fiction or non-fiction — and log one thing it got right. | The Reveler's Mask, +30 XP |

**Unmasking** *(deferred — data only)* — Optional, no risk: journal three or more sentences on
whether the mask fit and take **+10 Paper Scraps**. Counts as an Adventure Journal entry, so
quill and pen bonuses stack on it.

### SQ 12 · The Communal Table — *XP · Scraps · Blueprints*

> One table runs the length of the square, end to end. Nobody eats alone at the Festival of
> Turning — that is the entire body of festival law, and it is enforced by grandmothers.

**Branch type:** choice — *choose your seat, or roll a d3 and let the table seat you.*

| Key | Name | Prompt | Payout |
|---|---|---|---|
| A | The shared plate | Buddy read: read a book at the same time as someone else and talk to them about it at least once *before* either of you finishes. | +60 XP, +20 Scraps |
| B | The long meal | Read a book aloud to someone, or be read to — a partner, a child, a friend on a call. Any length counts; a picture book counts. | +50 XP, +15 Scraps |
| C | The recipe | Read a book with a meal at its center, then cook or make something that actually appears in it. | +40 XP, +10 Scraps, +10 Blueprints |

**Half a table** *(deferred — data only)* — If your reading partner drifts off, or the
reading-aloud never happens, take **half the XP** and all the Paper Scraps. There is no failure
state here on purpose — this quest depends on another person and shouldn't punish you for their
week.

---

## Locale III · The Exchange

> A term abroad at an institution that keeps no library at all — only teachers, fields, and
> workshops. They find your Sanctum charming and slightly pitiable. The curriculum is external
> in every sense.

### SQ 13 · The Visiting Scholar — *item reward*

> You are enrolled under a name nobody here can pronounce, in a hall where your expertise counts
> for nothing. Your first assignment is to stop being the most knowledgeable person in the room.

**Branch type:** choice — *choose a placement. All three sit on language, not on setting.*

| Key | Name | Prompt | Payout |
|---|---|---|---|
| A | In translation | Read a book translated into your language, and name the translator in your log. They wrote every word you actually read. | Visiting Scholar's Sigil, +20 XP |
| B | Enrollment record | Read a book by an author from a country you have never read a book from — and strike that country off the Exchange's register. **Each country can be claimed once, ever.** | Visiting Scholar's Sigil, +25 XP, +5 Scraps |
| C | The untranslated | Read a book that leaves words from another language standing in the text — italicised terms, a glossary, an untranslated song, dialect the author refuses to gloss. Log three words you learned. | Visiting Scholar's Sigil, +20 XP, +10 Scraps |

**Design note.** Draft 1's third branch was "read a book set somewhere you'll never physically
stand." It's out: a fantasy realm satisfies it trivially, and *The Lost Garden*, *The Astral
Archives* and *The Starlit Observatory* already own that ground. Branch B was also drifting
toward the Librarian's Compass and *Restore the Grand Entrance*, which both reward a
new-to-you author — the once-ever register is what separates them: the Compass pays out every
time, this pays out once per country and then closes that door forever.

### SQ 14 · The Field Practicum — *XP-heavy · Blueprints*

> The Exchange grades on output, not on hours. Reading is the prerequisite for the coursework
> here, not the coursework itself, and they are unmoved by how many pages you got through.

**Branch type:** roll — *roll a d4 for your assignment, or petition the registrar and choose.*

| Roll | Name | Prompt | Payout |
|---|---|---|---|
| 1 | The lecture | Read anything, then teach one idea out of it to another person, out loud, for five minutes. They're allowed to ask questions. You're not allowed to read from the book. | +80 XP, +15 Scraps |
| 2 | The practicum | Read something and then *do* it — cook the dish, walk the route, try the craft, run the drill, plant the thing. | +70 XP, +20 Blueprints |
| 3 | The seminar | Read two books that disagree about the same subject, and write a paragraph on exactly where they part ways. | +120 XP, +20 Scraps |
| 4 | The primary source | Read a diary, collected letters, an oral history, or first-hand testimony from someone who was there. **Not memoir** — the Philosophy Alcove already takes memoir. This is unshaped material: documents rather than a narrative built out of them. | +90 XP, +10 Scraps |

**Credit transfer** *(deferred — data only)* — Whatever you write or say for the assignment also
counts as an Adventure Journal entry, so the Librarian's Quill, the Golden Pen, and the Midnight
Waystation passive all fire on it. This is the one quest that deliberately double-dips.

---

## Locale IV · The Open Road

> Everything between one door and the next. The road doesn't care what you meant to read; it
> cares what you happen to have on you when the ferry leaves.

### SQ 15 · The Crossroads Inn — *item reward*

> Four roads, one hearth, and a house rule the innkeeper enforces with a broom: you eat what
> you're served and you read what you're handed.

**Branch type:** choice — *choose whose hands.*

| Key | Name | Prompt | Payout |
|---|---|---|---|
| A | The Bartender | She asks what you usually drink, listens carefully, and pours something else. Ask a bookseller or librarian to pick for you — in person or by note — and read whatever they hand over. | The Crossroads Fox, +20 XP |
| B | The Server | He brings what the kitchen sent out; nobody consulted you. Read a book pressed on you by a stranger whose taste you have no reason to trust — a shelf card, a note left inside a used copy, a list you stumbled into. | The Crossroads Fox, +20 XP, +5 Scraps |
| C | The Regular | Same stool, same story, every single time you come through. Read the book someone has recommended to you the most times and you have avoided the most successfully. | The Crossroads Fox, +30 XP |

**Design note.** Draft 1 spread "someone else chose it" across five prompts in three quests.
It's now concentrated here: the Inn is the recommendation quest and nothing else touches
recommendations.

### SQ 16 · The Short Crossing — *Scraps-heavy · XP*

> The ferry runs the narrows in well under an hour. Whatever you brought needs to be finished
> before the far bank, and the ferryman has opinions about people who bring the wrong thing.

**Branch type:** roll — *roll a d4 for what's in your coat pocket.*

| Roll | Name | Prompt | Payout |
|---|---|---|---|
| 1 | Poetry | A collection, a chapbook, or a novel in verse. | +40 XP, +25 Scraps |
| 2 | Illustrated | A graphic novel, comic, manga, or an illustrated edition where the pictures are doing real work. | +40 XP, +20 Scraps, +10 Blueprints |
| 3 | Short form | A short story collection, an essay collection, or a novella. | +50 XP, +20 Scraps |
| 4 | Spoken | A full-cast audiobook, or one read by the author. | +40 XP, +15 Scraps, +10 Blueprints |

**Crossing twice** *(deferred — data only)* — Complete the crossing on two different rolls inside
the same month and take **+30 Blueprints**.

### SQ 17 · The Lending Cart — *item reward*

> A cart pulled between towns by a man who will not say where he got any of it. Every copy on it
> has somebody else's fingerprints somewhere in the pages.

**Branch type:** choice — *choose a shelf. Each one is a book that passed through other hands
before yours.*

| Key | Name | Prompt | Payout |
|---|---|---|---|
| A | The mender's fee | Read a copy that is physically damaged, ex-library, or heavily marked by a previous reader — and log one thing that reader left behind. A note, a receipt, a name, an underline you disagree with. | The Mender's Thread, +25 Blueprints |
| B | The re-read | Re-read a book you loved at least five years ago, and log one thing you noticed this time that you missed then. The previous reader is you. | The Mender's Thread, +15 Blueprints, +10 Scraps |
| C | The inheritance | Read a book that came into your home attached to someone else — a partner's, a parent's, a housemate's, or one that was already on the shelf when you moved in. | The Mender's Thread, +20 Blueprints |

**Design note — DNF is off the table permanently.** Draft 1 opened this quest with "return to a
book you set aside." It's gone and it isn't coming back: **reading a DNF is one of the Worn Page
penalties.** Putting the same action on the reward side would make it mean two opposite things
— punishment when the Shroud assigns it, prize when the cart does — and that costs the penalty
its teeth. Whatever the Worn Page table takes, the reward tables leave alone.

### SQ 18 · The Relay House — *Scraps-heavy · XP*

> A staging post where letters wait for riders. The postmaster will carry absolutely anything,
> provided it is addressed to somebody.

**Branch type:** choice — *choose a dispatch.*

| Key | Name | Prompt | Payout |
|---|---|---|---|
| A | Letters received | Read an epistolary novel, or a book told through documents, transcripts, case files, or found records. | +50 XP, +25 Scraps |
| B | Letters sent | Read anything, then write to someone about it — an actual letter, a long message, a review posted where strangers can read it. | +40 XP, +30 Scraps |
| C | Letters left | Read a book and leave something in it for whoever reads it next — an annotation, a pressed note, a copy handed on with a message tucked inside. | +40 XP, +25 Scraps, +10 Blueprints |

**Franking** *(deferred — data only)* — If the letter gets an answer, take **+20 XP**. Claimable
whenever the reply arrives, even months later.

> Renamed from *The Waystation Post* because the Expedition's fifth stop is already the Midnight
> Waystation.

---

## Five new items

None grants Ink Drops. Two grant **Dusty Blueprints**, which currently has exactly one item
source in the whole game despite the Library Restoration expansion needing roughly 615 of them
to complete. That's the widest gap in the economy and these two fill it.

| Item | Type | Equipped bonus | Passive bonus | Tags |
|---|---|---|---|---|
| The Haggler's Ledger | Non-Wearable | Books you borrowed, bought used, or were given grant **+20 Dusty Blueprints**. | +10 Blueprints | `borrowed`, `secondhand`, `gifted` |
| The Reveler's Mask | Wearable | Books outside your usual genres grant **+25 XP and +10 Paper Scraps**. | +12 XP | `genre-stretch` |
| Visiting Scholar's Sigil | Wearable | Translated books, or books by an author from a country new to you, grant **+25 XP and +10 Paper Scraps**. | +12 XP, +5 Paper Scraps | `translated`, `new-country` |
| The Crossroads Fox | Familiar | Books recommended by another person grant **+20 XP and +10 Paper Scraps**. Once a month the Fox may choose for you: pick from your TBR at random and take **+30 XP** for accepting. | +10 XP; Fox's choice once every two months | `recommended` |
| The Mender's Thread | Non-Wearable | Re-reads, inherited books, and damaged or ex-library copies grant **+25 Dusty Blueprints**. | +12 Blueprints | `mended`, `re-read`, `inherited` |

The Crossroads Fox is the only one with an activated ability, and it's deliberate: the existing
Familiars are all passive multipliers, so a Familiar that occasionally *does something* gives the
slot a different feel. It also pairs with its own quest — the Fox is won by letting other people
choose, and then it keeps choosing.

## Sixteen new tags

`borrowed`, `secondhand`, `gifted`, `genre-stretch`, `translated`, `new-country`,
`untranslated`, `recommended`, `re-read`, `inherited`, `mended`, `epistolary`, `poetry`,
`illustrated`, `short-form`, `audio`.

Most describe the **copy** or the **circumstance** rather than the text, which is why none of
them clash with the existing tag vocabulary.

## Why these don't collide

Every prompt already in play was catalogued across the eight side quests, twenty-one dungeon
rooms, twenty restoration projects, and the bonus conditions on all thirty-six items. What is
already spoken for:

| Axis | Status |
|---|---|
| Cover attributes | **Fully saturated** — restoration projects and dungeon rooms own nearly the whole space. No new quest uses a cover prompt. |
| TBR mechanics | **Taken** by side quests 1 and 8 and the Grand Gallery / Endless Corridor. The Lending Cart works on damage, re-reads and inheritance instead of shelf age. |
| Genre and trope | **Heavily taken** — the dungeon owns genre. The new quests name almost no genre; the one that does (the Reveler's Mask) is defined by *your* reading history rather than a fixed genre. |
| Reading environment | **Taken** by atmospheric buffs. No new quest asks where you read. |
| Page count & length | **Taken** by three items. The Short Crossing uses *form* — poetry, comics, audio — a different axis. |
| Penalty actions | **Permanently off-limits.** An action that means "you failed" cannot also mean "you won." Reward tables and penalty tables never reach for the same verb. |
| Journaling | **Taken** by restoration projects and the Quill and Pen. The Relay House extends it outward — writing *to another person* — so it adds rather than repeats. |

That left four axes nothing in the game currently touches. All ten quests live on them:

1. **Provenance** — how the book physically reached you. Borrowed, bought used, gifted, inherited, damaged, wrapped in paper.
2. **Agency** — who chose it. A bookseller, a friend, a stranger's shelf card, a die, a fox.
3. **Form** — poetry, comics, essays, audio, letters, documents. Twenty-one dungeon rooms and not one acknowledges that books come in shapes.
4. **Aftermath** — what the book made you do. Cook it, teach it, walk it, argue with it, write to someone about it, leave a note for the next reader.

### Verification pass

Draft 2 was checked term by term against eleven data files — every prompt string, challenge,
befriend and defeat condition, completion prompt, and item bonus.

| Searched for | Hits | Outcome |
|---|---|---|
| translation, translator | 0 | Clear. |
| country, nationality | 0 | Clear as a prompt, but *new-to-you author* is claimed twice (Librarian's Compass, Restore the Grand Entrance). Resolved with the once-ever register. |
| memoir | 1 | **Collision.** The Philosophy Alcove takes memoir. The Field Practicum's primary-source branch now explicitly excludes it. |
| non-fiction + notes | 2 | **Collision.** *Restore the Card Catalog* is near-identical to draft 1's primer branch. Replaced with *The lecture*, which is spoken rather than written. |
| DNF, abandoned, set aside | 0 | **Collision found off-file.** Reading a DNF is a Worn Page penalty in `curseTableDetailed.json`. Permanently excluded. |
| poetry, verse, comic, graphic novel, novella, essay, audiobook | 0 | Clear. Format is unclaimed territory. |
| letter, epistolary, diary | 0 | Clear. |
| borrowed, thrift, used, inherited | 0 | Clear. Provenance is entirely unclaimed. |
| read aloud, buddy read | 0 | Clear. Nothing in the game involves a second person. |
| glossary, appendix | 0 | Clear. |

**Still unchecked:** `genreQuests.json`, `extraCreditRewards.json`, `masteryAbilities.json`,
`curseTableDetailed.json`, `schoolBenefits.json`, `sanctumBenefits.json`, `levelRewards.json`,
`shoppingOptions.json`, `keeperBackgrounds.json`, `atmosphericBuffs.json`,
`permanentBonuses.json`. The curse table is the highest priority — every verb in it is a verb
these quests must not use.

## Economy check

| Currency | Per run (avg) | Compared to existing content |
|---|---|---|
| XP | ~52 | In line with a dungeon room (30 monster / 50 room). The Field Practicum's 120 is the outlier and it's gated on reading two books and writing about them. |
| Paper Scraps | ~16 | Above existing sources (5–10), deliberately. The Short Crossing and the Relay House are meant to be the Scrap taps, and both are gated on real effort. |
| Dusty Blueprints | ~13 | New sustained source. A full pass through all ten yields roughly 130 Blueprints before item bonuses — about four restoration projects. Meaningful without trivialising a 615-Blueprint expansion. |
| Ink Drops | 0 | By design. |

**Worth watching:** if the Haggler's Row stake is run often against well-chosen used books, the
Ledger plus a doubled stake can produce 60 Blueprints from a single quest. If that proves too
fast in play, cap the haggle bonus at +20 rather than doubling. (Moot until the stake mechanic
ships.)

Because Ink Drops are held at zero throughout, this expansion is a clean lever: if the Ink Drop
glut ever resolves, Ink Drops can be added back to a few branches without redesigning anything.

## Card and item art

Ten side quest card images and five item images. `questCardImage.js` derives side quest
filenames from the quest **name**, keeping the "The" prefix and slugifying — so *The Blind
Stall* resolves to `side-quests/the-blind-stall.png`. Item images follow
`assets/images/rewards/<item-id>.png`.

**Maintainer task, not an implementation task.** Art lives in Supabase, not in the repo. The
JSON can land ahead of the art; cards render with the content overlay and a missing image,
which is ugly but not broken.

## Out of scope

- **Stakes as a mechanic.** Data lands inert; tracked as its own bead.
- **Multi-stage side quests.** Every quest here resolves in one submission against one book.
- **Retuning side quests 1–8**, including the two temp-buff quests that still pay Ink Drops.
- **Correcting stale dice notation on Spades and Hearts.** Clubs is corrected here only because it is being changed anyway.
- **Side quest and item art.** Maintainer task.
