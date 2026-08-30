# 4YQQ: Side Quest Expansion — Beyond the Library Doors

> **SUPERSEDED (2026-08-30)** by
> [`2026-08-30-4yqq-side-quest-expansion-draft3.md`](2026-08-30-4yqq-side-quest-expansion-draft3.md),
> which specifies ten branching quests rather than twelve flat ones. The engineering findings
> below — the blueprint payout gap (R4) and the hardcoded `1..8` render loop (R5) — were both
> correct and were carried forward and implemented. The quest and item content below was **not**
> implemented; none of these twelve quests, six items or six tags exist in the game.

## Summary

The side quest deck is exhausted. Eight quests shipped, all eight are completed, and `SideQuestDeckService.getAvailableSideQuests()` now returns an empty array every month. This spec adds **twelve** new side quests set **outside** the Grand Library — a night bazaar, a town festival, a term abroad, and six road-and-harbour locales — bringing the pool to twenty.

Six of the twelve grant a **thematic magical item**; six grant **XP, Paper Scraps, and Dusty Blueprints**. **None grant Ink Drops**, per the currency contract established in [8MFG](2026-08-29-8mfg-economy-rebalance-design.md): ink is the throughput currency and is already in surplus; paper and blueprints are the scarce ones.

This is a **data-first** change. No new quest schema, no multi-stage engine work. Dynamism comes from the prompt text — wagers, player choice, and prompts that span more than one book but resolve in a single quest submission, mirroring the die-roll branch already shipped on *The Glimmering Pools' Gift*.

## Problem Statement

Three problems, addressed together because they share the side quest data contract:

1. **The pool is empty.** Twelve months of play against an eight-card deck. The Clubs suit now draws nothing.
2. **Every existing side quest is set inside the Library**, and so is every one of the 21 dungeon rooms and all 20 restoration projects. The game has one location. A player who draws Clubs gets the same set-dressing they got from Spades.
3. **Side quests cannot pay Dusty Blueprints.** `QuestRewardService.calculateBlueprintReward()` branches on `♥ Organize the Stacks` and `⭐ Extra Credit` only. Blueprints authored into a side quest's `rewards` object would *render* on the card and in the receipt but never reach `stateAdapter.addDustyBlueprints()` — the exact display/behaviour mismatch class that 8MFG's R3 exists to fix. Half the new quests depend on this path, so it must be opened.

## Design Decisions

| Decision | Chosen | Rejected |
|---|---|---|
| Pool size | 12 new (20 total) | 8 new (16 total — lands on a non-standard d16) |
| Dynamism | Prompt-level: wagers, choices, multi-book prompts resolving in one submission | A `stages` array on the schema with one quest emitted per stage |
| Setting | Outside the Library — bazaar, festival, foreign academy, road, harbour | More Library interiors |
| Currency | Paper Scraps, XP, Blueprints | Ink Drops (already in surplus) |
| Item mechanics | Six new book tags, each unclaimed by any existing item | Reusing `social`, `cozy`, `new-author` — all already carry item bonuses |
| Blueprint plumbing | Read `blueprints` off the side quest catalog entry | Hardcoding a flat side-quest blueprint value in `GAME_CONFIG` |

**Why twenty and not sixteen.** Sixteen quests puts Clubs on a d16, which is not a die most players own. Twenty gives the suit a d20 — a real die, and the largest in the standard set, which suits Clubs being the deck with the most entries. Note the existing notation has already drifted (21 dungeon rooms behind a d12, 23 genre quests behind a d6), so this is a chance to make at least one suit honest. If the pool needs trimming, quests **17–20** are the droppable tail; the three requested themes are fully covered by 9–16.

**Why no multi-stage engine.** `SideQuestHandler.createQuests()` emits exactly one quest, bound to one book. Making side quests multi-book means a `stages` array, per-stage reward resolution, deck-availability changes (is a quest "completed" at stage 1 or stage 3?), card rendering for partial progress, and archive display. `DungeonQuestHandler` is the only multi-quest handler in the codebase and it sidesteps all of this by pinning both quests to the *same* book. The dynamism the player wants — arcs that span books — is reachable through prompt text at a fraction of the risk: *The Long Table* asks for two books read concurrently, *The Examination Board* asks for a completed Bingo line. Both resolve as one submission with one linked book and one journal note. If multi-stage still looks worth building after playing these, it can be a follow-up with real usage behind it.

## Requirements

### R1: Twelve new side quests

