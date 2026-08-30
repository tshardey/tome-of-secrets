# Economy Rebalance Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Paper Scraps an earnable currency, stop Ink Drop inflation, give the existing ink stockpile a sink, and let the shopping log record purchases the player cannot afford.

**Architecture:** Most of the rebalance is data — `assets/data/*.json` edits regenerated into JS exports. The code changes are narrow: the atmospheric reward path switches currency and gains two parameters it should always have had (an item multiplier and per-item daily values), and the shopping page's duplicated affordability checks collapse into one pure service so they can be tested and so "insufficient" becomes "confirm" in one place.

**Note on Jest:** this repo's Jest rejects `-v` (it parses as `--version`). Use `--verbose` if you want verbose output.

**Tech Stack:** Vanilla ES modules, Jekyll static site, Jest + jsdom for tests, Node build script for JSON→JS data generation.

**Spec:** `docs/superpowers/specs/2026-08-29-8mfg-economy-rebalance-design.md`

**Beads:** epic `tome-of-secrets-8mfg` — R1 `ar9w`, R2 `2pzf`, R3 `ds61`, R4 `ha2h`, R5 `mk7n`

## Global Constraints

- **Git, scoped exception for this branch.** Work happens on `8mfg-economy-rebalance`. For THIS branch only, the maintainer has authorised implementers to `git add` and `git commit` their own task's work. **Never `git push`.** Never merge to `main`. Never add Claude co-author or "Generated with" lines to commit messages. Commit message format: `feat(8mfg): <what changed>` or `fix(8mfg): <what changed>`. One commit per task unless the task's steps say otherwise. Outside this branch the maintainer's standing rule applies: agents do not stage or commit.
- **Never hand-edit `assets/js/character-sheet/data.json-exports.js`.** It is generated. After ANY `assets/data/*.json` change run `node scripts/generate-data.js` from the repo root.
- **Beads is the issue tracker.** Set a bead to `in_progress` when you start it (`bd update <id> --status in_progress`) and close it only after tests pass (`bd close <id> --reason "..."`). Never hand-edit `.beads/issues.jsonl`; after state changes run `bd export --no-memories -o .beads/issues.jsonl`.
- **Test commands run from `tests/`:** `cd tests && npm test`. Data validation: `cd tests && npm run validate-data`.
- **Currency values are exact.** Copy them verbatim from the spec tables; do not round or re-derive them.
- **Atmospheric rates:** `baseValue: 2`, `sanctumBonus: 3`, `resource: 'paperScraps'`.
- **Existing visual language:** negative/warning text uses `#d4a5a5`, the muted rose already used in `style.scss:1341,1361` and `character-sheet.css:3870,3981`. Do not introduce a new red.
- **Do not touch multipliers.** Scatter Brain Scarab (x3/x1.5), Tome of Potential (x3/x1.5), Page Sprite (x2/x1.5) keep their values, and `ModifierPipeline`'s ADD_FLAT-then-MULTIPLY ordering is unchanged.
- **Side quests are out of scope.** Do not add entries to `sideQuestsDetailed.json` or change `table-renderer.js`. That work is bead `tome-of-secrets-4yqq` and awaits a document from the maintainer.

---

## File Structure

**Created:**
- `assets/js/services/ShoppingBalanceService.js` — pure overdraft math and prompt text. Exists so the two duplicated affordability checks in `shoppingRenderer.js` have one home and can be unit-tested without a DOM.
- `tests/ShoppingBalanceService.test.js` — unit tests for the above.

**Modified:**
- `assets/data/allItems.json` — R1 conversions (nine items) and R2 atmospheric item conversions (four items).
- `assets/data/shoppingOptions.json` — R5 ink sinks.
- `assets/js/config/gameConfig.js` — atmospheric resource and rates.
- `assets/js/services/AtmosphericBuffService.js` — gains the shared multiplier and trackable-value lookups; `calculateTotalInkDrops` renamed.
- `assets/js/services/RewardCalculator.js` — `calculateAtmosphericBuffRewards` pays paper and accepts an options object.
- `assets/js/viewModels/atmosphericBuffViewModel.js` — sources multiplier and trackable values from the service instead of computing them privately.
- `assets/js/controllers/EndOfMonthController.js` — passes the new options through.
- `assets/js/page-renderers/shoppingRenderer.js` — confirm-instead-of-block, unclamped balances, negative styling.
- `assets/js/components/StatusWidget.js` — negative styling.
- `assets/css/style.scss`, `assets/css/status-widget.css` — one `.currency-negative` rule each.
- `_includes/character-sheet/tabs/character.html` — remove `min="0"`.
- `core-mechanics.md` — rules copy for the currency change.
- Existing tests: `tests/RewardCalculator.test.js`, `tests/RewardCalculatorReceipts.test.js`, `tests/viewModels/atmosphericBuffViewModel.test.js`, `tests/ModifierPipeline*.test.js`.

---

## Task 1: Convert nine items from Ink Drops to Paper Scraps (R1)

Bead: `tome-of-secrets-ar9w`

**Files:**
- Modify: `assets/data/allItems.json`
- Test: `tests/ModifierPipelinePaperImmunity.test.js` (create)

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: nine catalog items whose `effects[].modifier.resource` is `paperScraps`. Later tasks do not depend on this.

**Background:** These nine items are all on the ADR-003 `effects` pipeline. Each has exactly two effect entries — one `"slot": "equipped"`, one `"slot": "passive"` — sharing a `condition`. A conversion changes only `modifier.resource` and `modifier.value` on both entries, plus the human-readable `bonus` and `passiveBonus` strings that render on `rewards.md`. Do not touch `condition`, `trigger`, or `slot`.

- [ ] **Step 1: Write the failing test that pins why this works**

The whole conversion rests on one property: ink multipliers must not multiply paper. Create `tests/ModifierPipelinePaperImmunity.test.js`:

```javascript
import { ModifierPipeline } from '../assets/js/services/ModifierPipeline.js';
import { Reward } from '../assets/js/services/RewardCalculator.js';

describe('ModifierPipeline resource isolation', () => {
    test('an inkDrops MULTIPLY must not scale paperScraps', () => {
        const base = new Reward({ xp: 0, inkDrops: 10, paperScraps: 10, items: [] });
        const effects = [
            {
                trigger: 'ON_QUEST_COMPLETED',
                modifier: { type: 'ADD_FLAT', resource: 'paperScraps', value: 5 },
                source: 'Amulet of Duality'
            },
            {
                trigger: 'ON_QUEST_COMPLETED',
                modifier: { type: 'MULTIPLY', resource: 'inkDrops', value: 3 },
                source: 'Tome of Potential'
            }
        ];

        const resolved = ModifierPipeline.resolve('ON_QUEST_COMPLETED', {}, effects, base);

        expect(resolved.inkDrops).toBe(30);
        expect(resolved.paperScraps).toBe(15);
    });
});
```

- [ ] **Step 2: Run it and confirm it passes**

Run: `cd tests && npx jest ModifierPipelinePaperImmunity`
Expected: PASS (verified while writing this plan). This test documents existing behavior rather than driving new code — `_applyMultiply` reads `modifier.resource`, and `resolve()` accepts a bare effect object via `const effect = entry?.effect || entry` (`ModifierPipeline.js:92`). `validateEffect` requires only a valid `trigger` and `modifier.type`, so the condition-less effects above are accepted.

