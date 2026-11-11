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
import { safeGetJSON } from './utils/storage.js';
import { setSaveJSON } from './character-sheet/persistence.js';
import { parseIntOr } from './utils/helpers.js';
import { initializeFormPersistence, showSaveIndicator } from './character-sheet/formPersistence.js';
import { initializeStateDependentUI } from './character-sheet/stateInitUI.js';
import { RewardCalculator } from './services/RewardCalculator.js';
import { defaultQuestMonthYearIfEmpty } from './character-sheet/calendarPeriod.js';
import { createQuestDraftedHook } from './character-sheet/questDraftHook.js';
import { populateDropdowns } from './character-sheet/dropdownInit.js';
import { createUpdateCurrency } from './character-sheet/currencyService.js';
import { updateGenreQuestDropdown, initializeGenreSelection } from './character-sheet/genreSelection.js';
import { initializeCollapsiblePanels, initializeQuestDrawHelpersToggle } from './character-sheet/collapsiblePanels.js';
import { initializeDeckActions } from './character-sheet/deckActions.js';
import { initializeDelegatedClickHandler } from './character-sheet/delegatedClickHandler.js';
import { initializeRollingTables } from './character-sheet/rollingTables.js';
import { initializeQuestInfoDrawers } from './character-sheet/questInfoDrawers.js';

// Import controllers
import { CharacterController } from './controllers/CharacterController.js';
import { AbilityController } from './controllers/AbilityController.js';
import { InventoryController } from './controllers/InventoryController.js';
import { QuestController } from './controllers/QuestController.js';
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
import { FundController } from './controllers/FundController.js';

// Track unique books completed for XP calculation
let completedBooksSet = new Set();

const SCHEMA_VERSION_STORAGE_KEY = 'tomeOfSecrets_schemaVersion';
const SCHEMA_RELOAD_BANNER_ID = 'tos-schema-reload-banner';
let schemaChangeBannerInitialized = false;

function showSchemaReloadBanner() {
    if (document.getElementById(SCHEMA_RELOAD_BANNER_ID)) return;
    const banner = document.createElement('div');
    banner.id = SCHEMA_RELOAD_BANNER_ID;
    banner.setAttribute('role', 'alert');
    // Deliberately unclosable: this tab's saves are paused until it reloads.
    banner.style.cssText = 'position:fixed;top:0;left:0;right:0;z-index:10000;display:flex;' +
        'flex-wrap:wrap;gap:12px;align-items:center;justify-content:center;padding:12px 16px;' +
        'background:#3b2a14;color:#f5e6c8;font-weight:bold;box-shadow:0 2px 8px rgba(0,0,0,0.4);';
    const message = document.createElement('span');
    message.textContent = 'Tome of Secrets was updated in another tab. Reload this tab to keep playing.';
    const reload = document.createElement('button');
    reload.type = 'button';
    reload.textContent = 'Reload';
    reload.addEventListener('click', () => window.location.reload());
    banner.append(message, reload);
    document.body.prepend(banner);
}

/**
 * Show an unclosable reload banner when another tab changes the save's schema version,
 * or when this tab's write gate refuses a save (tos:schemaChangedElsewhere).
 */
export function initializeSchemaChangeBanner() {
    if (schemaChangeBannerInitialized) return;
    schemaChangeBannerInitialized = true;
    window.addEventListener('storage', (e) => {
        if (e.key === SCHEMA_VERSION_STORAGE_KEY) showSchemaReloadBanner();
    });
    window.addEventListener('tos:schemaChangedElsewhere', showSchemaReloadBanner);
}

export async function initializeCharacterSheet() {
    // --- FORM ELEMENTS ---
    const form = document.getElementById('character-sheet');
    if (!form) {
        // If the form isn't on the page, don't try to add listeners.
        // This is important for testing and for other pages on the site.
        return;
    }

    // Before loading: a newer save written by another tab pauses this one until it reloads.
    initializeSchemaChangeBanner();

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
        setSaveJSON(STORAGE_KEYS.MONTHLY_COMPLETED_BOOKS, booksArray);
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
    const fundController = new FundController(stateAdapter, form, dependencies);

    dependencies.onBookMarkedComplete = (result) => {
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
            const booksCompletedInput = document.getElementById('books-completed-month');
            if (booksCompletedInput) {
                const current = parseIntOr(booksCompletedInput.value, 0);
                if (current < 10) {
                    booksCompletedInput.value = current + 1;
                    updateCurrency(RewardCalculator.calculateBookCompletionRewards(1));
                    const shelfColors = safeGetJSON(STORAGE_KEYS.SHELF_BOOK_COLORS, []);
                    if (shelfColors.length < 10) {
                        const newColors = [...shelfColors, ui.getRandomShelfColor()];
                        setSaveJSON(STORAGE_KEYS.SHELF_BOOK_COLORS, newColors);
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
    fundController.initialize();

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
    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        await saveState(form);
        showSaveIndicator();
    });

    initializeDelegatedClickHandler(form, {
        ability: abilityController,
        inventory: inventoryController,
        quest: questController,
        buff: buffController,
        fund: fundController
    }, ui);

    initializeStateDependentUI({ ui, dataModule, stateAdapter, completedBooksSet });
    initializeGenreSelection(stateAdapter, dataModule);
    
    // Initialize rolling tables in Quests tab
    await initializeRollingTables();
    await initializeQuestInfoDrawers(updateCurrency, ui, stateAdapter);
}

// Run the initialization when the DOM is fully loaded
// document.addEventListener('DOMContentLoaded', initializeCharacterSheet);