Added to `assets/data/sideQuestsDetailed.json` as keys `9`–`20`, using the existing flat shape (`id`, `name`, `description`, `prompt`, `reward`, optional `hasLink`/`link`, `rewards`). No schema change.

Every prompt below was checked against all 8 existing side quests, all 21 dungeon room challenges, all 44 dungeon encounters, all 20 restoration completion prompts, and all 23 genre quests. Overlaps are called out where they exist.

---

#### The Night Bazaar

A market that assembles outside the Library gates and is gone by morning.

**9 · The Tongue-Tied Stall** — *item*
> A trader's crates are stamped in a script no one at the market can read.

**Prompt:** Read a book translated into your language, or written by an author who does not write in it.
**Reward:** Receive a **Polyglot's Earring**.
**`rewards`:** `{ xp: 0, inkDrops: 0, paperScraps: 0, items: ["Polyglot's Earring"] }`

*Fresh territory.* Nothing in the game touches translation or original language. Distinct from *Repair the Front Desk* (marginalized or BIPOC author), which is about who wrote it, not what language it was written in.

---

**10 · The Broken-Spine Barrow** — *XP / Paper / Blueprints*
> A barrow of secondhand books, every one carrying another reader's fingerprints in the margins.

**Prompt:** Read a book you did not buy new — borrowed, inherited, secondhand, or a library copy. Journal one guess about who held it before you.
**Reward:** +40 XP, +15 Paper Scraps, +15 Dusty Blueprints.
**`rewards`:** `{ xp: 40, inkDrops: 0, paperScraps: 15, blueprints: 15, items: [] }`

*Fresh territory.* Provenance is uncovered. Pairs with the Used Bookstore Haul shopping option added in 8MFG R5.

---

#### The Festival

Season-agnostic. Two events at one unnamed town festival — the players' own calendar decides which one.

**11 · The Lantern Procession** — *item*
> Every household sets a light in its window, and the whole town walks the same slow circuit, reciting as it goes.

**Prompt:** Listen to an audiobook from start to finish, or read a substantial portion of a book aloud — to someone, or to no one.
**Reward:** Receive a **Reciter's Lantern**.
**`rewards`:** `{ xp: 0, inkDrops: 0, paperScraps: 0, items: ["Reciter's Lantern"] }`

*Fresh territory.* The game has no audio mechanic at all — no quest, item, or buff acknowledges audiobooks, despite them being a large share of most readers' months.

**Note on the reframe:** the obvious festival prompt is "read a book with a festival or celebration in it," but that lands squarely on the `social` tag, which *The Ballroom* (dungeon room 14) and Dancing Shoes already claim. Recitation keeps the festival imagery and opens genuinely new ground.

---

**12 · The Contest of Small Hours** — *XP / Paper*
> By tradition the festival's last event is a wager: who can finish their tale before the braziers burn down?

**Prompt:** Finish a book in a single day, or read in one sitting at least twice as long as your usual. Journal what it cost you.
**Reward:** +60 XP, +20 Paper Scraps.
**`rewards`:** `{ xp: 60, inkDrops: 0, paperScraps: 20, items: [] }`

*Fresh territory.* Page Sprite and Tome of Potential care about *length*; nothing cares about *pace*.

---

#### Study Abroad

Both quests engage the External Curriculum tab, which currently has no quest, item, or reward hooked to it despite supporting prompt-based, book-club, and 5×5 bingo curriculums.

**13 · The Visiting Chair** — *XP / Paper / Blueprints*
> A scholar from an academy across the water offers you a seat in their term. Their reading list is not yours.

**Prompt:** Add an External Curriculum — a book club, a bingo board, or a prompt list — and read a book that satisfies one of its prompts.
**Reward:** +45 XP, +10 Paper Scraps, +20 Dusty Blueprints.
**`rewards`:** `{ xp: 45, inkDrops: 0, paperScraps: 10, blueprints: 20, items: [] }`

*Known mild overlap:* the restoration project *Restore the Main Card Catalog* asks for "a book from a popular reading list or book club." That is a one-time project on the Library Restoration page; this is a repeatable-by-design entry point into a whole feature tab. Judged acceptable — flag if it reads as a repeat in play.

---

**14 · The Examination Board** — *item*
> Three examiners, one card of prompts, and no allowance made for the reader you already are.