If it FAILS, stop and report: the entire R1 premise is wrong and the spec needs revisiting.

- [ ] **Step 3: Convert the eight pure-conversion items**

In `assets/data/allItems.json`, for each item below change BOTH effect entries' `modifier.resource` from `"inkDrops"` to `"paperScraps"`, set `modifier.value` to the new numbers, and rewrite the two display strings.

| Item | equipped value | passive value |
|---|---|---|
| Amulet of Duality | 5 | 2 |
| Key of the Archive | 5 | 2 |
| Temporal Sprite | 7 | 3 |
| Detective's Magnifying Glass | 5 | 2 |
| Ingredient Sprite | 5 | 2 |
| Star Navigator's Chart | 5 | 2 |
| Cloak of the Story-Weaver | 3 | 1 |
| The Bookwyrm's Scale | 3 | 1 |

New display strings, verbatim:

```
Amulet of Duality
  bonus:        "Earn a +5 Paper Scrap bonus on books with multiple points of view or multiple narrators."
  passiveBonus: "Earn a +2 Paper Scrap bonus on books with multiple POVs (passive)."

Key of the Archive
  bonus:        "Earn a +5 Paper Scrap bonus on books where something is unlocked, either literally or figuratively."
  passiveBonus: "Earn a +2 Paper Scrap bonus on unlock-themed books (passive)."

Temporal Sprite
  bonus:        "Books with non-linear storytelling or time jumps grant +7 Paper Scraps."
  passiveBonus: "Non-linear narratives grant +3 Paper Scraps (passive)."

Detective's Magnifying Glass
  bonus:        "Mystery or crime books with puzzles grant +5 Paper Scraps."
  passiveBonus: "Mystery books grant +2 Paper Scraps (passive)."

Ingredient Sprite
  bonus:        "Books with interesting magical systems grant +5 Paper Scraps."
  passiveBonus: "Magic system books grant +2 Paper Scraps (passive)."

Star Navigator's Chart
  bonus:        "Sci-fi books grant +5 Paper Scraps (always active)."
  passiveBonus: "Sci-fi books grant +2 Paper Scraps (passive)."

Cloak of the Story-Weaver
  bonus:        "Earn a permanent +3 Paper Scrap bonus for books that are part of a series."
  passiveBonus: "Earn a +1 Paper Scrap bonus for series books (passive)."

The Bookwyrm's Scale
  bonus:        "For every book over 500 pages, gain a +3 Paper Scrap bonus."
  passiveBonus: "Gain a +1 Paper Scrap bonus for books over 500 pages (passive)."
```

- [ ] **Step 4: Add paper to Literary Medallion without removing its XP**

Literary Medallion keeps both existing XP effects untouched and gains two new entries in its `effects` array, reusing its existing condition exactly:

```json
{
  "trigger": "ON_QUEST_COMPLETED",
  "condition": { "tagMatch": [["classics"], ["literary-fiction"]] },
  "modifier": { "type": "ADD_FLAT", "resource": "paperScraps", "value": 6 },
  "slot": "equipped"
},
{
  "trigger": "ON_QUEST_COMPLETED",
  "condition": { "tagMatch": [["classics"], ["literary-fiction"]] },
  "modifier": { "type": "ADD_FLAT", "resource": "paperScraps", "value": 3 },
  "slot": "passive"
}
```

Display strings:
```
  bonus:        "Classics or literary fiction grant +20 XP and +6 Paper Scraps."
  passiveBonus: "Literary fiction grants +10 XP and +3 Paper Scraps (passive)."
```

- [ ] **Step 5: Regenerate data exports**

Run: `node scripts/generate-data.js`
Expected: rewrites `assets/js/character-sheet/data.json-exports.js`. Confirm with `grep -c 'paperScraps' assets/js/character-sheet/data.json-exports.js` that the count went up.

- [ ] **Step 6: Validate and run the suite**

Run: `cd tests && npm run validate-data && npm test`
Expected: validation clean; full suite PASS. If a test asserts one of the nine items grants ink, that test is now asserting stale balance — update the expected value to the new paper figure, do not revert the data.

- [ ] **Step 7: Checkpoint**

Commit the task: `git add` the files you changed and commit as `feat(8mfg): convert nine items from Ink Drops to Paper Scraps`. Report files changed, suite status, and any test whose expectation you updated. Then: `bd close tome-of-secrets-ar9w --reason "Nine items converted to Paper Scraps; suite green"` and `bd export --no-memories -o .beads/issues.jsonl`.

---

## Task 2: Add ink-heavy shopping options (R5)

Bead: `tome-of-secrets-mk7n`

**Files:**
- Modify: `assets/data/shoppingOptions.json`

**Interfaces:**
- Consumes: nothing.
- Produces: three new option ids — `book-crawl`, `used-bookstore-haul`, `library-book-sale`. Task 3 does not depend on them but will exercise them manually.

**Background:** `type: "book-purchase"` matters — `shoppingRenderer.js:752` enables the book-linking UI only for `book-purchase`, `subscription-month`, and `special-edition`. `allowQuantity: true` renders a quantity input whose value multiplies both currency costs (`shoppingRenderer.js:945-948`).

- [ ] **Step 1: Add the three options**

Append to `assets/data/shoppingOptions.json`, preserving the existing entries exactly:

```json
"book-crawl": {
  "id": "book-crawl",
  "label": "The Book Crawl",
  "description": "A day spent moving between bookshops. Set the quantity to the number of shops you visited.",
  "inkDrops": 150,
  "paperScraps": 5,
  "allowQuantity": true,
  "type": "book-purchase"
},
"used-bookstore-haul": {
  "id": "used-bookstore-haul",
  "label": "Used Bookstore Haul",
  "description": "Secondhand finds carried home by the armful. Set the quantity to the number of books.",
  "inkDrops": 75,
  "paperScraps": 0,
  "allowQuantity": true,
  "type": "book-purchase"
},
"library-book-sale": {
  "id": "library-book-sale",
  "label": "Library Book Sale",
  "description": "Withdrawn stock, sold by the bagful. Set the quantity to the number of books.",
  "inkDrops": 50,
  "paperScraps": 0,
  "allowQuantity": true,
  "type": "book-purchase"
}
```

- [ ] **Step 2: Regenerate and validate**

Run: `node scripts/generate-data.js && cd tests && npm run validate-data && npm test`
Expected: validation clean, suite PASS.

- [ ] **Step 3: Checkpoint**

Commit as `feat(8mfg): add ink-heavy shopping options`. Report files changed. Then `bd close tome-of-secrets-mk7n --reason "Three ink-heavy shop options added"` and `bd export --no-memories -o .beads/issues.jsonl`.

---

## Task 3: Allow negative balances behind a confirm step (R4)

Bead: `tome-of-secrets-ha2h`

**Files:**
- Create: `assets/js/services/ShoppingBalanceService.js`
- Create: `tests/ShoppingBalanceService.test.js`
- Modify: `assets/js/page-renderers/shoppingRenderer.js` (lines ~163-196, ~591-598, ~952-959)
- Modify: `assets/js/components/StatusWidget.js` (lines ~100-104, ~145-153)
- Modify: `assets/css/style.scss`, `assets/css/status-widget.css`
- Modify: `_includes/character-sheet/tabs/character.html:101,108`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: `findOverdrafts(current, cost) -> Array<{resource: string, label: string, after: number}>` and `formatOverdraftPrompt(overdrafts) -> string`, both exported from `assets/js/services/ShoppingBalanceService.js`.

