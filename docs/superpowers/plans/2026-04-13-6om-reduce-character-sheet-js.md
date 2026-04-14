# Reduce character-sheet.js to Initialization and Wiring — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extract all domain logic from `character-sheet.js` (1,662 lines) into focused modules, leaving a ~200-line thin orchestrator.

**Architecture:** Each logical concern moves to its own ES module under `assets/js/character-sheet/`. Modules export functions that the orchestrator calls. The two large async functions (`initializeRollingTables`, `initializeQuestInfoDrawers`) move as-is without deduplication. No new controller classes.

**Tech Stack:** Vanilla JS ES modules, Jest + jsdom for testing

**Important context:**
- All test commands must run from the `tests/` directory: `cd /workspaces/tome-of-secrets/tests && npx jest --config jest.config.js`
- 3 test suites (`dataContracts.test.js`, `realDataIntegration.test.js`, `activationCooldown.test.js`) have pre-existing failures (ENOENT for data files). These are unrelated — ignore them.
- The user handles all git operations. Do NOT run `git add`, `git commit`, or `git push`.
- `character-sheet.js` lives at `assets/js/character-sheet.js`
- Existing modules in `assets/js/character-sheet/` include: `data.js`, `state.js`, `stateAdapter.js`, `storageKeys.js`, `formPersistence.js`, `postLoadRepair.js`, `ui.js`

---

### Task 1: Extract calendarPeriod.js and dropdownInit.js

Two small, dependency-free extractions that set up the initial UI before state loads.

**Files:**

- Create: `assets/js/character-sheet/calendarPeriod.js`
- Create: `assets/js/character-sheet/dropdownInit.js`
- Modify: `assets/js/character-sheet.js`

- [ ] **Step 1: Create `calendarPeriod.js`**

Create `assets/js/character-sheet/calendarPeriod.js` with this content:

```js
/**
 * Calendar period helpers for quest month/year defaulting.
 */

export function getCurrentCalendarPeriod() {
    const now = new Date();
    const monthNames = [
        'January', 'February', 'March', 'April', 'May', 'June',
        'July', 'August', 'September', 'October', 'November', 'December'
    ];
    return {
        month: monthNames[now.getMonth()],
        year: String(now.getFullYear())
    };
}

export function defaultQuestMonthYearIfEmpty() {
    const monthSel = document.getElementById('quest-month');
    const yearSel = document.getElementById('quest-year');
    const fallback = getCurrentCalendarPeriod();
    if (!monthSel || !yearSel) {
        return fallback;
    }
    if (!monthSel.value) {
        monthSel.value = fallback.month;
    }
    if (!yearSel.value) {
        yearSel.value = fallback.year;
    }
    return {
        month: monthSel.value?.trim?.() || fallback.month,
        year: yearSel.value?.trim?.() || fallback.year
    };
}
```

- [ ] **Step 2: Create `dropdownInit.js`**

Create `assets/js/character-sheet/dropdownInit.js` with this content:

```js
/**
 * Dropdown population for character sheet selects.
 * Populates wizard school, library sanctum, and year dropdowns.
 */

export function populateDropdowns(dataModule) {
    // Populate wizard school dropdown
    const wizardSchoolSelect = document.getElementById('wizardSchool');
    if (wizardSchoolSelect && dataModule.schoolBenefits) {
        wizardSchoolSelect.innerHTML = '<option value="">-- Select a School --</option>';
        Object.keys(dataModule.schoolBenefits).forEach(schoolName => {
            const opt = document.createElement('option');
            opt.value = schoolName;
            opt.textContent = schoolName;
            wizardSchoolSelect.appendChild(opt);
        });
    }

    // Populate library sanctum dropdown
    const librarySanctumSelect = document.getElementById('librarySanctum');
    if (librarySanctumSelect && dataModule.sanctumBenefits) {
        librarySanctumSelect.innerHTML = '<option value="">-- Select a Sanctum --</option>';
        Object.keys(dataModule.sanctumBenefits).forEach(sanctumName => {
            const sanctum = dataModule.sanctumBenefits[sanctumName];
            const opt = document.createElement('option');
            opt.value = sanctum?.id || sanctumName;
            opt.textContent = sanctum?.name || sanctumName;
            librarySanctumSelect.appendChild(opt);

            // Backward compatibility: support legacy saved/form values that used display name as value.
            if (sanctum?.id && sanctumName !== sanctum.id) {
                const legacyOpt = document.createElement('option');
                legacyOpt.value = sanctumName;
                legacyOpt.textContent = sanctum?.name || sanctumName;
                legacyOpt.hidden = true;
                librarySanctumSelect.appendChild(legacyOpt);
            }
        });
    }

    // Populate year dropdowns (for quest month/year selection)
    const populateYearDropdown = (selectElement) => {
        if (!selectElement) return;

        const firstOption = selectElement.querySelector('option[value=""]');
        selectElement.innerHTML = firstOption ? firstOption.outerHTML : '<option value="">-- Select Year --</option>';

        const currentYear = new Date().getFullYear();
        const startYear = 2025; // Game launch year
        const endYear = Math.max(currentYear + 2, startYear);

        for (let year = startYear; year <= endYear; year++) {
            const opt = document.createElement('option');
            opt.value = String(year);
            opt.textContent = String(year);
            selectElement.appendChild(opt);
        }
    };

    populateYearDropdown(document.getElementById('quest-year'));
    populateYearDropdown(document.getElementById('edit-quest-year'));
}
```

- [ ] **Step 3: Update `character-sheet.js` to use the new modules**

In `character-sheet.js`:

1. Add imports near the top (after the existing imports):

```js
import { getCurrentCalendarPeriod, defaultQuestMonthYearIfEmpty } from './character-sheet/calendarPeriod.js';
import { populateDropdowns } from './character-sheet/dropdownInit.js';
```

2. Replace lines 58-117 (everything from the wizard school dropdown population through the year dropdown population, but NOT the `ui.populateBackgroundDropdown()` call on line 59) with:

```js
    populateDropdowns(dataModule);
```

Keep `ui.populateBackgroundDropdown();` on its own line before the `populateDropdowns` call.

3. Delete the `getCurrentCalendarPeriod` function definition (lines 122-132) and the `defaultQuestMonthYearIfEmpty` function definition (lines 134-152). The call to `defaultQuestMonthYearIfEmpty()` on what was line 153 stays — it now calls the imported function.

- [ ] **Step 4: Run tests to verify nothing broke**

Run: `cd /workspaces/tome-of-secrets/tests && npx jest --config jest.config.js --verbose 2>&1 | tail -30`

