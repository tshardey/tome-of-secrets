# Side Quest Expansion — Beyond the Library Doors — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add ten branching side quests, thirty-three branch prompts, five items and sixteen book tags to the Clubs deck, with a branch picker on the drawn card, a working Dusty Blueprint payout path, and a once-ever country register.

**Architecture:** Data-first. Nine of ten quests are catalog entries resolved by machinery that already exists. Three code seams are genuinely new: (1) a `branches` array on the side quest schema plus a branch-aware reward resolver, (2) an additive blueprint payout so authored and item-granted Blueprints actually reach the wallet, and (3) a `claimedCountries` state key behind a schema migration. Item bonuses are ordinary ADR-003 `ADD_FLAT` effects and need no pipeline work.

**Tech Stack:** Vanilla ES modules, Jekyll static site, Jest + jsdom (`tests/`), JSON catalogs in `assets/data/` compiled by `scripts/generate-data.js`, validated by `scripts/validate-data.js`.

**Spec:** [`docs/superpowers/specs/2026-08-30-4yqq-side-quest-expansion-draft3.md`](../specs/2026-08-30-4yqq-side-quest-expansion-draft3.md)

**Bead:** `tome-of-secrets-4yqq` — *Implement new side quests*

---

## Global Constraints

- **Zero Ink Drops.** No new quest, branch, or item may set `inkDrops` to anything but `0`, or declare an `effects` modifier with `"resource": "inkDrops"`. Task 10 pins this with a test.
- **No Worn Page verbs.** No new prompt may ask the player to read a DNF or to do anything else the Worn Page penalty table (`assets/data/curseTableDetailed.json`) can assign. Reward tables and penalty tables never reach for the same verb.
- **JSON is the source of truth.** After every edit under `assets/data/`, run `node scripts/generate-data.js`. `assets/js/character-sheet/data.json-exports.js` is generated and gitignored — never hand-edit it, never stage it.
- **Deterministic bonuses go through ADR-003.** Author machine-readable `effects` on the catalog entry; do not add bespoke branches to calculators or controllers. See `project-docs/ADR-003-tcg-modifier-pipeline.md`.
- **`bonus` / `passiveBonus` strings must state exactly what the `effects` pay.** String/effect drift is its own bug class.
- **New state keys must be registered in five places** or cloud sync silently drops them: `STORAGE_KEYS`, `CHARACTER_STATE_KEYS`, `createEmptyCharacterState()` (all in `storageKeys.js`), `dataValidator.js`, and a new `dataMigrator.js` version. `cloudSync.js` iterates `CHARACTER_STATE_KEYS` generically — no Supabase migration needed.
- **Tag match semantics:** `condition.tagMatch` is an array of groups. Tags within a group are ANDed; groups are ORed (`ui.js:1362` — `group.every(tag => bookTags.includes(tag))`). "borrowed OR secondhand OR gifted" is `[["borrowed"],["secondhand"],["gifted"]]`, **not** `[["borrowed","secondhand","gifted"]]`.
- **Beads workflow (AGENTS.md):** run `bd list` before any write to confirm the tracker is healthy. Create a child bead per task under `4yqq` before starting it, `bd update <id> --status in_progress` when you pick it up, and close it only after the full suite passes **and** a subagent diff review passes. Run `bd export --no-memories -o .beads/issues.jsonl` and `git add` it whenever issue state changes.
- **Commits:** AGENTS.md tells agents not to run `git commit`/`git push`; the maintainer's standing instruction to this session permits committing and pushing on a **feature branch** (never to `main`). This plan follows the maintainer's instruction — work on `4yqq-side-quest-expansion` and commit per task. Flag the AGENTS.md discrepancy in the handoff so it can be reconciled.
- **No co-author trailers** in commit messages.

---

## File Structure

**Create**
- `tests/sideQuestBranches.test.js` — branch schema resolution and branch-aware rewards
- `tests/sideQuestBlueprints.test.js` — the blueprint payout regression guard
- `tests/claimedCountries.test.js` — register state, validation, migration

**Modify — data**
- `assets/data/bookTags.json` — 16 new tags
- `assets/data/allItems.json` — 5 new items
- `assets/data/sideQuestsDetailed.json` — 10 new quests, keys `9`–`18`

**Modify — code**
- `assets/js/services/QuestRewardService.js` — additive blueprint semantics
- `assets/js/controllers/QuestController.js` — pay the resolved blueprint total; claim country on completion
- `assets/js/services/RewardCalculator.js` — branch-aware side quest rewards
- `assets/js/viewModels/questDeckViewModel.js` — surface branches on the drawn card
- `assets/js/character-sheet/cardRenderer.js` — branch picker on the side quest card
- `assets/js/controllers/SideQuestDeckController.js` — read the chosen branch, stamp it on the quest
- `assets/js/character-sheet/storageKeys.js` — `CLAIMED_COUNTRIES`
- `assets/js/character-sheet/dataValidator.js` — validate the register, bump `SCHEMA_VERSION` to 17
- `assets/js/character-sheet/dataMigrator.js` — `migrateToVersion17`
- `assets/js/character-sheet/stateAdapter.js` — register accessors + event
- `assets/js/character-sheet/ui.js` — `actionDisplayName` entry for the Fox
- `assets/js/table-renderer.js` — iterate the catalog instead of `1..8`; render branches
- `scripts/validate-data.js` — validate the branch and stake shapes

**Modify — content**
- `core-mechanics.md` — Clubs dice notation, Blueprint sources list
- `_includes/character-sheet/drawers/side-quests.html` — heading, journaling copy, register panel
- `assets/css/card-draw.css` — branch picker styles
- `docs/superpowers/specs/2026-08-29-4yqq-side-quest-expansion-design.md` — mark superseded

**Not touched:** `SideQuestDeckService.js` (its key iteration is already unbounded), `SideQuestHandler.js`, `ModifierPipeline.js`, `effectSchema.js`, `rewards.md` (generated by `rewardsRenderer.js` from `allItems.json`).

---

## Task Order and Rationale

Tasks 1–3 are independent and land pure additive changes with no user-visible risk. Task 4 opens the schema; Task 5 pours the content in; Task 6 makes branches selectable. Task 7 is the register, self-contained behind a migration. Tasks 8–10 are catch-up, contract tests, and handoff.

Task 5 (the content) depends on Tasks 2, 3 and 4 because `validate-data` will error on an item or tag that does not exist yet.

---

### Task 1: Make Dusty Blueprints actually reach the wallet

Today `QuestRewardService.calculateBlueprintReward()` branches only on `♥ Organize the Stacks` and `⭐ Extra Credit`, and `QuestController.awardBlueprintsForQuest()` pays *that* function's return value rather than the reward object. Two consequences: a side quest that authors `rewards.blueprints` renders the number on the card and in the receipt and **never pays it**, and item-granted Blueprints from the ADR-003 pipeline are stomped by `applyBlueprintRewardToQuest()` before anyone reads them.

The fix is to make `applyBlueprintRewardToQuest` **additive** (catalog base + whatever the pipeline resolved) and make `awardBlueprintsForQuest` pay the resolved total. All three `awardBlueprintsForQuest` call sites in `QuestController.js` (lines 724, 1188, 1348) are already preceded by an `applyBlueprintRewardToQuest` call (lines 706, 1153, 1319), so the total is always present by the time it is paid.

Side quest base Blueprints need **no** new branch in `calculateBlueprintReward` — `RewardCalculator._getSideQuestRewards()` already does `new Reward(sideQuest.rewards)` and `Reward` already carries a `blueprints` field, so the base is in the pipeline input. Adding a branch would double-count.

**Files:**
- Modify: `assets/js/services/QuestRewardService.js:75-90`
- Modify: `assets/js/controllers/QuestController.js:1242-1251`
- Test: `tests/sideQuestBlueprints.test.js` (create)

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: `applyBlueprintRewardToQuest(quest) -> number` now returns the **total** (base + pipeline), and mutates `quest.rewards.blueprints` / `quest.receipt.final.blueprints` to that total. `QuestController.awardBlueprintsForQuest(quest) -> number` pays `quest.rewards.blueprints`. Task 5's authored `rewards.blueprints` values and Task 3's blueprint-granting items both rely on this.

- [ ] **Step 1: Write the failing test**

Create `tests/sideQuestBlueprints.test.js`:

```javascript
/**
 * Regression guard: Blueprints that render must also be paid.
 *
 * Two historical bugs are pinned here:
 *  1. A side quest authoring `rewards.blueprints` showed the number and never paid it,
 *     because calculateBlueprintReward() returned 0 for '♣ Side Quest'.
 *  2. applyBlueprintRewardToQuest() overwrote pipeline-resolved Blueprints (from item
 *     ADD_FLAT effects) with the catalog base, discarding the item bonus.
 */
import { applyBlueprintRewardToQuest, calculateBlueprintReward } from '../assets/js/services/QuestRewardService.js';

describe('blueprint payout path', () => {
    test('a side quest keeps the Blueprints its rewards object already carries', () => {
        const quest = {
            type: '♣ Side Quest',
            sideQuestId: 'side-quest-hagglers-row',
            prompt: "Haggler's Row: Read a book you borrowed.",
            rewards: { xp: 0, inkDrops: 0, paperScraps: 0, blueprints: 10, items: [] },
            receipt: {
                base: { xp: 0, inkDrops: 0, paperScraps: 0, blueprints: 10 },
                modifiers: [],
                final: { xp: 0, inkDrops: 0, paperScraps: 0, blueprints: 10 }
            }
        };

        const total = applyBlueprintRewardToQuest(quest);

        expect(total).toBe(10);
        expect(quest.rewards.blueprints).toBe(10);
        expect(quest.receipt.final.blueprints).toBe(10);
    });

    test('item-granted Blueprints are added to the catalog base, not replaced by it', () => {
        // A genre quest whose catalog base is resolved by calculateBlueprintReward,
        // read alongside an equipped Haggler's Ledger that added +20 through the pipeline.
        const quest = {
            type: '♥ Organize the Stacks',
            prompt: 'Fantasy: Read a fantasy novel.',
            rewards: { xp: 0, inkDrops: 0, paperScraps: 0, blueprints: 20, items: [] },
            receipt: {
                base: { xp: 0, inkDrops: 0, paperScraps: 0, blueprints: 0 },
                modifiers: [],
                final: { xp: 0, inkDrops: 0, paperScraps: 0, blueprints: 20 }
            }
        };

        const catalogBase = calculateBlueprintReward(quest);
        const total = applyBlueprintRewardToQuest(quest);

        expect(catalogBase).toBeGreaterThan(0);
        expect(total).toBe(20 + catalogBase);
        expect(quest.rewards.blueprints).toBe(20 + catalogBase);
    });

    test('a quest with no Blueprints anywhere stays at zero', () => {
        const quest = {
            type: '♠ Dungeon Crawl',
            prompt: 'Room 3',
            rewards: { xp: 50, inkDrops: 0, paperScraps: 0, blueprints: 0, items: [] }
        };

        expect(applyBlueprintRewardToQuest(quest)).toBe(0);
        expect(quest.rewards.blueprints).toBe(0);
    });
});
```

- [ ] **Step 2: Run the test and watch it fail**

```bash
cd tests && npx jest sideQuestBlueprints --verbose
```

Expected: the first two tests FAIL. Test 1 fails because `applyBlueprintRewardToQuest` returns `0` for a side quest (the `if (blueprintReward > 0)` guard skips the write, but the return value is `0`). Test 2 fails because the catalog base **replaces** `20` instead of adding to it.

- [ ] **Step 3: Make `applyBlueprintRewardToQuest` additive**

In `assets/js/services/QuestRewardService.js`, replace the whole `applyBlueprintRewardToQuest` function:

```javascript
/**
 * Apply the blueprint reward to a quest's reward object and receipt.
 *
 * Additive by design: `calculateBlueprintReward()` returns the *catalog base* for quest
 * types that carry one outside their rewards object (genre quests, extra credit), while
 * `quest.rewards.blueprints` already holds whatever the ADR-003 pipeline resolved —
 * the side quest's authored base plus any item ADD_FLAT bonuses. Overwriting instead of
 * adding would discard the item bonus; adding a '♣ Side Quest' branch to
 * calculateBlueprintReward() would double-count the authored base, which
 * RewardCalculator._getSideQuestRewards() has already put into the Reward.
 *
 * @param {Object} quest - Quest object (mutated: rewards.blueprints and receipt totals)
 * @returns {number} Total blueprints the quest pays
 */
export function applyBlueprintRewardToQuest(quest) {
    const catalogBase = calculateBlueprintReward(quest);
    const resolved = Number(quest?.rewards?.blueprints) || 0;
    const total = resolved + catalogBase;

    if (quest.rewards) {
        quest.rewards.blueprints = total;
    }

    if (quest.receipt) {
        quest.receipt.base.blueprints = (Number(quest.receipt.base.blueprints) || 0) + catalogBase;
        quest.receipt.final.blueprints = total;
    }

    return total;
}
```

- [ ] **Step 4: Make the controller pay the resolved total**

In `assets/js/controllers/QuestController.js`, replace `awardBlueprintsForQuest` (line 1242):