**Prompt:** Complete a full row, column, or diagonal of a Bingo curriculum — or three prompts within a single category of a prompt-based curriculum. Link the book that finished the line.
**Reward:** Receive a **Visiting Scholar's Seal**.
**`rewards`:** `{ xp: 0, inkDrops: 0, paperScraps: 0, items: ["Visiting Scholar's Seal"] }`

*This is the multi-book quest that needs no engine change.* The player reads three-to-five books over however long the line takes, then submits once with the finishing book linked. The prompt does the sequencing the schema doesn't.

---

#### The Road and the Harbour

**15 · The Bindery on Gallows Row** — *item*
> A shop where books are unmade and made again. The master binder is short a pair of hands and unfussy about whose.

**Prompt:** Read a book about a craft, a trade, or an art — how a thing is made, or the person who makes it.
**Reward:** Receive a **Binder's Bone Folder**.
**`rewards`:** `{ xp: 0, inkDrops: 0, paperScraps: 0, items: ["Binder's Bone Folder"] }`

*Fresh territory.* Craft and making are uncovered; the closest is *The Laboratory* (scientific discovery), which is a different register.

---

**16 · The Harbour Master's Manifest** — *XP / Paper / Blueprints*
> Crates arrive from ports you cannot place, and the manifest is three years out of date.

**Prompt:** Read a book set in a country or culture you have never read a book set in before.
**Reward:** +50 XP, +15 Paper Scraps, +10 Dusty Blueprints.
**`rewards`:** `{ xp: 50, inkDrops: 0, paperScraps: 15, blueprints: 10, items: [] }`

*Fresh territory,* and deliberately distinct from quest 9 — that one is about the language a book was written in, this one about where it is set.

---

**17 · The Waystation Inn** — *item*
> One room, one fire, and whoever the road brought in tonight.

**Prompt:** Read a book someone else chose for you — a gift, a recommendation, or a buddy read. Tell them what you thought of it.
**Reward:** Receive a **Traveller's Token**.
**`rewards`:** `{ xp: 0, inkDrops: 0, paperScraps: 0, items: ["Traveller's Token"] }`

*Fresh territory.* Nothing in the game acknowledges that books arrive through other people.

---

**18 · The Second Visit** — *XP / Paper*
> The pilgrim road loops back on itself. You have stood on this stone before, and you were shorter.

**Prompt:** Reread a book you loved. Journal one thing you noticed this time that you missed before.
**Reward:** +40 XP, +25 Paper Scraps.
**`rewards`:** `{ xp: 40, inkDrops: 0, paperScraps: 25, items: [] }`

*Fresh territory.* Every prompt in the game assumes a first read. Weighted toward Paper Scraps because the reward is the reflection.

---

**19 · The Lighthouse Keeper's Order** — *item*
> The keeper has not left the rock in eleven years and reads exactly one thing: whatever the supply boat brings first.

**Prompt:** Read a debut novel, or the earliest published work by an author you already admire.
**Reward:** Receive a **First-Light Lens**.
**`rewards`:** `{ xp: 0, inkDrops: 0, paperScraps: 0, items: ["First-Light Lens"] }`

*Fresh territory.* The `new-author` tag means new **to you**; a debut is the author's own first. Librarian's Compass covers the former and nothing covers the latter.

---

**20 · The Long Table** — *XP / Paper / Blueprints*
> At the crossroads inn they set one table and everyone eats from it, argument included.

**Prompt:** Read two books at the same time and finish both in the same month. Journal how each one changed the way you read the other.
**Reward:** +70 XP, +20 Paper Scraps, +15 Dusty Blueprints.
**`rewards`:** `{ xp: 70, inkDrops: 0, paperScraps: 20, blueprints: 15, items: [] }`

The pool's largest payout, for its largest ask. Scatter Brain Scarab rewards reading three at once as a *passive*; this is the first quest that asks for it. Submitted once with either book linked.

---

### R2: Six new items

Added to `assets/data/allItems.json`. All six are **ADD_FLAT** effects on the ADR-003 pipeline, equipped and passive, following the Crystal Sprite / Literary Medallion shape exactly. Passive values are roughly half of equipped, matching the existing convention.

**No item grants Ink Drops.** Two grant Dusty Blueprints — the first items in the game to do so. `ModifierPipeline._applyAddFlat()` reads `modifier.resource` generically and `Reward` already carries a `blueprints` field (`RewardCalculator.js:19`), so this needs no pipeline work.

