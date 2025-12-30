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
import { safeGetJSON, safeSetJSON } from '../utils/storage.js';
import { GAME_CONFIG } from '../config/gameConfig.js';
import * as data from '../character-sheet/data.js';
import { isWingReadyForRestoration } from '../restoration/wingProgress.js';

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
        const restorationWingSelect = document.getElementById('restoration-wing-select');
        const restorationProjectSelect = document.getElementById('restoration-project-select');
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
        this.restorationWingSelect = restorationWingSelect;
        this.restorationProjectSelect = restorationProjectSelect;
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

        // Restoration wing selection
        if (restorationWingSelect) {
            this.addEventListener(restorationWingSelect, 'change', () => {
                this.handleRestorationWingChange();
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
        const restorationContainer = document.getElementById('restoration-prompt-container');

        // Hide all prompt containers by default
        if (standardContainer) standardContainer.style.display = 'none';
        if (dungeonContainer) dungeonContainer.style.display = 'none';
        if (genreContainer) genreContainer.style.display = 'none';
        if (sideContainer) sideContainer.style.display = 'none';
        if (restorationContainer) restorationContainer.style.display = 'none';
        if (this.dungeonEncounterSelect) this.dungeonEncounterSelect.style.display = 'none';
        if (this.dungeonActionContainer) this.dungeonActionContainer.style.display = 'none';
        if (this.restorationProjectSelect) this.restorationProjectSelect.style.display = 'none';

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
        } else if (selectedType === '🔨 Restoration Project') {
            if (restorationContainer) restorationContainer.style.display = 'flex';
            this.populateRestorationWings();
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

    /**
     * Check if a wing is unlocked for restoration
     * A wing is unlocked if it has alwaysAccessible=true OR all its dungeon rooms are completed
     * @param {Object} wing - Wing data object
     * @param {string} wingId - Wing ID
     * @returns {boolean}
     */
    isWingUnlocked(wing, wingId) {
        // Wing 6 (Heart of the Library) is always accessible
        if (wing.alwaysAccessible) return true;
        
        // Other wings require all dungeon rooms to be completed
        return isWingReadyForRestoration(wingId);
    }

    /**
     * Populate the restoration wings dropdown
     * Only shows wings that are unlocked and have uncompleted projects
     */
    populateRestorationWings() {
        if (!this.restorationWingSelect || !data.wings) return;
        
        this.restorationWingSelect.innerHTML = '<option value="">-- Select a Wing --</option>';
        
        // Get completed projects to filter out already completed ones
        const completedProjects = this.stateAdapter.getCompletedRestorationProjects() || [];
        
        for (const wingId in data.wings) {
            const wing = data.wings[wingId];
            
            // Skip wings that are not unlocked
            if (!this.isWingUnlocked(wing, wingId)) continue;
            
            // Check if wing has any uncompleted projects
            const wingProjects = this.getProjectsForWing(wingId);
            const hasUncompletedProjects = wingProjects.some(p => !completedProjects.includes(p.id));
            
            if (hasUncompletedProjects) {
                const option = document.createElement('option');
                option.value = wingId;
                option.textContent = wing.name;
                this.restorationWingSelect.appendChild(option);
            }
        }
    }

    /**
     * Get all projects for a specific wing
     */
    getProjectsForWing(wingId) {
        if (!data.restorationProjects) return [];
        
        const projects = [];
        for (const projectId in data.restorationProjects) {
            const project = data.restorationProjects[projectId];
            if (project.wingId === wingId) {
                projects.push({ id: projectId, ...project });
            }
        }
        return projects;
    }

    /**
     * Handle restoration wing selection
     * Only shows projects the player can afford
     */
    handleRestorationWingChange() {
        const selectedWingId = this.restorationWingSelect?.value;
        if (!this.restorationProjectSelect) return;

        this.restorationProjectSelect.innerHTML = '<option value="">-- Select a Project --</option>';

        if (selectedWingId) {
            // Verify wing is still unlocked (double-check)
            const wing = data.wings?.[selectedWingId];
            if (!wing || !this.isWingUnlocked(wing, selectedWingId)) {
                this.restorationProjectSelect.style.display = 'none';
                return;
            }

            const completedProjects = this.stateAdapter.getCompletedRestorationProjects() || [];
            const currentBlueprints = this.stateAdapter.getDustyBlueprints();
            const projects = this.getProjectsForWing(selectedWingId);
            
            for (const project of projects) {
                // Skip already completed projects
                if (completedProjects.includes(project.id)) continue;
                
                // Skip projects the player can't afford
                const cost = project.cost || 0;
                if (currentBlueprints < cost) continue;
                
                const option = document.createElement('option');
                option.value = project.id;
                option.textContent = `${project.name} (📜 ${cost})`;
                this.restorationProjectSelect.appendChild(option);
            }
            this.restorationProjectSelect.style.display = 'block';
        } else {
            this.restorationProjectSelect.style.display = 'none';
        }
    }

    resetQuestForm() {
        // Clear form fields
        const promptInput = document.getElementById('new-quest-prompt');
        const bookInput = document.getElementById('new-quest-book');
        const bookAuthorInput = document.getElementById('new-quest-book-author');
        const notesInput = document.getElementById('new-quest-notes');
        
        if (promptInput) promptInput.value = '';
        if (bookInput) bookInput.value = '';
        if (bookAuthorInput) bookAuthorInput.value = '';
        if (notesInput) notesInput.value = '';

        if (this.dungeonRoomSelect) this.dungeonRoomSelect.innerHTML = '<option value="">-- Select a Room --</option>';
        if (this.dungeonEncounterSelect) this.dungeonEncounterSelect.innerHTML = '<option value="">-- Select an Encounter --</option>';
        if (this.genreQuestSelect) this.genreQuestSelect.innerHTML = '<option value="">-- Select a Genre Quest --</option>';
        if (this.sideQuestSelect) this.sideQuestSelect.innerHTML = '<option value="">-- Select a Side Quest --</option>';
        if (this.restorationWingSelect) this.restorationWingSelect.innerHTML = '<option value="">-- Select a Wing --</option>';
        if (this.restorationProjectSelect) this.restorationProjectSelect.innerHTML = '<option value="">-- Select a Project --</option>';
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
        const restorationContainer = document.getElementById('restoration-prompt-container');
        if (restorationContainer) restorationContainer.style.display = 'none';
    }

    handleAddQuest() {
        const { stateAdapter } = this;
        const { ui: uiModule } = this.dependencies;

        const type = this.questTypeSelect.value;
        const book = document.getElementById('new-quest-book')?.value || '';
        const bookAuthor = document.getElementById('new-quest-book-author')?.value || '';
        const notes = document.getElementById('new-quest-notes')?.value || '';
        const month = document.getElementById('quest-month')?.value || '';
        const year = document.getElementById('quest-year')?.value || '';

        // Get selected buffs from multi-select
        const buffsSelect = document.getElementById('quest-buffs-select');
        const selectedBuffs = buffsSelect ? Array.from(buffsSelect.selectedOptions).map(option => option.value) : [];

        if (this.editingQuestInfo) {
            // Update existing quest
            this.handleUpdateQuest(type, month, year, book, bookAuthor, notes, selectedBuffs);
        } else {
            // Add new quest
            this.handleCreateQuest(type, month, year, book, bookAuthor, notes, selectedBuffs);
        }
    }

    handleUpdateQuest(type, month, year, book, bookAuthor, notes, selectedBuffs) {
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

        // Preserve restorationData if it exists (for restoration project quests)
        const updates = { month, year, type, prompt, book, bookAuthor, notes, buffs: selectedBuffs };
        if (originalQuest.restorationData) {
            // For restoration quests, also update restorationData from form selections
            if (type === '🔨 Restoration Project') {
                const wingId = this.restorationWingSelect?.value;
                const projectId = this.restorationProjectSelect?.value;
                if (wingId && projectId) {
                    const wing = data.wings?.[wingId];
                    const project = data.restorationProjects?.[projectId];
                    updates.restorationData = {
                        wingId: wingId,
                        wingName: wing?.name || '',
                        projectId: projectId,
                        projectName: project?.name || '',
                        cost: project?.cost || 0,
                        rewardType: project?.reward?.type || null,
                        rewardSuggestedItems: project?.reward?.suggestedItems || []
                    };
                } else {
                    // Preserve existing restorationData if form wasn't filled
                    updates.restorationData = originalQuest.restorationData;
                }
            } else {
                // Preserve restorationData for non-restoration quests (shouldn't happen, but be safe)
                updates.restorationData = originalQuest.restorationData;
            }
        }
        
        // Update the quest in the state
        stateAdapter.updateQuest(
            this.resolveQuestListKey(this.editingQuestInfo.list),
            this.editingQuestInfo.index,
            updates
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

    handleCreateQuest(type, month, year, book, bookAuthor, notes, selectedBuffs) {
        const { stateAdapter } = this;
        const { ui: uiModule } = this.dependencies;

        try {
            // Create form elements object for handler
            const formElements = {
                monthInput: document.getElementById('quest-month'),
                yearInput: document.getElementById('quest-year'),
                bookInput: document.getElementById('new-quest-book'),
                bookAuthorInput: document.getElementById('new-quest-book-author'),
                notesInput: document.getElementById('new-quest-notes'),
                statusSelect: document.getElementById('new-quest-status'),
                buffsSelect: document.getElementById('quest-buffs-select'),
                backgroundSelect: this.keeperBackgroundSelect,
                wizardSchoolSelect: document.getElementById('wizardSchool'),
                promptInput: document.getElementById('new-quest-prompt'),
                dungeonRoomSelect: this.dungeonRoomSelect,
                dungeonEncounterSelect: this.dungeonEncounterSelect,
                dungeonActionToggle: this.dungeonActionToggle,
                genreQuestSelect: this.genreQuestSelect,
                sideQuestSelect: this.sideQuestSelect,
                restorationWingSelect: this.restorationWingSelect,
                restorationProjectSelect: this.restorationProjectSelect
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

                // Calculate and add blueprint rewards to quests before storing
                quests.forEach(quest => {
                    const blueprintReward = this.calculateBlueprintReward(quest);
                    if (blueprintReward > 0 && quest.rewards) {
                        quest.rewards.blueprints = blueprintReward;
                    }
                });

                // Handle restoration project completion BEFORE adding to completed history.
                // If blueprint spend fails, we should not add the quest to completed.
                for (const quest of quests) {
                    const restorationSuccess = this.handleRestorationProjectCompletion(quest);
                    if (!restorationSuccess) {
                        // Nothing was added yet; abort without saving/resetting the form.
                        return;
                    }
                }

                // Add to completed quests
                stateAdapter.addCompletedQuests(quests);
                quests.forEach(quest => {
                    // Award blueprints to state (currency)
                    this.awardBlueprintsForQuest(quest);
                    if (this.updateCurrency) this.updateCurrency(quest.rewards);
                });

                // Update book counter if new book
                if (isNewBook && this.completedBooksSet && this.saveCompletedBooksSet) {
                    this.completedBooksSet.add(bookName);
                    this.saveCompletedBooksSet();

                    const booksCompleted = document.getElementById('books-completed-month');
                    if (booksCompleted) {
                        const currentBooks = parseIntOr(booksCompleted.value, 0);
                        // Only increment if we haven't reached the maximum of 10
                        if (currentBooks < 10) {
                            booksCompleted.value = currentBooks + 1;
                            
                            // Add random color for new book and re-render shelf (only if under limit)
                            const shelfColors = safeGetJSON(STORAGE_KEYS.SHELF_BOOK_COLORS, []);
                            if (shelfColors.length < 10) {
                                shelfColors.push(uiModule.getRandomShelfColor());
                                // Update both localStorage and characterState to keep them in sync
                                safeSetJSON(STORAGE_KEYS.SHELF_BOOK_COLORS, shelfColors);
                                characterState[STORAGE_KEYS.SHELF_BOOK_COLORS] = shelfColors;
                                uiModule.renderShelfBooks(currentBooks + 1, shelfColors);
                            }
                        }
                    }
                }

                uiModule.renderCompletedQuests();
                const wearableSlotsInput = document.getElementById('wearable-slots');
                const nonWearableSlotsInput = document.getElementById('non-wearable-slots');
                const familiarSlotsInput = document.getElementById('familiar-slots');
                uiModule.renderLoadout(wearableSlotsInput, nonWearableSlotsInput, familiarSlotsInput);
                
                // Render passive equipment if restoration project was completed
                if (quests.some(q => q.type === '🔨 Restoration Project') && uiModule.renderPassiveEquipment) {
                    uiModule.renderPassiveEquipment();
                }
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
        const wizardSchoolSelect = document.getElementById('wizardSchool');
        const wizardSchool = wizardSchoolSelect?.value || '';
        const completedQuest = BaseQuestHandler.completeActiveQuest(questToMove, background, wizardSchool);

        // Calculate and add blueprints to rewards BEFORE storing the quest
        const blueprintReward = this.calculateBlueprintReward(completedQuest);
        if (blueprintReward > 0 && completedQuest.rewards) {
            completedQuest.rewards.blueprints = blueprintReward;
        }

        // Handle restoration project completion BEFORE moving quest to completed history.
        // This prevents inconsistent state if blueprint spend fails (e.g., player spent blueprints elsewhere).
        const restorationSuccess = this.handleRestorationProjectCompletion(completedQuest);
        if (!restorationSuccess) {
            // Roll back: restore quest to active queue and exit without adding to completed.
            stateAdapter.addActiveQuests(questToMove);
            uiModule.renderActiveAssignments();
            this.saveState();
            return;
        }

        // Add to completed quests (wrap in array for consistency)
        stateAdapter.addCompletedQuests([completedQuest]);

        // Add to completed books set if it's a new book
        if (isNewBook && this.completedBooksSet && this.saveCompletedBooksSet) {
            this.completedBooksSet.add(bookName);
            this.saveCompletedBooksSet();
        }

        // Award blueprints to state (currency)
        this.awardBlueprintsForQuest(completedQuest);
        
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
        
        // Render passive equipment if restoration project was completed
        if (completedQuest.type === '🔨 Restoration Project' && uiModule.renderPassiveEquipment) {
            uiModule.renderPassiveEquipment();
        }

        // Increment books completed counter only if this is a new book
        if (isNewBook && this.completedBooksSet) {
            const booksCompleted = document.getElementById('books-completed-month');
            if (booksCompleted) {
                const currentBooks = parseIntOr(booksCompleted.value, 0);
                // Only increment if we haven't reached the maximum of 10
                if (currentBooks < 10) {
                    booksCompleted.value = currentBooks + 1;
                    
                    // Add random color for new book and re-render shelf (only if under limit)
                    const shelfColors = safeGetJSON(STORAGE_KEYS.SHELF_BOOK_COLORS, []);
                    if (shelfColors.length < 10) {
                        shelfColors.push(uiModule.getRandomShelfColor());
                        // Update both localStorage and characterState to keep them in sync
                        safeSetJSON(STORAGE_KEYS.SHELF_BOOK_COLORS, shelfColors);
                        characterState[STORAGE_KEYS.SHELF_BOOK_COLORS] = shelfColors;
                        uiModule.renderShelfBooks(currentBooks + 1, shelfColors);
                    }
                }
            }
        }

        uiModule.renderActiveAssignments();
        uiModule.renderCompletedQuests();
        
        // Re-render tables on dungeons/quests pages if they exist
        this.reRenderTablesIfNeeded();
        
        this.saveState();
    }
    
    /**
     * Calculate blueprint reward for a quest type
     * @param {Object} quest - The quest
     * @returns {number} Blueprint reward amount
     */
    calculateBlueprintReward(quest) {
        let blueprintReward = 0;

        if (quest.type === '♥ Organize the Stacks') {
            // Genre quest - check genreQuests for blueprint reward
            if (data.genreQuests) {
                const normalize = (value) => String(value ?? '').trim().toLowerCase();
                // Some historical prompts may include extra text like "Fantasy: Read ..."
                const extractGenreFromPrompt = (prompt) => String(prompt ?? '').split(':')[0].trim();

                const promptRaw = String(quest.prompt ?? '');
                const promptGenre = normalize(extractGenreFromPrompt(promptRaw));

                // Prefer exact genre equality (prevents substring collisions like "Fiction" vs "Speculative Fiction")
                for (const genreQuest of Object.values(data.genreQuests)) {
                    if (!genreQuest) continue;
                    if (promptGenre && normalize(genreQuest.genre) === promptGenre) {
                        blueprintReward = genreQuest.blueprintReward || 3;
                        break;
                    }
                }

                // Fallback: if we didn't find an exact match, allow a contained match but choose the longest genre match.
                // This keeps compatibility with any prompts that include the genre inside longer text without being
                // vulnerable to "shorter genre" matches hijacking longer ones.
                if (blueprintReward === 0 && promptRaw) {
                    let best = null; // { len: number, reward: number }
                    const promptNorm = normalize(promptRaw);
                    for (const genreQuest of Object.values(data.genreQuests)) {
                        if (!genreQuest?.genre) continue;
                        const genreNorm = normalize(genreQuest.genre);
                        if (!genreNorm) continue;
                        if (promptNorm.includes(genreNorm)) {
                            const reward = genreQuest.blueprintReward || 3;
                            if (!best || genreNorm.length > best.len) {
                                best = { len: genreNorm.length, reward };
                            }
                        }
                    }
                    if (best) blueprintReward = best.reward;
                }
            }
            // Default if no specific match
            if (blueprintReward === 0) {
                blueprintReward = 3;
            }
        } else if (quest.type === '⭐ Extra Credit') {
            blueprintReward = GAME_CONFIG.restoration.extraCreditBlueprintReward;
        }
        // Note: Dungeon Crawl quests do NOT award blueprints

        return blueprintReward;
    }

    /**
     * Award blueprints based on quest type
     * @param {Object} quest - The completed quest
     * @returns {number} Blueprint reward amount
     */
    awardBlueprintsForQuest(quest) {
        const { stateAdapter } = this;
        const blueprintReward = this.calculateBlueprintReward(quest);

        if (blueprintReward > 0) {
            stateAdapter.addDustyBlueprints(blueprintReward);
        }

        return blueprintReward;
    }

    /**
     * Handle restoration project completion
     * Spends blueprints and marks the project as completed
     * @param {Object} quest - The completed quest
     */
    handleRestorationProjectCompletion(quest) {
        if (quest.type !== '🔨 Restoration Project') return true;
        
        const { stateAdapter } = this;
        
        // Get project ID and cost from restorationData
        const projectId = quest.restorationData?.projectId;
        const cost = quest.restorationData?.cost || 0;
        
        if (!projectId) return true;
        
        // Get project data to process reward
        const project = data.restorationProjects?.[projectId];
        if (!project) return true;
        
        // Check if player has enough blueprints BEFORE processing completion
        if (cost > 0) {
            const currentBlueprints = stateAdapter.getDustyBlueprints();
            if (currentBlueprints < cost) {
                // Don't complete the project if player doesn't have enough blueprints
                const needed = cost - currentBlueprints;
                alert(`Cannot complete restoration project: You need ${needed} more Dusty Blueprints. (Cost: ${cost}, You have: ${currentBlueprints})`);
                return false;
            }
            
            // Spend blueprints for the project cost
            const success = stateAdapter.spendDustyBlueprints(cost);
            if (!success) {
                // This shouldn't happen if we checked above, but handle it just in case
                alert(`Cannot complete restoration project: Failed to spend ${cost} Dusty Blueprints.`);
                return false;
            }
            
            // Update the blueprints display in the UI
            const dustyBlueprintsInput = document.getElementById('dustyBlueprints');
            if (dustyBlueprintsInput) {
                dustyBlueprintsInput.value = stateAdapter.getDustyBlueprints();
            }
        }
        
        // Mark project as completed in restoration state
        stateAdapter.completeRestorationProject(projectId);
        
        // Process reward (create passive slot, etc.)
        const reward = this.processRestorationProjectReward(projectId, project.reward);

        // Check wing completion (Quest completion path previously didn't trigger wing completion)
        // Determine wingId (prefer project data, fall back to quest restorationData)
        const wingId = String(project.wingId || quest.restorationData?.wingId || '');
        if (wingId && !stateAdapter.isWingCompleted(wingId)) {
            const wingProjectIds = Object.entries(data.restorationProjects || {})
                .filter(([_, p]) => String(p.wingId) === wingId)
                .map(([id]) => id);

            const allWingProjectsComplete = wingProjectIds.length > 0 &&
                wingProjectIds.every(id => stateAdapter.isRestorationProjectCompleted(id));

            if (allWingProjectsComplete) {
                stateAdapter.completeWing(wingId);

                // Award wing completion rewards (currency) if hook available
                if (this.updateCurrency) {
                    this.updateCurrency({
                        xp: GAME_CONFIG.restoration.wingCompletionRewards.xp,
                        inkDrops: GAME_CONFIG.restoration.wingCompletionRewards.inkDrops,
                        paperScraps: GAME_CONFIG.restoration.wingCompletionRewards.paperScraps,
                        items: []
                    });
                }

                // Notify
                this.showRewardNotification(
                    `Wing Restored! +${GAME_CONFIG.restoration.wingCompletionRewards.xp} XP, ` +
                    `+${GAME_CONFIG.restoration.wingCompletionRewards.inkDrops} Ink Drops, ` +
                    `+${GAME_CONFIG.restoration.wingCompletionRewards.paperScraps} Paper Scraps`
                );
            }
        }
        
        // Show reward notification
        if (reward) {
            const rewardText = this.getRestorationRewardText(reward);
            this.showRewardNotification(`Restoration Project Complete! ${rewardText}`);
        }

        return true;
    }

    /**
     * Process restoration project reward (create passive slots, etc.)
     * @param {string} projectId - Project ID
     * @param {Object} reward - Reward configuration
     * @returns {Object} Processed reward details
     */
    processRestorationProjectReward(projectId, reward) {
        if (!reward) return null;

        const result = { type: reward.type };

        switch (reward.type) {
            case 'passiveItemSlot':
                const itemSlotId = `item-slot-${projectId}`;
                this.stateAdapter.addPassiveItemSlot(itemSlotId, projectId);
                result.slotId = itemSlotId;
                result.suggestedItems = reward.suggestedItems;
                break;

            case 'passiveFamiliarSlot':
                const familiarSlotId = `familiar-slot-${projectId}`;
                this.stateAdapter.addPassiveFamiliarSlot(familiarSlotId, projectId);
                result.slotId = familiarSlotId;
                result.suggestedItems = reward.suggestedItems;
                break;

            case 'special':
                result.description = reward.description;
                result.bonusMultiplier = reward.bonusMultiplier;
                if (reward.title) {
                    result.title = reward.title;
                }
                break;
        }

        return result;
    }

    /**
     * Get human-readable reward text for restoration projects
     * @param {Object} reward - Processed reward object
     * @returns {string} Reward description
     */
    getRestorationRewardText(reward) {
        if (!reward) return 'Unknown reward';
        
        switch (reward.type) {
            case 'passiveItemSlot':
                return 'Unlocked a display slot';
            case 'passiveFamiliarSlot':
                return 'Unlocked an adoption slot';
            case 'special':
                return reward.description || 'Special reward';
            default:
                return 'Reward unlocked';
        }
    }

    /**
     * Show a reward notification
     * @param {string} message - Notification message
     */
    showRewardNotification(message) {
        // Show alert for now (matches character sheet pattern)
        alert(message);
        console.log('Reward:', message);
    }

    /**
     * Re-render tables on dungeons/quests pages after quest completion
     */
    reRenderTablesIfNeeded() {
        // Check if we're on dungeons or quests page by looking for table containers
        const dungeonRoomsTable = document.getElementById('dungeon-rooms-table');
        const sideQuestsTable = document.getElementById('side-quests-table');
        
        // Import and call initializeTables if tables exist
        if (dungeonRoomsTable || sideQuestsTable) {
            import('../table-renderer.js').then(module => {
                if (module.initializeTables) {
                    module.initializeTables();
                }
            }).catch(err => {
                console.warn('Failed to re-render tables:', err);
            });
        }
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
        const bookAuthorInput = document.getElementById('new-quest-book-author');
        const notesInput = document.getElementById('new-quest-notes');

        if (monthInput) monthInput.value = quest.month || '';
        if (yearInput) yearInput.value = quest.year || '';
        if (typeSelect) typeSelect.value = quest.type || '';
        if (promptInput) promptInput.value = quest.prompt || '';
        if (bookInput) bookInput.value = quest.book || '';
        if (bookAuthorInput) bookAuthorInput.value = quest.bookAuthor || '';
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
        
        // Ensure restoration container is visible when editing restoration quests
        if (quest.type === '🔨 Restoration Project') {
            const restorationContainer = document.getElementById('restoration-prompt-container');
            if (restorationContainer) {
                restorationContainer.style.display = 'flex';
            }
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
        } else if (quest.type === '🔨 Restoration Project' && quest.restorationData) {
            // Populate restoration wing and project dropdowns
            if (this.restorationWingSelect && quest.restorationData.wingId) {
                // First populate the wing dropdown (trigger change to populate projects)
                this.restorationWingSelect.value = quest.restorationData.wingId;
                this.restorationWingSelect.dispatchEvent(new Event('change'));
                
                // Then set the project after a brief delay to allow project dropdown to populate
                setTimeout(() => {
                    if (this.restorationProjectSelect && quest.restorationData.projectId) {
                        this.restorationProjectSelect.value = quest.restorationData.projectId;
                    }
                }, 50);
            }
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

