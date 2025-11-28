/**
 * QuestController - Handles all quest-related functionality
 * 
 * Manages:
 * - Quest form type selection and prompts
 * - Adding and editing quests
 * - Completing, discarding, and deleting quests
 * - Genre quest dropdown management
 * - Quest rewards and book tracking
 */

import { BaseController } from './BaseController.js';
import { QuestHandlerFactory } from '../quest-handlers/QuestHandlerFactory.js';
import { BaseQuestHandler } from '../quest-handlers/BaseQuestHandler.js';
import { trimOrEmpty, parseIntOr } from '../utils/helpers.js';
import { showErrors, clearAllErrors, showFormError, clearFormError } from '../utils/formErrors.js';
import { STORAGE_KEYS } from '../character-sheet/storageKeys.js';
import { characterState } from '../character-sheet/state.js';
import * as data from '../character-sheet/data.js';

export class QuestController extends BaseController {
    constructor(stateAdapter, form, dependencies) {
        super(stateAdapter, form, dependencies);
        this.editingQuestInfo = null;
        
        // Quest list key mapping
        this.QUEST_LIST_KEY_MAP = {
            active: STORAGE_KEYS.ACTIVE_ASSIGNMENTS,
            activeAssignments: STORAGE_KEYS.ACTIVE_ASSIGNMENTS,
            completed: STORAGE_KEYS.COMPLETED_QUESTS,
            completedQuests: STORAGE_KEYS.COMPLETED_QUESTS,
            discarded: STORAGE_KEYS.DISCARDED_QUESTS,
            discardedQuests: STORAGE_KEYS.DISCARDED_QUESTS
        };
    }

    resolveQuestListKey(key) {
        return this.QUEST_LIST_KEY_MAP[key] || key;
    }

    initialize(completedBooksSet, saveCompletedBooksSet, updateCurrency, updateGenreQuestDropdown) {
        const { stateAdapter, form } = this;
        const { ui: uiModule } = this.dependencies;

        if (!uiModule) return;

        // Store dependencies
        this.completedBooksSet = completedBooksSet;
        this.saveCompletedBooksSet = saveCompletedBooksSet;
        this.updateCurrency = updateCurrency;
        this.updateGenreQuestDropdown = updateGenreQuestDropdown;

        // Get form elements
        const questTypeSelect = document.getElementById('new-quest-type');
        const dungeonRoomSelect = document.getElementById('dungeon-room-select');
        const dungeonEncounterSelect = document.getElementById('dungeon-encounter-select');
        const dungeonActionContainer = document.getElementById('dungeon-action-container');
        const dungeonActionToggle = document.getElementById('dungeon-action-toggle');
        const genreQuestSelect = document.getElementById('genre-quest-select');
        const sideQuestSelect = document.getElementById('side-quest-select');
        const addQuestButton = document.getElementById('add-quest-button');
        const cancelEditQuestButton = document.getElementById('cancel-edit-quest-button');
        const keeperBackgroundSelect = document.getElementById('keeperBackground');

        if (!questTypeSelect || !addQuestButton) return;

        // Store elements for use in methods
        this.questTypeSelect = questTypeSelect;
        this.dungeonRoomSelect = dungeonRoomSelect;
        this.dungeonEncounterSelect = dungeonEncounterSelect;
        this.dungeonActionContainer = dungeonActionContainer;
        this.dungeonActionToggle = dungeonActionToggle;
        this.genreQuestSelect = genreQuestSelect;
        this.sideQuestSelect = sideQuestSelect;
        this.addQuestButton = addQuestButton;
        this.cancelEditQuestButton = cancelEditQuestButton;
        this.keeperBackgroundSelect = keeperBackgroundSelect;

        // Quest type selection
        this.addEventListener(questTypeSelect, 'change', () => {
            this.handleQuestTypeChange();
        });

        // Dungeon room selection
        if (dungeonRoomSelect) {
            this.addEventListener(dungeonRoomSelect, 'change', () => {
                this.handleDungeonRoomChange();
            });
        }

        // Dungeon encounter selection
        if (dungeonEncounterSelect) {
            this.addEventListener(dungeonEncounterSelect, 'change', () => {
                this.handleDungeonEncounterChange();
            });
        }

        // Dungeon action toggle
        if (dungeonActionToggle) {
            this.addEventListener(dungeonActionToggle, 'change', () => {
                const label = document.getElementById('dungeon-action-label');
                if (label) {
                    label.textContent = dungeonActionToggle.checked ? 'Befriend' : 'Defeat';
                }
            });
        }

        // Add/Update quest button
        this.addEventListener(addQuestButton, 'click', () => {
            this.handleAddQuest();
        });

        // Cancel edit button
        if (cancelEditQuestButton) {
            this.addEventListener(cancelEditQuestButton, 'click', () => {
                this.resetQuestForm();
            });
        }
    }

