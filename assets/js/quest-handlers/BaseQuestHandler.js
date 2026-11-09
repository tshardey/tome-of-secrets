/**
 * BaseQuestHandler - Abstract base class for quest type handlers
 * 
 * Each quest type (Dungeon, Genre, Side Quest, Extra Credit) should extend this
 * and implement the required methods.
 */

import { RewardCalculator, Reward } from '../services/RewardCalculator.js';
import { GAME_CONFIG } from '../config/gameConfig.js';
import { Validator, required, selected, conditional } from '../services/Validator.js';
import { characterState } from '../character-sheet/state.js';
import { getLinkedQuestIds, isSecondaryQuestInBatch } from '../utils/questLinkRules.js';
import { spendUseCountBuffs } from '../utils/useCountBuffs.js';
import { getTemporaryBuffData } from '../character-sheet/data.js';
import { STORAGE_KEYS } from '../character-sheet/storageKeys.js';

export class BaseQuestHandler {
    /**
     * @param {Object} formElements - References to form elements
     * @param {Object} data - Game data (dungeonRooms, sideQuests, etc.)
     */
    constructor(formElements, data) {
        this.formElements = formElements;
        this.data = data;
    }

    /**
     * Get common form values used by all quest types
     * @returns {Object} Common quest data
     */
    getCommonFormData() {
        // Handle buffs from hidden input (card-based selection) or fallback to select element
        let selectedBuffs = [];
        if (this.formElements.buffsSelect) {
            if (this.formElements.buffsSelect.type === 'hidden') {
                // Card-based selection: read from hidden input JSON
                try {
                    const value = this.formElements.buffsSelect.value;
                    selectedBuffs = value ? JSON.parse(value) : [];
                } catch (e) {
                    // If JSON parsing fails, default to empty array
                    selectedBuffs = [];
                }
            } else if (this.formElements.buffsSelect.selectedOptions) {
                // Fallback: old multi-select dropdown (for backward compatibility)
                selectedBuffs = Array.from(this.formElements.buffsSelect.selectedOptions).map(o => o.value);
            }
        }
        
        const bookId = (this.formElements.bookIdInput && this.formElements.bookIdInput.value) ? this.formElements.bookIdInput.value.trim() : null;
        const bookTitle = (this.formElements.bookTitleForQuest != null) ? String(this.formElements.bookTitleForQuest) : (this.formElements.bookInput ? this.formElements.bookInput.value : '');
        const bookAuthor = (this.formElements.bookAuthorForQuest != null) ? String(this.formElements.bookAuthorForQuest) : (this.formElements.bookAuthorInput ? this.formElements.bookAuthorInput.value : '');
        return {
            month: this.formElements.monthInput.value,
            year: this.formElements.yearInput.value,
            bookId: bookId || null,
            book: bookTitle,
            bookAuthor: bookAuthor,
            notes: this.formElements.notesInput.value,
            status: this.formElements.statusSelect.value,
            selectedBuffs: selectedBuffs,
            background: this.formElements.backgroundSelect ? this.formElements.backgroundSelect.value : '',
            wizardSchool: this.formElements.wizardSchoolSelect ? this.formElements.wizardSchoolSelect.value : ''
        };
    }

    /**
     * Get base validator with common rules for all quest types.
     * Book is required via bookId (library selection) or legacy book title.
     */
    getBaseValidator() {
        const validator = new Validator();
        validator.addRule('month', required('Month is required'));
        validator.addRule('year', required('Year is required'));
        validator.addRule('bookId', (value, data) => {
            if (value && String(value).trim()) return null;
            if (data.book && String(data.book).trim()) return null;
            return 'Please select a book from the Library.';
        });
        return validator;
    }

    /**
     * Get field map for error display
     * @returns {Object} Object mapping field names to DOM elements
     */
    getFieldMap() {
        return {
            month: this.formElements.monthInput,
            year: this.formElements.yearInput,
            bookId: this.formElements.bookIdInput || this.formElements.bookSelectorContainer,
            book: this.formElements.bookIdInput || this.formElements.bookSelectorContainer,
            prompt: this.formElements.promptInput || 
                   this.formElements.genreQuestSelect || 
                   this.formElements.sideQuestSelect ||
                   this.formElements.dungeonRoomSelect
        };
    }