**Background:** `shoppingRenderer.js` currently duplicates the affordability check in two places — the book-box month log (`:591-598`) and the shop redeem (`:952-959`) — and `updateResources()` (`:163-187`) clamps balances with `Math.max(0, ...)` in four places. Extracting the math is what makes this testable at all: the renderer exports only `initializeShoppingPage`, so the check is otherwise unreachable from a unit test.

- [ ] **Step 1: Write the failing test**

Create `tests/ShoppingBalanceService.test.js`:

```javascript
import { findOverdrafts, formatOverdraftPrompt } from '../assets/js/services/ShoppingBalanceService.js';

describe('findOverdrafts', () => {
    test('returns empty when the player can afford the cost', () => {
        const result = findOverdrafts({ inkDrops: 100, paperScraps: 50 }, { inkDrops: 100, paperScraps: 25 });
        expect(result).toEqual([]);
    });

    test('reports the resulting negative balance for one resource', () => {
        const result = findOverdrafts({ inkDrops: 100, paperScraps: 5 }, { inkDrops: 25, paperScraps: 25 });
        expect(result).toEqual([{ resource: 'paperScraps', label: 'Paper Scraps', after: -20 }]);
    });

    test('reports both resources when both go negative', () => {
        const result = findOverdrafts({ inkDrops: 10, paperScraps: 5 }, { inkDrops: 25, paperScraps: 25 });
        expect(result).toEqual([
            { resource: 'inkDrops', label: 'Ink Drops', after: -15 },
            { resource: 'paperScraps', label: 'Paper Scraps', after: -20 }
        ]);
    });

    test('treats missing values as zero', () => {
        const result = findOverdrafts({}, { paperScraps: 5 });
        expect(result).toEqual([{ resource: 'paperScraps', label: 'Paper Scraps', after: -5 }]);
    });

    test('a balance that lands exactly on zero is not an overdraft', () => {
        expect(findOverdrafts({ inkDrops: 25 }, { inkDrops: 25 })).toEqual([]);
    });
});

describe('formatOverdraftPrompt', () => {
    test('names the single resulting balance', () => {
        const text = formatOverdraftPrompt([{ resource: 'paperScraps', label: 'Paper Scraps', after: -20 }]);
        expect(text).toBe('This will put you at -20 Paper Scraps. Log anyway?');
    });

    test('names both resulting balances', () => {
        const text = formatOverdraftPrompt([
            { resource: 'inkDrops', label: 'Ink Drops', after: -15 },
            { resource: 'paperScraps', label: 'Paper Scraps', after: -20 }
        ]);
        expect(text).toBe('This will put you at -15 Ink Drops and -20 Paper Scraps. Log anyway?');
    });

    test('returns empty string when there is nothing to warn about', () => {
        expect(formatOverdraftPrompt([])).toBe('');
    });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd tests && npx jest ShoppingBalanceService`
Expected: FAIL — "Cannot find module '../assets/js/services/ShoppingBalanceService.js'".

- [ ] **Step 3: Write the service**

Create `assets/js/services/ShoppingBalanceService.js`:

```javascript
/**
 * ShoppingBalanceService - Pure balance math for the shopping page.
 *
 * Balances are allowed to go negative: book box subscriptions arrive whether
 * or not the player can pay, and the log has to be able to record that.
 * These helpers describe the overdraft so the caller can confirm it.
 */

const RESOURCES = ['inkDrops', 'paperScraps'];
const RESOURCE_LABELS = {
    inkDrops: 'Ink Drops',
    paperScraps: 'Paper Scraps'
};

/**
 * @param {{inkDrops?: number, paperScraps?: number}} current - Balance before the purchase
 * @param {{inkDrops?: number, paperScraps?: number}} cost - Total cost of the purchase
 * @returns {Array<{resource: string, label: string, after: number}>} One entry per resource that ends below zero
 */
export function findOverdrafts(current, cost) {
    const overdrafts = [];
    for (const resource of RESOURCES) {
        const after = (current?.[resource] || 0) - (cost?.[resource] || 0);
        if (after < 0) {
            overdrafts.push({ resource, label: RESOURCE_LABELS[resource], after });
        }
    }
    return overdrafts;
}

/**
 * @param {Array<{label: string, after: number}>} overdrafts
 * @returns {string} Confirmation text, or '' when there is no overdraft
 */
export function formatOverdraftPrompt(overdrafts) {
    if (!overdrafts || overdrafts.length === 0) return '';
    const parts = overdrafts.map((o) => `${o.after} ${o.label}`);
    const joined = parts.length > 1 ? `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}` : parts[0];
    return `This will put you at ${joined}. Log anyway?`;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd tests && npx jest ShoppingBalanceService`
Expected: PASS, 8 tests.

- [ ] **Step 5: Replace the two Insufficient guards**

In `assets/js/page-renderers/shoppingRenderer.js`, add to the imports at the top:

```javascript
import { findOverdrafts, formatOverdraftPrompt } from '../services/ShoppingBalanceService.js';
```

At `:591-598` (book box month log), replace:

```javascript
        const current = getCurrentResources();
        if (current.inkDrops < option.inkDrops) {
            showError(errorContainer, `Insufficient Ink Drops. You have ${current.inkDrops}, need ${option.inkDrops}.`);
            return;
        }
        if (current.paperScraps < option.paperScraps) {
            showError(errorContainer, `Insufficient Paper Scraps. You have ${current.paperScraps}, need ${option.paperScraps}.`);
            return;
        }
```

with:

```javascript
        const current = getCurrentResources();
        const overdrafts = findOverdrafts(current, {
            inkDrops: option.inkDrops,
            paperScraps: option.paperScraps
        });
        if (overdrafts.length > 0 && !confirm(formatOverdraftPrompt(overdrafts))) return;
```

At `:952-959` (shop redeem), replace:

```javascript
        if (current.inkDrops < totalInkDrops) {
            showError(errorContainer, `Insufficient Ink Drops. You have ${current.inkDrops}, but need ${totalInkDrops}.`);
            return;
        }
        if (current.paperScraps < totalPaperScraps) {
            showError(errorContainer, `Insufficient Paper Scraps. You have ${current.paperScraps}, but need ${totalPaperScraps}.`);
            return;
        }
```

with:

```javascript
        const overdrafts = findOverdrafts(current, {
            inkDrops: totalInkDrops,
            paperScraps: totalPaperScraps
        });
        if (overdrafts.length > 0 && !confirm(formatOverdraftPrompt(overdrafts))) return;
```

- [ ] **Step 6: Stop clamping balances at zero**

In `updateResources()` (`shoppingRenderer.js:163-187`), remove all four `Math.max(0, ...)` wrappers so the four assignments read:

```javascript
    if (inkDropsEl) {
        inkDropsEl.value = newInkDrops;
    }
    if (paperScrapsEl) {
        paperScrapsEl.value = newPaperScraps;
    }

    const formData = safeGetJSON(STORAGE_KEYS.CHARACTER_SHEET_FORM, {});
    formData.inkDrops = newInkDrops;
    formData.paperScraps = newPaperScraps;
```

Leave every other `Math.max(0, ...)` in the file alone — those at `:118` and `:121` sanitize log-entry amounts, which must stay non-negative.