    handleQuestTypeChange() {
        const standardContainer = document.getElementById('standard-prompt-container');
        const dungeonContainer = document.getElementById('dungeon-prompt-container');
        const genreContainer = document.getElementById('genre-prompt-container');
        const sideContainer = document.getElementById('side-prompt-container');

        // Hide all prompt containers by default
        if (standardContainer) standardContainer.style.display = 'none';
        if (dungeonContainer) dungeonContainer.style.display = 'none';
        if (genreContainer) genreContainer.style.display = 'none';
        if (sideContainer) sideContainer.style.display = 'none';
        if (this.dungeonEncounterSelect) this.dungeonEncounterSelect.style.display = 'none';
        if (this.dungeonActionContainer) this.dungeonActionContainer.style.display = 'none';

        const selectedType = this.questTypeSelect.value;

        if (selectedType === '♠ Dungeon Crawl') {
            if (dungeonContainer) dungeonContainer.style.display = 'flex';
            if (this.dungeonRoomSelect) {
                this.dungeonRoomSelect.innerHTML = '<option value="">-- Select a Room --</option>';
                for (const roomNumber in data.dungeonRooms) {
                    const option = document.createElement('option');
                    option.value = roomNumber;
                    option.textContent = `${roomNumber}: ${data.dungeonRooms[roomNumber].challenge.split(':')[0]}`;
                    this.dungeonRoomSelect.appendChild(option);
                }
            }
        } else if (selectedType === '♥ Organize the Stacks') {
            if (genreContainer) genreContainer.style.display = 'flex';
            if (this.updateGenreQuestDropdown) {
                this.updateGenreQuestDropdown();
            }
        } else if (selectedType === '♣ Side Quest') {
            if (sideContainer) sideContainer.style.display = 'flex';
            if (this.sideQuestSelect) {
                this.sideQuestSelect.innerHTML = '<option value="">-- Select a Side Quest --</option>';
                for (const key in data.sideQuests) {
                    const option = document.createElement('option');
                    option.value = data.sideQuests[key];
                    option.textContent = `${key}: ${data.sideQuests[key].split(':')[0]}`;
                    this.sideQuestSelect.appendChild(option);
                }
            }
        } else if (selectedType === '⭐ Extra Credit') {
            // Extra Credit doesn't need a prompt
        } else {
            // Show standard text input for empty or other types
            if (standardContainer) standardContainer.style.display = 'flex';
        }
    }

    handleDungeonRoomChange() {
        const selectedRoomNumber = this.dungeonRoomSelect?.value;
        if (!this.dungeonEncounterSelect) return;

        this.dungeonEncounterSelect.innerHTML = '<option value="">-- Select an Encounter --</option>';

        if (selectedRoomNumber && Object.keys(data.dungeonRooms[selectedRoomNumber].encounters).length > 0) {
            for (const encounterName in data.dungeonRooms[selectedRoomNumber].encounters) {
                const option = document.createElement('option');
                option.value = encounterName;
                option.textContent = encounterName;
                this.dungeonEncounterSelect.appendChild(option);
            }
            this.dungeonEncounterSelect.style.display = 'block';
        } else {
            this.dungeonEncounterSelect.style.display = 'none';
        }
        if (this.dungeonActionContainer) this.dungeonActionContainer.style.display = 'none';
    }

    handleDungeonEncounterChange() {
        const roomNumber = this.dungeonRoomSelect?.value;
        const encounterName = this.dungeonEncounterSelect?.value;
        
        if (!roomNumber || !encounterName || !this.dungeonActionContainer) {
            if (this.dungeonActionContainer) this.dungeonActionContainer.style.display = 'none';
            return;
        }

        const encounterData = data.dungeonRooms[roomNumber].encounters[encounterName];
        if (encounterData.defeat && encounterData.befriend) {
            this.dungeonActionContainer.style.display = 'flex';
        } else {
            this.dungeonActionContainer.style.display = 'none';
        }
    }

