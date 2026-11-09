# Dollar Economy Overhaul Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. In this run, each task is executed by an Orca worker (see the maintainer's choice of execution method).

**Goal:** Replace Ink Drops and Paper Scraps with one real-dollar Fund. Remove the Shroud/curse system, journaling, and the shopping page. Keep XP, levels, SMP, Blueprints, and the quest-completion receipt.

**Architecture:** Rewards keep flowing through `RewardCalculator`, which hands them to `ModifierPipeline` (ADR-003). The `Reward` object's `inkDrops`/`paperScraps` become a single `dollars` field. Catalog JSON effects switch to `resource: "dollars"`, and `MULTIPLY` is banned. The Fund balance and the deduction ledger live in character state behind `StateAdapter`, like blueprints. Schema v18 strips retired keys and form fields.

**Tech Stack:** Vanilla ES modules, Jekyll includes and Markdown, Jest (`tests/`), data pipeline `scripts/generate-data.js` + `scripts/validate-data.js`.

**Spec:** `docs/superpowers/specs/2026-11-08-dollar-economy-design.md`. Read it before starting any task. All dollar values in this plan come from it, and its tables are authoritative.

## Global Constraints

- Every completed quest pays a **$15** base, including restoration projects. When an ability lets a book clear a second quest, that second quest pays a **$10** base.
- Atmospheric buff: **$1 per buff per active day**. A buff associated with the chosen sanctum pays **$2/day** in total.
- No `MULTIPLY` modifier anywhere in the catalog JSON or side-quest stake JSON. No `inkDrops`/`paperScraps` remain in the code, the data, or the UI copy. Remaining hits are allowed only inside the v18 migration and its tests, and in the hiding of legacy history.
- XP bases are unchanged: genre 15, default 25, monster encounter 30, side quests and dungeon rooms as authored. A library book completion pays 15 XP and **no dollars**.
- Blueprint sources and restoration costs are unchanged.
- The Fund starts at **$0**. Old Ink/Paper balances are discarded, not converted.
- The quest-completion receipt pop-up keeps its line-by-line breakdown, shown in dollars.
- After any edit to `assets/data/*.json`, run `node scripts/generate-data.js`, then `cd tests && npm run validate-data`.
- Run tests with `cd tests && npx jest <file>`. The full suite is `cd tests && npm test`, and it must be green at the end of every task.
- Commits go on a feature branch only. Never add `Co-Authored-By` trailers. Beads (`bd`) is **not** used; skip every Beads step in AGENTS.md.
- UI must match the Dark Academia style. Reuse the `rpg-stats-panel` classes and the existing form styling in `_includes/character-sheet/tabs/character.html`.
- Before handoff, each task gets a subagent pre-commit review of its diff (AGENTS.md).

## Review Focus

1. **A real v17 save loads after the upgrade.** Old Ink/Paper values, curses, a shopping log, and a journal count are all present. Expected: the page loads, the Fund shows $0, and XP, level, SMP, blueprints, inventory, quests, and books are unchanged. Covered by a Task 8 test.
2. **Restoring an older cloud snapshot.** The snapshot contains retired keys (`activeCurses`, `shoppingLog`) and form fields (`inkDrops`, `journal-entries-completed`). Expected: they are stripped on apply, nothing is written back, and a Fund already present on the snapshot is kept. Covered by a Task 8 test.
3. **Messy deduct input.** Inputs like `""`, `"0"`, `"-5"`, `"$20"`, `"1,250.5"`, `"12.345"`, and `"abc"`. Expected: positive amounts parse to cents (`$20` → 2000, `1,250.5` → 125050, `12.345` → 1235 rounded). Anything else is rejected with an inline message. A deduction that would make the balance negative asks for confirmation first. Covered by Task 7 tests.
4. **Linking a book that is already linked to a quest.** Expected: refused with a visible message unless the keeper knows Quick Shot, Irresistible Charm, or Concussive Blast. With one of those abilities known, a second link is allowed, and that quest pays a $10 base. A third link is always refused. Covered by Task 6 tests.
5. **Old completed quests that stored `inkDrops`/`paperScraps` rewards.** Expected: the archive and receipt views show XP and blueprints only. Never show `undefined`, `NaN`, or "Ink" labels. Covered by a Task 4 test.

---

## File map

| Area | Files |
|---|---|
| Shared helper extraction | Create `assets/js/character-sheet/helperDiscoveryShared.js` |
| Shroud removal | Delete `shroud.md`, `assets/data/curseTableDetailed.json`, `_includes/character-sheet/tabs/curses.html`, `assets/js/controllers/CurseController.js`, `assets/js/character-sheet/curseHelperDiscovery.js`, `assets/js/viewModels/curseViewModel.js`, `assets/js/services/WornPagePrevention.js`, `tests/curseHelperDiscovery.test.js`, `tests/viewModels/curseViewModel.test.js` |
| Fund state | Modify `storageKeys.js`, `stateAdapter.js`, `dataValidator.js`, `persistence.js` |
| Fund logic | Create `assets/js/services/FundLedgerService.js` |
| Fund UI | Create `assets/js/controllers/FundController.js` and `assets/js/viewModels/fundLedgerViewModel.js`. Modify `_includes/character-sheet/tabs/character.html` |
| Reward core | Modify `RewardCalculator.js`, `ModifierPipeline.js`, `effectSchema.js`, `TriggerPayload.js`, `gameConfig.js`, `currencyService.js`, `ui.js` (receipts), `StatusWidget.js` |
| Shop removal | Delete `shopping.md`, `assets/data/shoppingOptions.json`, `assets/js/page-renderers/shoppingRenderer.js`, `assets/js/services/ShoppingBalanceService.js`, `assets/js/controllers/BookBoxSubscriptionController.js`, `assets/js/character-sheet/currencyWarning.js`, `tests/ShoppingBalanceService.test.js` |
| Migration | Modify `dataMigrator.js`, `dataValidator.js` (`SCHEMA_VERSION = 18`), `formPersistence.js`, `services/cloudSync.js` |

