/**
 * EndOfMonthController - Handles end of month processing
 * 
 * Manages:
 * - Processing atmospheric buff rewards
 * - Processing journal entry rewards
 * - Resetting monthly counters (book completion XP is awarded when marking a book complete in Library)
 */

import { BaseController } from './BaseController.js';
import { RewardCalculator } from '../services/RewardCalculator.js';
import { parseIntOr } from '../utils/helpers.js';
import { STORAGE_KEYS } from '../character-sheet/storageKeys.js';
import { safeSetJSON } from '../utils/storage.js';
import { characterState } from '../character-sheet/state.js';
import * as data from '../character-sheet/data.js';
import { toast } from '../ui/toast.js';
import { EffectRegistry } from '../services/EffectRegistry.js';
import { buildEffectContext } from '../services/effectContext.js';

const MONTH_NAMES = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
];

function ensureYearOption(selectEl, year) {
    if (!selectEl || !year) return;
    const exists = Array.from(selectEl.options || []).some((opt) => String(opt.value) === String(year));
    if (exists) return;
    const opt = document.createElement('option');
    opt.value = String(year);
    opt.textContent = String(year);
    selectEl.appendChild(opt);
}

function incrementQuestTrackerMonthYear() {
    const monthEl = document.getElementById('quest-month');
    const yearEl = document.getElementById('quest-year');
    if (!monthEl || !yearEl) return false;

    const currentMonth = monthEl.value?.trim?.() || '';
    const currentYearRaw = yearEl.value?.trim?.() || '';
    const currentMonthIndex = MONTH_NAMES.indexOf(currentMonth);
    const parsedYear = parseInt(currentYearRaw, 10);

    if (currentMonthIndex < 0 || Number.isNaN(parsedYear)) {
        return false;
    }

    const nextMonthIndex = (currentMonthIndex + 1) % 12;
    const nextYear = nextMonthIndex === 0 ? parsedYear + 1 : parsedYear;

    monthEl.value = MONTH_NAMES[nextMonthIndex];
    ensureYearOption(yearEl, nextYear);
    yearEl.value = String(nextYear);

    monthEl.dispatchEvent(new Event('change', { bubbles: true }));
    yearEl.dispatchEvent(new Event('change', { bubbles: true }));
    return true;
}