```javascript
    /**
     * Award the quest's Dusty Blueprints to the wallet.
     *
     * Reads the resolved total off the quest rather than recomputing it: every call site
     * runs applyBlueprintRewardToQuest() first, which folds the catalog base together with
     * pipeline-granted Blueprints from equipped and passive items.
     *
     * @param {Object} quest - Quest already passed through applyBlueprintRewardToQuest()
     * @returns {number} Amount awarded
     */
    awardBlueprintsForQuest(quest) {
        const { stateAdapter } = this;
        const amount = Number(quest?.rewards?.blueprints) || 0;

        if (amount > 0) {
            stateAdapter.addDustyBlueprints(amount);
        }

        return amount;
    }
```

- [ ] **Step 5: Run the new test and the existing reward suites**

```bash
cd tests && npx jest sideQuestBlueprints RewardCalculator restoration QuestRewardService --verbose
```

Expected: all PASS. If an existing test asserts that `awardBlueprintsForQuest` returns `calculateBlueprintReward(quest)` for a genre quest with no pipeline bonus, it still holds — `resolved` is `0` there, so the total equals the catalog base.

- [ ] **Step 6: Run the full suite**

```bash
cd tests && npm test
```

Expected: PASS. This change touches the reward path for every quest type, so a green full suite is the gate, not the targeted run.

- [ ] **Step 7: Commit**

```bash
git checkout -b 4yqq-side-quest-expansion
git add assets/js/services/QuestRewardService.js assets/js/controllers/QuestController.js tests/sideQuestBlueprints.test.js
git commit -m "fix(4yqq): pay resolved Dusty Blueprints instead of recomputing the catalog base

applyBlueprintRewardToQuest() now adds the catalog base to whatever the ADR-003
pipeline resolved, and awardBlueprintsForQuest() pays that total. Side quests can
now carry Blueprints in their rewards object, and item ADD_FLAT blueprint bonuses
are no longer discarded before they reach the wallet."
```

---

### Task 2: Sixteen new book tags

The tags drive the five new items' `tagMatch` conditions and light up in the tag picker built in FWR.10 with no picker changes. `bookTags.json` is a flat array of `{ id, label, category }`.

**Files:**
- Modify: `assets/data/bookTags.json`
- Test: `tests/bookTags.test.js` (existing — extend)

**Interfaces:**
- Consumes: nothing.
- Produces: tag ids `borrowed`, `secondhand`, `gifted`, `genre-stretch`, `translated`, `new-country`, `untranslated`, `recommended`, `re-read`, `inherited`, `mended`, `epistolary`, `poetry`, `illustrated`, `short-form`, `audio`. Task 3's items reference these in `condition.tagMatch`.

- [ ] **Step 1: Write the failing test**

Append to `tests/bookTags.test.js`:

```javascript
describe('4yqq expansion tags', () => {
    const EXPANSION_TAGS = [
        'borrowed', 'secondhand', 'gifted', 'genre-stretch',
        'translated', 'new-country', 'untranslated', 'recommended',
        're-read', 'inherited', 'mended', 'epistolary',
        'poetry', 'illustrated', 'short-form', 'audio'
    ];

    test('every expansion tag exists with a label and a category', () => {
        const byId = new Map(bookTags.map(tag => [tag.id, tag]));
        for (const id of EXPANSION_TAGS) {
            const tag = byId.get(id);
            expect(tag).toBeDefined();
            expect(typeof tag.label).toBe('string');
            expect(tag.label.length).toBeGreaterThan(0);
            expect(['provenance', 'agency', 'form', 'content']).toContain(tag.category);
        }
    });

    test('tag ids are unique across the whole vocabulary', () => {
        const ids = bookTags.map(tag => tag.id);
        expect(new Set(ids).size).toBe(ids.length);
    });
});
```

If `tests/bookTags.test.js` does not already import `bookTags`, add at the top of the file:

```javascript
import bookTags from '../assets/data/bookTags.json';
```

- [ ] **Step 2: Run the test and watch it fail**

```bash
cd tests && npx jest bookTags --verbose
```

Expected: FAIL — `expect(tag).toBeDefined()` receives `undefined` for `borrowed`.

- [ ] **Step 3: Add the tags**

Append these sixteen objects to the array in `assets/data/bookTags.json`, before the closing `]`. Note the three new categories — `provenance`, `agency` and `form` are the axes the spec identifies as unclaimed; keeping them out of `content` makes the picker groupable later.

```json
  {
    "id": "borrowed",
    "label": "Borrowed Copy",
    "category": "provenance"
  },
  {
    "id": "secondhand",
    "label": "Bought Used",
    "category": "provenance"
  },
  {
    "id": "gifted",
    "label": "Gifted / Given",
    "category": "provenance"
  },
  {
    "id": "inherited",
    "label": "Inherited / Someone Else's",
    "category": "provenance"
  },
  {
    "id": "mended",
    "label": "Damaged / Ex-Library / Marked",
    "category": "provenance"
  },
  {
    "id": "re-read",
    "label": "Re-Read",
    "category": "provenance"
  },
  {
    "id": "recommended",
    "label": "Chosen by Someone Else",
    "category": "agency"
  },
  {
    "id": "genre-stretch",
    "label": "Outside Your Usual Genres",
    "category": "agency"
  },
  {
    "id": "translated",
    "label": "Translated",
    "category": "content"
  },
  {
    "id": "new-country",
    "label": "Author from a New-to-You Country",
    "category": "content"
  },
  {
    "id": "untranslated",
    "label": "Untranslated Words in the Text",
    "category": "content"
  },
  {
    "id": "epistolary",
    "label": "Letters / Documents / Found Records",
    "category": "form"
  },
  {
    "id": "poetry",
    "label": "Poetry / Verse",
    "category": "form"
  },
  {
    "id": "illustrated",
    "label": "Graphic Novel / Illustrated",
    "category": "form"
  },
  {
    "id": "short-form",
    "label": "Short Stories / Essays / Novella",
    "category": "form"
  },
  {
    "id": "audio",
    "label": "Audiobook",
    "category": "form"
  }
```

- [ ] **Step 4: Regenerate and validate**

```bash
node scripts/generate-data.js
cd tests && npm run validate-data
```

Expected: generator prints the export summary; validator reports no new errors.

- [ ] **Step 5: Run the tests**

```bash
cd tests && npx jest bookTags applicableTagIds itemTagDisplay --verbose
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add assets/data/bookTags.json tests/bookTags.test.js
git commit -m "feat(4yqq): add sixteen provenance, agency and form book tags

Provenance, agency and form are the three axes the expansion design identifies as
entirely unclaimed by existing quests, rooms, projects and items. Three new tag
categories keep them separable from the existing genre/content vocabulary."
```

---

### Task 3: Five new items

All five are ordinary ADR-003 entries: `ADD_FLAT` effects on `ON_QUEST_COMPLETED`, one equipped and one passive per resource, matching the Librarian's Compass shape exactly. `ModifierPipeline._applyAddFlat()` reads `modifier.resource` generically and `Reward` already carries `blueprints`, so no pipeline work is needed. The Crossroads Fox adds one `ON_ACTIVATE` effect, which is a declarative label plus a cooldown — the player performs the action; `ui.js` only needs a display name.

`rewards.md` is generated from `allItems.json` by `rewardsRenderer.js`, so all five appear on the Rewards page at `#<kebab-id>` automatically.

**Files:**
- Modify: `assets/data/allItems.json`
- Modify: `assets/js/character-sheet/ui.js:1149-1162` (`actionDisplayName`)
- Test: `tests/dataContracts.test.js` (existing — extend)

**Interfaces:**
- Consumes: tag ids from Task 2.
- Produces: item names `The Haggler's Ledger`, `The Reveler's Mask`, `Visiting Scholar's Sigil`, `The Crossroads Fox`, `The Mender's Thread`. Task 5's quests reference these **by exact name** in `rewards.items` — `validateSideQuests()` warns on any mismatch.

- [ ] **Step 1: Write the failing test**

Append to `tests/dataContracts.test.js`:

```javascript
describe('4yqq expansion items', () => {
    const EXPANSION_ITEMS = [
        "The Haggler's Ledger",
        "The Reveler's Mask",
        "Visiting Scholar's Sigil",
        "The Crossroads Fox",
        "The Mender's Thread"
    ];

    test('all five exist with a kebab-case id, a type, and an effects array', () => {
        const items = loadJson('allItems.json');
        for (const name of EXPANSION_ITEMS) {
            const item = items[name];
            expect(item).toBeDefined();
            expect(item.id).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
            expect(['Wearable', 'Non-Wearable', 'Familiar']).toContain(item.type);
            expect(Array.isArray(item.effects)).toBe(true);
            expect(item.effects.length).toBeGreaterThan(0);
        }
    });

    test('no expansion item grants Ink Drops', () => {
        const items = loadJson('allItems.json');
        for (const name of EXPANSION_ITEMS) {
            for (const effect of items[name].effects) {
                expect(effect.modifier.resource).not.toBe('inkDrops');
            }
        }
    });

    test('every tag an expansion item matches on exists in bookTags.json', () => {
        const items = loadJson('allItems.json');
        const tagIds = new Set(loadJson('bookTags.json').map(tag => tag.id));
        for (const name of EXPANSION_ITEMS) {
            for (const effect of items[name].effects) {
                for (const group of effect.condition?.tagMatch ?? []) {
                    for (const tag of group) {
                        expect(tagIds.has(tag)).toBe(true);
                    }
                }
            }
        }
    });
});
```

`loadJson` is already defined in `tests/dataContracts.test.js` — reuse it rather than adding another loader.

- [ ] **Step 2: Run the test and watch it fail**

```bash
cd tests && npx jest dataContracts --verbose
```

Expected: FAIL — `expect(item).toBeDefined()` receives `undefined` for `The Haggler's Ledger`.

- [ ] **Step 3: Add the items**

Add these five entries to `assets/data/allItems.json`. `tagMatch` uses one single-tag group per accepted tag so the groups OR together.

```json
  "The Haggler's Ledger": {
    "id": "hagglers-ledger",
    "name": "The Haggler's Ledger",
    "type": "Non-Wearable",
    "img": "assets/images/rewards/hagglers-ledger.png",
    "bonus": "Books you borrowed, bought used, or were given grant +20 Dusty Blueprints.",
    "passiveBonus": "Books you borrowed, bought used, or were given grant +10 Dusty Blueprints (passive).",
    "rewardModifier": {},
    "passiveRewardModifier": {},
    "effects": [
      {
        "trigger": "ON_QUEST_COMPLETED",
        "condition": { "tagMatch": [["borrowed"], ["secondhand"], ["gifted"]] },
        "modifier": { "type": "ADD_FLAT", "resource": "blueprints", "value": 20 },
        "slot": "equipped"
      },
      {
        "trigger": "ON_QUEST_COMPLETED",
        "condition": { "tagMatch": [["borrowed"], ["secondhand"], ["gifted"]] },
        "modifier": { "type": "ADD_FLAT", "resource": "blueprints", "value": 10 },
        "slot": "passive"
      }
    ]
  },
  "The Reveler's Mask": {
    "id": "revelers-mask",
    "name": "The Reveler's Mask",
    "type": "Wearable",
    "img": "assets/images/rewards/revelers-mask.png",
    "bonus": "Books outside your usual genres grant +25 XP and +10 Paper Scraps.",
    "passiveBonus": "Books outside your usual genres grant +12 XP (passive).",
    "rewardModifier": {},
    "passiveRewardModifier": {},
    "effects": [
      {
        "trigger": "ON_QUEST_COMPLETED",
        "condition": { "tagMatch": [["genre-stretch"]] },
        "modifier": { "type": "ADD_FLAT", "resource": "xp", "value": 25 },
        "slot": "equipped"
      },
      {
        "trigger": "ON_QUEST_COMPLETED",
        "condition": { "tagMatch": [["genre-stretch"]] },
        "modifier": { "type": "ADD_FLAT", "resource": "paperScraps", "value": 10 },
        "slot": "equipped"
      },
      {
        "trigger": "ON_QUEST_COMPLETED",
        "condition": { "tagMatch": [["genre-stretch"]] },
        "modifier": { "type": "ADD_FLAT", "resource": "xp", "value": 12 },
        "slot": "passive"
      }
    ]
  },
  "Visiting Scholar's Sigil": {
    "id": "visiting-scholars-sigil",
    "name": "Visiting Scholar's Sigil",
    "type": "Wearable",
    "img": "assets/images/rewards/visiting-scholars-sigil.png",
    "bonus": "Translated books, or books by an author from a country new to you, grant +25 XP and +10 Paper Scraps.",
    "passiveBonus": "Translated books, or books by an author from a country new to you, grant +12 XP and +5 Paper Scraps (passive).",
    "rewardModifier": {},
    "passiveRewardModifier": {},
    "effects": [
      {
        "trigger": "ON_QUEST_COMPLETED",
        "condition": { "tagMatch": [["translated"], ["new-country"]] },
        "modifier": { "type": "ADD_FLAT", "resource": "xp", "value": 25 },
        "slot": "equipped"
      },
      {
        "trigger": "ON_QUEST_COMPLETED",
        "condition": { "tagMatch": [["translated"], ["new-country"]] },
        "modifier": { "type": "ADD_FLAT", "resource": "paperScraps", "value": 10 },
        "slot": "equipped"
      },
      {
        "trigger": "ON_QUEST_COMPLETED",
        "condition": { "tagMatch": [["translated"], ["new-country"]] },
        "modifier": { "type": "ADD_FLAT", "resource": "xp", "value": 12 },
        "slot": "passive"
      },
      {
        "trigger": "ON_QUEST_COMPLETED",
        "condition": { "tagMatch": [["translated"], ["new-country"]] },
        "modifier": { "type": "ADD_FLAT", "resource": "paperScraps", "value": 5 },
        "slot": "passive"
      }
    ]
  },
  "The Crossroads Fox": {
    "id": "crossroads-fox",
    "name": "The Crossroads Fox",
    "type": "Familiar",
    "img": "assets/images/rewards/crossroads-fox.png",
    "bonus": "Books recommended by another person grant +20 XP and +10 Paper Scraps. Once a month the Fox may choose for you: pick from your TBR at random and take +30 XP for accepting.",
    "passiveBonus": "Books recommended by another person grant +10 XP (passive). Once every 2 months the Fox may choose for you.",
    "rewardModifier": {},
    "passiveRewardModifier": {},
    "effects": [
      {
        "trigger": "ON_QUEST_COMPLETED",
        "condition": { "tagMatch": [["recommended"]] },
        "modifier": { "type": "ADD_FLAT", "resource": "xp", "value": 20 },
        "slot": "equipped"
      },
      {
        "trigger": "ON_QUEST_COMPLETED",
        "condition": { "tagMatch": [["recommended"]] },
        "modifier": { "type": "ADD_FLAT", "resource": "paperScraps", "value": 10 },
        "slot": "equipped"
      },
      {
        "trigger": "ON_QUEST_COMPLETED",
        "condition": { "tagMatch": [["recommended"]] },
        "modifier": { "type": "ADD_FLAT", "resource": "xp", "value": 10 },
        "slot": "passive"
      },
      {
        "trigger": "ON_ACTIVATE",
        "modifier": { "type": "ACTIVATE", "action": "fox_chooses_from_tbr" },
        "cooldown": "monthly"
      }
    ]
  },
  "The Mender's Thread": {
    "id": "menders-thread",
    "name": "The Mender's Thread",
    "type": "Non-Wearable",
    "img": "assets/images/rewards/menders-thread.png",
    "bonus": "Re-reads, inherited books, and damaged or ex-library copies grant +25 Dusty Blueprints.",
    "passiveBonus": "Re-reads, inherited books, and damaged or ex-library copies grant +12 Dusty Blueprints (passive).",
    "rewardModifier": {},
    "passiveRewardModifier": {},
    "effects": [
      {
        "trigger": "ON_QUEST_COMPLETED",
        "condition": { "tagMatch": [["mended"], ["re-read"], ["inherited"]] },
        "modifier": { "type": "ADD_FLAT", "resource": "blueprints", "value": 25 },
        "slot": "equipped"
      },
      {
        "trigger": "ON_QUEST_COMPLETED",
        "condition": { "tagMatch": [["mended"], ["re-read"], ["inherited"]] },
        "modifier": { "type": "ADD_FLAT", "resource": "blueprints", "value": 12 },
        "slot": "passive"
      }
    ]
  }
```