- [ ] **Step 7: Remove the input floor**

In `_includes/character-sheet/tabs/character.html`, delete ` min="0"` from both currency inputs (lines 101 and 108) so they read:

```html
<input type="number" id="inkDrops" class="rpg-stat-input" value="0" />
```
```html
<input type="number" id="paperScraps" class="rpg-stat-input" value="0" />
```

- [ ] **Step 8: Show negative balances in the warning tone**

Add to `assets/css/style.scss`, immediately after the `.shopping-currency-display` rule at `:1966`:

```scss
.shopping-currency-display.currency-negative {
    color: #d4a5a5;
}
```

Add to `assets/css/status-widget.css`, after the `.status-widget__currency-value` rule at `:220`:

```css
.status-widget__currency-value.currency-negative,
.status-widget__icon.currency-negative {
    color: #d4a5a5;
}
```

In `shoppingRenderer.js`, update `updateCurrencyDisplay()` (`:189-196`) to toggle the class:

```javascript
function updateCurrencyDisplay() {
    const currencyDisplay = document.getElementById('shopping-currency-display');
    if (!currencyDisplay) return;

    const { inkDrops, paperScraps } = getCurrentResources();
    currencyDisplay.textContent =
        `Ink Drops: ${inkDrops} | Paper Scraps: ${paperScraps} (read-only — update in Character Sheet)`;
    currencyDisplay.classList.toggle('currency-negative', inkDrops < 0 || paperScraps < 0);
}
```

In `assets/js/components/StatusWidget.js`, add the class to the four currency spans when the value is below zero. At `:102-103`:

```javascript
            <span class="status-widget__icon${charData.inkDrops < 0 ? ' currency-negative' : ''}" title="Ink Drops">💧 ${charData.inkDrops}</span>
            <span class="status-widget__icon${charData.paperScraps < 0 ? ' currency-negative' : ''}" title="Paper Scraps">📄 ${charData.paperScraps}</span>
```

and apply the same `${… < 0 ? ' currency-negative' : ''}` suffix to the two `status-widget__currency-value` spans at `:147` and `:152`.

- [ ] **Step 9: Run the full suite**

Run: `cd tests && npm test`
Expected: PASS. Note `tests/setup.js:10` sets `window.confirm = () => true` globally, so any existing test that logs a purchase will now proceed through the confirm rather than being blocked — which is the intended behavior.

- [ ] **Step 10: Verify by hand in the running site**

Run `bundle exec jekyll serve`, open `http://localhost:4000/shopping.html`, set Paper Scraps to 0 on the character sheet, and log a Book Box month. Confirm: the dialog names the resulting negative balance, cancelling records nothing, confirming records the entry and shows the balance negative in the muted rose.

- [ ] **Step 11: Checkpoint**

Commit as `feat(8mfg): allow negative balances in the shopping log`. Report files changed and suite status. Then `bd close tome-of-secrets-ha2h --reason "Negative balances allowed behind confirm; affordability math extracted to ShoppingBalanceService"` and `bd export --no-memories -o .beads/issues.jsonl`.

---

## Task 4: Switch atmospheric buffs to Paper Scraps (R2)

Bead: `tome-of-secrets-2pzf`

**Files:**
- Modify: `assets/js/config/gameConfig.js:66-70`
- Modify: `assets/js/services/AtmosphericBuffService.js:15-21, 45-52`
- Modify: `assets/js/services/RewardCalculator.js:846-913`
- Modify: `assets/js/viewModels/atmosphericBuffViewModel.js`
- Modify: `assets/data/allItems.json` (four atmospheric items)
- Modify: `core-mechanics.md`
- Test: `tests/RewardCalculator.test.js:697-786`, `tests/RewardCalculatorReceipts.test.js:308-325`, `tests/viewModels/atmosphericBuffViewModel.test.js`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: `GAME_CONFIG.atmospheric = { resource: 'paperScraps', baseValue: 2, sanctumBonus: 3 }`; `calculateBuffTotal(daysUsed, dailyValue) -> number` exported from `AtmosphericBuffService.js` (replacing `calculateTotalInkDrops`); `RewardCalculator.calculateAtmosphericBuffRewards(buffs, associatedBuffs, forcedActiveBuffNames)` now writes `reward.paperScraps`. Task 5 extends this signature with a fourth `options` argument.

- [ ] **Step 1: Update the existing tests to the new currency and rates**

These tests currently encode the old balance. Rewrite the `calculateAtmosphericBuffRewards` block in `tests/RewardCalculator.test.js` (starts at `:697`) so each case asserts paper at the new rates. The six cases and their new expectations:

```javascript
    describe('calculateAtmosphericBuffRewards', () => {
        test('should calculate paper scraps for active atmospheric buffs', () => {
            const atmosphericBuffs = {
                'The Candlight Study': { daysUsed: 10, isActive: true },
                'The Soaking in Nature': { daysUsed: 5, isActive: true },
                'Inactive Buff': { daysUsed: 7, isActive: false }
            };

            const rewards = RewardCalculator.calculateAtmosphericBuffRewards(atmosphericBuffs, []);

            expect(rewards.xp).toBe(0);
            expect(rewards.inkDrops).toBe(0);
            expect(rewards.paperScraps).toBe(30); // (10 + 5) × 2
            expect(rewards.modifiedBy).toContain('The Candlight Study');
            expect(rewards.modifiedBy).toContain('The Soaking in Nature');
            expect(rewards.modifiedBy).not.toContain('Inactive Buff');
        });

        test('should apply sanctum bonus to associated buffs', () => {
            const atmosphericBuffs = {
                'The Candlight Study': { daysUsed: 10, isActive: true },
                'The Soaking in Nature': { daysUsed: 5, isActive: true }
            };
            const associatedBuffs = ['The Candlight Study'];

            const rewards = RewardCalculator.calculateAtmosphericBuffRewards(atmosphericBuffs, associatedBuffs);

            expect(rewards.paperScraps).toBe(40); // (10 × 3) + (5 × 2) = 40
        });

        test('should ignore buffs with zero days used', () => {
            const atmosphericBuffs = {
                'The Candlight Study': { daysUsed: 0, isActive: true },
                'The Soaking in Nature': { daysUsed: 5, isActive: true }
            };

            const rewards = RewardCalculator.calculateAtmosphericBuffRewards(atmosphericBuffs, []);

            expect(rewards.paperScraps).toBe(10); // Only 5 × 2
            expect(rewards.modifiedBy).not.toContain('The Candlight Study');
        });

        test('should handle empty atmospheric buffs object', () => {
            const rewards = RewardCalculator.calculateAtmosphericBuffRewards({}, []);

            expect(rewards.paperScraps).toBe(0);
            expect(rewards.modifiedBy).toEqual([]);
        });

        test('should handle multiple associated buffs', () => {
            const atmosphericBuffs = {
                'Buff 1': { daysUsed: 3, isActive: true },
                'Buff 2': { daysUsed: 4, isActive: true },
                'Buff 3': { daysUsed: 5, isActive: true }
            };
            const associatedBuffs = ['Buff 1', 'Buff 3'];

            const rewards = RewardCalculator.calculateAtmosphericBuffRewards(atmosphericBuffs, associatedBuffs);

            expect(rewards.paperScraps).toBe(32); // (3 × 3) + (4 × 2) + (5 × 3) = 9 + 8 + 15 = 32
        });

        test('should only process active buffs', () => {
            const atmosphericBuffs = {
                'Active Buff': { daysUsed: 10, isActive: true },
                'Inactive Buff': { daysUsed: 10, isActive: false }
            };

            const rewards = RewardCalculator.calculateAtmosphericBuffRewards(atmosphericBuffs, []);

            expect(rewards.paperScraps).toBe(20); // Only active buff counted
            expect(rewards.modifiedBy).toContain('Active Buff');
            expect(rewards.modifiedBy).not.toContain('Inactive Buff');
        });

        test('should count buffs in forcedActiveBuffNames even when isActive is false', () => {
            const atmosphericBuffs = {
                'The Soaking in Nature': { daysUsed: 7, isActive: false }
            };
            const rewards = RewardCalculator.calculateAtmosphericBuffRewards(
                atmosphericBuffs,
                [],
                ['The Soaking in Nature']
            );
            expect(rewards.paperScraps).toBe(14);
            expect(rewards.modifiedBy).toContain('The Soaking in Nature');
        });
    });
```