Expected: All previously-passing tests still pass. The 3 pre-existing ENOENT failures are unrelated.

- [ ] **Step 5: Commit**

```
refactor: extract calendarPeriod.js and dropdownInit.js from character-sheet.js
```

---

### Task 2: Extract currencyService.js

The `updateCurrency` function and its internal `checkRewardTextForBuffs` helper.

**Files:**

- Create: `assets/js/character-sheet/currencyService.js`
- Modify: `assets/js/character-sheet.js`

- [ ] **Step 1: Create `currencyService.js`**

Create `assets/js/character-sheet/currencyService.js` with this content:

```js
/**
 * Currency update service.
 * Factory that returns an updateCurrency(rewards) function with dependencies bound via closure.
 */

import { parseIntOr } from '../utils/helpers.js';

export function createUpdateCurrency(stateAdapter, ui, dataModule) {
    return function updateCurrency(rewards) {
        if (!rewards) return;
        const xpCurrent = document.getElementById('xp-current');
        const inkDrops = document.getElementById('inkDrops');
        const paperScraps = document.getElementById('paperScraps');
        const dustyBlueprints = document.getElementById('dustyBlueprints');

        if (xpCurrent && rewards.xp > 0) {
            const currentXP = parseIntOr(xpCurrent.value, 0);
            xpCurrent.value = currentXP + rewards.xp;
        }

        if (inkDrops && rewards.inkDrops > 0) {
            const currentInk = parseIntOr(inkDrops.value, 0);
            inkDrops.value = currentInk + rewards.inkDrops;
        }

        // Note: blueprints are awarded via stateAdapter, so we sync from characterState
        if (dustyBlueprints) {
            const { characterState } = stateAdapter;
            const { STORAGE_KEYS } = require_STORAGE_KEYS();
            dustyBlueprints.value = characterState[STORAGE_KEYS.DUSTY_BLUEPRINTS] || 0;
        }

        if (paperScraps && rewards.paperScraps > 0) {
            const currentPaper = parseIntOr(paperScraps.value, 0);
            paperScraps.value = currentPaper + rewards.paperScraps;
        }

        // Handle items and temp buffs from rewards
        if (rewards.items && rewards.items.length > 0) {
            rewards.items.forEach(itemName => {
                let buffData = dataModule.temporaryBuffs?.[itemName] || dataModule.temporaryBuffsFromRewards?.[itemName];
                if (buffData) {
                    let monthsRemaining = 0;
                    if (buffData.duration === 'two-months') {
                        monthsRemaining = 2;
                    } else if (buffData.duration === 'until-end-month') {
                        monthsRemaining = 1;
                    }

                    stateAdapter.addTemporaryBuff({
                        name: itemName,
                        description: buffData.description,
                        duration: buffData.duration,
                        monthsRemaining,
                        status: 'active'
                    });

                    ui.renderTemporaryBuffs();
                    const wearableSlotsInput = document.getElementById('wearable-slots');
                    const nonWearableSlotsInput = document.getElementById('non-wearable-slots');
                    const familiarSlotsInput = document.getElementById('familiar-slots');
                    ui.updateQuestBuffsDropdown(wearableSlotsInput, nonWearableSlotsInput, familiarSlotsInput);
                } else if (dataModule.allItems[itemName]) {
                    stateAdapter.addInventoryItem({ name: itemName, ...dataModule.allItems[itemName] });
                }
            });
        }

        // Auto-detect temporary buffs from reward text
        const checkRewardTextForBuffs = (rewardText) => {
            if (!rewardText || !dataModule.temporaryBuffs) return;

            for (const [buffName, buffData] of Object.entries(dataModule.temporaryBuffs)) {
                if (rewardText.toLowerCase().includes(buffName.toLowerCase())) {
                    const existingBuffs = stateAdapter.getTemporaryBuffs();
                    const alreadyAdded = existingBuffs.some(buff => buff.name === buffName && buff.status === 'active');
                    if (!alreadyAdded) {
                        let monthsRemaining = 0;
                        if (buffData.duration === 'two-months') {
                            monthsRemaining = 2;
                        } else if (buffData.duration === 'until-end-month') {
                            monthsRemaining = 1;
                        }

                        stateAdapter.addTemporaryBuff({
                            name: buffName,
                            description: buffData.description,
                            duration: buffData.duration,
                            monthsRemaining,
                            status: 'active'
                        });

                        ui.renderTemporaryBuffs();
                        const wearableSlotsInput = document.getElementById('wearable-slots');
                        const nonWearableSlotsInput = document.getElementById('non-wearable-slots');
                        const familiarSlotsInput = document.getElementById('familiar-slots');
                        ui.updateQuestBuffsDropdown(wearableSlotsInput, nonWearableSlotsInput, familiarSlotsInput);
                    }
                }
            }
        };

        if (rewards.items && rewards.items.length > 0) {
            const rewardText = rewards.items.join(' ');
            checkRewardTextForBuffs(rewardText);
        }
    };
}
```

**Important:** The original code accesses `characterState[STORAGE_KEYS.DUSTY_BLUEPRINTS]` via closure variables. In the extracted module, these need to be passed in. Look at the actual code — `characterState` is imported at the top of `character-sheet.js` and `STORAGE_KEYS` is also imported. The cleanest approach: import them directly in `currencyService.js`:

Replace the `dustyBlueprints` block with:

```js
        if (dustyBlueprints) {
            dustyBlueprints.value = characterState[STORAGE_KEYS.DUSTY_BLUEPRINTS] || 0;
        }
```

And add these imports at the top of `currencyService.js`:

```js
import { characterState } from './state.js';
import { STORAGE_KEYS } from './storageKeys.js';
```

Remove the `require_STORAGE_KEYS()` placeholder from the first draft above.

- [ ] **Step 2: Update `character-sheet.js`**

1. Add import:

```js
import { createUpdateCurrency } from './character-sheet/currencyService.js';
```

2. Replace the entire `updateCurrency` function definition (lines 175-276 in the original) with:

```js
    const updateCurrency = createUpdateCurrency(stateAdapter, ui, dataModule);
```

This line should go after the `stateAdapter` creation (line 158) and before the `stateAdapter.applyQuestDraftedEffects` assignment.

- [ ] **Step 3: Run tests**

Run: `cd /workspaces/tome-of-secrets/tests && npx jest --config jest.config.js --verbose 2>&1 | tail -30`

Expected: All previously-passing tests still pass.

- [ ] **Step 4: Commit**

```
refactor: extract currencyService.js from character-sheet.js
```

---

### Task 3: Extract questDraftHook.js