- [ ] **Step 4: Give the Fox's activation a display name**

In `assets/js/character-sheet/ui.js`, add one entry to the `names` map inside `actionDisplayName` (around line 1150), after `same_book_room_and_encounter`:

```javascript
        same_book_room_and_encounter: 'Same book for room + encounter',
        fox_chooses_from_tbr: 'Fox chooses from your TBR'
```

- [ ] **Step 5: Regenerate, validate, and run the tests**

```bash
node scripts/generate-data.js
cd tests && npm run validate-data
cd tests && npx jest dataContracts activationCooldown itemTagDisplay realDataIntegration --verbose
```

Expected: PASS. `validate-data` may warn about missing images — art is a maintainer task and the images are not in the repo (`git ls-files assets/images` is empty). Warnings are acceptable; errors are not.

- [ ] **Step 6: Run the full suite**

```bash
cd tests && npm test
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add assets/data/allItems.json assets/js/character-sheet/ui.js tests/dataContracts.test.js
git commit -m "feat(4yqq): add the five Beyond the Library Doors items

Two of the five grant Dusty Blueprints, which had exactly one item source in the
game against a 615-Blueprint restoration expansion. All five are ordinary ADR-003
ADD_FLAT effects; the Crossroads Fox adds the first Familiar with an activated
ability."
```

---

### Task 4: Branch schema and branch-aware reward resolution

Add `locale`, `branchType`, `rollInstruction`, `branches` and `stake` to the side quest shape, and teach `RewardCalculator` to resolve a branch by key. The flat `prompt` / `reward` / `rewards` fields stay populated with branch A's values so any renderer that does not know about branches still shows a working quest.

`stake` is carried as data only — nothing reads it this release. It is authored now so the follow-up bead has content to build against.

**Files:**
- Modify: `assets/js/services/RewardCalculator.js:139-170` (`_getSideQuestRewards`)
- Modify: `scripts/validate-data.js:153-210` (`validateSideQuests`)
- Test: `tests/sideQuestBranches.test.js` (create)

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `RewardCalculator.getBaseRewards('♣ Side Quest', prompt, { sideQuestId, branchKey }) -> Reward` — when `branchKey` matches a branch on the resolved quest, the branch's `rewards` are used; otherwise the quest's flat `rewards` are used.
  - Side quest catalog shape, consumed by Tasks 5, 6 and 8:

```javascript
{
  id: string,                      // kebab-case, unique
  name: string,
  locale: string,                  // kebab-case locale id, e.g. "the-ninefold-bazaar"
  description: string,
  prompt: string,                  // fallback: branch A / roll 1
  reward: string,                  // fallback: branch A / roll 1
  rewards: {                       // fallback: branch A / roll 1
    xp: number, inkDrops: number, paperScraps: number,
    blueprints: number, items: string[]
  },
  hasLink?: boolean,
  link?: { text: string, url: string },
  branchType: 'choice' | 'roll',
  rollInstruction: string | null,  // e.g. "Roll a d6:"
  branches: Array<{
    key: string,                   // 'A'|'B'|'C'|'D' for choice, '1'|'2'|'3'|'4' for roll
    roll: string | null,           // display range for roll branches, e.g. "1-2"
    name: string,
    prompt: string,
    reward: string,
    rewards: { xp, inkDrops, paperScraps, blueprints, items },
    requiresCountry?: boolean      // Task 7: this branch takes a country for the register
  }>,
  stake?: {                        // inert this release
    name: string,
    declareBefore: boolean,
    condition: string,
    onSuccess: object,
    onFailure: object
  }
}
```

- [ ] **Step 1: Write the failing test**

Create `tests/sideQuestBranches.test.js`:

```javascript
/**
 * Branch resolution for side quests.
 *
 * A branching side quest is still one quest bound to one book: the branch decides which
 * prompt the player reads against and which payout they take, and nothing else.
 */
// Named with a `mock` prefix: babel-plugin-jest-hoist lifts jest.mock() above other
// statements and only allows the factory to close over variables matching /^mock/i.
const mockBranchingQuest = {
    id: 'side-quest-test-branching',
    name: 'The Test Stall',
    locale: 'the-test-bazaar',
    description: 'A stall that exists only in tests.',
    prompt: 'Branch A prompt.',
    reward: 'Branch A reward.',
    rewards: { xp: 10, inkDrops: 0, paperScraps: 0, blueprints: 0, items: [] },
    branchType: 'choice',
    rollInstruction: null,
    branches: [
        {
            key: 'A',
            roll: null,
            name: 'First',
            prompt: 'Branch A prompt.',
            reward: 'Branch A reward.',
            rewards: { xp: 10, inkDrops: 0, paperScraps: 0, blueprints: 0, items: [] }
        },
        {
            key: 'B',
            roll: null,
            name: 'Second',
            prompt: 'Branch B prompt.',
            reward: 'Branch B reward.',
            rewards: { xp: 0, inkDrops: 0, paperScraps: 5, blueprints: 15, items: [] }
        }
    ]
};

// Follows the repo convention (see tests/bonusCardState.test.js): jest.mock with
// requireActual, not unstable_mockModule — babel-jest transpiles these tests to CJS.
jest.mock('../assets/js/character-sheet/data.js', () => {
    const originalModule = jest.requireActual('../assets/js/character-sheet/data.js');
    return {
        ...originalModule,
        sideQuestsDetailed: { 99: mockBranchingQuest },
        sideQuestsById: new Map([[mockBranchingQuest.id, mockBranchingQuest]])
    };
});

const { RewardCalculator } = require('../assets/js/services/RewardCalculator.js');

describe('branch-aware side quest rewards', () => {
    test('a branchKey selects that branch\'s rewards', () => {
        const reward = RewardCalculator.getBaseRewards('♣ Side Quest', 'The Test Stall: Branch B prompt.', {
            sideQuestId: mockBranchingQuest.id,
            branchKey: 'B'
        });

        expect(reward.xp).toBe(0);
        expect(reward.paperScraps).toBe(5);
        expect(reward.blueprints).toBe(15);
        expect(reward.receipt.base.blueprints).toBe(15);
        expect(reward.receipt.final.blueprints).toBe(15);
    });

    test('no branchKey falls back to the flat rewards (branch A)', () => {
        const reward = RewardCalculator.getBaseRewards('♣ Side Quest', 'The Test Stall: Branch A prompt.', {
            sideQuestId: mockBranchingQuest.id
        });

        expect(reward.xp).toBe(10);
        expect(reward.blueprints).toBe(0);
    });

    test('an unknown branchKey falls back to the flat rewards rather than throwing', () => {
        const reward = RewardCalculator.getBaseRewards('♣ Side Quest', 'The Test Stall: Branch A prompt.', {
            sideQuestId: mockBranchingQuest.id,
            branchKey: 'Z'
        });

        expect(reward.xp).toBe(10);
    });
});
```

- [ ] **Step 2: Run the test and watch it fail**

```bash
cd tests && npx jest sideQuestBranches --verbose
```

Expected: the first test FAILS with `expect(reward.blueprints).toBe(15)` receiving `0` — `_getSideQuestRewards` ignores `branchKey` and reads the flat rewards.

- [ ] **Step 3: Teach the resolver about branches**

In `assets/js/services/RewardCalculator.js`, thread `branchKey` through `getBaseRewards`. In the destructure at the top of `getBaseRewards` (around line 98), add `branchKey`:

```javascript
        const {
            isEncounter = false,
            roomNumber = null,
            encounterName = null,
            isBefriend = true,
            sideQuestId = null,
            branchKey = null
        } = options;
```

and change the side quest dispatch (around line 121):

```javascript
        // Side Quests
        else if (type === '♣ Side Quest') {
            reward = this._getSideQuestRewards(prompt, sideQuestId, branchKey);
        }
```

Then replace `_getSideQuestRewards` with:

```javascript
    /**
     * Resolve the rewards for a side quest, honouring a chosen branch when there is one.
     *
     * Branching quests keep their flat prompt/reward/rewards fields populated with branch A's
     * values, so a renderer or a stored quest that predates branches still resolves correctly.
     *
     * @param {string} prompt
     * @param {string|null} sideQuestId
     * @param {string|null} branchKey - 'A'..'D' or '1'..'4'; null resolves the flat rewards
     * @private
     */
    static _getSideQuestRewards(prompt, sideQuestId = null, branchKey = null) {
        const build = (rewards) => {
            const reward = new Reward(rewards);
            reward.receipt.base.xp = reward.xp;
            reward.receipt.base.inkDrops = reward.inkDrops;
            reward.receipt.base.paperScraps = reward.paperScraps;
            reward.receipt.base.blueprints = reward.blueprints;
            reward.receipt.final = { ...reward.receipt.base };
            return reward;
        };

        const resolveFor = (sideQuest) => {
            if (branchKey && Array.isArray(sideQuest.branches)) {
                const branch = sideQuest.branches.find((b) => b?.key === branchKey);
                if (branch?.rewards) return build(branch.rewards);
            }
            return build(sideQuest.rewards);
        };

        if (sideQuestId && data.sideQuestsById?.has(sideQuestId)) {
            return resolveFor(data.sideQuestsById.get(sideQuestId));
        }

        for (const key in data.sideQuestsDetailed) {
            const sideQuest = data.sideQuestsDetailed[key];
            if (prompt.includes(sideQuest.prompt) || prompt.includes(sideQuest.name)) {
                return resolveFor(sideQuest);
            }
        }

        const reward = new Reward({ inkDrops: GAME_CONFIG.rewards.defaultFallback.inkDrops });
        reward.receipt.base.inkDrops = GAME_CONFIG.rewards.defaultFallback.inkDrops;
        reward.receipt.final = { ...reward.receipt.base };
        return reward;
    }
```

- [ ] **Step 4: Teach `validate-data` about the branch shape**

In `scripts/validate-data.js`, inside `validateSideQuests`'s `for (const [key, quest] of Object.entries(quests))` loop, after the existing `rewards.items` check, add:

```javascript
        // Branch shape (optional, but if present it must be complete and consistent)
        if (quest.branches !== undefined) {
            if (!Array.isArray(quest.branches) || quest.branches.length === 0) {
                results.push({ type: 'error', message: `Side quest "${key}" has a branches field that is not a non-empty array` });
            } else {
                if (quest.branchType !== 'choice' && quest.branchType !== 'roll') {
                    results.push({ type: 'error', message: `Side quest "${key}" has branches but branchType is "${quest.branchType}" (expected "choice" or "roll")` });
                }
                if (quest.branchType === 'roll' && !quest.rollInstruction) {
                    results.push({ type: 'error', message: `Side quest "${key}" is a roll quest with no rollInstruction` });
                }

                const branchKeys = new Set();
                for (const branch of quest.branches) {
                    if (!branch || typeof branch !== 'object') {
                        results.push({ type: 'error', message: `Side quest "${key}" has a malformed branch entry` });
                        continue;
                    }
                    if (!branch.key) {
                        results.push({ type: 'error', message: `Side quest "${key}" has a branch with no key` });
                    } else if (branchKeys.has(branch.key)) {
                        results.push({ type: 'error', message: `Side quest "${key}" has duplicate branch key "${branch.key}"` });
                    } else {
                        branchKeys.add(branch.key);
                    }
                    for (const field of ['name', 'prompt', 'reward']) {
                        if (typeof branch[field] !== 'string' || !branch[field].trim()) {
                            results.push({ type: 'error', message: `Side quest "${key}" branch "${branch.key}" is missing ${field}` });
                        }
                    }
                    if (!branch.rewards || typeof branch.rewards !== 'object') {
                        results.push({ type: 'error', message: `Side quest "${key}" branch "${branch.key}" is missing a rewards object` });
                        continue;
                    }
                    if (Number(branch.rewards.inkDrops) !== 0) {
                        results.push({ type: 'error', message: `Side quest "${key}" branch "${branch.key}" grants Ink Drops; the expansion contract is zero` });
                    }
                    for (const itemName of branch.rewards.items ?? []) {
                        const itemExists = itemsById.has(itemName) ||
                            Array.from(itemsById.values()).some(item => item.name === itemName || item.id === itemName);
                        if (!itemExists && !allTemporaryBuffs.has(itemName)) {
                            results.push({
                                type: 'warning',
                                message: `Side quest "${key}" branch "${branch.key}" references "${itemName}", but neither item nor temporary buff found`
                            });
                        }
                    }
                }

                // The flat fields must mirror the first branch so branch-unaware renderers work.
                const first = quest.branches[0];
                if (first && quest.prompt !== first.prompt) {
                    results.push({ type: 'warning', message: `Side quest "${key}" flat prompt does not mirror branch "${first.key}"` });
                }
            }
        }
```

- [ ] **Step 5: Run the tests and the validator**

```bash
cd tests && npx jest sideQuestBranches RewardCalculator --verbose
cd tests && npm run validate-data
```

Expected: all PASS; the validator is unchanged in output because no quest carries `branches` yet.

- [ ] **Step 6: Run the full suite**

```bash
cd tests && npm test
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add assets/js/services/RewardCalculator.js scripts/validate-data.js tests/sideQuestBranches.test.js
git commit -m "feat(4yqq): resolve side quest rewards by branch key

Adds an optional branches array to the side quest shape and threads branchKey
through RewardCalculator.getBaseRewards. Flat prompt/reward/rewards keep mirroring
the first branch, so a stored quest or a branch-unaware renderer still resolves.
validate-data now checks branch completeness, key uniqueness and the zero-Ink-Drop
contract."
```

---

### Task 5: Author the ten quests

Add keys `9`–`18` to `assets/data/sideQuestsDetailed.json`. Every value below comes from the spec; transcribe it exactly. Item-granting quests get `hasLink`/`link` pointing at the Rewards page anchor, matching quests 2–6 and 8.

**Files:**
- Modify: `assets/data/sideQuestsDetailed.json`
- Test: `tests/sideQuestBranches.test.js` (extend with a real-data block)

**Interfaces:**
- Consumes: item names from Task 3, tag ids from Task 2, the schema from Task 4.
- Produces: side quest ids `side-quest-hagglers-row`, `side-quest-the-blind-stall`, `side-quest-the-masked-procession`, `side-quest-the-communal-table`, `side-quest-the-visiting-scholar`, `side-quest-the-field-practicum`, `side-quest-the-crossroads-inn`, `side-quest-the-short-crossing`, `side-quest-the-lending-cart`, `side-quest-the-relay-house`. Tasks 6, 7 and 8 render these.

- [ ] **Step 1: Write the failing test**

Append to `tests/sideQuestBranches.test.js` — note this block reads the real JSON, so put it in its own file-level `describe` outside the mocked import above, reading the file directly:

```javascript
describe('the ten Beyond the Library Doors quests', () => {
    // Read the catalog directly: the mocked data module above only carries the fixture.
    const catalog = JSON.parse(
        require('fs').readFileSync(
            require('path').join(__dirname, '../assets/data/sideQuestsDetailed.json'),
            'utf8'
        )
    );
    const NEW_KEYS = ['9', '10', '11', '12', '13', '14', '15', '16', '17', '18'];

    test('all ten exist and carry a locale and branches', () => {
        for (const key of NEW_KEYS) {
            const quest = catalog[key];
            expect(quest).toBeDefined();
            expect(typeof quest.locale).toBe('string');
            expect(quest.locale.length).toBeGreaterThan(0);
            expect(Array.isArray(quest.branches)).toBe(true);
            expect(quest.branches.length).toBeGreaterThanOrEqual(2);
        }
    });

    test('thirty-three branch prompts across the ten quests', () => {
        const total = NEW_KEYS.reduce((sum, key) => sum + catalog[key].branches.length, 0);
        expect(total).toBe(33);
    });

    test('no new quest or branch grants Ink Drops', () => {
        for (const key of NEW_KEYS) {
            const quest = catalog[key];
            expect(quest.rewards.inkDrops).toBe(0);
            for (const branch of quest.branches) {
                expect(branch.rewards.inkDrops).toBe(0);
            }
        }
    });

    test('the flat fields mirror the first branch', () => {
        for (const key of NEW_KEYS) {
            const quest = catalog[key];
            const first = quest.branches[0];
            expect(quest.prompt).toBe(first.prompt);
            expect(quest.reward).toBe(first.reward);
            expect(quest.rewards).toEqual(first.rewards);
        }
    });

    test('branch keys are unique within each quest', () => {
        for (const key of NEW_KEYS) {
            const keys = catalog[key].branches.map(b => b.key);
            expect(new Set(keys).size).toBe(keys.length);
        }
    });

    test('the four locales are the ones the design names', () => {
        const locales = new Set(NEW_KEYS.map(key => catalog[key].locale));
        expect(locales).toEqual(new Set([
            'the-ninefold-bazaar',
            'the-festival-of-turning',
            'the-exchange',
            'the-open-road'
        ]));
    });
});
```

- [ ] **Step 2: Run the test and watch it fail**

```bash
cd tests && npx jest sideQuestBranches --verbose
```

Expected: FAIL — `catalog['9']` is `undefined`.

- [ ] **Step 3: Add quests 9 and 10 (Locale I — The Ninefold Bazaar)**

Add to `assets/data/sideQuestsDetailed.json`, after key `"8"`:

```json
    "9": {
        "id": "side-quest-hagglers-row",
        "name": "Haggler's Row",
        "locale": "the-ninefold-bazaar",
        "description": "The stallkeepers know your face by now, and not one of them will take full price from a Keeper.",
        "prompt": "Read a book you borrowed — a library copy, a friend's shelf, an app hold, an interlibrary request.",
        "reward": "Receive The Haggler's Ledger. +10 Dusty Blueprints.",
        "hasLink": true,
        "link": {
            "text": "The Haggler's Ledger",
            "url": "{{ site.baseurl }}/rewards.html#hagglers-ledger"
        },
        "rewards": {
            "xp": 0,
            "inkDrops": 0,
            "paperScraps": 0,
            "blueprints": 10,
            "items": ["The Haggler's Ledger"]
        },
        "branchType": "choice",
        "rollInstruction": null,
        "branches": [
            {
                "key": "A",
                "roll": null,
                "name": "The Loan",
                "prompt": "Read a book you borrowed — a library copy, a friend's shelf, an app hold, an interlibrary request.",
                "reward": "Receive The Haggler's Ledger. +10 Dusty Blueprints.",
                "rewards": { "xp": 0, "inkDrops": 0, "paperScraps": 0, "blueprints": 10, "items": ["The Haggler's Ledger"] }
            },
            {
                "key": "B",
                "roll": null,
                "name": "The Second Hand",
                "prompt": "Read a book you bought used — thrift store, used bookshop, library sale, a reseller.",
                "reward": "Receive The Haggler's Ledger. +15 Dusty Blueprints.",
                "rewards": { "xp": 0, "inkDrops": 0, "paperScraps": 0, "blueprints": 15, "items": ["The Haggler's Ledger"] }
            },
            {
                "key": "C",
                "roll": null,
                "name": "The Gift",
                "prompt": "Read a book you neither chose nor paid for — given to you, a Little Free Library find, a subscription box pick you'd never have bought. Books that came with the house belong to the Lending Cart, not here.",
                "reward": "Receive The Haggler's Ledger. +20 Dusty Blueprints.",
                "rewards": { "xp": 0, "inkDrops": 0, "paperScraps": 0, "blueprints": 20, "items": ["The Haggler's Ledger"] }
            }
        ],
        "stake": {
            "name": "Haggle",
            "declareBefore": true,
            "condition": "rating >= 4",
            "onSuccess": { "multiply": { "blueprints": 2 } },
            "onFailure": { "blueprints": -10, "floorAtZero": true }
        }
    },
    "10": {
        "id": "side-quest-the-blind-stall",
        "name": "The Blind Stall",
        "locale": "the-ninefold-bazaar",
        "description": "The merchant at the end of the ninth row sells her books wrapped in butcher's paper and string.",
        "prompt": "Pick a book from its title only. No blurb, no cover, no reviews, no one's opinion. Commit before you look at anything else.",
        "reward": "+40 XP, +10 Paper Scraps.",
        "rewards": { "xp": 40, "inkDrops": 0, "paperScraps": 10, "blueprints": 0, "items": [] },
        "branchType": "roll",
        "rollInstruction": "Roll a d6 to see which parcel she puts in your hands:",
        "branches": [
            {
                "key": "1",
                "roll": "1-2",
                "name": "Sold by title alone",
                "prompt": "Pick a book from its title only. No blurb, no cover, no reviews, no one's opinion. Commit before you look at anything else.",
                "reward": "+40 XP, +10 Paper Scraps.",
                "rewards": { "xp": 40, "inkDrops": 0, "paperScraps": 10, "blueprints": 0, "items": [] }
            },
            {
                "key": "3",
                "roll": "3",
                "name": "Sold by the spine",
                "prompt": "Stand at a shelf — yours, a store's, a library's — and choose a book touching nothing but spines. No pulling it out to read the back first.",
                "reward": "+45 XP, +15 Paper Scraps.",
                "rewards": { "xp": 45, "inkDrops": 0, "paperScraps": 15, "blueprints": 0, "items": [] }
            },
            {
                "key": "4",
                "roll": "4-5",
                "name": "Sold by the first line",
                "prompt": "Read the opening sentence of a book and nothing else — not the blurb, not the cover copy, not the second sentence. Commit or walk away on that one line.",
                "reward": "+50 XP, +10 Paper Scraps.",
                "rewards": { "xp": 50, "inkDrops": 0, "paperScraps": 10, "blueprints": 0, "items": [] }
            },
            {
                "key": "6",
                "roll": "6",
                "name": "Sold in a lot",
                "prompt": "She won't split the bundle. Read two short works by the same author, or a book plus its companion novella.",
                "reward": "+80 XP, +20 Paper Scraps.",
                "rewards": { "xp": 80, "inkDrops": 0, "paperScraps": 20, "blueprints": 0, "items": [] }
            }
        ],
        "stake": {
            "name": "The wrapper's terms",
            "declareBefore": true,
            "condition": "finished",
            "onSuccess": { "blueprints": 15 },
            "onFailure": { "forfeit": ["xp"], "floorAtZero": true }
        }
    },
```

**Roll branch key convention:** the `key` is the **lowest** roll in the range and `roll` is the displayed range. Branch A of a choice quest uses `"A"`; roll branches use the numeric string. Keep this consistent — Task 6's picker sorts on `key`.

- [ ] **Step 4: Add quests 11 and 12 (Locale II — The Festival of Turning)**

Follow the exact same shape as Step 3. Values:

**Key `"11"`** — `id: side-quest-the-masked-procession`, `locale: the-festival-of-turning`, `branchType: "choice"`, `rollInstruction: null`, `hasLink: true`, link text `The Reveler's Mask` → `{{ site.baseurl }}/rewards.html#revelers-mask`.
`description`: "At the gate they hand you a mask and take your name for the evening. Until the lanterns burn out you are permitted to be someone you are not, and expected to try."

| key | roll | name | prompt | reward | rewards |
|---|---|---|---|---|---|
| A | null | The Stranger's Face | Read in a genre you actively avoid or have simply never tried. Not a genre you read rarely — one you've decided isn't for you. | Receive The Reveler's Mask. +25 XP. | `{ xp: 25, inkDrops: 0, paperScraps: 0, blueprints: 0, items: ["The Reveler's Mask"] }` |
| B | null | The Other Life | Read a book whose narrator's ordinary day has nothing in common with yours — different work, different body, different century, different belief about what a day is for. | Receive The Reveler's Mask. +20 XP, +5 Paper Scraps. | `{ xp: 20, inkDrops: 0, paperScraps: 5, blueprints: 0, items: ["The Reveler's Mask"] }` |
| C | null | The Opposing Voice | Read a book that argues for something you're inclined to disagree with — fiction or non-fiction — and log one thing it got right. | Receive The Reveler's Mask. +30 XP. | `{ xp: 30, inkDrops: 0, paperScraps: 0, blueprints: 0, items: ["The Reveler's Mask"] }` |

