import { safeGetJSON, safeSetJSON } from '../utils/storage.js';
import { STORAGE_KEYS } from './storageKeys.js';
import { characterState } from './state.js';
import { parseIntOr } from '../utils/helpers.js';
import { runAllRepairs } from './postLoadRepair.js';

/**
 * Initialize all state-dependent UI elements after state has been loaded.
 * @param {object} params
 * @param {object} params.ui - UI module
 * @param {object} params.dataModule - Data module with allItems etc.
 * @param {object} params.stateAdapter - State adapter instance
 * @param {Set} params.completedBooksSet - Set of completed book titles
 */
export function initializeStateDependentUI({ ui, dataModule, stateAdapter, completedBooksSet }) {
    // --- INITIALIZE DROPDOWNS ---
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

    // --- INITIALIZE STATE-DEPENDENT UI ---
    // completedBooksSet already populated earlier so shelf sync and callbacks see correct set
    // Run post-load repairs to fix any inconsistencies in saved data
    runAllRepairs(stateAdapter, ui);

    // Sync dusty blueprints input from characterState (stored separately from form)
    const dustyBlueprintsInput = document.getElementById('dustyBlueprints');
    if (dustyBlueprintsInput) {
        dustyBlueprintsInput.value = characterState[STORAGE_KEYS.DUSTY_BLUEPRINTS] || 0;

        // Sync characterState when input changes
        dustyBlueprintsInput.addEventListener('change', () => {
            const newValue = parseIntOr(dustyBlueprintsInput.value, 0);
            characterState[STORAGE_KEYS.DUSTY_BLUEPRINTS] = newValue;
            stateAdapter.state[STORAGE_KEYS.DUSTY_BLUEPRINTS] = newValue;
            safeSetJSON(STORAGE_KEYS.DUSTY_BLUEPRINTS, newValue);
        });
    }

    // Initialize shelf books visualization
    const booksCompletedInput = document.getElementById('books-completed-month');
    // Sync input value from completedBooksSet to ensure it matches actual data
    const actualBooksCount = completedBooksSet.size;
    const inputValue = booksCompletedInput ? parseIntOr(booksCompletedInput.value, 0) : 0;
    // Cap booksCompleted at 10 to match shelf visualization limit
    const booksCompleted = Math.min(Math.max(inputValue, actualBooksCount), 10);

    // Update input if it was out of sync (also cap at 10)
    if (booksCompletedInput && booksCompleted !== inputValue) {
        booksCompletedInput.value = booksCompleted;
    }

    let shelfColors = safeGetJSON(STORAGE_KEYS.SHELF_BOOK_COLORS, []);
    // Ensure we have enough colors for the actual book count (but don't exceed 10)
    while (shelfColors.length < booksCompleted && shelfColors.length < 10) {
        shelfColors.push(ui.getRandomShelfColor());
    }
    // Trim colors if we have more than needed
    if (shelfColors.length > booksCompleted) {
        shelfColors = shelfColors.slice(0, booksCompleted);
    }
    // Save updated colors if they changed
    if (shelfColors.length !== safeGetJSON(STORAGE_KEYS.SHELF_BOOK_COLORS, []).length) {
        safeSetJSON(STORAGE_KEYS.SHELF_BOOK_COLORS, shelfColors);
        characterState[STORAGE_KEYS.SHELF_BOOK_COLORS] = shelfColors;
    }

    ui.renderShelfBooks(booksCompleted, shelfColors);

    // Handle manual changes to books completed input
    if (booksCompletedInput) {
        booksCompletedInput.addEventListener('change', () => {
            let newCount = parseIntOr(booksCompletedInput.value, 0);
            // Enforce maximum of 10 books
            if (newCount > 10) {
                newCount = 10;
                booksCompletedInput.value = 10;
            }

            let currentColors = safeGetJSON(STORAGE_KEYS.SHELF_BOOK_COLORS, []);

            // Add new colors if count increased (but don't exceed 10)
            while (currentColors.length < newCount && currentColors.length < 10) {
                currentColors.push(ui.getRandomShelfColor());
            }

            // Trim colors if count decreased
            if (currentColors.length > newCount) {
                currentColors = currentColors.slice(0, newCount);
            }

            // Update both localStorage and characterState to keep them in sync
            safeSetJSON(STORAGE_KEYS.SHELF_BOOK_COLORS, currentColors);
            characterState[STORAGE_KEYS.SHELF_BOOK_COLORS] = currentColors;
            ui.renderShelfBooks(newCount, currentColors);
        });
    }

    // Note: checkCurrencyUnsavedChanges() is already called once above after listeners
    // are installed. Avoid scheduling an extra async check here because it can race
    // with other initialization steps/tests and incorrectly show the warning.

    const levelInput = document.getElementById('level');
    const xpNeededInput = document.getElementById('xp-needed');
    const wizardSchoolSelect = document.getElementById('wizardSchool');
    const librarySanctumSelect = document.getElementById('librarySanctum');
    const smpInput = document.getElementById('smp');
    const wearableSlotsInput = document.getElementById('wearable-slots');
    const nonWearableSlotsInput = document.getElementById('non-wearable-slots');
    const familiarSlotsInput = document.getElementById('familiar-slots');

    ui.renderAll(levelInput, xpNeededInput, wizardSchoolSelect, librarySanctumSelect, smpInput, wearableSlotsInput, nonWearableSlotsInput, familiarSlotsInput);
    // Update RPG-styled XP progress bar after state is loaded
    ui.updateXpProgressBar();
}
