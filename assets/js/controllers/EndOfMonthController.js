/**
 * EndOfMonthController - Handles end of month processing
 * 
 * Manages:
 * - Processing atmospheric buff rewards
 * - Processing book completion XP
 * - Processing journal entry rewards
 * - Resetting monthly counters
 * - Processing temporary buff expiration
 */

import { BaseController } from './BaseController.js';
import { RewardCalculator } from '../services/RewardCalculator.js';
import { GAME_CONFIG } from '../config/gameConfig.js';
import { parseIntOr } from '../utils/helpers.js';
import { STORAGE_KEYS } from '../character-sheet/storageKeys.js';
import * as data from '../character-sheet/data.js';

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

            // Calculate and add book completion XP using RewardCalculator
            const booksCompletedInput = document.getElementById('books-completed-month');
            if (booksCompletedInput) {
                const booksCompleted = parseIntOr(booksCompletedInput.value, 0);
                const bookRewards = RewardCalculator.calculateBookCompletionRewards(booksCompleted);

                updateCurrency(bookRewards);

                // Reset books completed counter to 0
                booksCompletedInput.value = 0;
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
                        alert(`Journal entries rewarded: ${journalRewards.paperScraps} Paper Scraps (${journalEntries} × ${papersPerEntry} with Scribe's Acolyte bonus)`);
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

            // Process temporary buffs - decrement monthsRemaining and remove expired
            const temporaryBuffs = stateAdapter.getTemporaryBuffs();
            if (temporaryBuffs && temporaryBuffs.length > 0) {
                // Filter out expired buffs and update state
                const activeBuffs = temporaryBuffs
                    .map(buff => ({ ...buff })) // Create a copy to avoid mutating the original
                    .filter(buff => {
                        // Remove one-time buffs that were used
                        if (buff.duration === 'one-time' && buff.status === 'used') {
                            return false;
                        }

                        // Remove end-of-month buffs
                        if (buff.duration === 'until-end-month') {
                            return false;
                        }

                        // Decrement two-month buffs
                        if (buff.duration === 'two-months' && buff.monthsRemaining > 0) {
                            buff.monthsRemaining--;
                            // Remove if no months remaining
                            if (buff.monthsRemaining === 0) {
                                return false;
                            }
                        }

                        return true;
                    });

                // Replace the entire list with the filtered/updated buffs
                stateAdapter._replaceList(STORAGE_KEYS.TEMPORARY_BUFFS, activeBuffs);

                // Increment buff month counter
                stateAdapter.incrementBuffMonthCounter();
            }

            // Re-render the atmospheric buffs table to show 0 days used
            uiModule.renderAtmosphericBuffs(librarySanctumSelect);
            uiModule.renderTemporaryBuffs();

            const wearableSlotsInput = document.getElementById('wearable-slots');
            const nonWearableSlotsInput = document.getElementById('non-wearable-slots');
            const familiarSlotsInput = document.getElementById('familiar-slots');
            uiModule.updateQuestBuffsDropdown(wearableSlotsInput, nonWearableSlotsInput, familiarSlotsInput);
            
            this.saveState();

            // Show success notification
            alert('End of Month processed! Rewards distributed and counters reset.');
        };

        // Attach the handler to all "End of Month" buttons
        const endOfMonthButtons = document.querySelectorAll('.end-of-month-button');
        endOfMonthButtons.forEach(button => {
            this.addEventListener(button, 'click', handleEndOfMonth);
        });
    }
}