`stake`: `{ "name": "Unmasking", "declareBefore": false, "condition": "journal >= 3 sentences", "onSuccess": { "paperScraps": 10 }, "onFailure": {} }`

**Key `"12"`** — `id: side-quest-the-communal-table`, `locale: the-festival-of-turning`, `branchType: "choice"`, `rollInstruction: "Choose your seat, or roll a d3 and let the table seat you:"`, no link.
`description`: "One table runs the length of the square, end to end. Nobody eats alone at the Festival of Turning — that is the entire body of festival law, and it is enforced by grandmothers."

| key | roll | name | prompt | reward | rewards |
|---|---|---|---|---|---|
| A | null | The shared plate | Buddy read: read a book at the same time as someone else and talk to them about it at least once before either of you finishes. | +60 XP, +20 Paper Scraps. | `{ xp: 60, inkDrops: 0, paperScraps: 20, blueprints: 0, items: [] }` |
| B | null | The long meal | Read a book aloud to someone, or be read to — a partner, a child, a friend on a call. Any length counts; a picture book counts. | +50 XP, +15 Paper Scraps. | `{ xp: 50, inkDrops: 0, paperScraps: 15, blueprints: 0, items: [] }` |
| C | null | The recipe | Read a book with a meal at its center, then cook or make something that actually appears in it. | +40 XP, +10 Paper Scraps, +10 Dusty Blueprints. | `{ xp: 40, inkDrops: 0, paperScraps: 10, blueprints: 10, items: [] }` |

`stake`: `{ "name": "Half a table", "declareBefore": false, "condition": "partner did not follow through", "onSuccess": {}, "onFailure": { "halve": ["xp"], "floorAtZero": true } }`

- [ ] **Step 5: Add quests 13 and 14 (Locale III — The Exchange)**

**Key `"13"`** — `id: side-quest-the-visiting-scholar`, `locale: the-exchange`, `branchType: "choice"`, `rollInstruction: null`, `hasLink: true`, link text `Visiting Scholar's Sigil` → `{{ site.baseurl }}/rewards.html#visiting-scholars-sigil`.
`description`: "You are enrolled under a name nobody here can pronounce, in a hall where your expertise counts for nothing. Your first assignment is to stop being the most knowledgeable person in the room."

| key | roll | name | prompt | reward | rewards |
|---|---|---|---|---|---|
| A | null | In translation | Read a book translated into your language, and name the translator in your log. They wrote every word you actually read. | Receive the Visiting Scholar's Sigil. +20 XP. | `{ xp: 20, inkDrops: 0, paperScraps: 0, blueprints: 0, items: ["Visiting Scholar's Sigil"] }` |
| B | null | Enrollment record | Read a book by an author from a country you have never read a book from — and strike that country off the Exchange's register. Each country can be claimed once, ever. | Receive the Visiting Scholar's Sigil. +25 XP, +5 Paper Scraps. | `{ xp: 25, inkDrops: 0, paperScraps: 5, blueprints: 0, items: ["Visiting Scholar's Sigil"] }` |
| C | null | The untranslated | Read a book that leaves words from another language standing in the text — italicised terms, a glossary, an untranslated song, dialect the author refuses to gloss. Log three words you learned. | Receive the Visiting Scholar's Sigil. +20 XP, +10 Paper Scraps. | `{ xp: 20, inkDrops: 0, paperScraps: 10, blueprints: 0, items: ["Visiting Scholar's Sigil"] }` |

Branch B additionally carries `"requiresCountry": true` — Task 7 keys the register prompt off this flag rather than hardcoding a branch key.

No `stake`.

**Key `"14"`** — `id: side-quest-the-field-practicum`, `locale: the-exchange`, `branchType: "roll"`, `rollInstruction: "Roll a d4 for your assignment, or petition the registrar and choose:"`, no link.
`description`: "The Exchange grades on output, not on hours. Reading is the prerequisite for the coursework here, not the coursework itself."

| key | roll | name | prompt | reward | rewards |
|---|---|---|---|---|---|
| 1 | 1 | The lecture | Read anything, then teach one idea out of it to another person, out loud, for five minutes. They're allowed to ask questions. You're not allowed to read from the book. | +80 XP, +15 Paper Scraps. | `{ xp: 80, inkDrops: 0, paperScraps: 15, blueprints: 0, items: [] }` |
| 2 | 2 | The practicum | Read something and then do it — cook the dish, walk the route, try the craft, run the drill, plant the thing. | +70 XP, +20 Dusty Blueprints. | `{ xp: 70, inkDrops: 0, paperScraps: 0, blueprints: 20, items: [] }` |
| 3 | 3 | The seminar | Read two books that disagree about the same subject, and write a paragraph on exactly where they part ways. | +120 XP, +20 Paper Scraps. | `{ xp: 120, inkDrops: 0, paperScraps: 20, blueprints: 0, items: [] }` |
| 4 | 4 | The primary source | Read a diary, collected letters, an oral history, or first-hand testimony from someone who was there. Not memoir — the Philosophy Alcove already takes memoir. This is unshaped material: documents rather than a narrative built out of them. | +90 XP, +10 Paper Scraps. | `{ xp: 90, inkDrops: 0, paperScraps: 10, blueprints: 0, items: [] }` |

`stake`: `{ "name": "Credit transfer", "declareBefore": false, "condition": "assignment output logged as a journal entry", "onSuccess": { "countsAsJournalEntry": true }, "onFailure": {} }`

- [ ] **Step 6: Add quests 15–18 (Locale IV — The Open Road)**

**Key `"15"`** — `id: side-quest-the-crossroads-inn`, `locale: the-open-road`, `branchType: "choice"`, `rollInstruction: null`, `hasLink: true`, link text `The Crossroads Fox` → `{{ site.baseurl }}/rewards.html#crossroads-fox`.
`description`: "Four roads, one hearth, and a house rule the innkeeper enforces with a broom: you eat what you're served and you read what you're handed."

| key | roll | name | prompt | reward | rewards |
|---|---|---|---|---|---|
| A | null | The Bartender | Ask a bookseller or librarian to pick for you — in person or by note — and read whatever they hand over. | Receive The Crossroads Fox. +20 XP. | `{ xp: 20, inkDrops: 0, paperScraps: 0, blueprints: 0, items: ["The Crossroads Fox"] }` |
| B | null | The Server | Read a book pressed on you by a stranger whose taste you have no reason to trust — a shelf card, a note left inside a used copy, a list you stumbled into. | Receive The Crossroads Fox. +20 XP, +5 Paper Scraps. | `{ xp: 20, inkDrops: 0, paperScraps: 5, blueprints: 0, items: ["The Crossroads Fox"] }` |
| C | null | The Regular | Read the book someone has recommended to you the most times and you have avoided the most successfully. | Receive The Crossroads Fox. +30 XP. | `{ xp: 30, inkDrops: 0, paperScraps: 0, blueprints: 0, items: ["The Crossroads Fox"] }` |

No `stake`.

**Key `"16"`** — `id: side-quest-the-short-crossing`, `locale: the-open-road`, `branchType: "roll"`, `rollInstruction: "Roll a d4 for what's in your coat pocket:"`, no link.
`description`: "The ferry runs the narrows in well under an hour. Whatever you brought needs to be finished before the far bank."

| key | roll | name | prompt | reward | rewards |
|---|---|---|---|---|---|
| 1 | 1 | Poetry | A collection, a chapbook, or a novel in verse. | +40 XP, +25 Paper Scraps. | `{ xp: 40, inkDrops: 0, paperScraps: 25, blueprints: 0, items: [] }` |
| 2 | 2 | Illustrated | A graphic novel, comic, manga, or an illustrated edition where the pictures are doing real work. | +40 XP, +20 Paper Scraps, +10 Dusty Blueprints. | `{ xp: 40, inkDrops: 0, paperScraps: 20, blueprints: 10, items: [] }` |
| 3 | 3 | Short form | A short story collection, an essay collection, or a novella. | +50 XP, +20 Paper Scraps. | `{ xp: 50, inkDrops: 0, paperScraps: 20, blueprints: 0, items: [] }` |
| 4 | 4 | Spoken | A full-cast audiobook, or one read by the author. | +40 XP, +15 Paper Scraps, +10 Dusty Blueprints. | `{ xp: 40, inkDrops: 0, paperScraps: 15, blueprints: 10, items: [] }` |

`stake`: `{ "name": "Crossing twice", "declareBefore": false, "condition": "two different rolls in the same month", "onSuccess": { "blueprints": 30 }, "onFailure": {} }`

**Key `"17"`** — `id: side-quest-the-lending-cart`, `locale: the-open-road`, `branchType: "choice"`, `rollInstruction: null`, `hasLink: true`, link text `The Mender's Thread` → `{{ site.baseurl }}/rewards.html#menders-thread`.
`description`: "A cart pulled between towns by a man who will not say where he got any of it. Every copy on it has somebody else's fingerprints somewhere in the pages."

| key | roll | name | prompt | reward | rewards |
|---|---|---|---|---|---|
| A | null | The mender's fee | Read a copy that is physically damaged, ex-library, or heavily marked by a previous reader — and log one thing that reader left behind. A note, a receipt, a name, an underline you disagree with. | Receive The Mender's Thread. +25 Dusty Blueprints. | `{ xp: 0, inkDrops: 0, paperScraps: 0, blueprints: 25, items: ["The Mender's Thread"] }` |
| B | null | The re-read | Re-read a book you loved at least five years ago, and log one thing you noticed this time that you missed then. The previous reader is you. | Receive The Mender's Thread. +15 Dusty Blueprints, +10 Paper Scraps. | `{ xp: 0, inkDrops: 0, paperScraps: 10, blueprints: 15, items: ["The Mender's Thread"] }` |
| C | null | The inheritance | Read a book that came into your home attached to someone else — a partner's, a parent's, a housemate's, or one that was already on the shelf when you moved in. | Receive The Mender's Thread. +20 Dusty Blueprints. | `{ xp: 0, inkDrops: 0, paperScraps: 0, blueprints: 20, items: ["The Mender's Thread"] }` |

No `stake`. **Do not** add a "return to a book you set aside" branch — reading a DNF is a Worn Page penalty and is permanently excluded.

**Key `"18"`** — `id: side-quest-the-relay-house`, `locale: the-open-road`, `branchType: "choice"`, `rollInstruction: null`, no link.
`description`: "A staging post where letters wait for riders. The postmaster will carry absolutely anything, provided it is addressed to somebody."

| key | roll | name | prompt | reward | rewards |
|---|---|---|---|---|---|
| A | null | Letters received | Read an epistolary novel, or a book told through documents, transcripts, case files, or found records. | +50 XP, +25 Paper Scraps. | `{ xp: 50, inkDrops: 0, paperScraps: 25, blueprints: 0, items: [] }` |
| B | null | Letters sent | Read anything, then write to someone about it — an actual letter, a long message, a review posted where strangers can read it. | +40 XP, +30 Paper Scraps. | `{ xp: 40, inkDrops: 0, paperScraps: 30, blueprints: 0, items: [] }` |
| C | null | Letters left | Read a book and leave something in it for whoever reads it next — an annotation, a pressed note, a copy handed on with a message tucked inside. | +40 XP, +25 Paper Scraps, +10 Dusty Blueprints. | `{ xp: 40, inkDrops: 0, paperScraps: 25, blueprints: 10, items: [] }` |

`stake`: `{ "name": "Franking", "declareBefore": false, "condition": "the letter gets an answer", "onSuccess": { "xp": 20 }, "onFailure": {} }`

- [ ] **Step 7: Regenerate, validate, test**

```bash
node scripts/generate-data.js
cd tests && npm run validate-data
cd tests && npx jest sideQuestBranches SideQuestDeckService data dataContracts tableRenderer --verbose
```

Expected: `validate-data` reports 18 side quests with no errors. `sideQuestBranches` passes, including the 33-prompt count. `SideQuestDeckService.test.js` still passes — it asserts `Object.keys(data.sideQuestsDetailed).length - 2`, which scales with the pool.

If the 33-count assertion fails, count the branches: 3 + 4 + 3 + 3 + 3 + 4 + 3 + 4 + 3 + 3 = 33.

- [ ] **Step 8: Run the full suite**

```bash
cd tests && npm test
```

Expected: PASS. `tableRenderer.test.js` may still pass while only rendering the first eight rows — Task 8 fixes the loop and adds coverage.

- [ ] **Step 9: Commit**

```bash
git add assets/data/sideQuestsDetailed.json tests/sideQuestBranches.test.js
git commit -m "feat(4yqq): add ten branching side quests beyond the library doors

Ten quests across four locales, thirty-three branch prompts, zero Ink Drops. The
quests live on the four axes nothing else in the game touches: provenance, agency,
form and aftermath. Stake objects are authored but inert — the stake mechanic is
tracked separately."
```