| Item | Type | Tag | Equipped | Passive |
|---|---|---|---|---|
| Polyglot's Earring | Wearable | `translated` | +15 Paper | +7 Paper |
| Reciter's Lantern | Non-Wearable | `audiobook` | +15 Paper, +15 XP | +7 Paper, +7 XP |
| Visiting Scholar's Seal | Non-Wearable | `curriculum` | +10 Blueprints, +10 XP | +5 Blueprints, +5 XP |
| Binder's Bone Folder | Non-Wearable | `craft` | +10 Paper, +10 Blueprints | +5 Paper, +5 Blueprints |
| Traveller's Token | Wearable | `recommended` | +15 Paper, +15 XP | +7 Paper, +7 XP |
| First-Light Lens | Non-Wearable | `debut` | +20 XP, +10 Paper | +10 XP, +5 Paper |

Slot spread is 2 Wearable / 4 Non-Wearable and no Familiars — deliberate. Familiars are the dungeon's reward vocabulary (befriending creatures); side quests trade in objects, and every one of these is something handed to you at a market stall, a festival, or a door.

Each entry needs `id` (kebab-case), `name`, `type`, `img`, `bonus`, `passiveBonus`, empty `rewardModifier`/`passiveRewardModifier`, and the `effects` array. `bonus` and `passiveBonus` strings must state exactly what the effects pay — 8MFG R1 calls string/effect drift out as its own bug class and these are new strings with no excuse for it.

`rewards.md` is fully generated by `rewardsRenderer.js` from `allItems.json`, so the six items appear on the Rewards page with `#kebab-id` anchors automatically. The six item-granting quests get `hasLink`/`link` entries pointing at those anchors, matching quests 2–6 and 8.

### R3: Six new book tags

Added to `assets/data/bookTags.json`, all `category: "content"`:

| id | label |
|---|---|
| `translated` | Translated / Original Language |
| `audiobook` | Audiobook / Read Aloud |
| `curriculum` | External Curriculum |
| `craft` | Craft / Trade / Artistry |
| `recommended` | Recommended / Gifted |
| `debut` | Debut / First Work |

None collides with an existing tag, and none is currently claimed by any item — so each new item owns its tag outright rather than double-dipping alongside an existing bonus. The tag picker built in FWR.10 highlights applicable tags via `buildEffectContext`, so these light up for the new items with no picker changes.

### R4: Open the blueprint award path to side quests

Without this, the blueprints in quests 10, 13, 16, and 20 render on the card and in the receipt and are never paid.

`QuestRewardService.calculateBlueprintReward()` gains a `♣ Side Quest` branch that resolves the quest's `sideQuestId` through `data.sideQuestsById` and returns that entry's `rewards.blueprints ?? 0`. Falling back to a prompt-substring match is unnecessary here: `SideQuestHandler.createQuests()` has stamped `sideQuestId` on every side quest since it was written, and quests predating it carry no blueprint rewards to find.

Both call sites — `applyBlueprintRewardToQuest()` (writes into `quest.rewards`/`quest.receipt`) and `QuestController.awardBlueprintsForQuest()` (calls `addDustyBlueprints`) — already route through this one function, so the single branch fixes display and payment together.

### R5: Rules and rendering catch-up

- **`table-renderer.js:519`** hardcodes `for (let i = 1; i <= 8; i++)`. Quests 9–20 would be invisible on the rules table and in the side quests info drawer. Replace with iteration over `Object.keys(sideQuestsDetailed)`, so the table never needs touching again when the pool grows.
- **`core-mechanics.md:35`** — `**Clubs ♣ (d8):** Roll a d8 for a Side Quest` becomes **d20**.
- **`_includes/character-sheet/drawers/side-quests.html`** — the drawer heading reads `♣ Side Quests (Roll a d8)`; same change.
- **`core-mechanics.md`** — the **Earn Dusty Blueprints for** list currently reads Genre Quests and Extra Credit. Add *Completing certain Side Quests*. The **Earn Ink Drops by** list keeps its "Completing *Side Quests*" bullet — quests 1–8 still pay ink through their buffs, and only the new ones abstain.
- The drawer's journaling copy — "These involve interactions with the Library's denizens… ghosts, lost students, magical portraits" — is now wrong for more than half the deck. Widen it to cover the world beyond the doors: the bazaar's traders, the festival crowd, the visiting academy, the people met on the road.

`SideQuestDeckService.getAvailableSideQuests()` iterates `data.sideQuestsDetailed` by key with no bound, so **the deck needs no changes** — the twelve new quests become drawable the moment the JSON lands and `scripts/generate-data.js` runs.

