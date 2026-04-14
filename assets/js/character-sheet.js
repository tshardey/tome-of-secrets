/**
 * Character Sheet Initialization - Controller-based architecture
 * 
 * This file orchestrates all controllers and provides the main initialization
 * function for the character sheet.
 */

import * as dataModule from './character-sheet/data.js';
import { initializeKeeperPage } from './page-renderers/keeperRenderer.js';
import { initializeSanctumPage } from './page-renderers/sanctumRenderer.js';
import * as ui from './character-sheet/ui.js';
import { characterState, loadState, saveState } from './character-sheet/state.js';
import { STORAGE_KEYS } from './character-sheet/storageKeys.js';
import { StateAdapter } from './character-sheet/stateAdapter.js';
import { safeGetJSON, safeSetJSON } from './utils/storage.js';
import { parseIntOr } from './utils/helpers.js';
import { initializeFormPersistence } from './character-sheet/formPersistence.js';
import { initializeCurrencyWarning } from './character-sheet/currencyWarning.js';
import { initializeStateDependentUI } from './character-sheet/stateInitUI.js';
import { RewardCalculator } from './services/RewardCalculator.js';
import { defaultQuestMonthYearIfEmpty } from './character-sheet/calendarPeriod.js';
import { createQuestDraftedHook } from './character-sheet/questDraftHook.js';
import { populateDropdowns } from './character-sheet/dropdownInit.js';
import { createUpdateCurrency } from './character-sheet/currencyService.js';
import { updateGenreQuestDropdown, initializeGenreSelection } from './character-sheet/genreSelection.js';
import { initializeCollapsiblePanels, initializeQuestDrawHelpersToggle } from './character-sheet/collapsiblePanels.js';
import { initializeDeckActions } from './character-sheet/deckActions.js';
import { initializePrintHandler } from './character-sheet/printHandler.js';
import { initializeDelegatedClickHandler } from './character-sheet/delegatedClickHandler.js';
import { initializeRollingTables } from './character-sheet/rollingTables.js';
import { initializeQuestInfoDrawers } from './character-sheet/questInfoDrawers.js';

// Import controllers
import { CharacterController } from './controllers/CharacterController.js';
import { AbilityController } from './controllers/AbilityController.js';
import { InventoryController } from './controllers/InventoryController.js';
import { QuestController } from './controllers/QuestController.js';
import { CurseController } from './controllers/CurseController.js';
import { BuffController } from './controllers/BuffController.js';
import { EndOfMonthController } from './controllers/EndOfMonthController.js';
import { DungeonDeckController } from './controllers/DungeonDeckController.js';
import { AtmosphericBuffDeckController } from './controllers/AtmosphericBuffDeckController.js';
import { GenreQuestDeckController } from './controllers/GenreQuestDeckController.js';
import { SideQuestDeckController } from './controllers/SideQuestDeckController.js';
import { OtherQuestDeckController } from './controllers/OtherQuestDeckController.js';
import { LibraryController } from './controllers/LibraryController.js';
import { CampaignsController } from './controllers/CampaignsController.js';
import { ExternalCurriculumController } from './controllers/ExternalCurriculumController.js';

// Track unique books completed for XP calculation
let completedBooksSet = new Set();