In `tests/RewardCalculatorReceipts.test.js`, update the atmospheric receipt test at `:308`:

```javascript
            expect(receipt.modifiers.length).toBe(2);
            expect(receipt.final.paperScraps).toBe(19); // 5 × 2 + 3 × 3
```

- [ ] **Step 2: Run them to verify they fail**

Run: `cd tests && npx jest RewardCalculator`
Expected: FAIL — the atmospheric cases report `paperScraps: 0` and non-zero `inkDrops`.

- [ ] **Step 3: Update the config**

In `assets/js/config/gameConfig.js`, replace the `atmospheric` block:

```javascript
    /**
     * Atmospheric buff configuration.
     * Atmospheric play is the Paper Scrap faucet; `resource` keeps the currency
     * a single knob rather than a value hardcoded across calculator and view model.
     */
    atmospheric: {
        resource: 'paperScraps',
        baseValue: 2,
        sanctumBonus: 3
    },
```

- [ ] **Step 4: Update the service**

In `assets/js/services/AtmosphericBuffService.js`, add `import { GAME_CONFIG } from '../config/gameConfig.js';` to the imports, then replace the hardcoded rates in `calculateDailyValue` (`:15-21`):

```javascript
export function calculateDailyValue(buffName, associatedBuffs = []) {
    const buff = data.getAtmosphericBuff(buffName);
    const key = buff?.id || buffName;
    return (associatedBuffs.includes(key) || associatedBuffs.includes(buff?.name) || associatedBuffs.includes(buffName))
        ? GAME_CONFIG.atmospheric.sanctumBonus
        : GAME_CONFIG.atmospheric.baseValue;
}
```

and rename `calculateTotalInkDrops` (`:45-52`) — the arithmetic is currency-agnostic and the old name is now actively misleading:

```javascript
/**
 * Calculate the total reward for an atmospheric buff.
 * Currency-agnostic: the resource is GAME_CONFIG.atmospheric.resource.
 * @param {number} daysUsed
 * @param {number} dailyValue
 * @returns {number}
 */
export function calculateBuffTotal(daysUsed, dailyValue) {
    return daysUsed * dailyValue;
}
```

Update the import and both call sites in `assets/js/viewModels/atmosphericBuffViewModel.js` (`:13`, `:121`, `:154`) from `calculateTotalInkDrops` to `calculateBuffTotal`. Then run `grep -rn "calculateTotalInkDrops" assets/js tests` and confirm the only remaining hit is the mock in `tests/viewModels/atmosphericBuffViewModel.test.js:14` — update that key to `calculateBuffTotal` too.

- [ ] **Step 5: Make the calculator pay paper**

In `assets/js/services/RewardCalculator.js`, in `calculateAtmosphericBuffRewards` (`:846-913`): rename the accumulator `totalInkDrops` to `total`, and change the four currency-bearing lines. The `dailyValue` line already reads from `GAME_CONFIG` and needs no change. The receipt entry's currency and the final assignments become:

```javascript
                    reward.receipt.modifiers.push({
                        source: buffName,
                        type: 'atmospheric',
                        value: buffTotal,
                        description: `${buff.daysUsed} days × ${dailyValue} Paper Scraps${isAssociated ? ' (Sanctum bonus)' : ''}`,
                        currency: GAME_CONFIG.atmospheric.resource
                    });
```

```javascript
        reward.paperScraps = total;
        reward.modifiedBy = processedBuffs;
        reward.receipt.base.paperScraps = 0; // No base, all from modifiers
        reward.receipt.final.paperScraps = total;
```

Also rename the local `countsForInk` to `countsForReward` and update the JSDoc `@returns` from "Reward with ink drops only" to "Reward with paper scraps only".

- [ ] **Step 6: Run the tests to verify they pass**

Run: `cd tests && npx jest RewardCalculator`
Expected: PASS.

- [ ] **Step 7: Convert the four atmospheric items**

In `assets/data/allItems.json`, change these items' `rewardModifier`/`passiveRewardModifier` keys from `inkDrops` to `paperScraps` (values unchanged) and rewrite the display strings. These items are excluded from quest bonus dropdowns by `shouldExcludeFromQuestBonuses()` (`AtmosphericBuffService.js:94`), so their `rewardModifier` is currently dead data — Task 6 makes it live.

```
Gilded Painting
  rewardModifier:        { "paperScraps": 2 }
  passiveRewardModifier: { "paperScraps": 1 }
  bonus:        "Earn +2 Paper Scraps when reading in an ornate location."
  passiveBonus: "Earn +1 Paper Scrap for reading in ornate locations (passive)."

Garden Gnome
  rewardModifier:        { "paperScraps": 2 }
  passiveRewardModifier: { "paperScraps": 1 }
  bonus:        "Earn +2 Paper Scraps on any day where you read outside in nature or in a plant-filled room."
  passiveBonus: "Earn +1 Paper Scrap for reading in nature or with plants (passive)."

Mystical Moth
  rewardModifier:        { "paperScraps": 2 }
  passiveRewardModifier: { "paperScraps": 1 }
  bonus:        "Earn +2 Paper Scraps on nights when you read by lamplight."
  passiveBonus: "Earn +1 Paper Scrap for reading by lamplight (passive)."

Tome-Bound Cat
  bonus:        "When you choose an Atmospheric Buff for your reading session, earn a x2 Paper Scrap bonus on the effect."
  passiveBonus: "Atmospheric Buffs grant x1.5 Paper Scraps when adopted (passive)."
```

Tome-Bound Cat keeps `rewardModifier: {}`, `atmosphericBuffMultiplier: 2`, and `passiveAtmosphericMultiplier: 1.5` exactly as they are; change `passiveRewardModifier` from `{ "inkDropsMultiplier": 1.5 }` to `{}` — the multiplier is read from `passiveAtmosphericMultiplier`, and leaving an ink key there would be stale.

- [ ] **Step 8: Update the rules copy**

In `core-mechanics.md`, under "Currencies and Progression": delete the `*  Triggering *Atmospheric Buffs*` bullet from the **Earn Ink Drops by** list, and add to the **Earn Paper Scraps for the following** list:

```markdown
    *  Triggering *Atmospheric Buffs* (+2 *Paper Scraps* per day, or +3 per day if the buff matches your Sanctum)
```