---

### Task 6: Branch picker on the drawn card

The add-quest form's `side-quest-select` no longer exists in the markup; the card draw is the live path. So the branch picker belongs on the drawn side quest card, and `SideQuestDeckController.handleAddQuestFromCard()` reads the selection.

**Files:**
- Modify: `assets/js/viewModels/questDeckViewModel.js:92-111` (`createSideQuestDeckViewModel`)
- Modify: `assets/js/character-sheet/cardRenderer.js:328-368` (`renderSideQuestCard`)
- Modify: `assets/js/controllers/SideQuestDeckController.js:210-250` (`handleAddQuestFromCard`)
- Modify: `assets/css/card-draw.css`
- Test: `tests/cardRenderer.test.js` (existing — extend)

**Interfaces:**
- Consumes: the catalog shape from Task 4, the quests from Task 5, `RewardCalculator.getBaseRewards(..., { sideQuestId, branchKey })` from Task 4.
- Produces: an active quest object carrying `branchKey: string|null` and `branchName: string|null` alongside the existing `sideQuestId` and `prompt`. `prompt` stays in `"<Quest Name>: <branch prompt>"` form so `extractNameFromPrompt` in `questArchiveCardsViewModel.js` and `checkSideQuestCompletion` in `table-renderer.js` keep working unchanged. Task 7 reads `branchKey` at completion.

- [ ] **Step 1: Write the failing test**

Append to `tests/cardRenderer.test.js`:

```javascript
describe('side quest card branch picker', () => {
    const branchingCard = {
        key: '9',
        name: "Haggler's Row",
        description: 'The stallkeepers know your face by now.',
        prompt: 'Read a book you borrowed.',
        cardImage: null,
        branchType: 'choice',
        rollInstruction: null,
        branches: [
            { key: 'A', roll: null, name: 'The Loan', prompt: 'Read a book you borrowed.' },
            { key: 'B', roll: null, name: 'The Second Hand', prompt: 'Read a book you bought used.' }
        ],
        questData: {}
    };

    test('renders a select with one option per branch', () => {
        const card = renderSideQuestCard(branchingCard);
        const select = card.querySelector('select.card-branch-select');

        expect(select).not.toBeNull();
        expect(select.options.length).toBe(2);
        expect(select.options[0].value).toBe('A');
        expect(select.options[1].value).toBe('B');
        expect(select.dataset.questKey).toBe('9');
    });

    test('the first branch is selected by default and its prompt is shown', () => {
        const card = renderSideQuestCard(branchingCard);

        expect(card.querySelector('select.card-branch-select').value).toBe('A');
        expect(card.querySelector('.card-prompt').textContent).toContain('Read a book you borrowed.');
    });

    test('changing the branch swaps the displayed prompt', () => {
        const card = renderSideQuestCard(branchingCard);
        const select = card.querySelector('select.card-branch-select');

        select.value = 'B';
        select.dispatchEvent(new Event('change', { bubbles: true }));

        expect(card.querySelector('.card-prompt').textContent).toContain('Read a book you bought used.');
    });

    test('a roll quest labels its options with the roll range', () => {
        const rollCard = {
            ...branchingCard,
            key: '10',
            name: 'The Blind Stall',
            branchType: 'roll',
            rollInstruction: 'Roll a d6:',
            branches: [
                { key: '1', roll: '1-2', name: 'Sold by title alone', prompt: 'Pick a book from its title only.' },
                { key: '3', roll: '3', name: 'Sold by the spine', prompt: 'Choose a book touching nothing but spines.' }
            ]
        };
        const card = renderSideQuestCard(rollCard);

        expect(card.textContent).toContain('Roll a d6:');
        expect(card.querySelector('select.card-branch-select').options[0].textContent)
            .toContain('1-2');
    });

    test('a quest with no branches renders exactly as before', () => {
        const flat = {
            key: '1',
            name: 'The Arcane Grimoire',
            description: 'An ancient spellbook writes a new page.',
            prompt: 'Read the book on your TBR the longest.',
            cardImage: null,
            questData: {}
        };
        const card = renderSideQuestCard(flat);

        expect(card.querySelector('select.card-branch-select')).toBeNull();
        expect(card.querySelector('.card-prompt').textContent).toContain('Read the book on your TBR the longest.');
    });
});
```

- [ ] **Step 2: Run the test and watch it fail**

```bash
cd tests && npx jest cardRenderer --verbose
```

Expected: FAIL — `expect(select).not.toBeNull()` receives `null`.

- [ ] **Step 3: Surface branches on the view model**

In `assets/js/viewModels/questDeckViewModel.js`, extend the `drawnQuests` mapping inside `createSideQuestDeckViewModel`:

```javascript
        drawnQuests: list.map((q) => ({
            key: q.key,
            name: q.name,
            description: q.description,
            prompt: q.prompt,
            cardImage: getSideQuestCardImage(q),
            branchType: q.branchType ?? null,
            rollInstruction: q.rollInstruction ?? null,
            branches: Array.isArray(q.branches) ? q.branches : null,
            questData: q
        })),
```

- [ ] **Step 4: Render the picker**

In `assets/js/character-sheet/cardRenderer.js`, replace the prompt block inside `renderSideQuestCard` (currently lines 358-363) with:

```javascript
    // Branch picker (branching quests only). The prompt element below is live-updated
    // when the selection changes, so the card always shows the prompt you'd be taking.
    const branches = Array.isArray(questCardData.branches) ? questCardData.branches : null;

    if (branches && branches.length > 0 && questCardData.rollInstruction) {
        const instruction = createElement('p', { class: 'card-roll-instruction' });
        instruction.textContent = questCardData.rollInstruction;
        content.appendChild(instruction);
    }

    const prompt = createElement('div', { class: 'card-prompt' });
    const activeBranch = branches && branches.length > 0 ? branches[0] : null;
    const promptText = activeBranch ? activeBranch.prompt : (questCardData.prompt || '');
    prompt.innerHTML = `<strong>Prompt:</strong> ${escapeHtml(promptText)}`;

    if (branches && branches.length > 0) {
        const select = createElement('select', {
            class: 'card-branch-select',
            'aria-label': `Choose a branch for ${questCardData.name || 'this side quest'}`
        });
        select.dataset.questKey = String(questCardData.key ?? '');

        branches.forEach((branch) => {
            const option = createElement('option');
            option.value = branch.key;
            const lead = questCardData.branchType === 'roll' ? (branch.roll || branch.key) : branch.key;
            option.textContent = `${lead} · ${branch.name}`;
            select.appendChild(option);
        });

        select.value = branches[0].key;
        select.addEventListener('change', () => {
            const chosen = branches.find((b) => b.key === select.value) || branches[0];
            prompt.innerHTML = `<strong>Prompt:</strong> ${escapeHtml(chosen.prompt)}`;
        });
        // The card wrapper handles selection clicks; don't let the dropdown toggle it.
        select.addEventListener('click', (event) => event.stopPropagation());

        content.appendChild(select);
    }

    content.appendChild(prompt);
```

Delete the original `if (questCardData.prompt) { ... }` block — the code above replaces it and covers the flat case.

- [ ] **Step 5: Read the chosen branch when adding the quest**

In `assets/js/controllers/SideQuestDeckController.js`, replace the body of the `for (const questData of toAdd)` loop inside `handleAddQuestFromCard()`:

```javascript
        for (const questData of toAdd) {
            const branches = Array.isArray(questData.branches) ? questData.branches : null;
            let branch = null;

            if (branches && branches.length > 0) {
                const select = this.drawnCardDisplay.querySelector(
                    `select.card-branch-select[data-quest-key="${questData.key}"]`
                );
                const chosenKey = select?.value || branches[0].key;
                branch = branches.find((b) => b.key === chosenKey) || branches[0];
            }

            // Keep the "<Name>: <prompt>" shape: extractNameFromPrompt() in the archive view
            // model and checkSideQuestCompletion() in table-renderer both parse it.
            const prompt = `${questData.name}: ${branch ? branch.prompt : questData.prompt}`;
            const rewards = RewardCalculator.getBaseRewards('♣ Side Quest', prompt, {
                sideQuestId: questData.id || null,
                branchKey: branch ? branch.key : null
            });
            const quest = {
                type: '♣ Side Quest',
                sideQuestId: questData.id || null,
                branchKey: branch ? branch.key : null,
                branchName: branch ? branch.name : null,
                prompt,
                rewards: rewards.toJSON ? rewards.toJSON() : rewards,
                buffs: [],
                dateAdded: new Date().toISOString(),
                month,
                year
            };
            if (this.isQuestDuplicate(quest, activeQuests)) {
                toast.warning(`"${questData.name}" is already in your quest log.`);
                continue;
            }
            questJSONs.push(quest);
            activeQuests.push(quest); // Track for duplicate check within this batch
        }
```

`isQuestDuplicate` still matches on `sideQuestId` first, so two branches of the same quest cannot both be active — which is correct: one quest, one card, one book.

- [ ] **Step 6: Style the picker**

Append to `assets/css/card-draw.css`:

```css
/* Side quest branch picker — sits inside the card content overlay */
.card-branch-select {
    display: block;
    width: 100%;
    margin: 0.5rem 0;
    padding: 0.35rem 0.5rem;
    font-family: inherit;
    font-size: 0.85rem;
    color: var(--text-primary, #e8e0d0);
    background: rgba(0, 0, 0, 0.45);
    border: 1px solid var(--accent-gold, #c9a961);
    border-radius: 3px;
    cursor: pointer;
}

.card-branch-select:focus-visible {
    outline: 2px solid var(--accent-gold, #c9a961);
    outline-offset: 2px;
}

.card-roll-instruction {
    margin: 0.35rem 0 0;
    font-size: 0.8rem;
    font-style: italic;
    opacity: 0.85;
}
```

If `--text-primary` / `--accent-gold` are not the variable names in use, match whatever `.card-prompt` and neighbouring card rules already use — do not introduce a new colour.

- [ ] **Step 7: Run the tests**

```bash
cd tests && npx jest cardRenderer questDeckViewModel otherQuestDeckController genreQuestDeckController --verbose
```

Expected: PASS.

- [ ] **Step 8: Run the full suite**

```bash
cd tests && npm test
```

Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add assets/js/viewModels/questDeckViewModel.js assets/js/character-sheet/cardRenderer.js assets/js/controllers/SideQuestDeckController.js assets/css/card-draw.css tests/cardRenderer.test.js
git commit -m "feat(4yqq): pick a side quest branch on the drawn card

The drawn card gains a branch dropdown that live-updates the displayed prompt, and
the deck controller stamps branchKey/branchName on the quest and resolves rewards
for that branch. Quests without branches render exactly as before."
```

---

### Task 7: The Exchange's country register

The Visiting Scholar's *Enrollment record* branch needs a once-ever list of claimed countries. This is a new persistent state key, which means a schema migration and five registration points.

**Files:**
- Modify: `assets/js/character-sheet/storageKeys.js`
- Modify: `assets/js/character-sheet/dataValidator.js:32` (`SCHEMA_VERSION`) and the validation block around line 1031
- Modify: `assets/js/character-sheet/dataMigrator.js`
- Modify: `assets/js/character-sheet/stateAdapter.js`
- Modify: `assets/js/controllers/SideQuestDeckController.js` (capture the country at draw time)
- Modify: `assets/js/controllers/QuestController.js` (claim it at completion)
- Modify: `assets/js/character-sheet/cardRenderer.js` (country input on the branch)
- Modify: `_includes/character-sheet/drawers/side-quests.html` (register panel)
- Modify: `assets/js/table-renderer.js` (render the register panel)
- Test: `tests/claimedCountries.test.js` (create)

**Interfaces:**
- Consumes: `branchKey` / `requiresCountry` from Tasks 5 and 6.
- Produces:
  - `STORAGE_KEYS.CLAIMED_COUNTRIES === 'claimedCountries'`, default `[]`
  - `stateAdapter.getClaimedCountries() -> string[]`
  - `stateAdapter.addClaimedCountry(country: string) -> boolean` — normalises case, idempotent, emits `CLAIMED_COUNTRIES_CHANGED`
  - `stateAdapter.hasClaimedCountry(country: string) -> boolean`
  - `quest.branchCountry: string|null` on Visiting Scholar branch-B quests
  - `SCHEMA_VERSION === 17`

- [ ] **Step 1: Write the failing test**

Create `tests/claimedCountries.test.js`:

```javascript
/**
 * The Exchange's register: countries claimed once, ever.
 */
import { STORAGE_KEYS, createEmptyCharacterState } from '../assets/js/character-sheet/storageKeys.js';
import { validateCharacterState, SCHEMA_VERSION } from '../assets/js/character-sheet/dataValidator.js';
import { migrateState } from '../assets/js/character-sheet/dataMigrator.js';