export class EndOfMonthController extends BaseController {
    initialize(completedBooksSet, saveCompletedBooksSet, updateCurrency) {
        const { stateAdapter, form } = this;
        const { ui: uiModule } = this.dependencies;

        if (!uiModule) return;

        const librarySanctumSelect = document.getElementById('librarySanctum');
        const keeperBackgroundSelect = document.getElementById('keeperBackground');

        const handleEndOfMonth = () => {
            const selectedSanctum = librarySanctumSelect?.value || '';
            const associatedBuffs = (selectedSanctum && data.sanctumBenefits[selectedSanctum]?.associatedBuffs) || [];
            const atmosphericBuffs = stateAdapter.getAtmosphericBuffs();
            const background = keeperBackgroundSelect?.value || '';
            const effectCtx = buildEffectContext(stateAdapter, form);
            const forcedBuffNames = EffectRegistry.getForcedAtmosphericBuffNames(effectCtx, data);
            const forcedBuffSet = new Set(forcedBuffNames);

            // Calculate atmospheric buff rewards using RewardCalculator
            const atmosphericRewards = RewardCalculator.calculateAtmosphericBuffRewards(
                atmosphericBuffs,
                associatedBuffs,
                forcedBuffNames
            );

            // Reset atmospheric buffs (re-activate pipeline-forced buffs after reset)
            for (const buffName in atmosphericBuffs) {
                if (forcedBuffSet.has(buffName)) {
                    stateAdapter.setAtmosphericBuffDaysUsed(buffName, 0);
                } else {
                    stateAdapter.updateAtmosphericBuff(buffName, { daysUsed: 0, isActive: false });
                }
            }
            for (const name of forcedBuffNames) {
                stateAdapter.setAtmosphericBuffActive(name, true);
            }

            // Apply atmospheric buff ink drops
            updateCurrency(atmosphericRewards);

            // Book completion XP is now awarded when marking a book complete in the Library (not at end of month).
            // Reset books completed counter and shelf for the new month.
            const booksCompletedInput = document.getElementById('books-completed-month');
            if (booksCompletedInput) {
                booksCompletedInput.value = 0;
                safeSetJSON(STORAGE_KEYS.SHELF_BOOK_COLORS, []);
                characterState[STORAGE_KEYS.SHELF_BOOK_COLORS] = [];
                uiModule.renderShelfBooks(0, []);
            }

            // Calculate and add journal entries paper scraps using RewardCalculator
            const journalEntriesInput = document.getElementById('journal-entries-completed');
            if (journalEntriesInput) {
                const journalEntries = parseIntOr(journalEntriesInput.value, 0);
                const wizardSchool = document.getElementById('wizardSchool')?.value || '';
                const journalRewards = RewardCalculator.calculateJournalEntryRewards(journalEntries, {
                    stateAdapter: {
                        state: stateAdapter.state,
                        formData: {
                            keeperBackground: background,
                            wizardSchool
                        }
                    },
                    dataModule: data
                });

                if (journalRewards.paperScraps > 0) {
                    updateCurrency(journalRewards);
                    if (journalEntries > 0) {
                        const extras =
                            journalRewards.modifiedBy && journalRewards.modifiedBy.length
                                ? ` — ${journalRewards.modifiedBy.join(', ')}`
                                : '';
                        toast.info(`Journal entries rewarded: ${journalRewards.paperScraps} Paper Scraps${extras}`);
                    }
                }

                // Reset journal entries counter to 0
                journalEntriesInput.value = 0;
            }

            // Clear the completed books set for the new month
            if (completedBooksSet) {
                completedBooksSet.clear();
                if (saveCompletedBooksSet) saveCompletedBooksSet();
            }

            // Apply duration-based temporary buff lifecycle at month boundary.
            const temporaryBuffsChanged =
                typeof stateAdapter.expireTemporaryBuffsAtEndOfMonth === 'function'
                    ? stateAdapter.expireTemporaryBuffsAtEndOfMonth()
                    : false;

            // Re-render the atmospheric buffs table to show 0 days used
            uiModule.renderAtmosphericBuffs(librarySanctumSelect);
            uiModule.renderTemporaryBuffs();

            const wearableSlotsInput = document.getElementById('wearable-slots');
            const nonWearableSlotsInput = document.getElementById('non-wearable-slots');
            const familiarSlotsInput = document.getElementById('familiar-slots');
            uiModule.updateQuestBuffsDropdown(wearableSlotsInput, nonWearableSlotsInput, familiarSlotsInput);

            // Refresh Worn Page mitigation helpers: monthly → restore each cycle; every-2-months → restore every second cycle
            const helperCatalogs = {
                allItems: data.allItems || {},
                temporaryBuffs: { ...(data.temporaryBuffsFromRewards || {}), ...(data.temporaryBuffs || {}) },
                masteryAbilities: data.masteryAbilities || {},
                schoolBenefits: data.schoolBenefits || {},
                seriesExpedition: data.seriesCompletionRewards || {},
                permanentBonuses: data.permanentBonuses || {}
            };
            const school = document.getElementById('wizardSchool')?.value || '';
            const curseHelpers = stateAdapter.getCurseHelpers(helperCatalogs, { school });
            stateAdapter.refreshCurseHelpersAtEndOfMonth(curseHelpers);
            // Remove one-time Worn Page temp buffs that were marked used (they expire after this EOM)
            if (stateAdapter.removeUsedOneTimeWornPageTempBuffsAtEOM(curseHelpers)) {
                uiModule.renderTemporaryBuffs();
            }
            if (uiModule.renderWornPageHelpers) uiModule.renderWornPageHelpers();

            const levelRaw = document.getElementById('level')?.value;
            const level = Math.max(1, parseInt(levelRaw, 10) || 1);
            const questDrawHelpers = stateAdapter.getQuestDrawHelpers(helperCatalogs, { school, level });
            stateAdapter.refreshQuestDrawHelpersAtEndOfMonth(questDrawHelpers);
            if (stateAdapter.removeUsedOneTimeQuestDrawTempBuffsAtEOM(questDrawHelpers)) {
                uiModule.renderTemporaryBuffs();
            }
            if (temporaryBuffsChanged) {
                uiModule.renderTemporaryBuffs();
            }
            if (uiModule.renderQuestDrawHelpers) uiModule.renderQuestDrawHelpers();

            if (typeof stateAdapter.resetMonthlyCooldowns === 'function') {
                stateAdapter.resetMonthlyCooldowns();
            }
            if (uiModule.renderActivatedAbilities) {
                uiModule.renderActivatedAbilities();
            }

            this.saveState();

            const shouldAdvance = window.confirm(
                'Advance the Quest tracker to next month/year now?'
            );
            if (shouldAdvance) {
                if (incrementQuestTrackerMonthYear()) {
                    toast.success('Quest month/year advanced to next month.');
                } else {
                    toast.warning('Could not auto-advance month/year. Please set Quest Month/Year manually.');
                }
            }

            // Show success notification
            toast.success('End of Month processed! Rewards distributed and counters reset.');
        };

        // Attach the handler to all "End of Month" buttons
        const endOfMonthButtons = document.querySelectorAll('.end-of-month-button');
        endOfMonthButtons.forEach(button => {
            this.addEventListener(button, 'click', handleEndOfMonth);
        });
    }
}