The `stateAdapter.applyQuestDraftedEffects` monkey-patch.

**Files:**

- Create: `assets/js/character-sheet/questDraftHook.js`
- Modify: `assets/js/character-sheet.js`

- [ ] **Step 1: Create `questDraftHook.js`**

Create `assets/js/character-sheet/questDraftHook.js`:

```js
/**
 * Quest drafted effects hook factory.
 * Returns a function to assign to stateAdapter.applyQuestDraftedEffects.
 */

import { applyQuestDraftedEffects } from '../services/QuestDraftEffectService.js';
import { toast } from '../ui/toast.js';
import { getCurrentCalendarPeriod, defaultQuestMonthYearIfEmpty } from './calendarPeriod.js';

export function createQuestDraftedHook({ stateAdapter, updateCurrency, dataModule, form }) {
    return function questDraftedHook(addedQuests) {
        const drafted = Array.isArray(addedQuests) ? addedQuests : [];
        const firstWithPeriod = drafted.find((quest) => {
            const monthVal = typeof quest?.month === 'string' ? quest.month.trim() : '';
            const yearVal = typeof quest?.year === 'string' ? quest.year.trim() : '';
            return !!(monthVal && yearVal);
        });
        const questMonthEl = document.getElementById('quest-month');
        const questYearEl = document.getElementById('quest-year');
        const fallback = getCurrentCalendarPeriod();
        const monthFromQuest = typeof firstWithPeriod?.month === 'string' ? firstWithPeriod.month.trim() : '';
        const yearFromQuest = typeof firstWithPeriod?.year === 'string' ? firstWithPeriod.year.trim() : '';
        const monthRaw = questMonthEl?.value?.trim?.() || '';
        const yearRaw = questYearEl?.value?.trim?.() || '';
        const month = monthFromQuest || monthRaw || fallback.month;
        const year = yearFromQuest || yearRaw || fallback.year;
        applyQuestDraftedEffects(this, addedQuests, {
            updateCurrency,
            dataModule,
            toast,
            form,
            month,
            year
        });
    };
}
```

- [ ] **Step 2: Update `character-sheet.js`**

1. Add import:

```js
import { createQuestDraftedHook } from './character-sheet/questDraftHook.js';
```