describe('claimed countries register', () => {
    test('the storage key exists and defaults to an empty array', () => {
        expect(STORAGE_KEYS.CLAIMED_COUNTRIES).toBe('claimedCountries');
        expect(createEmptyCharacterState()[STORAGE_KEYS.CLAIMED_COUNTRIES]).toEqual([]);
    });

    test('the schema version is 17', () => {
        expect(SCHEMA_VERSION).toBe(17);
    });

    test('validation coerces a non-array register to an empty array', () => {
        const validated = validateCharacterState({
            ...createEmptyCharacterState(),
            [STORAGE_KEYS.CLAIMED_COUNTRIES]: 'Japan'
        });
        expect(validated[STORAGE_KEYS.CLAIMED_COUNTRIES]).toEqual([]);
    });

    test('validation keeps a well-formed register', () => {
        const validated = validateCharacterState({
            ...createEmptyCharacterState(),
            [STORAGE_KEYS.CLAIMED_COUNTRIES]: ['Japan', 'Nigeria']
        });
        expect(validated[STORAGE_KEYS.CLAIMED_COUNTRIES]).toEqual(['Japan', 'Nigeria']);
    });

    // migrateState() reads the stored version from localStorage rather than taking it as
    // an argument, so the fixture sets it directly. The key is 'tomeOfSecrets_schemaVersion'
    // (dataValidator.js:37).
    test('migration to v17 adds the register to a v16 state without one', () => {
        localStorage.setItem('tomeOfSecrets_schemaVersion', '16');
        const v16State = { ...createEmptyCharacterState() };
        delete v16State[STORAGE_KEYS.CLAIMED_COUNTRIES];

        const migrated = migrateState(v16State);

        expect(migrated[STORAGE_KEYS.CLAIMED_COUNTRIES]).toEqual([]);
    });

    test('migration leaves an existing register alone', () => {
        localStorage.setItem('tomeOfSecrets_schemaVersion', '16');
        const v16State = {
            ...createEmptyCharacterState(),
            [STORAGE_KEYS.CLAIMED_COUNTRIES]: ['Iceland']
        };

        const migrated = migrateState(v16State);

        expect(migrated[STORAGE_KEYS.CLAIMED_COUNTRIES]).toEqual(['Iceland']);
    });
});
```

Check the actual exported names of `validateCharacterState` and `migrateData` in `dataValidator.js` / `dataMigrator.js` before running; match the imports to what those modules export (other tests such as `tests/dataValidation.test.js` and `tests/statePersistence.test.js` already import them — copy their import lines).

- [ ] **Step 2: Run the test and watch it fail**

```bash
cd tests && npx jest claimedCountries --verbose
```

Expected: FAIL — `STORAGE_KEYS.CLAIMED_COUNTRIES` is `undefined`.

- [ ] **Step 3: Register the key**

In `assets/js/character-sheet/storageKeys.js`:

Add to `STORAGE_KEYS`, after `SERIES_EXPEDITION_PROGRESS`:

```javascript
    /** The Exchange's register: country names claimed once, ever, by side quest 13 branch B. */
    CLAIMED_COUNTRIES: 'claimedCountries',
```

Add to `CHARACTER_STATE_KEYS`, after `STORAGE_KEYS.SERIES_EXPEDITION_PROGRESS`:

```javascript
    STORAGE_KEYS.CLAIMED_COUNTRIES,
```

Add to `createEmptyCharacterState()`, after the `SERIES_EXPEDITION_PROGRESS` line:

```javascript
        [STORAGE_KEYS.CLAIMED_COUNTRIES]: [],
```

- [ ] **Step 4: Validate and migrate**

In `assets/js/character-sheet/dataValidator.js`, bump line 32:

```javascript
export const SCHEMA_VERSION = 17;
```

and add next to the `CLAIMED_SERIES_REWARDS` validation (around line 1031):

```javascript
    validated[STORAGE_KEYS.CLAIMED_COUNTRIES] = validateStringArray(
        state[STORAGE_KEYS.CLAIMED_COUNTRIES],
        STORAGE_KEYS.CLAIMED_COUNTRIES
    );
```

In `assets/js/character-sheet/dataMigrator.js`, add the migration next to `migrateToVersion16`:

```javascript
/**
 * Migration from schema version 16 to version 17
 * - Adds claimedCountries: the Exchange's once-ever register (side quest 13, branch B)
 */
function migrateToVersion17(state) {
    const migrated = { ...state };
    if (!Array.isArray(migrated[STORAGE_KEYS.CLAIMED_COUNTRIES])) {
        migrated[STORAGE_KEYS.CLAIMED_COUNTRIES] = [];
    }
    return migrated;
}
```

and add the case to the `while (currentVersion < SCHEMA_VERSION)` switch in `migrateState()`, after `case 16`:

```javascript
            case 17:
                migratedState = migrateToVersion17(migratedState);
                break;
```

The switch dispatches on `nextVersion` (`const nextVersion = currentVersion + 1`), **not** the current version — `case 16` calls `migrateToVersion16`. So the new case number and the new function number match.

- [ ] **Step 5: Add the state adapter accessors**

In `assets/js/character-sheet/stateAdapter.js`, add to the `EVENTS` object next to `CLAIMED_SERIES_REWARDS_CHANGED`:

```javascript
    CLAIMED_COUNTRIES_CHANGED: 'claimedCountriesChanged',
```

and add these methods next to `getClaimedSeriesRewards` / `addClaimedSeriesReward`:

```javascript
    /**
     * The Exchange's register: countries already struck off, in claim order.
     * @returns {string[]}
     */
    getClaimedCountries() {
        const raw = this.state[STORAGE_KEYS.CLAIMED_COUNTRIES];
        return Array.isArray(raw) ? [...raw] : [];
    }

    /**
     * Compare countries case- and whitespace-insensitively so "japan" cannot
     * re-claim "Japan", while the display keeps whatever the player typed.
     * @param {string} country
     */
    hasClaimedCountry(country) {
        if (!country || typeof country !== 'string') return false;
        const needle = country.trim().toLowerCase();
        return this.getClaimedCountries().some((entry) => entry.trim().toLowerCase() === needle);
    }

    /**
     * Strike a country off the register. Once ever — a repeat claim is a no-op.
     * @param {string} country
     * @returns {boolean} true if the register now contains it
     */
    addClaimedCountry(country) {
        if (!country || typeof country !== 'string') return false;
        const trimmed = country.trim();
        if (!trimmed) return false;
        if (this.hasClaimedCountry(trimmed)) return true;

        const list = this.getClaimedCountries();
        list.push(trimmed);
        this.state[STORAGE_KEYS.CLAIMED_COUNTRIES] = list;
        void setStateKey(STORAGE_KEYS.CLAIMED_COUNTRIES, list);
        this.emit(EVENTS.CLAIMED_COUNTRIES_CHANGED, [...list]);
        return true;
    }
```

- [ ] **Step 6: Capture the country on the card**

In `assets/js/character-sheet/cardRenderer.js`, inside the branch-picker block added in Task 6, after the `select.addEventListener('click', ...)` line and before `content.appendChild(select)`, add a country input that appears only for a branch flagged `requiresCountry`:

```javascript
        const countryInput = createElement('input', {
            class: 'card-branch-country',
            type: 'text',
            placeholder: 'Country (claimed once, ever)',
            'aria-label': 'Author country to strike off the register'
        });
        countryInput.dataset.questKey = String(questCardData.key ?? '');
        countryInput.addEventListener('click', (event) => event.stopPropagation());

        const syncCountryInput = () => {
            const chosen = branches.find((b) => b.key === select.value) || branches[0];
            countryInput.hidden = !chosen?.requiresCountry;
        };
        select.addEventListener('change', syncCountryInput);
        syncCountryInput();

        content.appendChild(select);
        content.appendChild(countryInput);