Tasks run **sequentially in the order below**. Most of them touch `stateAdapter.js`, `characterSheet.test.js`, and `EndOfMonthController.js`, so running them in parallel would conflict. Tasks 6 and 7 both depend only on Task 4 and touch different files, so they may run in parallel if the orchestrator isolates the worktrees and merges in order.

---

### Task 1: Remove the Shroud / curse system

**Files:**
- Create: `assets/js/character-sheet/helperDiscoveryShared.js`
- Delete: everything listed under "Shroud removal" in the file map
- Modify:
  - `_layouts/default.html` (remove the Shroud nav link)
  - `_includes/character-sheet/tab-nav.html` and `quests.html:177`
  - `assets/js/character-sheet.js`, `delegatedClickHandler.js`, `ui.js`, `renderComponents.js`
  - `models/Character.js`, `stateAdapter.js` (curse methods, roughly lines 518–689)
  - `table-renderer.js` (`renderCurseTable`), `character-sheet/data.js` (`cursesById`, `getCurse`, `curseTable`)
  - `EndOfMonthController.js:179-195`, `QuestController.js:1069-1080` (`remove_all_worn_pages`)
  - `SeriesCompletionService.js:166-172` (dead `curse-removal` case)
  - `questDrawHelperDiscovery.js:7`, `dataValidator.js`
  - `scripts/generate-data.js:38`, `scripts/validate-data.js` (curse sections)
  - `assets/data/expansions.json`, CSS curse rules in `character-sheet.css` and `style.scss`
- Test: `tests/questDrawHelperDiscovery.test.js`, `tests/characterSheet.test.js`, `tests/stateAdapter.test.js`, plus every other test file that references curses

**Interfaces:**
- Produces: `helperDiscoveryShared.js` exports `buildSourceId`, `getCadenceFromText`, and `validateHelperState`. The last one is `validateCurseHelperState` renamed. Its signature and behaviour do not change.
- Keeps: `STORAGE_KEYS.ACTIVE_CURSES`, `COMPLETED_CURSES`, and `CURSE_HELPER_STATE` constants stay in `storageKeys.js` **only** so Task 8 can delete them from old saves. Remove them from `CHARACTER_STATE_KEYS`, `createEmptyCharacterState()`, the `loadAndMigrateState` key list, and `persistence.js`.