    resetQuestForm() {
        // Clear form fields
        const promptInput = document.getElementById('new-quest-prompt');
        const bookInput = document.getElementById('new-quest-book');
        const notesInput = document.getElementById('new-quest-notes');
        
        if (promptInput) promptInput.value = '';
        if (bookInput) bookInput.value = '';
        if (notesInput) notesInput.value = '';

        if (this.dungeonRoomSelect) this.dungeonRoomSelect.innerHTML = '<option value="">-- Select a Room --</option>';
        if (this.dungeonEncounterSelect) this.dungeonEncounterSelect.innerHTML = '<option value="">-- Select an Encounter --</option>';
        if (this.genreQuestSelect) this.genreQuestSelect.innerHTML = '<option value="">-- Select a Genre Quest --</option>';
        if (this.sideQuestSelect) this.sideQuestSelect.innerHTML = '<option value="">-- Select a Side Quest --</option>';
        if (this.dungeonActionContainer) this.dungeonActionContainer.style.display = 'none';

        // Clear buff selection
        const buffsSelect = document.getElementById('quest-buffs-select');
        if (buffsSelect) {
            Array.from(buffsSelect.options).forEach(option => option.selected = false);
        }

        // Reset editing state
        this.editingQuestInfo = null;
        if (this.addQuestButton) this.addQuestButton.textContent = 'Add Quest';
        const statusSelect = document.getElementById('new-quest-status');
        if (statusSelect) statusSelect.style.display = 'inline-block';
        if (this.cancelEditQuestButton) this.cancelEditQuestButton.style.display = 'none';
        if (this.addQuestButton) this.addQuestButton.style.width = '100%';

        // Reset prompt visibility
        const standardContainer = document.getElementById('standard-prompt-container');
        if (standardContainer) standardContainer.style.display = 'flex';
        const genreContainer = document.getElementById('genre-prompt-container');
        if (genreContainer) genreContainer.style.display = 'none';
        const sideContainer = document.getElementById('side-prompt-container');
        if (sideContainer) sideContainer.style.display = 'none';
        const dungeonContainer = document.getElementById('dungeon-prompt-container');
        if (dungeonContainer) dungeonContainer.style.display = 'none';
    }

    handleAddQuest() {
        const { stateAdapter } = this;
        const { ui: uiModule } = this.dependencies;

        const type = this.questTypeSelect.value;
        const book = document.getElementById('new-quest-book')?.value || '';
        const notes = document.getElementById('new-quest-notes')?.value || '';
        const month = document.getElementById('quest-month')?.value || '';
        const year = document.getElementById('quest-year')?.value || '';

        // Get selected buffs from multi-select
        const buffsSelect = document.getElementById('quest-buffs-select');
        const selectedBuffs = buffsSelect ? Array.from(buffsSelect.selectedOptions).map(option => option.value) : [];

        if (this.editingQuestInfo) {
            // Update existing quest
            this.handleUpdateQuest(type, month, year, book, notes, selectedBuffs);
        } else {
            // Add new quest
            this.handleCreateQuest(type, month, year, book, notes, selectedBuffs);
        }
    }

    handleUpdateQuest(type, month, year, book, notes, selectedBuffs) {
        const { stateAdapter } = this;
        const { ui: uiModule } = this.dependencies;

        const originalQuestList = characterState[this.resolveQuestListKey(this.editingQuestInfo.list)] || [];
        const originalQuest = originalQuestList[this.editingQuestInfo.index];
        if (!originalQuest) {
            this.resetQuestForm();
            return;
        }

        const formElements = {
            dungeonRoomSelect: this.dungeonRoomSelect,
            dungeonEncounterSelect: this.dungeonEncounterSelect,
            dungeonActionToggle: this.dungeonActionToggle,
            genreQuestSelect: this.genreQuestSelect,
            sideQuestSelect: this.sideQuestSelect,
            promptInput: document.getElementById('new-quest-prompt')
        };

        // Use BaseQuestHandler to determine the correct prompt
        const prompt = BaseQuestHandler.determinePromptForEdit(type, originalQuest, formElements, data);

        // Update the quest in the state
        stateAdapter.updateQuest(
            this.resolveQuestListKey(this.editingQuestInfo.list),
            this.editingQuestInfo.index,
            { month, year, type, prompt, book, notes, buffs: selectedBuffs }
        );

        // Re-render the appropriate list
        const renderMap = {
            activeAssignments: () => uiModule.renderActiveAssignments(),
            completedQuests: () => uiModule.renderCompletedQuests(),
            discardedQuests: () => uiModule.renderDiscardedQuests()
        };

        if (renderMap[this.editingQuestInfo.list]) {
            renderMap[this.editingQuestInfo.list]();
        }

        this.saveState();
        this.resetQuestForm();
    }