    /**
     * Validate form inputs for this quest type
     * @returns {Object} { valid: boolean, error: string, errors: Object }
     */
    validate() {
        throw new Error('validate() must be implemented by subclass');
    }

    /**
     * Create quest object(s) from form data
     * @returns {Array} Array of quest objects
     */
    createQuests() {
        throw new Error('createQuests() must be implemented by subclass');
    }

    /**
     * Calculate final rewards with modifiers and background bonuses
     * @param {Reward} baseRewards - Base rewards from RewardCalculator
     * @param {Object} quest - Quest object
     * @param {Array} selectedBuffs - Selected buff/item names
     * @param {string} background - Background key
     * @param {string} wizardSchool - Wizard school key
     * @param {{ isSecondaryQuest?: boolean|null, temporaryBuffs?: Array|null }} [options] - isSecondaryQuest overrides
     *   the book-link lookup; temporaryBuffs overrides the state's buffs (batch use-count tracking)
     * @returns {Reward} Final rewards with all modifiers applied
     */
    calculateFinalRewards(baseRewards, quest, selectedBuffs, background, wizardSchool = null, options = {}) {
        const stateAdapter = this.data?.rewardStateAdapter || null;
        const getBook =
            stateAdapter && typeof stateAdapter.getBook === 'function'
                ? id => stateAdapter.getBook(id)
                : null;
        const adapter = stateAdapter || {
            state: characterState,
            formData: {
                keeperBackground: background ?? '',
                wizardSchool: wizardSchool ?? ''
            }
        };
        return RewardCalculator.calculateFinalRewards(quest.type, quest.prompt || '', {
            baseRewardOverride: baseRewards,
            appliedBuffs: selectedBuffs || [],
            background,
            wizardSchool,
            quest,
            isEncounter: quest.isEncounter || false,
            roomNumber: quest.roomNumber || null,
            encounterName: quest.encounterName || null,
            isBefriend: quest.isBefriend !== undefined ? quest.isBefriend : true,
            stateAdapter: adapter,
            getBook,
            isSecondaryQuest: options.isSecondaryQuest ?? null,
            temporaryBuffs: options.temporaryBuffs ?? null
        });
    }

    /**
     * Enrich a quest with page count from its linked book (for page-count-aware reward modifiers).
     * Mutates quest in place; no-op if getBook is missing, quest has no bookId, or book has no page count.
     * @param {Object} quest - Quest object (may have bookId)
     * @param {function(string): Object|null} getBook - Function to resolve book by id (e.g. stateAdapter.getBook)
     */
    static enrichQuestWithBookPageCount(quest, getBook) {
        if (!quest || !getBook || typeof getBook !== 'function' || !quest.bookId) return;
        const book = getBook(quest.bookId);
        if (!book) return;
        const pc = typeof book.pageCount === 'number' && !isNaN(book.pageCount)
            ? book.pageCount
            : (typeof book.pageCountRaw === 'number' && !isNaN(book.pageCountRaw) ? book.pageCountRaw : null);
        if (pc != null) {
            const value = Math.max(0, Math.floor(pc));
            quest.pageCountEffective = value;
            quest.pageCountRaw = value;
        }
    }