- [ ] **Step 1: Move the shared helpers.** Move `buildSourceId`, `getCadenceFromText`, and `validateCurseHelperState` (as `validateHelperState`) into `helperDiscoveryShared.js`. Repoint `questDrawHelperDiscovery.js` and the `QUEST_DRAW_HELPER_STATE` check in `dataValidator.js`.
- [ ] **Step 2: Check the move.** Run `cd tests && npx jest questDrawHelperDiscovery`. Expected: PASS, unchanged.
- [ ] **Step 3: Delete the curse system.** Delete the curse files and strip the curse code from the files listed above.
- [ ] **Step 4: Strip effects that target Worn Pages.** Remove every effect with `target: "worn_page"`, or `PREVENT` on `ON_MONTH_END`, from `allItems.json` (Chalice of Restoration, Raven Familiar), `masteryAbilities.json` (Ward Against the Shroud, Grand Dispelling), and `schoolBenefits.json` (Abjuration). Leave their `effects: []` and their text untouched; Task 5 retargets them. Remove Worn-Page outcomes from `temporaryBuffs.json` (Librarian's Blessing, Unwavering Resolve) the same way.
- [ ] **Step 5: Regenerate and validate.** Run `node scripts/generate-data.js && cd tests && npm run validate-data`. Expected: no errors.
- [ ] **Step 6: Add the guard test.** In `tests/dataContracts.test.js`, add `test('no catalog effect targets worn_page and no curse data export exists')`. It asserts that `data.curseTable`, `data.cursesById`, and `data.getCurse` are `undefined`, and that no effect in any catalog JSON has `modifier.target === 'worn_page'`.
- [ ] **Step 7: Clean up the tests.** Delete the curse-only test files and describe blocks (`describe("The Shroud's Curse")` in `characterSheet.test.js`, the curse sections in `stateAdapter.test.js`, and the others). Fix the remaining references. Run `cd tests && npm test`. Expected: all PASS.
- [ ] **Step 8: Commit.** `git commit -m "refactor: remove Shroud curse system"`

---

### Task 2: Remove journaling

**Files:**
- Modify:
  - `_includes/character-sheet/tabs/quests.html:106-114` (delete the `#journal-entries-completed` input and its end-of-month text)
  - `EndOfMonthController.js:6,127-155`
  - `RewardCalculator.js:811-855` (delete `calculateJournalEntryRewards`)
  - `gameConfig.js` (delete `endOfMonth.journalEntry`)
  - `effectSchema.js` (delete `ON_JOURNAL_ENTRY`)
  - `ModifierPipeline.js` (delete `_journalEntryMultiplier` and its uses)
  - `TriggerPayload.js:51-59`
- Data:
  - `allItems.json`: strip the `ON_JOURNAL_ENTRY` effects from Librarian's Quill and Golden Pen
  - `keeperBackgrounds.json`: strip them from Scribe's Acolyte
  - `sideQuestsDetailed.json`: remove the `countsAsJournalEntry` conditions at ~403 and ~635
  - Task 5 rewrites the text for all of these
- Copy:
  - `core-mechanics.md` (delete "The Keeper's Journal" section and the lines at 58 and 62)
  - "Journaling:" sections in `_includes` drawers: `atmospheric-buffs.html`, `dungeons.html`, `genre-quests.html`, `side-quests.html`
  - Prompt blockquotes in `keeper-backgrounds.html`, `library-sanctums.html`, `wizard-schools.html`
- Test: `RewardCalculator.test.js`, `ModifierPipeline.test.js`, `RewardCalculatorReceipts.test.js`, `gameConfig.test.js`, `realDataIntegration.test.js`, `characterSheet.test.js`, `temporaryBuffCatalog.test.js`

**Interfaces:**
- Produces: `TRIGGERS` no longer contains `ON_JOURNAL_ENTRY`. `validateEffect` therefore rejects it.

- [ ] **Step 1: Add the guard tests.**
  - In `tests/dataContracts.test.js`: `test('no catalog effect uses ON_JOURNAL_ENTRY')`. It scans all catalog JSON.
  - In `tests/ModifierPipeline.test.js`: `test('ON_JOURNAL_ENTRY is not a valid trigger')`. It asserts `validateEffect({trigger:'ON_JOURNAL_ENTRY', modifier:{type:'ADD_FLAT', resource:'xp', value:1}}).valid === false`.
- [ ] **Step 2: Watch them fail.** Run `cd tests && npx jest dataContracts ModifierPipeline`. Expected: FAIL.
- [ ] **Step 3: Remove journaling.** Remove the code, data, and copy listed above. Delete the journal tests and replace none of them.
- [ ] **Step 4: Regenerate and run everything.** Run `node scripts/generate-data.js && cd tests && npm run validate-data && npm test`. Expected: PASS.
- [ ] **Step 5: Confirm nothing is left.** Run `grep -rniE "journal" assets/js _includes *.md`. Expected: no matches.
- [ ] **Step 6: Commit.** `git commit -m "refactor: remove journaling mechanic"`

---

### Task 3: Fund state and accessors

**Files:**
- Modify: `assets/js/character-sheet/storageKeys.js`, `stateAdapter.js`, `dataValidator.js`, `persistence.js`, `dataMigrator.js` (the `loadAndMigrateState` key list only)
- Create: `assets/js/services/FundLedgerService.js`
- Test: `tests/stateAdapter.test.js`, `tests/services/FundLedgerService.test.js`

**Interfaces:**
- Produces:
  - **Storage keys:**
    - `STORAGE_KEYS.FUND_BALANCE_CENTS = 'fundBalanceCents'`: integer, default `0`.
    - `STORAGE_KEYS.FUND_LEDGER = 'fundLedger'`: array, default `[]`.
    - Both are added to `CHARACTER_STATE_KEYS` and `createEmptyCharacterState()`.
  - **Ledger entry shape:** `{ id: string, date: 'YYYY-MM-DD', amountCents: positive integer, note: string }`.
  - **StateAdapter methods:**
    - `getFundBalanceCents(): number`
    - `setFundBalanceCents(cents: number): number`. Rounds the input to an integer.
    - `addFunds(dollars: number): number`. Rewards are whole dollars, so this adds `dollars * 100`. Ignores values ≤ 0 and non-numbers. Returns the new balance in cents.
    - `deductFunds({ amountCents, note = '', date }): FundLedgerEntry | null`. Appends to the ledger and subtracts from the balance. Returns `null` when `amountCents` is not a positive integer. The balance is allowed to go negative.
    - `deleteFundDeduction(id: string): boolean`. Removes the entry and refunds its amount.
    - `getFundLedger(): FundLedgerEntry[]`
    - Every mutation persists through `setStateKey` and emits `EVENTS.FUND_CHANGED` with `{ balanceCents }`.
  - **`FundLedgerService.js` (pure functions):**
    - `parseDollarInput(raw: string): number | null`. Returns cents. Strips `$` and `,`, then requires a value > 0. Rounds to the nearest cent.
    - `formatCents(cents: number): string`. `1234` → `"$12.34"`, `1500` → `"$15"`, `-500` → `"-$5"`.
    - `groupLedgerByMonth(entries): Array<{ monthKey: 'YYYY-MM', label: 'November 2026', totalCents, entries }>`. Groups are sorted newest first, and the entries inside each group are newest first.

- [ ] **Step 1: Write the FundLedgerService tests.** In `tests/services/FundLedgerService.test.js`:

```js
test('parseDollarInput', () => {
  expect(parseDollarInput('$20')).toBe(2000);
  expect(parseDollarInput('1,250.5')).toBe(125050);
  expect(parseDollarInput('12.345')).toBe(1235);
  ['', '0', '-5', 'abc', null].forEach(v => expect(parseDollarInput(v)).toBeNull());
});
test('formatCents', () => {
  expect(formatCents(1234)).toBe('$12.34');
  expect(formatCents(1500)).toBe('$15');
  expect(formatCents(-500)).toBe('-$5');
});
test('groupLedgerByMonth sorts newest first and totals per month', () => {
  const g = groupLedgerByMonth([
    { id: 'a', date: '2026-10-03', amountCents: 3200, note: '' },
    { id: 'b', date: '2026-11-01', amountCents: 1900, note: 'Legendarium purchase' },
    { id: 'c', date: '2026-11-07', amountCents: 500, note: '' },
  ]);
  expect(g.map(x => x.monthKey)).toEqual(['2026-11', '2026-10']);
  expect(g[0].totalCents).toBe(2400);
  expect(g[0].entries.map(e => e.id)).toEqual(['c', 'b']);
});
```

- [ ] **Step 2: Write the StateAdapter test.** In `tests/stateAdapter.test.js`, add `describe('Fund')`. It covers:
  - `addFunds(15)` → `getFundBalanceCents() === 1500`
  - `deductFunds({amountCents: 3200, note: 'x', date: '2026-11-08'})` → the balance is `-1700` and the ledger has length 1
  - `deleteFundDeduction(id)` → the balance is back to `1500` and the ledger is empty
  - `deductFunds({amountCents: 0})` returns `null`
  - `addFunds(-5)` is a no-op
- [ ] **Step 3: Watch them fail.** Run `cd tests && npx jest FundLedgerService stateAdapter -t Fund`. Expected: FAIL.
- [ ] **Step 4: Implement.** Add the keys, the validator defaults (`fundBalanceCents` must be a finite integer, otherwise `0`; `fundLedger` drops malformed entries), the persistence entries, the StateAdapter methods, and the service.
- [ ] **Step 5: Run the tests again.** Expected: PASS. Then run `cd tests && npm test`. Expected: PASS.
- [ ] **Step 6: Commit.** `git commit -m "feat: fund balance and deduction ledger state"`

---

### Task 4: Dollar reward core (quests, receipts, payouts)

**Files:**
- Modify:
  - `RewardCalculator.js`, `ModifierPipeline.js`, `effectSchema.js`, `gameConfig.js`, `currencyService.js`
  - `QuestRewardService.js`, `BaseQuestHandler.js`, `QuestService.js`, the `RestorationQuestHandler` file
  - `AtmosphericBuffService.js`, `EndOfMonthController.js`, `BuffController.js:170-190`
  - `CharacterController.js:105-160` (level rewards), `RestorationController.js:170`, `QuestController.js:1012-1066` (delete the transmute flow), `QuestController.js:1458` (wing completion)
  - `DungeonRewardService.js`, `SeriesCompletionService.js:145`
  - `stateAdapter.js:2076-2079` (delete the curriculum synergy), `assets/js/character-sheet.js:128-148`
  - `ui.js:2035-2121` (receipts), `components/StatusWidget.js`
  - `_includes/character-sheet/tabs/character.html` (remove the `#inkDrops`/`#paperScraps` inputs and `#currency-unsaved-warning`; add a read-only `#fund-balance-display` placeholder that Task 7 replaces)
  - Data: `levelRewards.json`
- Test: `RewardCalculator.test.js`, `RewardCalculatorReceipts.test.js`, `ModifierPipeline.test.js`, `gameConfig.test.js`, `questHandlers.test.js`, `restoration.test.js`, `statusWidget.test.js`, `uiCompletedQuestsDungeonArchive.test.js`, `characterSheet.test.js`

**Interfaces:**
- Consumes: `stateAdapter.addFunds(dollars)` from Task 3.
- Produces:
  - **`Reward`.** The constructor is `new Reward({ xp = 0, dollars = 0, blueprints = 0, items = [], modifiedBy = [] })`. `receipt.base` and `receipt.final` are `{ xp, dollars, blueprints }`. `inkDrops` and `paperScraps` are removed.
  - **`GAME_CONFIG.rewards.questBase = { dollars: 15 }`** and **`GAME_CONFIG.rewards.secondaryQuestBase = { dollars: 10 }`**. These are used by Task 6.
  - **XP bases unchanged:** `organizeTheStacks.xp = 15`, `defaultQuestCompletion.xp = 25`, `encounter.monster.xp = 30`. Delete the `friendlyCreature` and `familiar` currency entries. Extra credit keeps `restoration.extraCreditBlueprintReward = 10`.
  - **`GAME_CONFIG.atmospheric = { resource: 'dollars', baseValue: 1, sanctumBonus: 2 }`.** `sanctumBonus` is the total daily value for an associated buff, as it is today.
  - **`GAME_CONFIG.restoration.wingCompletionRewards = { dollars: 25, xp: 75 }`.** Delete the unused `wingPassiveBonus`.
  - **`RewardCalculator.getBaseRewards(questType, …)`** returns `dollars: 15` for every quest type: genre, side, dungeon room, dungeon encounter, extra credit, and restoration. It also returns the existing XP and blueprints. Per-room and per-quest Ink/Paper values from JSON are ignored.
  - **`updateCurrency(rewards)`** calls `stateAdapter.addFunds(rewards.dollars)` and keeps its XP, blueprint, and item handling.
  - **Effect resources:** `effectSchema.js` exports `RESOURCES = Object.freeze(['xp', 'dollars', 'blueprints'])`.
  - **`levelRewards.json`** entries become `{ dollars, blueprints, smp, inventorySlot }`, with values from the spec's Levels table. Level 2–4: $10 and +10 blueprints. 5–9: $15/+10. 10–14: $20/+15. 15–19: $25/+15. 20: $50/+25. SMP 1 at levels 3, 5, 7, 10, 13, 15, 17, 20. Inventory slots unchanged at 4, 8, 12, 16, 19.

- [ ] **Step 1: Write the failing reward tests.**
  - In `tests/RewardCalculator.test.js`:
    - `test.each(['genre','side','dungeonRoom','dungeonEncounter','extraCredit','restoration'])('%s quest pays $15 base', …)`. Asserts `reward.dollars === 15` with no effects active.
    - `test('atmospheric pays $1/day and sanctum-associated $2/day')`: 3 days on a plain buff plus 2 days on an associated buff gives `dollars === 7`.
    - `test('library book completion grants 15 XP and 0 dollars')`.
  - In `tests/RewardCalculatorReceipts.test.js`: `test('receipt lists base $15 and each flat dollar line')`.
  - In `tests/uiCompletedQuestsDungeonArchive.test.js`: `test('legacy quest with inkDrops/paperScraps renders XP and blueprints only')`. Asserts the rendered HTML contains none of `undefined`, `NaN`, or `Ink`.
- [ ] **Step 2: Watch them fail.** Run `cd tests && npx jest RewardCalculator uiCompletedQuestsDungeonArchive`. Expected: FAIL.
- [ ] **Step 3: Implement the core.**
  - Replace the Reward fields as above. Update the pipeline's `receipt.final` and the receipt/StatusWidget rendering to a single dollar line, formatted with `formatCents(dollars * 100)`.
  - Route every payout through `dollars`: quests, atmospheric, wing completion, level-up, series stops, Librarian's Hoard ($20), and Philosopher's Stone (−50 XP → +$5).
  - Delete the ink↔paper transmute flow and the curriculum synergy.
  - Delete the dead `applyModifiers` path (`RewardCalculator.js:280-391`) and the hardcoded `_getModifier` background bonus (~611).
  - Leave `MULTIPLY` handling in place for now; Task 5 removes it together with the data.
- [ ] **Step 4: Convert the level rewards.** Convert `levelRewards.json`. Run `node scripts/generate-data.js && cd tests && npm run validate-data`.
- [ ] **Step 5: Run the tests.** Run `cd tests && npm test`. Expected: PASS. Tests that asserted old Ink/Paper values are updated to the dollar values, not deleted.
- [ ] **Step 6: Commit.** `git commit -m "feat: dollar reward core with \$15 quest base"`

---

### Task 5: Catalog content conversion and multiplier ban

**Files:**
- Data:
  - `allItems.json`, `keeperBackgrounds.json`, `schoolBenefits.json`, `masteryAbilities.json`
  - `temporaryBuffs.json`, `temporaryBuffsFromRewards.json`, `dungeonCompletionRewards.json` (Story Surge)
  - `sideQuestsDetailed.json` (stakes, rewards text, Masked Procession), `dungeonRooms.json` (reward text, Nymph outcome, The Shroud's Heart prompt), `genreQuests.json`
  - `seriesCompletionRewards.json` (stops, Echoing Caverns, Midnight Waystation, Weaver's Hollow), `permanentBonuses.json` (level 7 text)
  - `sanctumBenefits.json` (drop the dead `MULTIPLY inkDrops` selector effects; keep the selector data in a non-effect field if `EffectRegistry.js:238-243` needs it)
- Code:
  - `ModifierPipeline.js` (delete `_applyMultiply`)
  - `effectSchema.js` (remove `MULTIPLY` from `MODIFIER_TYPES` and `RESOLUTION_ORDER`)
  - `RewardCalculator.js:665-716` (the familiar ON_STATE_LOAD block becomes flat `dollars`: Empowered Bond +$1, Echo Chamber +$3 per equipped familiar)
  - `AtmosphericBuffService.js` (Tome-Bound Cat: +$1 per atmospheric buff day instead of ×2)
  - The side-quest stake resolver (find `halve`/`multiply`/`forfeit` handling in the side-quest completion seam)
  - `scripts/validate-data.js`
- Test: `tests/dataValidation.test.js`, `tests/realDataIntegration.test.js`, `tests/sideQuestBranches.test.js`, `tests/ModifierPipeline.test.js`

**Interfaces:**
- Consumes: `RESOURCES` from Task 4.
- Produces: `validate-data` fails on any of the following:
  - a `MULTIPLY` modifier
  - any `inkDrops`/`paperScraps` key or resource in the catalog JSON
  - a stake `multiply`/`halve` key
  - "Ink Drop", "Paper Scrap", "Worn Page", or "journal" (case-insensitive) in any catalog text field

- [ ] **Step 1: Write the failing data tests.**
  - In `tests/dataValidation.test.js`:
    - `test('catalog has no MULTIPLY, inkDrops or paperScraps')`
    - `test('catalog text has no Ink Drop / Paper Scrap / Worn Page / journal wording')`
  - In `tests/realDataIntegration.test.js`, add one assertion per row of the spec's tables. Examples:
    - `Tome of Potential` equipped `+10 dollars`, passive `+5`
    - `Grand Dispelling` `+10 dollars`
    - `Scribe's Acolyte` `+3 dollars`
    - `Tome-Bound Cat` with 4 atmospheric days → `+4 dollars`
    - `Enchantment` → `+10 xp` flat
    - `Haggler's Row` win → the blueprint reward added again as a flat number
    - a failed stake leaves `dollars === 15`
- [ ] **Step 2: Watch them fail.** Run `cd tests && npx jest dataValidation realDataIntegration sideQuestBranches`. Expected: FAIL.
- [ ] **Step 3: Convert the data.** Convert every entry using the spec's item table, the "Former Worn Page and journaling content" table, the backgrounds/schools/abilities table, the temporary buffs table, the side-quest stakes section, and the series section. Rewrite each `bonus`/`description`/`reward` string to dollar wording, for example "Books over 400 pages grant +$10." Equipped and passive values go in the existing `slot`-scoped effect pairs.
- [ ] **Step 4: Remove the multiplier code and add the validator bans.** Delete the `MULTIPLY` code paths and add the bans to `scripts/validate-data.js`.
- [ ] **Step 5: Regenerate, validate, and test.** Run `node scripts/generate-data.js && cd tests && npm run validate-data && npm test`. Expected: PASS.
- [ ] **Step 6: Commit.** `git commit -m "feat: convert catalog to flat dollar effects; ban multipliers"`

---

### Task 6: One book, one quest (with the $10 secondary quest)

**Files:**
- Modify:
  - `stateAdapter.js:1534` (`linkQuestToBook`)
  - `assets/js/utils/questBookLinker.js`
  - `QuestController.js` link call sites at ~522, 697, 721, 1000, 1172, 1816
  - `RewardCalculator.getBaseRewards` / `QuestRewardService.js` (secondary base)
- Test: `tests/libraryQuestLinking.test.js`, `tests/questBookLinker.test.js`, `tests/RewardCalculator.test.js`

**Interfaces:**
- Consumes: `GAME_CONFIG.rewards.questBase` and `secondaryQuestBase` from Task 4.
- Produces:
  - **`MULTI_QUEST_ABILITIES = Object.freeze(['Quick Shot', 'Irresistible Charm', 'Concussive Blast'])`**, exported from `gameConfig.js`.
  - **`stateAdapter.canLinkQuestToBook(bookId, questId): { ok: boolean, reason?: 'already-linked' | 'max-links' }`**. A link that already exists returns `ok: true` (idempotent).
    - A book with 0 links: allowed.
    - A book with 1 link: allowed only if a learned ability is in `MULTI_QUEST_ABILITIES`. Otherwise it returns `already-linked`.
    - A book with 2 or more links: returns `max-links`.
    - Existing saves with more links are not modified.
  - **`linkQuestToBook`** returns `false` when `canLinkQuestToBook` is not ok.
  - **`stateAdapter.isSecondaryQuestForBook(bookId, questId): boolean`**. True when the quest's index in `book.links.questIds` is ≥ 1.
  - **Base dollars** are `secondaryQuestBase.dollars` (10) when the completed quest's book makes `isSecondaryQuestForBook` true, and 15 otherwise. A quest with no `bookId` pays 15.
  - **When a link is refused,** the UI shows a toast through the existing toast helper: "This book is already linked to a quest." For `max-links` it shows "A book can complete at most two quests."

- [ ] **Step 1: Write the failing tests.**
  - In `tests/libraryQuestLinking.test.js`:
    - `test('second link refused without a multi-quest ability')`
    - `test('second link allowed with Quick Shot; third refused')`
    - `test('relinking same quest is idempotent')`
    - `test('pre-existing multi-linked book is left intact on load')`
  - In `tests/RewardCalculator.test.js`:
    - `test('secondary quest for a book pays $10 base, item bonuses still apply')`
    - `test('quest without bookId pays $15')`
- [ ] **Step 2: Watch them fail.** Run `cd tests && npx jest libraryQuestLinking questBookLinker RewardCalculator`. Expected: FAIL.
- [ ] **Step 3: Implement.** Add the guard and the secondary-quest base. Make every link call site in `QuestController.js` and `questBookLinker.js` check the returned boolean and show the toast.
- [ ] **Step 4: Run the tests.** Run `cd tests && npm test`. Expected: PASS.
- [ ] **Step 5: Commit.** `git commit -m "feat: one book per quest, \$10 secondary quest base"`

---

### Task 7: Fund widget and shop removal

**Files:**
- Create:
  - `assets/js/controllers/FundController.js` (extends `BaseController`)
  - `assets/js/viewModels/fundLedgerViewModel.js`
- Modify:
  - `_includes/character-sheet/tabs/character.html` (the Resources panel; replace the Task 4 placeholder)
  - `assets/js/character-sheet.js` (register the controller)
  - `assets/css/character-sheet.css` (only if existing classes don't cover it)
- Delete: everything listed under "Shop removal" in the file map. Also remove:
  - the shopping nav link in `_layouts/default.html:54`
  - the `expansions.json` entries
  - `data.js:24` and `generate-data.js:42`
  - the "Shopping Page Renderer" describe in `tests/pageRenderers.test.js`
  - the `stateInitUI.js:41` comment
  - `STORAGE_KEYS.SHOPPING_LOG`, `BOOK_BOX_SUBSCRIPTIONS`, and `BOOK_BOX_HISTORY` from `CHARACTER_STATE_KEYS`, `createEmptyCharacterState()`, `persistence.js`, the `dataValidator.js` sections, and the `stateAdapter.js:1858-1950` methods. The constants stay for Task 8.
- Test: `tests/viewModels/fundLedgerViewModel.test.js`, `tests/controllers.test.js`

**Interfaces:**
- Consumes: the Task 3 StateAdapter Fund methods, plus `parseDollarInput`, `formatCents`, and `groupLedgerByMonth`.
- Produces:
  - **DOM ids:**
    - `#fund-balance`: `input type="number" step="0.01"`, shows dollars. On `change`, it calls `setFundBalanceCents(Math.round(value*100))`.
    - `#fund-deduct-amount`: a text input.
    - `#fund-deduct-note`
    - `#fund-deduct-date`: `type="date"`, defaults to today.
    - `#fund-deduct-submit`
    - `#fund-deduct-error`
    - `#fund-ledger`
  - **`buildFundLedgerViewModel(entries): Array<{ monthKey, label, totalLabel, entries: Array<{ id, dateLabel, amountLabel, note }> }>`**.
  - **Deleting an entry** happens through a button with `data-action="delete-fund-deduction" data-id="…"`, handled through `delegatedClickHandler.js`.
  - **Submit behaviour.** An invalid amount shows "Enter an amount greater than $0." in `#fund-deduct-error`. A deduction that would make the balance negative calls `window.confirm('This will take your Fund below $0. Continue?')` first. A successful submit clears the amount and note fields and re-renders the panel on `EVENTS.FUND_CHANGED`.
  - **The deduction receipt** (the Fund's month-grouped ledger) has a month header (`label` and `totalLabel`), then rows showing date, amount, and note.

- [ ] **Step 1: Write the view-model test.** In `tests/viewModels/fundLedgerViewModel.test.js`: `test('labels months and formats amounts')`. For entries in Nov and Oct 2026 it expects the first group label `'November 2026'`, a `totalLabel` like `'$24'`, and entries like `amountLabel: '$19'`.
- [ ] **Step 2: Write the controller tests.** In `tests/controllers.test.js`, add `describe('FundController')`, with jsdom fixture markup for the ids above:
  - `test('submitting $20 with note deducts and renders under current month')`
  - `test('invalid amount shows error and does not deduct')`
  - `test('overdraft asks confirm; declining leaves balance unchanged')`
  - `test('delete refunds')`
  - `test('editing #fund-balance sets cents')`
- [ ] **Step 3: Watch them fail.** Run `cd tests && npx jest fundLedgerViewModel controllers -t Fund`. Expected: FAIL.
- [ ] **Step 4: Implement and delete.** Build the controller and view model, write the markup, and delete the shop files.
- [ ] **Step 5: Check.** Run `node scripts/generate-data.js && cd tests && npm run validate-data && npm test`. Expected: PASS. Then run `grep -rn "shopping" assets/js _layouts _includes *.md`. Expected: no matches, except the retained `STORAGE_KEYS` constants.
- [ ] **Step 6: Look at it in the browser.** Run `bundle exec jekyll serve --config _config.yml,_config.supabase.yml`, open the Character tab, and check the Fund panel against the neighbouring Resources fields.
- [ ] **Step 7: Commit.** `git commit -m "feat: fund widget with monthly deduction receipt; remove shop page"`

---

### Task 8: Schema v18 migration and cloud snapshot

**Files:**
- Modify:
  - `assets/js/character-sheet/dataMigrator.js` (add `migrateToVersion18`, the `case 17`, and the `loadAndMigrateState` key list)
  - `dataValidator.js:33` (`SCHEMA_VERSION = 18`)
  - `formPersistence.js`
  - `assets/js/services/cloudSync.js` (`buildLocalSnapshot` ~81-108, `applySnapshot`)
  - `storageKeys.js` (delete the retired constants once nothing references them except the migrator, which keeps local string literals in a `RETIRED_STATE_KEYS` array)
- Test: `tests/statePersistence.test.js`, `tests/cloudSync.test.js`, `tests/formPersistence.test.js`

**Interfaces:**
- Produces:
  - **`RETIRED_STATE_KEYS = Object.freeze(['activeCurses', 'completedCurses', 'curseHelperState', 'shoppingLog', 'bookBoxSubscriptions', 'bookBoxHistory'])`**, exported from `dataMigrator.js`.
  - **`RETIRED_FORM_FIELDS = Object.freeze(['inkDrops', 'paperScraps', 'journal-entries-completed'])`**, exported from `dataMigrator.js`.
  - **`migrateToVersion18(state)`.** Deletes `RETIRED_STATE_KEYS`. Sets `fundBalanceCents = 0` and `fundLedger = []` only when they are absent. Leaves every other key untouched.
  - **`stripRetiredFormFields(formData): object`.** Pure and idempotent. Runs on every form-blob load and on every snapshot apply.
  - **On load,** remove the retired keys from localStorage (`localStorage.removeItem`) after migrating.
  - **`applySnapshot`** runs a snapshot's `characterState` through `migrateState` using the snapshot's `version`, and its `formData` through `stripRetiredFormFields`.

- [ ] **Step 1: Write the failing persistence test.** In `tests/statePersistence.test.js`: `test('v17 save migrates to v18')`. Build a fixture with:
  - `activeCurses` holding one curse
  - `shoppingLog` holding one entry
  - `dustyBlueprints: 42`
  - two books and a completed quest
  - form blob `{ inkDrops: '300', paperScraps: '40', 'journal-entries-completed': '3', 'xp-current': '1234', level: '6', smp: '2' }`

  Assert:
  - the retired keys are gone, from both the state and localStorage
  - `fundBalanceCents === 0`, `fundLedger` equals `[]`
  - blueprints are 42 and the books/quests are deep-equal to the input
  - the form keeps `xp-current`, `level`, and `smp`, and drops the three retired fields
- [ ] **Step 2: Write the failing cloud tests.** In `tests/cloudSync.test.js`:
  - `test('applying a v17 snapshot strips retired keys and form fields')`
  - `test('applying a v18 snapshot keeps its fund balance and ledger')`
- [ ] **Step 3: Watch them fail.** Run `cd tests && npx jest statePersistence cloudSync formPersistence`. Expected: FAIL.
- [ ] **Step 4: Implement.** Add the migration, the form strip, and the snapshot handling.
- [ ] **Step 5: Run the tests.** Run `cd tests && npm test`. Expected: PASS.
- [ ] **Step 6: Commit.** `git commit -m "feat: schema v18 migration for dollar economy"`

---

### Task 9: Rules pages, docs, and the final sweep

**Files:**
- Modify:
  - `rewards.md`, `core-mechanics.md`, `index.md` (keep the lore), `README.md:3`, `_config.yml:2`
  - `AGENTS.md:7,62,218` (repository structure: drop `curseTableDetailed.json`, `shroud.md`, `CurseController`; tagline "reading game")
  - `project-docs/EXTENDING-THE-CODEBASE.md:71`, `project-docs/ADR-003-tcg-modifier-pipeline.md` (resources are now `xp | dollars | blueprints`; `MULTIPLY` and `ON_JOURNAL_ENTRY` are removed; add a dated note), `project-docs/ADR-001` line ~186
  - `assets/js/page-renderers/rewardsRenderer.js`, `sanctumRenderer.js`, `keeperRenderer.js` (any hard-coded Ink/Paper copy)
- Test: `tests/pageRenderers.test.js`

**Interfaces:** none new.

- [ ] **Step 1: Rewrite the copy.** Rewrite the rules copy to describe the Fund:
  - $15 per quest, $10 for a secondary quest
  - $1 per atmospheric day, $2 for a sanctum day
  - flat item bonuses
  - level-up payouts
  - spending through the Resources panel
- [ ] **Step 2: Sweep for leftovers.** Run `grep -rniE "ink drop|paper scrap|inkDrops|paperScraps|worn page|shroud's curse|journal" --include=*.md --include=*.html --include=*.js --include=*.json . | grep -v node_modules | grep -v _site | grep -v "docs/superpowers"`. Expected: matches only in `dataMigrator.js` (retired lists), the v18 migration tests, and the legacy-history hiding code.
- [ ] **Step 3: Run everything.** Run `node scripts/generate-data.js && cd tests && npm run validate-data && npm test`. Expected: PASS.
- [ ] **Step 4: Check the site.** Run `bundle exec jekyll build --config _config.yml,_config.supabase.yml` from the repo root. Expected: the build succeeds and there are no links to `shroud.html` or `shopping.html` in `_site/`. Check with `grep -rl "shroud.html\|shopping.html" _site`; expected: none.
- [ ] **Step 5: Commit.** `git commit -m "docs: rules and project docs for dollar economy"`
- [ ] **Step 6: Final review.** Run a whole-branch subagent review against the spec and the Review Focus list. Then push the branch and open a PR against `main`, leaving it unmerged.