    handleCreateQuest(type, month, year, book, notes, selectedBuffs) {
        const { stateAdapter } = this;
        const { ui: uiModule } = this.dependencies;

        try {
            // Create form elements object for handler
            const formElements = {
                monthInput: document.getElementById('quest-month'),
                yearInput: document.getElementById('quest-year'),
                bookInput: document.getElementById('new-quest-book'),
                notesInput: document.getElementById('new-quest-notes'),
                statusSelect: document.getElementById('new-quest-status'),
                buffsSelect: document.getElementById('quest-buffs-select'),
                backgroundSelect: this.keeperBackgroundSelect,
                promptInput: document.getElementById('new-quest-prompt'),
                dungeonRoomSelect: this.dungeonRoomSelect,
                dungeonEncounterSelect: this.dungeonEncounterSelect,
                dungeonActionToggle: this.dungeonActionToggle,
                genreQuestSelect: this.genreQuestSelect,
                sideQuestSelect: this.sideQuestSelect
            };

            // Get handler for quest type
            const handler = QuestHandlerFactory.getHandler(type, formElements, data);

            // Clear any previous errors
            const questFormContainer = document.querySelector('.add-quest-form');
            if (questFormContainer) {
                clearFormError(questFormContainer);
                clearAllErrors(handler.getFieldMap());
            }

            // Validate form
            const validation = handler.validate();
            if (!validation.valid) {
                // Show inline errors
                if (questFormContainer && validation.errors) {
                    showErrors(validation.errors, handler.getFieldMap());
                } else {
                    showFormError(questFormContainer, validation.error || 'Please correct the errors below.');
                }
                return;
            }

            // Create quests
            const quests = handler.createQuests();
            const status = formElements.statusSelect?.value || 'active';

            // Add quests to appropriate list
            if (status === 'active') {
                stateAdapter.addActiveQuests(quests);
                uiModule.renderActiveAssignments();
            } else if (status === 'completed') {
                // Track if this is a new book
                const bookName = trimOrEmpty(book);
                const isNewBook = bookName && this.completedBooksSet && !this.completedBooksSet.has(bookName);

                // Add to completed quests
                stateAdapter.addCompletedQuests(quests);
                quests.forEach(quest => {
                    if (this.updateCurrency) this.updateCurrency(quest.rewards);
                });

                // Update book counter if new book
                if (isNewBook && this.completedBooksSet && this.saveCompletedBooksSet) {
                    this.completedBooksSet.add(bookName);
                    this.saveCompletedBooksSet();

                    const booksCompleted = document.getElementById('books-completed-month');
                    if (booksCompleted) {
                        const currentBooks = parseIntOr(booksCompleted.value, 0);
                        booksCompleted.value = currentBooks + 1;
                    }
                }

                uiModule.renderCompletedQuests();
                const wearableSlotsInput = document.getElementById('wearable-slots');
                const nonWearableSlotsInput = document.getElementById('non-wearable-slots');
                const familiarSlotsInput = document.getElementById('familiar-slots');
                uiModule.renderLoadout(wearableSlotsInput, nonWearableSlotsInput, familiarSlotsInput);
            }

            this.saveState();
            this.resetQuestForm();
        } catch (error) {
            console.error('Error adding quest:', error);
            const questFormContainer = document.querySelector('.add-quest-form');
            if (questFormContainer) {
                showFormError(questFormContainer, `Error adding quest: ${error.message}`);
            }
        }
    }