    /**
     * Process quests for completion (apply modifiers and convert to JSON)
     * @param {Array} quests - Array of quest objects with base rewards
     * @param {Array} selectedBuffs - Selected buff/item names
     * @param {string} background - Background key
     * @param {string} wizardSchool - Wizard school key
     * @returns {Array} Quests with finalized rewards
     */
    processCompletedQuests(quests, selectedBuffs, background, wizardSchool = null) {
        const getBook = this.data && typeof this.data.getBook === 'function' ? this.data.getBook : null;
        // Book links for this batch are stored only after the quests are added, so count the
        // earlier quests of the batch on each book to find the secondary ($10 base) quest.
        const pendingLinksByBook = new Map();
        const rewardAdapter = this.data?.rewardStateAdapter;
        const liveQuestIds = typeof rewardAdapter?.getLiveQuestIds === 'function' ? rewardAdapter.getLiveQuestIds() : null;
        // Use-count buffs (Enchanted Focus, ...) are spent only after the batch is stored, so track
        // the uses each earlier quest of the batch will spend; the last use pays only once.
        let batchBuffs = (rewardAdapter?.state ?? characterState)?.[STORAGE_KEYS.TEMPORARY_BUFFS] ?? null;
        const getCatalogUseCount = name => getTemporaryBuffData(name)?.useCount || 0;
        return quests.map(quest => {
            if (getBook) BaseQuestHandler.enrichQuestWithBookPageCount(quest, getBook);
            let isSecondaryQuest = null;
            const book = getBook && quest.bookId ? getBook(quest.bookId) : null;
            if (book) {
                const earlier = pendingLinksByBook.get(quest.bookId) || 0;
                isSecondaryQuest = isSecondaryQuestInBatch(book, quest.id, earlier, { liveQuestIds });
                if (!(quest.id && getLinkedQuestIds(book, { liveQuestIds, keepId: quest.id }).includes(quest.id))) {
                    pendingLinksByBook.set(quest.bookId, earlier + 1);
                }
            }
            const finalRewards = this.calculateFinalRewards(
                quest.rewards,
                quest,
                selectedBuffs,
                background,
                wizardSchool,
                { isSecondaryQuest, temporaryBuffs: batchBuffs }
            );
            if (Array.isArray(batchBuffs)) {
                batchBuffs = spendUseCountBuffs(batchBuffs, selectedBuffs, getCatalogUseCount).buffs;
            }
            return {
                ...quest,
                rewards: finalRewards.toJSON()
            };
        });
    }

    /**
     * Convert quests with Reward objects to plain JSON format
     * @param {Array} quests - Array of quest objects
     * @returns {Array} Quests with rewards converted to JSON
     */
    questsToJSON(quests) {
        return quests.map(quest => ({
            ...quest,
            rewards: quest.rewards.toJSON ? quest.rewards.toJSON() : quest.rewards
        }));
    }

    /**
     * Static helper to complete an active quest (recalculate rewards and finalize)
     * @param {Object} quest - Active quest to complete
     * @param {string} background - Background key
     * @param {string} wizardSchool - Wizard school key
     * @returns {Object} Quest with finalized rewards
     */
    static completeActiveQuest(quest, background, wizardSchool = null, stateAdapter = null) {
        // Recalculate base rewards from scratch to ensure receipt base values are correct
        // This is important because stored rewards are plain JSON objects that don't have receipt info
        let baseRewards = RewardCalculator.getBaseRewards(
            quest.type,
            quest.prompt || '',
            {
                isEncounter: quest.isEncounter || false,
                roomNumber: quest.roomNumber || null,
                encounterName: quest.encounterName || null,
                isBefriend: quest.isBefriend !== undefined ? quest.isBefriend : true,
                // Without these a branching side quest recomputes to its flat (branch A)
                // rewards here, silently paying the wrong branch on every completion.
                sideQuestId: quest.sideQuestId || null,
                branchKey: quest.branchKey || null
            }
        );
        
        // If recalculation resulted in a fallback reward (e.g., dungeon quest without roomNumber)
        // and we have stored rewards that look more complete, use stored rewards as base instead
        // This handles legacy quests and test cases that don't have full quest metadata
        if (quest.rewards && quest.type === '♠ Dungeon Crawl' && !quest.roomNumber) {
            // Check if we got a fallback reward (only the dollar quest base, no XP/blueprints)
            const isFallbackReward = baseRewards.xp === 0 && baseRewards.blueprints === 0;

            // Check if stored rewards look like actual quest rewards (not just defaults)
            const storedHasContent = (quest.rewards.xp > 0 || quest.rewards.blueprints > 0);

            if (isFallbackReward && storedHasContent) {
                // Use stored XP/blueprints as base; dollars always come from the flat quest base
                baseRewards = Reward.fromAuthored(quest.rewards);
                baseRewards.dollars = GAME_CONFIG.rewards.questBase.dollars;
                baseRewards.syncReceiptBase();
            }
        }
        
        // Preserve any items that were already in the quest (e.g., from side quests)
        if (quest.rewards?.items && Array.isArray(quest.rewards.items)) {
            baseRewards.items = [...baseRewards.items, ...quest.rewards.items];
            // Remove duplicates while preserving order
            baseRewards.items = [...new Set(baseRewards.items)];
        }
        
        const adapter = stateAdapter || {
            state: characterState,
            formData: {
                keeperBackground: background || '',
                wizardSchool: wizardSchool || ''
            }
        };
        const getBook =
            stateAdapter && typeof stateAdapter.getBook === 'function'
                ? id => stateAdapter.getBook(id)
                : null;

        let finalRewards = RewardCalculator.calculateFinalRewards(quest.type, quest.prompt || '', {
            baseRewardOverride: baseRewards,
            appliedBuffs: quest.buffs || [],
            background,
            wizardSchool,
            quest,
            isEncounter: quest.isEncounter || false,
            roomNumber: quest.roomNumber || null,
            encounterName: quest.encounterName || null,
            isBefriend: quest.isBefriend !== undefined ? quest.isBefriend : true,
            stateAdapter: adapter,
            getBook
        });

        if (quest.rewards?.items && Array.isArray(quest.rewards.items)) {
            finalRewards.items = [...finalRewards.items, ...quest.rewards.items];
            finalRewards.items = [...new Set(finalRewards.items)];
        }
        
        // Get receipt before converting to JSON
        const receipt = finalRewards.getReceipt();
        
        // Return quest with finalized rewards and receipt
        return {
            ...quest,
            rewards: finalRewards.toJSON(),
            receipt: receipt // Store receipt for UI display
        };
    }

