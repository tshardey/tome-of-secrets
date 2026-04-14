import { saveState } from './state.js';
import { showSaveIndicator } from './formPersistence.js';
import { safeGetJSON } from '../utils/storage.js';
import { STORAGE_KEYS } from './storageKeys.js';
import { parseIntOr } from '../utils/helpers.js';

export function initializeCurrencyWarning(form) {
    // Form submit handler
    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        await saveState(form);
        showSaveIndicator();
        // Hide currency warning after save
        checkCurrencyUnsavedChanges();
    });

    // --- CURRENCY UNSAVED CHANGES WARNING ---
    function checkCurrencyUnsavedChanges() {
        const warningEl = document.getElementById('currency-unsaved-warning');
        if (!warningEl) return;

        const inkDropsEl = document.getElementById('inkDrops');
        const paperScrapsEl = document.getElementById('paperScraps');
        if (!inkDropsEl || !paperScrapsEl) return;

        // Get saved values from localStorage
        const savedData = safeGetJSON(STORAGE_KEYS.CHARACTER_SHEET_FORM, {});

        // Compare numerically so missing/empty saved values behave like 0 and
        // don't trigger a warning on initial load.
        const savedInkDrops = parseIntOr(savedData.inkDrops, 0);
        const savedPaperScraps = parseIntOr(savedData.paperScraps, 0);

        const currentInkDrops = parseIntOr(inkDropsEl.value, 0);
        const currentPaperScraps = parseIntOr(paperScrapsEl.value, 0);

        const hasUnsavedChanges = (currentInkDrops !== savedInkDrops) || (currentPaperScraps !== savedPaperScraps);

        // Show or hide warning
        if (hasUnsavedChanges) {
            warningEl.style.display = 'block';
        } else {
            warningEl.style.display = 'none';
        }
    }

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

    // Ensure warning reflects current saved vs form values on initial load
    checkCurrencyUnsavedChanges();
}