    /**
     * Handle quest-related clicks - called from main delegated handler
     */
    handleClick(target) {
        const { stateAdapter } = this;
        const { ui: uiModule } = this.dependencies;

        if (!target.dataset.index) return false;

        const index = parseInt(target.dataset.index || '0', 10);

        if (target.classList.contains('complete-quest-btn')) {
            this.handleCompleteQuest(index);
            return true;
        }

        if (target.classList.contains('discard-quest-btn')) {
            const questToMove = stateAdapter.removeQuest(STORAGE_KEYS.ACTIVE_ASSIGNMENTS, index);
            if (!questToMove) return true;

            stateAdapter.addDiscardedQuests(questToMove);
            uiModule.renderActiveAssignments();
            uiModule.renderDiscardedQuests();
            this.saveState();
            return true;
        }

        if (target.classList.contains('delete-btn')) {
            const list = target.dataset.list;
            const storageKey = this.resolveQuestListKey(list);
            
            if (storageKey === STORAGE_KEYS.ACTIVE_ASSIGNMENTS) {
                stateAdapter.removeQuest(storageKey, index);
                uiModule.renderActiveAssignments();
            } else if (storageKey === STORAGE_KEYS.COMPLETED_QUESTS) {
                stateAdapter.removeQuest(storageKey, index);
                uiModule.renderCompletedQuests();
            } else if (storageKey === STORAGE_KEYS.DISCARDED_QUESTS) {
                stateAdapter.removeQuest(storageKey, index);
                uiModule.renderDiscardedQuests();
            }
            this.saveState();
            return true;
        }

        if (target.classList.contains('edit-quest-btn')) {
            this.handleEditQuest(target);
            return true;
        }

        return false;
    }

    handleCompleteQuest(index) {
        const { stateAdapter } = this;
        const { ui: uiModule } = this.dependencies;

        const questToMove = stateAdapter.removeQuest(STORAGE_KEYS.ACTIVE_ASSIGNMENTS, index);
        if (!questToMove) return;

        // Check if this is a new book
        const bookName = trimOrEmpty(questToMove.book);
        const isNewBook = bookName && this.completedBooksSet && !this.completedBooksSet.has(bookName);

        // Use the BaseQuestHandler helper to finalize rewards
        const background = this.keeperBackgroundSelect?.value || '';
        const completedQuest = BaseQuestHandler.completeActiveQuest(questToMove, background);

        // Add to completed quests (wrap in array for consistency)
        stateAdapter.addCompletedQuests([completedQuest]);

        // Add to completed books set if it's a new book
        if (isNewBook && this.completedBooksSet && this.saveCompletedBooksSet) {
            this.completedBooksSet.add(bookName);
            this.saveCompletedBooksSet();
        }

        // Update currency with finalized rewards
        if (this.updateCurrency) {
            this.updateCurrency(completedQuest.rewards);
            
            // Auto-detect temporary buffs from quest notes or reward text
            // Check quest notes for temporary buff names
            if (completedQuest.notes) {
                this.autoDetectTemporaryBuffsFromText(completedQuest.notes);
            }
            
            // For dungeon completion rewards, check the reward text
            if (completedQuest.type === '♠ Dungeon Crawl' && completedQuest.prompt) {
                // Try to extract dungeon completion reward info from notes or check all possible rewards
                // This is a fallback - the main detection happens in updateCurrency
            }
        }
        
        const wearableSlotsInput = document.getElementById('wearable-slots');
        const nonWearableSlotsInput = document.getElementById('non-wearable-slots');
        const familiarSlotsInput = document.getElementById('familiar-slots');
        uiModule.renderLoadout(wearableSlotsInput, nonWearableSlotsInput, familiarSlotsInput);

        // Increment books completed counter only if this is a new book
        if (isNewBook && this.completedBooksSet) {
            const booksCompleted = document.getElementById('books-completed-month');
            if (booksCompleted) {
                const currentBooks = parseIntOr(booksCompleted.value, 0);
                booksCompleted.value = currentBooks + 1;
            }
        }

        uiModule.renderActiveAssignments();
        uiModule.renderCompletedQuests();
        this.saveState();
    }