    /**
     * Static helper to determine prompt based on quest type during editing
     * @param {string} type - Quest type
     * @param {Object} originalQuest - Original quest being edited
     * @param {Object} formElements - Form elements for quest input
     * @param {Object} data - Game data
     * @returns {string} The determined prompt
     */
    static determinePromptForEdit(type, originalQuest, formElements, data) {
        const {
            dungeonRoomSelect,
            dungeonEncounterSelect,
            dungeonActionToggle,
            genreQuestSelect,
            sideQuestSelect
        } = formElements;

        // Start with original prompt as default
        let prompt = originalQuest.prompt;

        switch (type) {
            case '♠ Dungeon Crawl':
                if (originalQuest.isEncounter && dungeonEncounterSelect.value) {
                    // It's an encounter quest
                    const roomNumber = dungeonRoomSelect.value;
                    const encounterName = dungeonEncounterSelect.value;
                    const encounterData = data.dungeonRooms[roomNumber].encounters[encounterName];
                    
                    if (encounterData.defeat && encounterData.befriend) {
                        prompt = dungeonActionToggle.checked ? encounterData.befriend : encounterData.defeat;
                    } else {
                        prompt = encounterData.defeat || encounterData.befriend;
                    }
                } else {
                    // It's a room challenge quest
                    const roomNumber = dungeonRoomSelect.value;
                    if (roomNumber) {
                        prompt = data.dungeonRooms[roomNumber].challenge;
                    }
                }
                break;

            case '⭐ Extra Credit':
                prompt = 'Book read outside of quest pool';
                break;

            case '♥ Organize the Stacks':
                prompt = genreQuestSelect.value;
                break;

            case '♣ Side Quest':
                if (sideQuestSelect.value) {
                    const sideQuest = data.getSideQuest
                        ? data.getSideQuest(sideQuestSelect.value)
                        : null;
                    if (sideQuest?.name && sideQuest?.prompt) {
                        prompt = `${sideQuest.name}: ${sideQuest.prompt}`;
                    } else {
                        prompt = sideQuestSelect.value;
                    }
                }
                break;

            default:
                // For other quest types, use the manual prompt input
                prompt = formElements.promptInput ? formElements.promptInput.value : prompt;
                break;
        }

        return prompt;
    }
}