### R6: Card and item art

Twelve side quest card images and six item images. `questCardImage.js` derives side quest filenames from the quest **name**, keeping the "The" prefix and slugifying — so *The Tongue-Tied Stall* resolves to `side-quests/the-tongue-tied-stall.png`. Item images follow `assets/images/rewards/<item-id>.png`.

**This is a maintainer task, not an implementation task.** Art lives in Supabase, not in the repo. The JSON can land ahead of the art; cards render with the content overlay and a missing image, which is ugly but not broken.

## Architecture

Deliberately thin. Eleven of the twelve quests are pure catalog entries resolved by machinery that already exists:

```
Draw Clubs
  → SideQuestDeckService.getAvailableSideQuests(state)     [unbounded key iteration — no change]
  → SideQuestHandler.createQuests()                        [no change]
  → RewardCalculator._getSideQuestRewards(prompt, id)      [no change — new Reward(sideQuest.rewards)
                                                            already picks up `blueprints`]
  → QuestController.completeQuest()
      · applyBlueprintRewardToQuest()  ─┐
      · awardBlueprintsForQuest()      ─┴─ both call calculateBlueprintReward()   [R4: one new branch]
  → ModifierPipeline.resolve()                             [no change — items are ordinary ADD_FLAT]
```

The one genuine code change is R4's branch. R5 is copy and a render loop.

### Files touched

**Data** (`assets/data/`): `sideQuestsDetailed.json` (R1), `allItems.json` (R2), `bookTags.json` (R3).

**Code** (`assets/js/`): `services/QuestRewardService.js` (R4), `table-renderer.js` (R5).

**Markup/content**: `core-mechanics.md`, `_includes/character-sheet/drawers/side-quests.html` (R5).

**Generated**: `assets/js/character-sheet/data.json-exports.js` via `node scripts/generate-data.js` — never edited by hand.

**Not touched:** `SideQuestDeckService.js`, `SideQuestHandler.js`, `RewardCalculator.js`, `cardRenderer.js`, `questDeckViewModel.js`, `rewards.md`.

## Testing

- `npm run validate-data` after the JSON edits. `validateSideQuests()` checks kebab-case IDs, ID uniqueness, and that every name in `rewards.items` resolves against `allItems.json` — which is exactly the guard that catches a typo between the six new items and the six quests that grant them.
- `tests/SideQuestDeckService.test.js` — extend so availability and completion hold across the full twenty-quest pool, not just the original eight.
- `tests/bookTags.test.js` / `tests/applicableTagIds.test.js` — the six new tags flow into tag-highlighting; assert they resolve and that each new item's `tagMatch` finds its tag.
- **New: a blueprint-award test for R4.** Complete a side quest carrying `rewards.blueprints` and assert `addDustyBlueprints()` is called with that value. This is the regression guard for the whole class — a side quest that displays blueprints it never pays.
- **New: an assertion that no new side quest and no new item grants `inkDrops`.** Cheap to write, and it pins the 8MFG currency contract against future additions to this file.
- `tests/dataContracts.test.js` and `tests/data.test.js` — confirm the new entries satisfy the existing shape contracts.
- Then `cd tests && npm test` and `node scripts/generate-data.js`.

Per AGENTS.md, the `QuestRewardService` and `table-renderer` changes are code and require a **subagent diff review** before handoff.

## Migration and Compatibility

None required. Side quests are read fresh from the catalog on every draw and every reward calculation. Completed quests 1–8 stay completed — `isSideQuestCompleted()` matches on `sideQuestId`, then exact prompt, then name substring, and none of the twelve new names or prompts collides with an existing one. A player mid-month with an active side quest is unaffected.

**Player-visible consequence:** the Clubs deck goes from empty to twelve cards immediately on deploy. Both blueprint-granting items are new acquisitions, so the existing blueprint balance is untouched.

## Out of Scope

- **Multi-stage side quests.** Discussed under Design Decisions; revisit with play data behind it.
- **Side quest art.** R6 — maintainer task, tracked separately.
- Retuning the rewards on side quests 1–8, including the two temp-buff quests that still pay Ink Drops.
- Correcting the stale dice notation on Spades (21 rooms behind a d12) and Hearts (23 genre quests behind a d6). Clubs is corrected here only because it is being changed anyway.
- Any External Curriculum feature work. Quests 13 and 14 use the tab exactly as it exists; they do not ask it to grow.