- [ ] **Step 9: Regenerate, validate, run everything**

Run: `node scripts/generate-data.js && cd tests && npm run validate-data && npm test`
Expected: validation clean, suite PASS.

- [ ] **Step 10: Checkpoint**

Commit as `feat(8mfg): atmospheric buffs pay Paper Scraps`. Report files changed and suite status. Then `bd close tome-of-secrets-2pzf --reason "Atmospheric buffs pay Paper Scraps at 2/3 per day; four atmospheric items converted"` and `bd export --no-memories -o .beads/issues.jsonl`.

---

## Task 5: Pay the Tome-Bound Cat multiplier at end of month (R3a)

Bead: `tome-of-secrets-ds61` (part 1 of 2)

**Files:**
- Modify: `assets/js/services/AtmosphericBuffService.js`
- Modify: `assets/js/services/RewardCalculator.js`
- Modify: `assets/js/viewModels/atmosphericBuffViewModel.js:25-57, 100`
- Modify: `assets/js/controllers/EndOfMonthController.js:88-94`
- Test: `tests/RewardCalculator.test.js`, `tests/viewModels/atmosphericBuffViewModel.test.js`

**Interfaces:**
- Consumes: `GAME_CONFIG.atmospheric.resource` and the paper-paying `calculateAtmosphericBuffRewards` from Task 4.
- Produces: `getAtmosphericBuffMultiplier(state) -> { multiplier: number, modifierItemName: string|null }` exported from `AtmosphericBuffService.js`; `calculateAtmosphericBuffRewards(buffs, associatedBuffs, forcedActiveBuffNames, options)` where `options = { multiplier?: number, multiplierSource?: string|null, trackableItemValues?: Object<string, number> }`. Task 6 uses `trackableItemValues`.

**Background:** `atmosphericBuffViewModel.js:130` multiplies the displayed Total by the Cat's multiplier, but `EndOfMonthController.js:90` — the only production caller of the calculator — never passes it. The player is shown x2 and paid x1. The fix moves the lookup into the service so both the display and the award read one implementation.

- [ ] **Step 1: Write the failing test**

Add to the `calculateAtmosphericBuffRewards` describe block in `tests/RewardCalculator.test.js`:

```javascript
        test('should apply an atmospheric multiplier to the total', () => {
            const atmosphericBuffs = {
                'The Candlight Study': { daysUsed: 10, isActive: true }
            };

            const rewards = RewardCalculator.calculateAtmosphericBuffRewards(
                atmosphericBuffs,
                [],
                [],
                { multiplier: 2, multiplierSource: 'Tome-Bound Cat' }
            );

            expect(rewards.paperScraps).toBe(40); // 10 × 2 base, then × 2
        });

        test('should record the multiplier as its own receipt line', () => {
            const atmosphericBuffs = {
                'The Candlight Study': { daysUsed: 10, isActive: true }
            };

            const rewards = RewardCalculator.calculateAtmosphericBuffRewards(
                atmosphericBuffs,
                [],
                [],
                { multiplier: 2, multiplierSource: 'Tome-Bound Cat' }
            );
            const receipt = rewards.getReceipt();

            const catLine = receipt.modifiers.find((m) => m.source === 'Tome-Bound Cat');
            expect(catLine).toBeDefined();
            expect(catLine.value).toBe(20); // the added half
            expect(receipt.final.paperScraps).toBe(40);
        });

        test('should floor a fractional multiplied total', () => {
            const atmosphericBuffs = {
                'The Candlight Study': { daysUsed: 5, isActive: true }
            };

            const rewards = RewardCalculator.calculateAtmosphericBuffRewards(
                atmosphericBuffs,
                [],
                [],
                { multiplier: 1.5, multiplierSource: 'Tome-Bound Cat' }
            );

            expect(rewards.paperScraps).toBe(15); // 5 × 2 = 10, × 1.5 = 15
        });

        test('should leave the total alone when there is no multiplier', () => {
            const atmosphericBuffs = {
                'The Candlight Study': { daysUsed: 10, isActive: true }
            };

            const rewards = RewardCalculator.calculateAtmosphericBuffRewards(atmosphericBuffs, [], [], {});

            expect(rewards.paperScraps).toBe(20);
            expect(rewards.getReceipt().modifiers.length).toBe(1);
        });
```

- [ ] **Step 2: Run to verify failure**

Run: `cd tests && npx jest RewardCalculator -t "multiplier"`
Expected: FAIL — totals come back unmultiplied (40 expected, 20 received).

- [ ] **Step 3: Move the multiplier lookup into the service**

Cut `getAtmosphericBuffMultiplier` from `atmosphericBuffViewModel.js:25-57` and paste it into `assets/js/services/AtmosphericBuffService.js` as an exported function, unchanged apart from the `export` keyword and its JSDoc. It already imports `STORAGE_KEYS` and `data`, so no new imports are needed.

In `atmosphericBuffViewModel.js`, delete the local copy and add `getAtmosphericBuffMultiplier` to the existing import from `../services/AtmosphericBuffService.js`. The call at `:100` is unchanged.

- [ ] **Step 4: Accept and apply the multiplier in the calculator**

Change the signature in `assets/js/services/RewardCalculator.js`:

```javascript
    static calculateAtmosphericBuffRewards(
        atmosphericBuffs = {},
        associatedBuffs = [],
        forcedActiveBuffNames = [],
        options = {}
    ) {
        const { multiplier = 1, multiplierSource = null } = options;
```

After the buff loop, before the final assignments, apply it:

```javascript
        if (multiplier !== 1 && total > 0) {
            const beforeMultiplier = total;
            total = Math.floor(total * multiplier);
            reward.receipt.modifiers.push({
                source: multiplierSource || 'Atmospheric multiplier',
                type: 'atmospheric-multiplier',
                value: total - beforeMultiplier,
                description: `x${multiplier} to atmospheric buff total`,
                currency: GAME_CONFIG.atmospheric.resource
            });
        }
```

- [ ] **Step 5: Run to verify the tests pass**

Run: `cd tests && npx jest RewardCalculator`
Expected: PASS.

- [ ] **Step 6: Pass it through from End of Month**

In `assets/js/controllers/EndOfMonthController.js`, add `getAtmosphericBuffMultiplier` to the existing import from `../services/AtmosphericBuffService.js` (currently importing `isForcedAtmosphericBuff`; if the controller does not yet import from that module, add `import { getAtmosphericBuffMultiplier } from '../services/AtmosphericBuffService.js';`). Then replace the call at `:90-94`:

```javascript
            const { multiplier, modifierItemName } = getAtmosphericBuffMultiplier(stateAdapter.state);

            // Calculate atmospheric buff rewards using RewardCalculator
            const atmosphericRewards = RewardCalculator.calculateAtmosphericBuffRewards(
                atmosphericBuffs,
                associatedBuffs,
                forcedBuffNames,
                { multiplier, multiplierSource: modifierItemName }
            );
```

- [ ] **Step 7: Update the view model test mock**

`tests/viewModels/atmosphericBuffViewModel.test.js:8-26` mocks the whole service module, so the moved function must be added to the mock or the view model will call `undefined`. Add to the mock factory:

```javascript
    getAtmosphericBuffMultiplier: jest.fn((state) => {
        const equipped = state?.equippedItems || [];
        if (equipped.some((i) => i?.name === 'Tome-Bound Cat')) {
            return { multiplier: 2, modifierItemName: 'Tome-Bound Cat' };
        }
        const passiveFamiliars = state?.passiveFamiliarSlots || [];
        if (passiveFamiliars.some((s) => s?.itemName === 'Tome-Bound Cat')) {
            return { multiplier: 1.5, modifierItemName: 'Tome-Bound Cat' };
        }
        return { multiplier: 1, modifierItemName: null };
    }),
```

- [ ] **Step 8: Run the full suite**

Run: `cd tests && npm test`
Expected: PASS.

- [ ] **Step 9: Checkpoint**

Commit as `fix(8mfg): pay the Tome-Bound Cat atmospheric multiplier at end of month`. Report files changed and suite status. Leave bead `ds61` open — Task 6 completes it.

---

## Task 6: Make trackable atmospheric items actually pay (R3b)

Bead: `tome-of-secrets-ds61` (part 2 of 2)

**Files:**
- Modify: `assets/js/services/AtmosphericBuffService.js`
- Modify: `assets/js/services/RewardCalculator.js`
- Modify: `assets/js/viewModels/atmosphericBuffViewModel.js:143-170`
- Modify: `assets/js/controllers/EndOfMonthController.js`
- Test: `tests/RewardCalculator.test.js`, `tests/viewModels/atmosphericBuffViewModel.test.js`

**Interfaces:**
- Consumes: `options` on `calculateAtmosphericBuffRewards` from Task 5.
- Produces: `getTrackableAtmosphericItemValues(state) -> Object<string, number>` exported from `AtmosphericBuffService.js`.

**Background — two compounding defects:** (1) `atmosphericBuffViewModel.js:151` hardcodes `dailyValue = 1` while the Gilded Painting promises +2. (2) These rows pay nothing at all: `updateAtmosphericBuff()` (`stateAdapter.js:1144`) seeds entries as `{ daysUsed: 0, isActive: false }`, entering days calls only `setAtmosphericBuffDaysUsed()` which never touches `isActive`, and the row's checkbox is rendered `disabled` so `handleAtmosphericBuffToggle()` never fires. The calculator gates on `buff.isActive === true`, so the entry is skipped every month.

The fix passes trackable item names and their per-day values into the calculator, which treats them as active — the same shape `forcedActiveBuffNames` already uses for Grove Tender. **Do not** fix this by writing `isActive: true` into state from a render path; a view model must not mutate state.

- [ ] **Step 1: Write the failing test**

Add to the `calculateAtmosphericBuffRewards` describe block in `tests/RewardCalculator.test.js`:

```javascript
        test('should pay trackable items at their own per-day value even when isActive is false', () => {
            const atmosphericBuffs = {
                'Garden Gnome': { daysUsed: 10, isActive: false }
            };

            const rewards = RewardCalculator.calculateAtmosphericBuffRewards(
                atmosphericBuffs,
                [],
                [],
                { trackableItemValues: { 'Garden Gnome': 2 } }
            );

            expect(rewards.paperScraps).toBe(20); // 10 days × the item's own 2/day
            expect(rewards.modifiedBy).toContain('Garden Gnome');
        });

        test('should use the passive per-day value when the item is displayed not equipped', () => {
            const atmosphericBuffs = {
                'Gilded Painting': { daysUsed: 10, isActive: false }
            };

            const rewards = RewardCalculator.calculateAtmosphericBuffRewards(
                atmosphericBuffs,
                [],
                [],
                { trackableItemValues: { 'Gilded Painting': 1 } }
            );

            expect(rewards.paperScraps).toBe(10);
        });

        test('should multiply trackable item totals alongside buff totals', () => {
            const atmosphericBuffs = {
                'The Candlight Study': { daysUsed: 5, isActive: true },
                'Garden Gnome': { daysUsed: 5, isActive: false }
            };

            const rewards = RewardCalculator.calculateAtmosphericBuffRewards(
                atmosphericBuffs,
                [],
                [],
                { multiplier: 2, multiplierSource: 'Tome-Bound Cat', trackableItemValues: { 'Garden Gnome': 2 } }
            );

            expect(rewards.paperScraps).toBe(40); // (5×2 buff + 5×2 gnome) = 20, × 2 = 40
        });

        test('should not pay a trackable item with zero days used', () => {
            const atmosphericBuffs = {
                'Garden Gnome': { daysUsed: 0, isActive: false }
            };

            const rewards = RewardCalculator.calculateAtmosphericBuffRewards(
                atmosphericBuffs,
                [],
                [],
                { trackableItemValues: { 'Garden Gnome': 2 } }
            );

            expect(rewards.paperScraps).toBe(0);
            expect(rewards.modifiedBy).not.toContain('Garden Gnome');
        });
```

- [ ] **Step 2: Run to verify failure**

Run: `cd tests && npx jest RewardCalculator -t "trackable"`
Expected: FAIL — all four return 0, because `isActive` is false and nothing overrides it.

- [ ] **Step 3: Add the lookup to the service**

Append to `assets/js/services/AtmosphericBuffService.js`:

```javascript
/**
 * Per-day reward value for each equipped or displayed trackable atmospheric item
 * (Gilded Painting, Garden Gnome, Mystical Moth).
 *
 * Equipped items use `rewardModifier`, display/adoption slots use `passiveRewardModifier`,
 * both keyed by GAME_CONFIG.atmospheric.resource. Equipped wins when an item appears in both.
 *
 * @param {Object} state - Character state object
 * @param {Object} [dataModule]
 * @returns {Object<string, number>} Map of item name to per-day value
 */
export function getTrackableAtmosphericItemValues(state, dataModule = data) {
    const values = {};
    const allItems = dataModule.allItems || {};
    const resource = GAME_CONFIG.atmospheric.resource;

    const add = (itemName, isEquipped) => {
        if (!itemName || values[itemName] !== undefined) return;
        const itemData = allItems[itemName];
        if (!itemData?.atmosphericReward || !itemData?.atmosphericRewardTrackable) return;
        const modifier = isEquipped ? itemData.rewardModifier : itemData.passiveRewardModifier;
        const value = modifier?.[resource];
        if (typeof value === 'number' && value > 0) {
            values[itemName] = value;
        }
    };

    const equipped = state?.[STORAGE_KEYS.EQUIPPED_ITEMS];
    if (Array.isArray(equipped)) {
        equipped.forEach((item) => { add(item?.name, true); });
    }
    (state?.[STORAGE_KEYS.PASSIVE_ITEM_SLOTS] || []).forEach((slot) => { add(slot?.itemName, false); });
    (state?.[STORAGE_KEYS.PASSIVE_FAMILIAR_SLOTS] || []).forEach((slot) => { add(slot?.itemName, false); });

    return values;
}
```

- [ ] **Step 4: Honour trackable values in the calculator**

In `calculateAtmosphericBuffRewards`, destructure the third option and branch inside the loop:

```javascript
        const { multiplier = 1, multiplierSource = null, trackableItemValues = {} } = options;
```

