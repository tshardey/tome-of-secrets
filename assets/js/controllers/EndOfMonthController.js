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
import { GAME_CONFIG } from '../config/gameConfig.js';
import { parseIntOr } from '../utils/helpers.js';
import { STORAGE_KEYS } from '../character-sheet/storageKeys.js';
import { safeSetJSON } from '../utils/storage.js';
import { characterState } from '../character-sheet/state.js';
import * as data from '../character-sheet/data.js';
import { toast } from '../ui/toast.js';

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

            // Calculate atmospheric buff rewards using RewardCalculator
            const atmosphericRewards = RewardCalculator.calculateAtmosphericBuffRewards(atmosphericBuffs, associatedBuffs);

            // Reset atmospheric buffs (keep Grove Tender's "Soaking in Nature" active)
            for (const buffName in atmosphericBuffs) {
                const isGroveTenderBuff = background === 'groveTender' && buffName === 'The Soaking in Nature';
                if (isGroveTenderBuff) {
                    stateAdapter.setAtmosphericBuffDaysUsed(buffName, 0);
                    // Keep it active (already set)
                } else {
                    stateAdapter.updateAtmosphericBuff(buffName, { daysUsed: 0, isActive: false });
                }
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
                const journalRewards = RewardCalculator.calculateJournalEntryRewards(journalEntries, background);

                if (journalRewards.paperScraps > 0) {
                    updateCurrency(journalRewards);

                    // Show notification of bonus if applicable
                    if (background === 'scribe') {
                        const papersPerEntry = GAME_CONFIG.endOfMonth.journalEntry.basePaperScraps +
                                              GAME_CONFIG.endOfMonth.journalEntry.scribeBonus;
                        toast.info(`Journal entries rewarded: ${journalRewards.paperScraps} Paper Scraps (${journalEntries} × ${papersPerEntry} with Scribe's Acolyte bonus)`);
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

            // Note: Temporary buffs are now self-managed by users
            // No automatic expiration or cleanup is performed

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
                temporaryBuffs: { ...(data.temporaryBuffs || {}), ...(data.temporaryBuffsFromRewards || {}) },
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
            if (uiModule.renderQuestDrawHelpers) uiModule.renderQuestDrawHelpers();

            this.saveState();

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