```

and remove the standalone `content.appendChild(select);` line that Task 6 added, so the select is appended exactly once.

Add to `assets/css/card-draw.css`:

```css
.card-branch-country {
    display: block;
    width: 100%;
    margin: 0 0 0.5rem;
    padding: 0.35rem 0.5rem;
    font-family: inherit;
    font-size: 0.85rem;
    color: var(--text-primary, #e8e0d0);
    background: rgba(0, 0, 0, 0.45);
    border: 1px solid var(--accent-gold, #c9a961);
    border-radius: 3px;
}
```

- [ ] **Step 7: Stamp the country on the quest and claim it at completion**

In `assets/js/controllers/SideQuestDeckController.js`, inside `handleAddQuestFromCard()`, after `branch` is resolved, read the input and reject a country already on the register:

```javascript
            let branchCountry = null;
            if (branch?.requiresCountry) {
                const input = this.drawnCardDisplay.querySelector(
                    `input.card-branch-country[data-quest-key="${questData.key}"]`
                );
                branchCountry = (input?.value || '').trim() || null;
                if (!branchCountry) {
                    toast.warning('Name the author\'s country before enrolling — the register needs an entry.');
                    continue;
                }
                if (this.stateAdapter.hasClaimedCountry(branchCountry)) {
                    toast.warning(`${branchCountry} is already struck off the Exchange's register.`);
                    continue;
                }
            }
```

and add `branchCountry` to the quest object literal, next to `branchName`:

```javascript
                branchCountry,
```

In `assets/js/controllers/QuestController.js`, inside `completeQuest`'s per-quest loop — immediately after `this.awardBlueprintsForQuest(quest);` at line 724 — add:

```javascript
                    // The Exchange's register: strike the country off, once ever.
                    if (quest.branchCountry) {
                        stateAdapter.addClaimedCountry(quest.branchCountry);
                    }
```

Add the same two lines after the `awardBlueprintsForQuest` calls at lines 1188 and 1348 (the `completeMovedQuestFromBook` and sibling completion paths), using whichever local holds the quest at each site.

- [ ] **Step 8: Show the register in the side quests drawer**

In `_includes/character-sheet/drawers/side-quests.html`, add a container above `<div id="side-quests-table-container"></div>`:

```html
            <h3>The Exchange's Register</h3>
            <p>Countries struck off by <em>The Visiting Scholar</em>. Each one can be claimed once, ever — the list is the reward.</p>
            <div id="exchange-register-container"></div>
```

In `assets/js/table-renderer.js`, add a renderer and call it where `side-quests-table` is hydrated (around line 708):

```javascript
/**
 * Renders the Exchange's register of claimed countries.
 * @returns {string} HTML
 */
export function renderExchangeRegister() {
    const claimed = characterState[STORAGE_KEYS.CLAIMED_COUNTRIES] || [];

    if (claimed.length === 0) {
        return '<p><em>No countries struck off yet. The register is empty.</em></p>';
    }

    const items = claimed
        .map((country) => `<li>${escapeHtml(country)}</li>`)
        .join('');

    return `<ol class="exchange-register">${items}</ol>`;
}
```

and in the hydration block:

```javascript
    const registerEl = document.getElementById('exchange-register-container');
    if (registerEl) {
        registerEl.innerHTML = renderExchangeRegister();
    }
```

`table-renderer.js` already imports `characterState` (from `./character-sheet/state.js`) and `STORAGE_KEYS`, but it does **not** import `escapeHtml`. Add it alongside the existing imports at the top of the file — the same module `cardRenderer.js` uses:

```javascript
import { escapeHtml } from './utils/sanitize.js';
```

- [ ] **Step 9: Run the tests**

```bash
cd tests && npx jest claimedCountries dataValidation statePersistence cloudSync eventEmission --verbose
```

Expected: PASS. `statePersistence` and `cloudSync` exercise `CHARACTER_STATE_KEYS` round-tripping, which is why the key must be in that array.

- [ ] **Step 10: Run the full suite**

```bash
cd tests && npm test
```

Expected: PASS. If a test asserts `SCHEMA_VERSION === 16`, update it — the bump is intentional and the migration is covered.

- [ ] **Step 11: Commit**

```bash
git add assets/js/character-sheet/storageKeys.js assets/js/character-sheet/dataValidator.js assets/js/character-sheet/dataMigrator.js assets/js/character-sheet/stateAdapter.js assets/js/character-sheet/cardRenderer.js assets/js/controllers/SideQuestDeckController.js assets/js/controllers/QuestController.js assets/js/table-renderer.js assets/css/card-draw.css _includes/character-sheet/drawers/side-quests.html tests/claimedCountries.test.js
git commit -m "feat(4yqq): add the Exchange's once-ever country register

Schema v17 adds claimedCountries. The Visiting Scholar's enrollment branch takes a
country at draw time, refuses one already struck off, and claims it on completion.
The register renders in the side quests drawer."
```

---

### Task 8: Rules and rendering catch-up

`table-renderer.js:518` hardcodes `for (let i = 1; i <= 8; i++)`, so quests 9–18 would be invisible in the rules table and the info drawer. The Clubs dice notation and the Blueprint sources list are also stale.

**Files:**
- Modify: `assets/js/table-renderer.js:507-545` (`renderSideQuestsTable`)
- Modify: `core-mechanics.md:35` and the Blueprint sources list around line 70
- Modify: `_includes/character-sheet/drawers/side-quests.html` (heading, journaling copy)
- Test: `tests/tableRenderer.test.js` (existing — extend)

**Interfaces:**
- Consumes: the catalog from Task 5.
- Produces: nothing other tasks depend on.

- [ ] **Step 1: Write the failing test**

Append to `tests/tableRenderer.test.js`, inside the existing side quest describe block:

```javascript
    test('renders a row for every side quest in the catalog, not just the first eight', () => {
        const html = renderSideQuestsTable();
        const keys = Object.keys(sideQuestsDetailed);

        for (const key of keys) {
            expect(html).toContain(sideQuestsDetailed[key].name);
        }
        // One <tr> per quest, plus the header row.
        expect(html.match(/<tr/g).length).toBe(keys.length + 1);
    });

    test('a branching quest lists all of its branch prompts', () => {
        const html = renderSideQuestsTable();
        const hagglers = sideQuestsDetailed['9'];

        for (const branch of hagglers.branches) {
            expect(html).toContain(branch.name);
        }
    });
```

- [ ] **Step 2: Run the test and watch it fail**

```bash
cd tests && npx jest tableRenderer --verbose
```

Expected: FAIL — the row count is `9` (8 quests + header) rather than `19`.

- [ ] **Step 3: Iterate the catalog and render branches**

In `assets/js/table-renderer.js`, replace the body of `renderSideQuestsTable`:

```javascript
export function renderSideQuestsTable() {
    let html = `
<table>
  <thead>
    <tr>
      <th>Roll</th>
      <th>Quest Description</th>
    </tr>
  </thead>
  <tbody>`;

    // Iterate the catalog rather than a fixed range — the pool grows, the loop shouldn't.
    for (const key of Object.keys(sideQuestsDetailed)) {
        const quest = sideQuestsDetailed[key];
        if (!quest) continue;

        const isCompleted = checkSideQuestCompletion(key);
        const rowClass = isCompleted ? 'class="completed-quest"' : '';
        const rowStyle = isCompleted ? 'style="opacity: 0.6; color: #999;"' : '';
        const checkmark = isCompleted ? ' ✓' : '';

        let rewardText = quest.reward;
        if (quest.hasLink && quest.link) {
            rewardText = rewardText.replace(
                quest.link.text,
                `<a href="${quest.link.url}">${quest.link.text}</a>`
            );
        }

        let body;
        if (Array.isArray(quest.branches) && quest.branches.length > 0) {
            const lead = quest.rollInstruction || 'Choose one:';
            const branchItems = quest.branches.map((branch) => {
                const label = quest.branchType === 'roll' ? (branch.roll || branch.key) : branch.key;
                return `<li><strong>${label} · ${branch.name}:</strong> ${branch.prompt} <em>${branch.reward}</em></li>`;
            }).join('');
            body = `<strong>${quest.name}:</strong>${checkmark} ${quest.description} <strong>${lead}</strong><ul class="side-quest-branches">${branchItems}</ul>`;
        } else {
            body = `<strong>${quest.name}:</strong>${checkmark} ${quest.description} <strong>Prompt:</strong> ${quest.prompt} <strong>Reward:</strong> ${rewardText}`;
        }

        html += `
    <tr ${rowClass} ${rowStyle}>
      <td><strong>${key}</strong></td>
      <td>${body}</td>
    </tr>`;
    }
```

Leave the closing `</tbody></table>` and `return html;` exactly as they are.

Also update the JSDoc on `checkSideQuestCompletion` (line 138) — `@param {string} sideQuestNumber - Side quest key` rather than `(1-8)`.

- [ ] **Step 4: Fix the dice notation and the Blueprint sources list**

In `core-mechanics.md`, replace line 35:

```markdown
* **Clubs ♣ (d8 + d4/d4):** Roll a d8 for a Side Quest inside the Library. To leave the Library, roll a d4 for a locale — the Ninefold Bazaar, the Festival of Turning, the Exchange, or the Open Road — then a coin or d4 for which quest at that locale. Most quests outside the Library then branch again; the quest tells you whether you choose or roll.
```

In the **Earn Dusty Blueprints for** list (around line 70), add a bullet in the existing style:

```markdown
    * Completing certain **Side Quests** — the Bazaar, the Exchange, and the Open Road pay in Blueprints.
```

Leave the **Earn Ink Drops by** list alone: side quests 1–8 still pay ink through their buffs, and only the new ones abstain.

- [ ] **Step 5: Update the drawer copy**

In `_includes/character-sheet/drawers/side-quests.html`:

Change the heading:

```html
        <h2>♣ Side Quests</h2>
```

Replace the journaling paragraph — it describes the Library's denizens, which is now wrong for more than half the deck:

```html
            <p>Side quests are the people you meet. Inside the Library that means its denizens — ghosts, lost students, magical portraits, other entities that require your aid. Beyond the doors it means traders at the Ninefold Bazaar, the crowd at the Festival of Turning, the visiting academy at the Exchange, and whoever the Open Road puts in front of you.</p>

            <p>Quests set outside the Library <strong>branch</strong>: the quest offers two to four ways to take it, and you either choose one or roll for it. Each branch has its own prompt and its own payout. Pick your branch on the drawn card before you add the quest.</p>
```

- [ ] **Step 6: Run the tests and build the site**

```bash
cd tests && npx jest tableRenderer pageRenderers --verbose
cd tests && npm test
bundle exec jekyll build
```

Expected: tests PASS; Jekyll builds without Liquid errors.

- [ ] **Step 7: Commit**

```bash
git add assets/js/table-renderer.js core-mechanics.md _includes/character-sheet/drawers/side-quests.html tests/tableRenderer.test.js
git commit -m "fix(4yqq): render every side quest and its branches in the rules table

The table looped 1..8 and would have hidden the ten new quests. It now iterates the
catalog and renders branch lists for branching quests. Clubs dice notation and the
Dusty Blueprint sources list catch up with the expansion."
```

---

### Task 9: Contract tests for the currency and collision rules

Two rules in this expansion are cheap to break silently and cheap to pin: zero Ink Drops, and no reward prompt reaching for a Worn Page penalty verb.

**Files:**
- Test: `tests/dataContracts.test.js` (existing — extend)

**Interfaces:**
- Consumes: everything from Tasks 2, 3, 5.
- Produces: nothing.

- [ ] **Step 1: Write the test**

Append to `tests/dataContracts.test.js`:

```javascript
describe('4yqq currency and collision contracts', () => {
    const NEW_QUEST_KEYS = ['9', '10', '11', '12', '13', '14', '15', '16', '17', '18'];

    test('no new side quest, branch, or expansion item grants Ink Drops', () => {
        const quests = loadJson('sideQuestsDetailed.json');
        for (const key of NEW_QUEST_KEYS) {
            expect(quests[key].rewards.inkDrops).toBe(0);
            for (const branch of quests[key].branches) {
                expect(branch.rewards.inkDrops).toBe(0);
            }
        }
    });

    test('no new prompt reaches for a Worn Page penalty verb', () => {
        // Reward tables and penalty tables must never name the same action: an action that
        // means "you failed" cannot also mean "you won".
        const quests = loadJson('sideQuestsDetailed.json');
        const FORBIDDEN = [/\bDNF\b/i, /did not finish/i, /\bset aside\b/i, /\babandoned\b/i];

        for (const key of NEW_QUEST_KEYS) {
            const texts = [quests[key].prompt, ...quests[key].branches.map(b => b.prompt)];
            for (const text of texts) {
                for (const pattern of FORBIDDEN) {
                    expect(text).not.toMatch(pattern);
                }
            }
        }
    });

    test('every item a new quest grants exists in allItems.json by exact name', () => {
        const quests = loadJson('sideQuestsDetailed.json');
        const items = loadJson('allItems.json');
        const names = new Set(Object.values(items).map(item => item.name));

        for (const key of NEW_QUEST_KEYS) {
            const granted = [
                ...quests[key].rewards.items,
                ...quests[key].branches.flatMap(b => b.rewards.items)
            ];
            for (const name of granted) {
                expect(names.has(name)).toBe(true);
            }
        }
    });

    test('side quest ids are unique and kebab-case across the whole pool', () => {
        const quests = loadJson('sideQuestsDetailed.json');
        const ids = Object.values(quests).map(q => q.id);

        expect(new Set(ids).size).toBe(ids.length);
        for (const id of ids) {
            expect(id).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
        }
    });
});
```

- [ ] **Step 2: Run it**

```bash
cd tests && npx jest dataContracts --verbose
```

Expected: PASS — the data authored in Tasks 2, 3 and 5 already satisfies all four. If the Worn Page test fails, the offending prompt must be rewritten, not the test relaxed.

- [ ] **Step 3: Cross-check the curse table by hand**

The spec flags this as the highest-priority unchecked file. Read it and confirm no new prompt duplicates a penalty verb:

```bash
grep -io "read\|reread\|re-read\|dnf\|abandon\|set aside\|finish" assets/data/curseTableDetailed.json | sort | uniq -c
sed -n '1,80p' assets/data/curseTableDetailed.json
```

Record what you find in the handoff. If a collision surfaces beyond DNF, rewrite the branch prompt and note it in the spec's verification table.

- [ ] **Step 4: Commit**

```bash
git add tests/dataContracts.test.js
git commit -m "test(4yqq): pin the zero-Ink-Drop and no-penalty-verb contracts

Cheap guards against the two rules this expansion is most likely to lose silently
as content is added to the same files later."
```

---

### Task 10: Beads, docs, and handoff

**Files:**
- Modify: `docs/superpowers/specs/2026-08-29-4yqq-side-quest-expansion-design.md`
- Modify: `.beads/issues.jsonl` (via `bd export`)

- [ ] **Step 1: Mark the superseded spec**

Add immediately below the H1 of `docs/superpowers/specs/2026-08-29-4yqq-side-quest-expansion-design.md`:

```markdown
> **SUPERSEDED (2026-08-30)** by
> [`2026-08-30-4yqq-side-quest-expansion-draft3.md`](2026-08-30-4yqq-side-quest-expansion-draft3.md),
> which specifies ten branching quests rather than twelve flat ones. The engineering findings
> below — the blueprint payout gap (R4) and the hardcoded `1..8` render loop (R5) — are still
> correct and were carried forward. The quest and item content below was **not** implemented.
```

- [ ] **Step 2: File the follow-up beads**

```bash
bd list   # confirm the tracker is healthy before any write

bd create "Implement side quest stakes as a full mechanic" -p 2
bd create "Commission card art for the ten Beyond the Library Doors side quests" -p 3
bd create "Commission item art for the five Beyond the Library Doors items" -p 3
bd create "Verify new side quest prompts against the eleven unchecked data files" -p 2
```

Give each a description explaining the scope. For the stake bead, record that the `stake` objects are already authored in `sideQuestsDetailed.json` and are inert: the mechanic needs a declared-stake field on the active quest, an outcome prompt at completion, and multiply/subtract-with-floor resolution through the reward pipeline. For the verification bead, list the files the spec names as unchecked, with `curseTableDetailed.json` first.

Then link them and close the parent:

```bash
bd dep add <stake-bead-id> tome-of-secrets-4yqq
bd update tome-of-secrets-4yqq --status in_progress
```

- [ ] **Step 3: Final verification**

```bash
node scripts/generate-data.js
cd tests && npm run validate-data
cd tests && npm test
bundle exec jekyll build
```

Expected: generator succeeds, validator reports 18 side quests and 43 items with no errors, the full Jest suite is green, and Jekyll builds. Do not proceed on a red run — paste the failure and fix it.

- [ ] **Step 4: Subagent pre-commit review**

AGENTS.md requires a separate subagent pass over the diff before handoff on any code change. Dispatch one with the full diff and ask it to check: ADR-003 conformance on the new `effects`, the additive blueprint semantics for double-pay or lost-bonus regressions, the migration's `case 16` placement, and whether any test asserts behaviour it also implements.

- [ ] **Step 5: Close out and hand off**

```bash
bd close tome-of-secrets-4yqq --reason "Ten branching side quests, five items, sixteen tags, branch picker, blueprint payout path and the Exchange register shipped. Stakes and art tracked separately."
bd export --no-memories -o .beads/issues.jsonl
git add .beads/issues.jsonl docs/superpowers/specs/2026-08-29-4yqq-side-quest-expansion-design.md
git commit -m "docs(4yqq): supersede the twelve-quest draft and file follow-ups"
git push -u origin 4yqq-side-quest-expansion
```

Open a PR against `main`; do not merge it. Summarise in the PR body: what shipped, that Ink Drops are held at zero by contract and by test, that the stake objects are authored but inert, that card and item art are outstanding (cards render with the overlay and a missing image), and that `SCHEMA_VERSION` moved to 17 so a stale tab will migrate on next load.

---

## Verification Summary

| What | Command | Expected |
|---|---|---|
| Data shape | `cd tests && npm run validate-data` | 18 side quests, 43 items, 0 errors |
| Data exports | `node scripts/generate-data.js` | Regenerates `data.json-exports.js` (gitignored) |
| Unit + integration | `cd tests && npm test` | All green |
| Site build | `bundle exec jekyll build` | No Liquid errors |
| Blueprint payout | `cd tests && npx jest sideQuestBlueprints` | Green — the regression guard |
| Currency contract | `cd tests && npx jest dataContracts` | Green — zero Ink Drops |

## Known Gaps at Handoff

- **Card and item art.** Ten quest cards and five item images. Art lives in Supabase, not the repo (`git ls-files assets/images` is empty), so this is a maintainer task. Cards render with the content overlay and a broken image until it lands.
- **Stakes are inert.** Five `stake` objects are authored in the JSON and nothing reads them. Tracked as its own bead.
- **Eleven data files unverified.** The spec's verification pass covered eleven files; eleven more were not checked. Task 9 Step 3 covers `curseTableDetailed.json` by hand; the rest is a follow-up bead.
- **Clubs dice notation is a two-roll instruction**, not a single die. Eighteen quests do not fit a standard die, and the spec's locale-then-quest draw order is the intended shape. The physical-dice path is now slightly more elaborate than the other suits.