export async function initializeCharacterSheet() {
    // --- FORM ELEMENTS ---
    const form = document.getElementById('character-sheet');
    if (!form) {
        // If the form isn't on the page, don't try to add listeners.
        // This is important for testing and for other pages on the site.
        return;
    }

    // --- CHARACTER CREATION GUIDE ---
    initializeKeeperPage();
    initializeSanctumPage();

    // --- POPULATE DROPDOWNS FIRST (before loadState) ---
    // Populate keeper background dropdown
    ui.populateBackgroundDropdown();

    populateDropdowns(dataModule);

    // --- INITIAL LOAD (may be async due to IndexedDB-backed storage) ---
    await loadState(form);

    defaultQuestMonthYearIfEmpty();

    // Initialize form persistence (auto-save on input/change)
    initializeFormPersistence(form);

    const stateAdapter = new StateAdapter(characterState);

    // --- HELPER FUNCTIONS ---
    function initializeCompletedBooksSet() {
        completedBooksSet.clear();
        const monthlyBooks = safeGetJSON(STORAGE_KEYS.MONTHLY_COMPLETED_BOOKS, []);
        monthlyBooks.forEach(bookName => completedBooksSet.add(bookName));
    }

    function saveCompletedBooksSet() {
        const booksArray = Array.from(completedBooksSet);
        safeSetJSON(STORAGE_KEYS.MONTHLY_COMPLETED_BOOKS, booksArray);
    }

    // Populate completedBooksSet from storage so deduplication works after reload (before callback/controllers use it)
    initializeCompletedBooksSet();

    const updateCurrency = createUpdateCurrency(stateAdapter, ui, dataModule);

    stateAdapter.applyQuestDraftedEffects = createQuestDraftedHook({
        stateAdapter, updateCurrency, dataModule, form
    });

    // Shared dependencies for all controllers
    const dependencies = {
        ui,
        data: dataModule,
        saveState,
        updateCurrency
    };

    // --- CONTROLLERS ---
    const characterController = new CharacterController(stateAdapter, form, dependencies);
    const abilityController = new AbilityController(stateAdapter, form, dependencies);
    const inventoryController = new InventoryController(stateAdapter, form, dependencies);
    const questController = new QuestController(stateAdapter, form, dependencies);
    const curseController = new CurseController(stateAdapter, form, dependencies);
    const buffController = new BuffController(stateAdapter, form, dependencies);
    const endOfMonthController = new EndOfMonthController(stateAdapter, form, dependencies);
    const dungeonDeckController = new DungeonDeckController(stateAdapter, form, dependencies);
    const atmosphericBuffDeckController = new AtmosphericBuffDeckController(stateAdapter, form, dependencies);
    const genreQuestDeckController = new GenreQuestDeckController(stateAdapter, form, dependencies);
    const sideQuestDeckController = new SideQuestDeckController(stateAdapter, form, dependencies);
    const otherQuestDeckController = new OtherQuestDeckController(stateAdapter, form, dependencies);
    const libraryController = new LibraryController(stateAdapter, form, dependencies);
    const campaignsController = new CampaignsController(stateAdapter, form, dependencies);
    const externalCurriculumController = new ExternalCurriculumController(stateAdapter, form, dependencies);

    dependencies.onBookMarkedComplete = (result) => {
        if (result.synergyRewards && (result.synergyRewards.inkDrops > 0 || result.synergyRewards.paperScraps > 0)) {
            updateCurrency(result.synergyRewards);
        }
        (result.movedQuests || []).forEach((quest) => {
            questController.completeMovedQuestFromBook(quest);
        });
        if (result.movedQuests && result.movedQuests.length > 0) {
            ui.renderActiveAssignments();
            ui.renderCompletedQuests();
        }
        // Book count and XP: only when marking a book complete in Library (not from quest completion)
        if (result.book && result.book.title && completedBooksSet && !completedBooksSet.has(result.book.title)) {
            completedBooksSet.add(result.book.title);
            if (saveCompletedBooksSet) saveCompletedBooksSet();
            stateAdapter.decrementUseCountBuffsOnBookComplete();
            const booksCompletedInput = document.getElementById('books-completed-month');
            if (booksCompletedInput) {
                const current = parseIntOr(booksCompletedInput.value, 0);
                if (current < 10) {
                    booksCompletedInput.value = current + 1;
                    updateCurrency(RewardCalculator.calculateBookCompletionRewards(1));
                    const shelfColors = safeGetJSON(STORAGE_KEYS.SHELF_BOOK_COLORS, []);
                    if (shelfColors.length < 10) {
                        const newColors = [...shelfColors, ui.getRandomShelfColor()];
                        safeSetJSON(STORAGE_KEYS.SHELF_BOOK_COLORS, newColors);
                        characterState[STORAGE_KEYS.SHELF_BOOK_COLORS] = newColors;
                        ui.renderShelfBooks(current + 1, newColors);
                    }
                }
            }
        }
    };

    // Initialize controllers
    characterController.initialize();
    abilityController.initialize();
    inventoryController.initialize();
    questController.initialize(completedBooksSet, saveCompletedBooksSet, updateCurrency, () => updateGenreQuestDropdown(stateAdapter, dataModule));
    curseController.initialize();
    buffController.initialize(updateCurrency);
    endOfMonthController.initialize(completedBooksSet, saveCompletedBooksSet, updateCurrency);
    dungeonDeckController.initialize();
    atmosphericBuffDeckController.initialize();
    genreQuestDeckController.initialize();
    sideQuestDeckController.initialize();
    otherQuestDeckController.initialize();
    libraryController.initialize();
    campaignsController.initialize();
    externalCurriculumController.initialize();

    // --- COLLAPSIBLE PANELS (Add Book, Active Temporary Buffs, Draw Quest Cards) ---
    initializeCollapsiblePanels();

    // Quest draw helpers: toggle long help copy (panel info icon)
    initializeQuestDrawHelpersToggle();

    const deckControllers = {
        genreQuestDeck: genreQuestDeckController,
        sideQuestDeck: sideQuestDeckController,
        atmosphericBuffDeck: atmosphericBuffDeckController,
        dungeonDeck: dungeonDeckController,
        otherQuestDeck: otherQuestDeckController
    };
    const updateDeckActionsLabel = initializeDeckActions(deckControllers);
    dependencies.updateDeckActionsLabel = updateDeckActionsLabel;

    // --- MAIN EVENT HANDLERS ---
    initializePrintHandler();

    initializeCurrencyWarning(form);

    initializeDelegatedClickHandler(form, {
        ability: abilityController,
        inventory: inventoryController,
        quest: questController,
        curse: curseController,
        buff: buffController
    }, ui);

    initializeStateDependentUI({ ui, dataModule, stateAdapter, completedBooksSet });
    initializeGenreSelection(stateAdapter, dataModule);
    
    // Initialize rolling tables in Quests tab
    await initializeRollingTables();
    await initializeQuestInfoDrawers(updateCurrency, ui, stateAdapter);
}

// Run the initialization when the DOM is fully loaded
// document.addEventListener('DOMContentLoaded', initializeCharacterSheet);