```javascript
        for (const buffName in atmosphericBuffs) {
            const buff = atmosphericBuffs[buffName];
            const trackableValue = trackableItemValues[buffName];
            const isTrackableItem = typeof trackableValue === 'number';
            const countsForReward =
                buff.daysUsed > 0 &&
                (isTrackableItem || buff.isActive === true || forcedActive.has(buffName));
            if (!countsForReward) continue;

            let dailyValue;
            let descriptionSuffix;
            if (isTrackableItem) {
                // Equipped/displayed atmospheric items are always active; their per-day
                // value comes from the item, not the sanctum table.
                dailyValue = trackableValue;
                descriptionSuffix = ' (from item)';
            } else {
                const buffId = data.getAtmosphericBuff(buffName)?.id || buffName;
                const isAssociated = associatedSet.has(buffId);
                dailyValue = isAssociated
                    ? GAME_CONFIG.atmospheric.sanctumBonus
                    : GAME_CONFIG.atmospheric.baseValue;
                descriptionSuffix = isAssociated ? ' (Sanctum bonus)' : '';
            }

            const buffTotal = buff.daysUsed * dailyValue;
            total += buffTotal;

            if (buffTotal > 0) {
                processedBuffs.push(buffName);
                reward.receipt.modifiers.push({
                    source: buffName,
                    type: 'atmospheric',
                    value: buffTotal,
                    description: `${buff.daysUsed} days × ${dailyValue} Paper Scraps${descriptionSuffix}`,
                    currency: GAME_CONFIG.atmospheric.resource
                });
            }
        }
```

- [ ] **Step 5: Run to verify the tests pass**

Run: `cd tests && npx jest RewardCalculator`
Expected: PASS.

- [ ] **Step 6: Pass trackable values through from End of Month**

In `assets/js/controllers/EndOfMonthController.js`, add `getTrackableAtmosphericItemValues` to the service import and extend the options object:

```javascript
            const { multiplier, modifierItemName } = getAtmosphericBuffMultiplier(stateAdapter.state);
            const trackableItemValues = getTrackableAtmosphericItemValues(stateAdapter.state);

            // Calculate atmospheric buff rewards using RewardCalculator
            const atmosphericRewards = RewardCalculator.calculateAtmosphericBuffRewards(
                atmosphericBuffs,
                associatedBuffs,
                forcedBuffNames,
                { multiplier, multiplierSource: modifierItemName, trackableItemValues }
            );
```

- [ ] **Step 7: Use the same values in the view model**

In `atmosphericBuffViewModel.js`, add `getTrackableAtmosphericItemValues` to the service import, call it once alongside the multiplier (near `:100`):

```javascript
    const trackableItemValues = getTrackableAtmosphericItemValues(state);
```

and in the trackable branch (`:151`) replace `const dailyValue = 1;` with:

```javascript
            const dailyValue = trackableItemValues[name] ?? 1;
```

- [ ] **Step 8: Pin display and award together**

Add to `tests/viewModels/atmosphericBuffViewModel.test.js`. First extend the module mock with the new function and give Garden Gnome a `rewardModifier` in the data mock:

```javascript
    getTrackableAtmosphericItemValues: jest.fn((state) => {
        const equipped = state?.equippedItems || [];
        return equipped.some((i) => i?.name === 'Garden Gnome') ? { 'Garden Gnome': 2 } : {};
    }),
```

```javascript
        'Garden Gnome': {
            atmosphericReward: true,
            atmosphericRewardTrackable: true,
            rewardModifier: { paperScraps: 2 },
            passiveRewardModifier: { paperScraps: 1 }
        }
```

Then the equivalence test — this is the regression guard for both R3a and R3b, since each bug was a divergence between the displayed Total and the awarded amount:

```javascript
        test('trackable item row uses the item per-day value, not a hardcoded 1', () => {
            const state = {
                atmosphericBuffs: { 'Garden Gnome': { daysUsed: 4, isActive: false } },
                equippedItems: [{ name: 'Garden Gnome' }]
            };

            const viewModels = createAtmosphericBuffViewModel(state, '', '');
            const gnomeRow = viewModels.find((vm) => vm.name === 'Garden Gnome');

            expect(gnomeRow.dailyValue).toBe(2);
            expect(gnomeRow.total).toBe(8); // 4 days × 2
        });
```

- [ ] **Step 9: Run the full suite**

Run: `cd tests && npm test`
Expected: PASS. Existing trackable-item tests at `:141-170` assert totals computed at 1/day; update their expectations to the item's 2/day value.

- [ ] **Step 10: Verify by hand**

Run `bundle exec jekyll serve`, open the character sheet Environment tab, equip the Garden Gnome and the Tome-Bound Cat, set the Gnome to 5 days and one atmospheric buff to 10 days, and press End of Month. Expected Paper Scraps: `(10 × 2) + (5 × 2) = 30`, then `× 2` for the Cat = **60**. Confirm the Paper Scraps field increases by 60 and Ink Drops does not change.

- [ ] **Step 11: Checkpoint**

Commit as `fix(8mfg): pay trackable atmospheric items their own per-day value`. Report files changed, suite status, and the hand-verified figure. Then `bd close tome-of-secrets-ds61 --reason "Cat multiplier now paid at EOM; trackable items pay their own per-day value"` and `bd export --no-memories -o .beads/issues.jsonl`.

---

## Task 7: Final verification and review gate

**Files:** none modified unless review finds defects.

- [ ] **Step 1: Run everything from a clean state**

Run: `node scripts/generate-data.js && cd tests && npm run validate-data && npm test`
Expected: validation clean, full suite PASS. Record the test counts.

Note: `assets/js/character-sheet/data.json-exports.js` is **gitignored** (`.gitignore:12`) and untracked — it is generated locally and never committed, so it will not appear in any diff. Regenerating it and having the suite still pass IS the consistency check; there is no "unchanged diff" to look for.

- [ ] **Step 2: Confirm no ink references survive in converted content**

Run: `grep -n "Ink Drop" assets/data/allItems.json | grep -iE "amulet|key of|temporal|magnifying|ingredient|navigator|story-weaver|bookwyrm|gilded|gnome|moth|tome-bound"`
Expected: no output. Any hit is a display string left stale against its effect — the exact defect class R3 exists to fix.

Run: `grep -n "Atmospheric" core-mechanics.md`
Expected: the atmospheric bullet appears under Paper Scraps, not under Ink Drops.

- [ ] **Step 3: Dispatch the required pre-commit review subagent**

AGENTS.md requires a separate subagent review pass for code changes before handoff. Dispatch a subagent with the full diff and ask it to check: consistency with ADR-003 (no bespoke calculator branches where the pipeline could express the mechanic), that no view model mutates state, that `Math.max(0, …)` removal was limited to balances and did not touch reward/cost sanitizers, and test coverage gaps.

- [ ] **Step 4: Report to the maintainer**

Summarize: every file changed across Tasks 1-6, the test counts, the review subagent's findings and their resolution, and the reminder that all five beads are closed and the branch is committed but never pushed — the merge to `main` is the maintainer's.

---

## Notes for the executor

- **`data.json-exports.js` will NOT appear in any diff.** It is gitignored (`.gitignore:12`) and untracked — generated locally, never committed. Run `node scripts/generate-data.js` after every `assets/data/*.json` change anyway: `data.js` re-exports from it, so the test suite reads your regenerated file. Skipping the regen means your tests run against stale data and may pass or fail for the wrong reason.
- **If a test fails with a stale currency expectation**, the test encodes the old balance and should be updated — but read it first. A test failing because a *different* currency moved is a real regression, not a stale expectation.
- **The player's existing 1000+ Ink Drop balance is deliberately untouched.** Do not add a migration that reduces it.