2. Remove the `import { applyQuestDraftedEffects } from './services/QuestDraftEffectService.js';` line (it's now imported inside `questDraftHook.js`). Also remove `import { toast } from './ui/toast.js';` if it's no longer used elsewhere in character-sheet.js — check first. If `toast` is still referenced elsewhere, keep the import.

3. Replace the `stateAdapter.applyQuestDraftedEffects = function questDraftedHook(addedQuests) { ... };` block (lines 278-302) with:

```js
    stateAdapter.applyQuestDraftedEffects = createQuestDraftedHook({
        stateAdapter, updateCurrency, dataModule, form
    });
```

**Note:** The original function uses `this` (bound to the stateAdapter when called as a method). The extracted version preserves this — `applyQuestDraftedEffects(this, ...)` still works because the function is assigned as a method on stateAdapter.

- [ ] **Step 3: Run tests**

Run: `cd /workspaces/tome-of-secrets/tests && npx jest --config jest.config.js --verbose 2>&1 | tail -30`

Expected: All previously-passing tests still pass.

- [ ] **Step 4: Commit**

```
refactor: extract questDraftHook.js from character-sheet.js
```

---

### Task 4: Extract genreSelection.js

Genre quest dropdown management and genre selection initialization/display.

**Files:**

- Create: `assets/js/character-sheet/genreSelection.js`
- Modify: `assets/js/character-sheet.js`

- [ ] **Step 1: Create `genreSelection.js`**

Create `assets/js/character-sheet/genreSelection.js`:

```js
/**
 * Genre selection functionality.
 * Manages the genre quest dropdown and selected genres display.
 */

import { STATE_EVENTS } from './stateAdapter.js';

export function updateGenreQuestDropdown(stateAdapter, dataModule) {
    const genreQuestSelect = document.getElementById('genre-quest-select');
    if (!genreQuestSelect) return;

    genreQuestSelect.innerHTML = '<option value="">-- Select a Genre Quest --</option>';
    const selectedGenres = stateAdapter.getSelectedGenres();

    if (selectedGenres.length > 0) {
        selectedGenres.forEach((genre, index) => {
            const option = document.createElement('option');
            option.value = `${genre}: ${dataModule.allGenres[genre]}`;
            option.textContent = `${index + 1}: ${genre}`;
            genreQuestSelect.appendChild(option);
        });
    } else {
        for (const key in dataModule.genreQuests) {
            const option = document.createElement('option');
            option.value = `${dataModule.genreQuests[key].genre}: ${dataModule.genreQuests[key].description}`;
            option.textContent = `${key}: ${dataModule.genreQuests[key].genre}`;
            genreQuestSelect.appendChild(option);
        }
    }
}

export function displaySelectedGenres(stateAdapter) {
    const display = document.getElementById('selected-genres-display');
    if (!display) return;

    const selectedGenres = stateAdapter.getSelectedGenres();

    if (selectedGenres.length === 0) {
        display.innerHTML = '<p class="no-genres">No genres selected yet. Open the Quests tab and click "\u2665 View Genre Quests" to choose your genres.</p>';
        return;
    }

    let html = '<div class="selected-genres-list">';
    selectedGenres.forEach((genre, index) => {
        html += `
            <div class="selected-genre-item">
                <span class="genre-number">${index + 1}.</span>
                <span class="genre-name">${genre}</span>
            </div>
        `;
    });
    html += '</div>';
    display.innerHTML = html;
}

export function initializeGenreSelection(stateAdapter, dataModule) {
    stateAdapter.syncSelectedGenresFromStorage();

    const handleGenresChanged = () => {
        updateGenreQuestDropdown(stateAdapter, dataModule);
        displaySelectedGenres(stateAdapter);
    };

    handleGenresChanged();
    stateAdapter.on(STATE_EVENTS.SELECTED_GENRES_CHANGED, handleGenresChanged);
}
```

- [ ] **Step 2: Update `character-sheet.js`**

1. Add import:

```js
import { updateGenreQuestDropdown, initializeGenreSelection } from './character-sheet/genreSelection.js';
```

2. Delete the `updateGenreQuestDropdown` function (lines 305-328), the `initializeGenreSelection` function (lines 511-521), and the `displaySelectedGenres` function (lines 523-545).

3. Replace the call `initializeGenreSelection();` (around line 897) with:

```js
    initializeGenreSelection(stateAdapter, dataModule);
```

4. Update the `questController.initialize(...)` call. It currently receives `updateGenreQuestDropdown` as an argument. Change it to pass a wrapper that calls the imported function with the right args:

```js
    questController.initialize(completedBooksSet, saveCompletedBooksSet, updateCurrency, () => updateGenreQuestDropdown(stateAdapter, dataModule));
```

- [ ] **Step 3: Run tests**

Run: `cd /workspaces/tome-of-secrets/tests && npx jest --config jest.config.js --verbose 2>&1 | tail -30`

Expected: All previously-passing tests still pass.

- [ ] **Step 4: Commit**

```
refactor: extract genreSelection.js from character-sheet.js
```

---

### Task 5: Extract collapsiblePanels.js

Collapsible panel toggle and quest draw helpers help toggle.

**Files:**

- Create: `assets/js/character-sheet/collapsiblePanels.js`
- Modify: `assets/js/character-sheet.js`

- [ ] **Step 1: Create `collapsiblePanels.js`**

Create `assets/js/character-sheet/collapsiblePanels.js`:

```js
/**
 * Collapsible panel initialization.
 * Sets up show/hide toggle for collapsible panels and quest draw helpers help.
 */

import { safeGetJSON, safeSetJSON } from '../utils/storage.js';
import { STORAGE_KEYS } from './storageKeys.js';

export function initializeCollapsiblePanels() {
    const configs = [
        { buttonSelector: '.rpg-library-add-panel .panel-toggle-btn', storageKey: 'library-add-panel-body' },
        { buttonSelector: '.rpg-campaigns-add-panel .panel-toggle-btn', storageKey: 'campaigns-add-panel-body' },
        { buttonSelector: '.rpg-external-curriculum-add-panel .panel-toggle-btn', storageKey: 'external-curriculum-add-panel-body' },
        { buttonSelector: '.rpg-temporary-buffs-panel .panel-toggle-btn', storageKey: 'temporary-buffs-panel-body' },
        { buttonSelector: '.rpg-quest-card-draw-panel .panel-toggle-btn', storageKey: 'quest-card-draw-panel-body' },
        { buttonSelector: '.rpg-quest-draw-helpers-panel .panel-toggle-btn', storageKey: 'quest-draw-helpers-panel-body' }
    ];

    const stored = safeGetJSON(STORAGE_KEYS.COLLAPSED_PANELS, {});

    const saveCollapsed = (bodyId, isCollapsed) => {
        const next = { ...safeGetJSON(STORAGE_KEYS.COLLAPSED_PANELS, {}) };
        if (isCollapsed) next[bodyId] = true;
        else delete next[bodyId];
        safeSetJSON(STORAGE_KEYS.COLLAPSED_PANELS, next);
    };

    configs.forEach((cfg, index) => {
        const btn = document.querySelector(cfg.buttonSelector);
        if (!btn) return;
        const targetId = btn.getAttribute('data-panel-target');
        const body = targetId ? document.getElementById(targetId) : btn.closest('.rpg-panel')?.querySelector('.rpg-panel-body');
        if (!body) return;

        const bodyKey = body.id || targetId || cfg.storageKey || `${cfg.buttonSelector || 'panel'}-${index}`;
        let collapsed = Boolean(stored[bodyKey]);

        const applyState = () => {
            body.style.display = collapsed ? 'none' : '';
            btn.setAttribute('aria-expanded', collapsed ? 'false' : 'true');
            btn.textContent = collapsed ? 'Show' : 'Hide';
        };

        applyState();

        btn.addEventListener('click', () => {
            collapsed = !collapsed;
            saveCollapsed(bodyKey, collapsed);
            applyState();
        });
    });
}

export function initializeQuestDrawHelpersToggle() {
    const btn = document.getElementById('quest-draw-helpers-help-toggle');
    const details = document.getElementById('quest-draw-helpers-help-details');
    if (!btn || !details) return;

    btn.addEventListener('click', () => {
        const open = details.hasAttribute('hidden');
        if (open) {
            details.removeAttribute('hidden');
            btn.setAttribute('aria-expanded', 'true');
        } else {
            details.setAttribute('hidden', '');
            btn.setAttribute('aria-expanded', 'false');
        }
    });
}
```

- [ ] **Step 2: Update `character-sheet.js`**

1. Add import:

```js
import { initializeCollapsiblePanels, initializeQuestDrawHelpersToggle } from './character-sheet/collapsiblePanels.js';
```

2. Replace the two IIFEs (lines 420-483 — `setupCollapsiblePanels` and `setupQuestDrawHelpersHelpToggle`) with:

```js
    initializeCollapsiblePanels();
    initializeQuestDrawHelpersToggle();
```

- [ ] **Step 3: Run tests**

Run: `cd /workspaces/tome-of-secrets/tests && npx jest --config jest.config.js --verbose 2>&1 | tail -30`

Expected: All previously-passing tests still pass.

- [ ] **Step 4: Commit**

```
refactor: extract collapsiblePanels.js from character-sheet.js
```

---

### Task 6: Extract deckActions.js

Deck action button wiring and `updateDeckActionsLabel`.

**Files:**

- Create: `assets/js/character-sheet/deckActions.js`
- Modify: `assets/js/character-sheet.js`

- [ ] **Step 1: Create `deckActions.js`**

Create `assets/js/character-sheet/deckActions.js`:

```js
/**
 * Consolidated deck action button wiring.
 * Wires "Add selected" and "Clear draw" buttons across all deck controllers.
 */

export function createUpdateDeckActionsLabel(addSelectedBtn, deckControllers) {
    return function updateDeckActionsLabel() {
        if (!addSelectedBtn) return;
        const n = (deckControllers.genreQuestDeck.selectedIndices?.size ?? 0) +
            (deckControllers.sideQuestDeck.selectedIndices?.size ?? 0) +
            (deckControllers.atmosphericBuffDeck.selectedIndices?.size ?? 0) +
            (deckControllers.dungeonDeck.selectedIndices?.size ?? 0) +
            (deckControllers.otherQuestDeck.selectedIndices?.size ?? 0) +
            (deckControllers.otherQuestDeck.selectedIndicesExtraCredit?.size ?? 0);
        addSelectedBtn.textContent = n > 0 ? `Add selected (${n})` : 'Add selected';
        addSelectedBtn.disabled = n === 0;
    };
}

export function initializeDeckActions(deckControllers) {
    const addSelectedBtn = document.getElementById('add-selected-cards-btn');
    const clearDrawBtn = document.getElementById('clear-drawn-cards-btn');

    if (addSelectedBtn) {
        addSelectedBtn.addEventListener('click', () => {
            deckControllers.genreQuestDeck.handleAddQuestFromCard();
            deckControllers.sideQuestDeck.handleAddQuestFromCard();
            deckControllers.atmosphericBuffDeck.handleActivateBuff();
            deckControllers.dungeonDeck.handleAddQuestFromCards();
            deckControllers.otherQuestDeck.handleAddExtraCreditFromCard();
            deckControllers.otherQuestDeck.handleAddRestorationFromCard();
        });
    }

    if (clearDrawBtn) {
        clearDrawBtn.addEventListener('click', () => {
            deckControllers.genreQuestDeck.handleClearDraw();
            deckControllers.sideQuestDeck.handleClearDraw();
            deckControllers.atmosphericBuffDeck.handleClearDraw();
            deckControllers.dungeonDeck.handleClearDraw();
            deckControllers.otherQuestDeck.handleClearDraw();
        });
    }

    const updateDeckActionsLabel = createUpdateDeckActionsLabel(addSelectedBtn, deckControllers);
    updateDeckActionsLabel();

    return updateDeckActionsLabel;
}
```

- [ ] **Step 2: Update `character-sheet.js`**

1. Add import:

```js
import { initializeDeckActions } from './character-sheet/deckActions.js';
```

2. Replace lines 355-508 (from `const addSelectedBtn` through the end of the `clearDrawBtn` click handler and `updateDeckActionsLabel()` call) with:

```js
    const deckControllers = {
        genreQuestDeck: genreQuestDeckController,
        sideQuestDeck: sideQuestDeckController,
        atmosphericBuffDeck: atmosphericBuffDeckController,
        dungeonDeck: dungeonDeckController,
        otherQuestDeck: otherQuestDeckController
    };
    const updateDeckActionsLabel = initializeDeckActions(deckControllers);
    dependencies.updateDeckActionsLabel = updateDeckActionsLabel;
```

Note: The `dependencies.onBookMarkedComplete` callback (lines 369-401) must NOT be removed — it sits between the old `updateDeckActionsLabel` definition and the deck button wiring. Move it to after the `initializeDeckActions` call and the `dependencies.updateDeckActionsLabel` assignment.

- [ ] **Step 3: Run tests**

Run: `cd /workspaces/tome-of-secrets/tests && npx jest --config jest.config.js --verbose 2>&1 | tail -30`

Expected: All previously-passing tests still pass.

- [ ] **Step 4: Commit**

```
refactor: extract deckActions.js from character-sheet.js
```

---

### Task 7: Extract printHandler.js

Print button, beforeprint/afterprint event handling, tab save/restore.

**Files:**

- Create: `assets/js/character-sheet/printHandler.js`
- Modify: `assets/js/character-sheet.js`

- [ ] **Step 1: Create `printHandler.js`**

Create `assets/js/character-sheet/printHandler.js`:

```js
/**
 * Print handler.
 * Sets up print button, beforeprint/afterprint events, and tab save/restore.
 */

export function initializePrintHandler() {
    const printButton = document.getElementById('print-button');
    if (!printButton) return;

    let originalActiveTab = null;
    let isPrinting = false;

    const prepareForPrint = () => {
        const tabContainer = document.querySelector('.tab-container');
        if (tabContainer) {
            tabContainer.classList.add('printing');
        }

        if (!isPrinting) {
            const activePanel = document.querySelector('[data-tab-panel].active');
            originalActiveTab = activePanel ? activePanel.dataset.tabPanel : 'character';
            isPrinting = true;
        }

        const tabPanels = document.querySelectorAll('[data-tab-panel]');
        tabPanels.forEach(panel => {
            panel.classList.add('active');
        });
    };

    const restoreAfterPrint = () => {
        const tabContainer = document.querySelector('.tab-container');
        if (tabContainer) {
            tabContainer.classList.remove('printing');
        }

        if (originalActiveTab) {
            const tabPanels = document.querySelectorAll('[data-tab-panel]');
            tabPanels.forEach(panel => {
                panel.classList.remove('active');
            });

            let activePanel = document.querySelector(`[data-tab-panel="${originalActiveTab}"]`);
            if (!activePanel) {
                const firstPanel = tabPanels[0];
                if (firstPanel) {
                    activePanel = firstPanel;
                    originalActiveTab = firstPanel.dataset.tabPanel;
                }
            }

            if (activePanel) {
                activePanel.classList.add('active');
                localStorage.setItem('activeCharacterTab', originalActiveTab);
            }

            originalActiveTab = null;
            isPrinting = false;
        }
    };

    window.addEventListener('beforeprint', prepareForPrint);
    window.addEventListener('afterprint', restoreAfterPrint);

    printButton.addEventListener('click', () => {
        const activePanel = document.querySelector('[data-tab-panel].active');
        originalActiveTab = activePanel ? activePanel.dataset.tabPanel : 'character';
        isPrinting = true;

        prepareForPrint();
        setTimeout(() => {
            window.print();
        }, 50);
    });
}
```

- [ ] **Step 2: Update `character-sheet.js`**

1. Add import:

```js
import { initializePrintHandler } from './character-sheet/printHandler.js';
```

2. Replace lines 548-630 (the entire print button block) with:

```js
    initializePrintHandler();
```

- [ ] **Step 3: Run tests**

Run: `cd /workspaces/tome-of-secrets/tests && npx jest --config jest.config.js --verbose 2>&1 | tail -30`

Expected: All previously-passing tests still pass.

- [ ] **Step 4: Commit**

```
refactor: extract printHandler.js from character-sheet.js
```

---

### Task 8: Extract currencyWarning.js

Form submit handler and currency unsaved changes warning.

**Files:**

- Create: `assets/js/character-sheet/currencyWarning.js`
- Modify: `assets/js/character-sheet.js`

- [ ] **Step 1: Create `currencyWarning.js`**

Create `assets/js/character-sheet/currencyWarning.js`:

```js
/**
 * Currency unsaved changes warning and form submit handler.
 */

import { saveState } from './state.js';
import { showSaveIndicator } from './formPersistence.js';
import { safeGetJSON } from '../utils/storage.js';
import { STORAGE_KEYS } from './storageKeys.js';
import { parseIntOr } from '../utils/helpers.js';

export function initializeCurrencyWarning(form) {
    function checkCurrencyUnsavedChanges() {
        const warningEl = document.getElementById('currency-unsaved-warning');
        if (!warningEl) return;

        const inkDropsEl = document.getElementById('inkDrops');
        const paperScrapsEl = document.getElementById('paperScraps');
        if (!inkDropsEl || !paperScrapsEl) return;

        const savedData = safeGetJSON(STORAGE_KEYS.CHARACTER_SHEET_FORM, {});

        const savedInkDrops = parseIntOr(savedData.inkDrops, 0);
        const savedPaperScraps = parseIntOr(savedData.paperScraps, 0);

        const currentInkDrops = parseIntOr(inkDropsEl.value, 0);
        const currentPaperScraps = parseIntOr(paperScrapsEl.value, 0);

        const hasUnsavedChanges = (currentInkDrops !== savedInkDrops) || (currentPaperScraps !== savedPaperScraps);

        if (hasUnsavedChanges) {
            warningEl.style.display = 'block';
        } else {
            warningEl.style.display = 'none';
        }
    }

    // Form submit handler
    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        await saveState(form);
        showSaveIndicator();
        checkCurrencyUnsavedChanges();
    });

    // Check for unsaved changes on currency field changes
    const inkDropsEl = document.getElementById('inkDrops');
    const paperScrapsEl = document.getElementById('paperScraps');

    if (inkDropsEl) {
        inkDropsEl.addEventListener('input', checkCurrencyUnsavedChanges);
        inkDropsEl.addEventListener('change', checkCurrencyUnsavedChanges);
    }

    if (paperScrapsEl) {
        paperScrapsEl.addEventListener('input', checkCurrencyUnsavedChanges);
        paperScrapsEl.addEventListener('change', checkCurrencyUnsavedChanges);
    }

    // Initial check
    checkCurrencyUnsavedChanges();
}
```

- [ ] **Step 2: Update `character-sheet.js`**

1. Add import:

```js
import { initializeCurrencyWarning } from './character-sheet/currencyWarning.js';
```

2. Replace lines 632-686 (form submit handler + currency warning setup + initial check) with:

```js
    initializeCurrencyWarning(form);
```

3. Check if `saveState` and `showSaveIndicator` imports are still needed in character-sheet.js. `saveState` is still used in `dependencies` and `loadState` is used directly. `showSaveIndicator` may only be used in the form submit handler — if so, remove its import. Check before removing.

- [ ] **Step 3: Run tests**

Run: `cd /workspaces/tome-of-secrets/tests && npx jest --config jest.config.js --verbose 2>&1 | tail -30`

Expected: All previously-passing tests still pass.

- [ ] **Step 4: Commit**

```
refactor: extract currencyWarning.js from character-sheet.js
```

---

### Task 9: Extract delegatedClickHandler.js

The consolidated delegated click handler on the form element.

**Files:**

- Create: `assets/js/character-sheet/delegatedClickHandler.js`
- Modify: `assets/js/character-sheet.js`

- [ ] **Step 1: Create `delegatedClickHandler.js`**

Create `assets/js/character-sheet/delegatedClickHandler.js`:

```js
/**
 * Delegated click handler for the character sheet form.
 * Routes clicks to appropriate controllers and handles archive card interactions.
 */

import { safeSetJSON } from '../utils/storage.js';
import { STORAGE_KEYS } from './storageKeys.js';

export function initializeDelegatedClickHandler(form, controllers, ui) {
    const isTouchFlipMode = window.matchMedia?.('(hover: none)')?.matches ?? false;

    form.addEventListener('click', (e) => {
        const target = e.target;

        // Archive tab: jump links smooth-scroll to section
        const jumpLink = target.closest('.archive-jump-link');
        if (jumpLink && jumpLink.getAttribute('href')?.startsWith('#')) {
            const id = jumpLink.getAttribute('href').slice(1);
            const section = document.getElementById(id);
            if (section) {
                e.preventDefault();
                section.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }
            return;
        }

        // Archive tab: card face toggle (Poster vs Cover)
        const faceBtn = target.closest('.archive-face-toggle-btn');
        if (faceBtn) {
            const mode = faceBtn.getAttribute('data-archive-face');
            if (mode === 'poster' || mode === 'cover') {
                safeSetJSON(STORAGE_KEYS.ARCHIVE_CARD_FACE_MODE, mode);
                ui.renderCompletedQuests();
            }
            return;
        }

        // Archive tab: group by (Month/Year vs Quest type)
        const groupByBtn = target.closest('.archive-group-by-btn');
        if (groupByBtn) {
            const mode = groupByBtn.getAttribute('data-archive-group-by');
            if (mode === 'month' || mode === 'type') {
                safeSetJSON(STORAGE_KEYS.ARCHIVE_GROUP_BY, mode);
                ui.renderCompletedQuests();
            }
            return;
        }

        // Handle archive card clicks
        const tomeCard = target.closest('.tome-card');
        const dungeonCard = target.closest('.dungeon-archive-card');
        const archiveCard = tomeCard || dungeonCard;
        if (archiveCard && !target.closest('button')) {
            const editButton = archiveCard.querySelector('.edit-quest-btn');
            if (editButton && editButton.dataset.list && editButton.dataset.index) {
                if (tomeCard) {
                    if (!isTouchFlipMode) {
                        editButton.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));
                        return;
                    }

                    const now = Date.now();
                    const sameCard = window._tomeCardLastClickCard === tomeCard;
                    const recent = sameCard && (now - (window._tomeCardLastClickTime || 0)) < 400;
                    if (recent) {
                        window._tomeCardLastClickCard = null;
                        window._tomeCardLastClickTime = 0;
                        editButton.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));
                        return;
                    }
                    window._tomeCardLastClickCard = tomeCard;
                    window._tomeCardLastClickTime = now;
                    tomeCard.classList.toggle('tome-card-flipped');
                    return;
                }
                editButton.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));
                return;
            }
        }

        // Allow buttons without index if they're special buttons
        if (!target.dataset.index &&
            !target.classList.contains('delete-ability-btn') &&
            !target.classList.contains('remove-passive-item-btn') &&
            !target.classList.contains('equip-from-passive-btn') &&
            !target.classList.contains('mark-helper-used-btn') &&
            !target.classList.contains('undo-helper-used-btn') &&
            !target.classList.contains('mark-quest-draw-helper-used-btn') &&
            !target.classList.contains('undo-quest-draw-helper-used-btn') &&
            !target.classList.contains('activate-ability-btn')) {
            return;
        }

        // Route to appropriate controller
        if (controllers.ability.handleDeleteAbilityClick && controllers.ability.handleDeleteAbilityClick(target)) {
            return;
        }
        if (controllers.inventory.handleClick && controllers.inventory.handleClick(target)) {
            return;
        }
        if (controllers.quest.handleClick && controllers.quest.handleClick(target)) {
            return;
        }
        if (controllers.curse.handleClick && controllers.curse.handleClick(target)) {
            return;
        }
        if (controllers.buff.handleClick && controllers.buff.handleClick(target)) {
            return;
        }
    });
}
```

- [ ] **Step 2: Update `character-sheet.js`**

1. Add import:

```js
import { initializeDelegatedClickHandler } from './character-sheet/delegatedClickHandler.js';
```

2. Replace lines 688-791 (the `isTouchFlipMode` declaration and the entire `form.addEventListener('click', ...)` block) with:

```js
    initializeDelegatedClickHandler(form, {
        ability: abilityController,
        inventory: inventoryController,
        quest: questController,
        curse: curseController,
        buff: buffController
    }, ui);
```

- [ ] **Step 3: Run tests**

Run: `cd /workspaces/tome-of-secrets/tests && npx jest --config jest.config.js --verbose 2>&1 | tail -30`

Expected: All previously-passing tests still pass.

- [ ] **Step 4: Commit**

```
refactor: extract delegatedClickHandler.js from character-sheet.js
```

---

### Task 10: Extract stateInitUI.js

Item dropdown, shelf books, dusty blueprints sync, and `renderAll` call.

**Files:**

- Create: `assets/js/character-sheet/stateInitUI.js`
- Modify: `assets/js/character-sheet.js`

- [ ] **Step 1: Create `stateInitUI.js`**

Create `assets/js/character-sheet/stateInitUI.js`:

```js
/**
 * State-dependent UI initialization.
 * Item dropdown, shelf books visualization, dusty blueprints sync, renderAll.
 */

import { safeGetJSON, safeSetJSON } from '../utils/storage.js';
import { STORAGE_KEYS } from './storageKeys.js';
import { characterState } from './state.js';
import { parseIntOr } from '../utils/helpers.js';
import { runAllRepairs } from './postLoadRepair.js';

export function initializeStateDependentUI({ ui, dataModule, stateAdapter, completedBooksSet }) {
    // Populate item select dropdown
    const itemSelect = document.getElementById('item-select');
    if (itemSelect) {
        for (const name in dataModule.allItems) {
            const option = document.createElement('option');
            option.value = name;
            option.textContent = name;
            itemSelect.appendChild(option);
        }
    }

    // Run post-load repairs
    runAllRepairs(stateAdapter, ui);

    // Sync dusty blueprints input from characterState
    const dustyBlueprintsInput = document.getElementById('dustyBlueprints');
    if (dustyBlueprintsInput) {
        dustyBlueprintsInput.value = characterState[STORAGE_KEYS.DUSTY_BLUEPRINTS] || 0;

        dustyBlueprintsInput.addEventListener('change', () => {
            const newValue = parseIntOr(dustyBlueprintsInput.value, 0);
            characterState[STORAGE_KEYS.DUSTY_BLUEPRINTS] = newValue;
            stateAdapter.state[STORAGE_KEYS.DUSTY_BLUEPRINTS] = newValue;
            safeSetJSON(STORAGE_KEYS.DUSTY_BLUEPRINTS, newValue);
        });
    }

    // Initialize shelf books visualization
    const booksCompletedInput = document.getElementById('books-completed-month');
    const actualBooksCount = completedBooksSet.size;
    const inputValue = booksCompletedInput ? parseIntOr(booksCompletedInput.value, 0) : 0;
    const booksCompleted = Math.min(Math.max(inputValue, actualBooksCount), 10);

    if (booksCompletedInput && booksCompleted !== inputValue) {
        booksCompletedInput.value = booksCompleted;
    }

    let shelfColors = safeGetJSON(STORAGE_KEYS.SHELF_BOOK_COLORS, []);
    while (shelfColors.length < booksCompleted && shelfColors.length < 10) {
        shelfColors.push(ui.getRandomShelfColor());
    }
    if (shelfColors.length > booksCompleted) {
        shelfColors = shelfColors.slice(0, booksCompleted);
    }
    if (shelfColors.length !== safeGetJSON(STORAGE_KEYS.SHELF_BOOK_COLORS, []).length) {
        safeSetJSON(STORAGE_KEYS.SHELF_BOOK_COLORS, shelfColors);
        characterState[STORAGE_KEYS.SHELF_BOOK_COLORS] = shelfColors;
    }

    ui.renderShelfBooks(booksCompleted, shelfColors);

    // Handle manual changes to books completed input
    if (booksCompletedInput) {
        booksCompletedInput.addEventListener('change', () => {
            let newCount = parseIntOr(booksCompletedInput.value, 0);
            if (newCount > 10) {
                newCount = 10;
                booksCompletedInput.value = 10;
            }

            let currentColors = safeGetJSON(STORAGE_KEYS.SHELF_BOOK_COLORS, []);

            while (currentColors.length < newCount && currentColors.length < 10) {
                currentColors.push(ui.getRandomShelfColor());
            }

            if (currentColors.length > newCount) {
                currentColors = currentColors.slice(0, newCount);
            }

            safeSetJSON(STORAGE_KEYS.SHELF_BOOK_COLORS, currentColors);
            characterState[STORAGE_KEYS.SHELF_BOOK_COLORS] = currentColors;
            ui.renderShelfBooks(newCount, currentColors);
        });
    }

    // Render all UI
    const levelInput = document.getElementById('level');
    const xpNeededInput = document.getElementById('xp-needed');
    const wizardSchoolSelect = document.getElementById('wizardSchool');
    const librarySanctumSelect = document.getElementById('librarySanctum');
    const smpInput = document.getElementById('smp');
    const wearableSlotsInput = document.getElementById('wearable-slots');
    const nonWearableSlotsInput = document.getElementById('non-wearable-slots');
    const familiarSlotsInput = document.getElementById('familiar-slots');

    ui.renderAll(levelInput, xpNeededInput, wizardSchoolSelect, librarySanctumSelect, smpInput, wearableSlotsInput, nonWearableSlotsInput, familiarSlotsInput);
    ui.updateXpProgressBar();
}
```

- [ ] **Step 2: Update `character-sheet.js`**

1. Add import:

```js
import { initializeStateDependentUI } from './character-sheet/stateInitUI.js';
```

2. Replace lines 793-897 (from `const itemSelect` through `ui.updateXpProgressBar()`) with:

```js
    initializeStateDependentUI({ ui, dataModule, stateAdapter, completedBooksSet });
```

3. The `runAllRepairs` import in `character-sheet.js` can be removed since it's now imported inside `stateInitUI.js`.

- [ ] **Step 3: Run tests**

Run: `cd /workspaces/tome-of-secrets/tests && npx jest --config jest.config.js --verbose 2>&1 | tail -30`

Expected: All previously-passing tests still pass.

- [ ] **Step 4: Commit**

```
refactor: extract stateInitUI.js from character-sheet.js
```

---

### Task 11: Extract rollingTables.js

The entire `initializeRollingTables` async function (348 lines).

**Files:**

- Create: `assets/js/character-sheet/rollingTables.js`
- Modify: `assets/js/character-sheet.js`

- [ ] **Step 1: Create `rollingTables.js`**

Move the entire `initializeRollingTables` function (lines 904-1251 of the original `character-sheet.js`) into `assets/js/character-sheet/rollingTables.js`.

The file should start with:

```js
/**
 * Rolling tables overlay initialization.
 * Manages the table overlay panel for genre quests, atmospheric buffs, side quests, and dungeon rooms.
 */

import { DrawerManager } from '../ui/DrawerManager.js';
```

Then the function body, exported as:

```js
export async function initializeRollingTables() {
    // ... entire function body from character-sheet.js lines 908-1251 ...
}
```

Copy the function body exactly as-is. The function uses dynamic imports internally (`await import(...)`) so all its dependencies are already self-contained.

- [ ] **Step 2: Update `character-sheet.js`**

1. Add import:

```js
import { initializeRollingTables } from './character-sheet/rollingTables.js';
```

2. Delete the entire `initializeRollingTables` function definition (lines 904-1251). The call `await initializeRollingTables();` in `initializeCharacterSheet()` stays unchanged.

3. If `DrawerManager` is no longer used directly in `character-sheet.js`, remove its import.

- [ ] **Step 3: Run tests**

Run: `cd /workspaces/tome-of-secrets/tests && npx jest --config jest.config.js --verbose 2>&1 | tail -30`

Expected: All previously-passing tests still pass.

- [ ] **Step 4: Commit**

```
refactor: extract rollingTables.js from character-sheet.js
```

---

### Task 12: Extract questInfoDrawers.js

The entire `initializeQuestInfoDrawers` async function (408 lines).

**Files:**

- Create: `assets/js/character-sheet/questInfoDrawers.js`
- Modify: `assets/js/character-sheet.js`

- [ ] **Step 1: Create `questInfoDrawers.js`**

Move the entire `initializeQuestInfoDrawers` function (lines 1253-1660 of the original `character-sheet.js`) into `assets/js/character-sheet/questInfoDrawers.js`.

The file should start with:

```js
/**
 * Quest info drawers initialization.
 * Manages info drawers for genre quests, atmospheric buffs, side quests, dungeons,
 * keeper backgrounds, wizard schools, and library sanctums.
 */

import { DrawerManager } from '../ui/DrawerManager.js';
```

Then the function body, exported as:

```js
export async function initializeQuestInfoDrawers(updateCurrency, uiModule, mainStateAdapter) {
    // ... entire function body from character-sheet.js lines 1254-1660 ...
}
```

Copy the function body exactly as-is. Like `initializeRollingTables`, this function uses dynamic imports internally so its dependencies are self-contained.

- [ ] **Step 2: Update `character-sheet.js`**

1. Add import:

```js
import { initializeQuestInfoDrawers } from './character-sheet/questInfoDrawers.js';
```

2. Delete the entire `initializeQuestInfoDrawers` function definition (lines 1253-1660). The call `await initializeQuestInfoDrawers(updateCurrency, ui, stateAdapter);` in `initializeCharacterSheet()` stays unchanged.

- [ ] **Step 3: Run tests**

Run: `cd /workspaces/tome-of-secrets/tests && npx jest --config jest.config.js --verbose 2>&1 | tail -30`

Expected: All previously-passing tests still pass.

- [ ] **Step 4: Commit**

```
refactor: extract questInfoDrawers.js from character-sheet.js
```

---

### Task 13: Clean up character-sheet.js imports

After all extractions, remove unused imports from `character-sheet.js`.

**Files:**

- Modify: `assets/js/character-sheet.js`

- [ ] **Step 1: Audit imports**

Read the final `character-sheet.js` and check each import. Remove any that are no longer referenced directly in the file. Candidates likely to be removable:

- `import { DrawerManager } from './ui/DrawerManager.js'` — moved to rollingTables.js and questInfoDrawers.js
- `import { toast } from './ui/toast.js'` — moved to questDraftHook.js
- `import { applyQuestDraftedEffects } from './services/QuestDraftEffectService.js'` — moved to questDraftHook.js
- `import { runAllRepairs } from './character-sheet/postLoadRepair.js'` — moved to stateInitUI.js
- `import { showSaveIndicator } from './character-sheet/formPersistence.js'` — moved to currencyWarning.js (check if `initializeFormPersistence` is still needed — it is, so keep the import but remove `showSaveIndicator` from the destructure)
- `import { RewardCalculator } from './services/RewardCalculator.js'` — check if still used in `onBookMarkedComplete`
- `import { parseIntOr, trimOrEmpty } from './utils/helpers.js'` — check if still used
- `import { safeGetJSON, safeSetJSON } from './utils/storage.js'` — check if still used
- `import { STORAGE_KEYS } from './character-sheet/storageKeys.js'` — check if still used

For each, grep for usage in the remaining `character-sheet.js` code before removing.

- [ ] **Step 2: Verify final file size**

Run: `wc -l assets/js/character-sheet.js`

Expected: ~200-250 lines.

- [ ] **Step 3: Run full test suite**

Run: `cd /workspaces/tome-of-secrets/tests && npx jest --config jest.config.js --verbose 2>&1 | tail -30`

Expected: All previously-passing tests still pass.

- [ ] **Step 4: Commit**

```
refactor: clean up unused imports in character-sheet.js
```

---

### Task 14: Check for dedup bead and create if needed

Check if a bead exists for deduplicating the shared genre selection UI code between `rollingTables.js` and `questInfoDrawers.js`. If not, create one.

**Files:** None (CLI only)

- [ ] **Step 1: Search for existing dedup bead**

Run: `bd list 2>&1 | grep -i -E 'dedup|genre|rolling.*quest'`

If no relevant bead exists, proceed to step 2.

- [ ] **Step 2: Create dedup bead if needed**

Run: `bd create --title "Deduplicate shared genre selection UI between rollingTables.js and questInfoDrawers.js" --priority P2 --type task`

(Adjust the exact `bd create` syntax to match your CLI. The bead should be P2 since it's a code quality improvement, not a feature.)

- [ ] **Step 3: Commit**

No code changes — this is just a bead creation task.