    /**
     * Auto-detect and add temporary buffs from text (e.g., quest notes or reward descriptions)
     */
    autoDetectTemporaryBuffsFromText(text) {
        const { stateAdapter } = this;
        const { ui: uiModule } = this.dependencies;
        
        if (!text || !data.temporaryBuffs) return;
        
        for (const [buffName, buffData] of Object.entries(data.temporaryBuffs)) {
            // Check if text contains the buff name (case-insensitive)
            if (text.toLowerCase().includes(buffName.toLowerCase())) {
                // Check if buff is already added
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

                    if (uiModule) {
                        uiModule.renderTemporaryBuffs();
                        const wearableSlotsInput = document.getElementById('wearable-slots');
                        const nonWearableSlotsInput = document.getElementById('non-wearable-slots');
                        const familiarSlotsInput = document.getElementById('familiar-slots');
                        uiModule.updateQuestBuffsDropdown(wearableSlotsInput, nonWearableSlotsInput, familiarSlotsInput);
                    }
                    this.saveState();
                }
            }
        }
    }

    handleEditQuest(target) {
        const { ui: uiModule } = this.dependencies;

        const list = target.dataset.list;
        const index = parseInt(target.dataset.index, 10);
        const storageKey = this.resolveQuestListKey(list);
        const questList = characterState[storageKey] || [];
        const quest = questList[index];
        if (!quest) return;

        // Populate form
        const monthInput = document.getElementById('quest-month');
        const yearInput = document.getElementById('quest-year');
        const typeSelect = document.getElementById('new-quest-type');
        const promptInput = document.getElementById('new-quest-prompt');
        const bookInput = document.getElementById('new-quest-book');
        const notesInput = document.getElementById('new-quest-notes');

        if (monthInput) monthInput.value = quest.month || '';
        if (yearInput) yearInput.value = quest.year || '';
        if (typeSelect) typeSelect.value = quest.type || '';
        if (promptInput) promptInput.value = quest.prompt || '';
        if (bookInput) bookInput.value = quest.book || '';
        if (notesInput) notesInput.value = quest.notes || '';

        // Populate buffs selection
        const buffsSelect = document.getElementById('quest-buffs-select');
        if (buffsSelect && quest.buffs) {
            Array.from(buffsSelect.options).forEach(option => {
                option.selected = quest.buffs.includes(option.value);
            });
        }

        // Trigger change to show correct prompt containers
        if (this.questTypeSelect) {
            this.questTypeSelect.dispatchEvent(new Event('change'));
        }

        // Show correct prompt field for editing
        if (quest.type === '♠ Dungeon Crawl' && this.dungeonRoomSelect) {
            // Find the room number based on the challenge text
            const roomNumber = Object.keys(data.dungeonRooms).find(key => {
                if (data.dungeonRooms[key].challenge === quest.prompt) return true;
                for (const encounterName in data.dungeonRooms[key].encounters) {
                    const encounter = data.dungeonRooms[key].encounters[encounterName];
                    if (encounter.defeat === quest.prompt || encounter.befriend === quest.prompt) {
                        return true;
                    }
                }
                return false;
            });

            if (roomNumber) {
                this.dungeonRoomSelect.value = roomNumber;
                this.dungeonRoomSelect.dispatchEvent(new Event('change'));

                // If it's an encounter quest, select the encounter
                if (quest.isEncounter && this.dungeonEncounterSelect) {
                    const encounterName = quest.prompt?.split(':')[0];
                    this.dungeonEncounterSelect.value = encounterName;
                    this.dungeonEncounterSelect.dispatchEvent(new Event('change'));
                }
            }
        } else if (quest.type === '♥ Organize the Stacks' && this.genreQuestSelect) {
            this.genreQuestSelect.value = quest.prompt;
        } else if (quest.type === '♣ Side Quest' && this.sideQuestSelect) {
            this.sideQuestSelect.value = quest.prompt;
        }

        // Set editing state
        this.editingQuestInfo = { list, index };
        if (this.addQuestButton) this.addQuestButton.textContent = 'Update Quest';
        const statusSelect = document.getElementById('new-quest-status');
        if (statusSelect) statusSelect.style.display = 'none';
        if (this.cancelEditQuestButton) this.cancelEditQuestButton.style.display = 'inline-block';
        if (this.addQuestButton) {
            this.addQuestButton.style.width = '50%';
            if (this.cancelEditQuestButton) this.cancelEditQuestButton.style.width = '50%';
        }

        if (this.addQuestButton && typeof this.addQuestButton.scrollIntoView === 'function') {
            this.addQuestButton.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
    }
}

