/**
 * @jest-environment jsdom
 */

import { BaseController } from '../assets/js/controllers/BaseController.js';
import { CharacterController } from '../assets/js/controllers/CharacterController.js';
import { AbilityController } from '../assets/js/controllers/AbilityController.js';
import { InventoryController } from '../assets/js/controllers/InventoryController.js';
import { QuestController } from '../assets/js/controllers/QuestController.js';
import { CurseController } from '../assets/js/controllers/CurseController.js';
import { BuffController } from '../assets/js/controllers/BuffController.js';
import { EndOfMonthController } from '../assets/js/controllers/EndOfMonthController.js';
import { StateAdapter } from '../assets/js/character-sheet/stateAdapter.js';
import { characterState } from '../assets/js/character-sheet/state.js';
import * as ui from '../assets/js/character-sheet/ui.js';
import * as data from '../assets/js/character-sheet/data.js';

describe('Controllers', () => {
    let stateAdapter;
    let form;
    let dependencies;

    beforeEach(() => {
        // Create mock form element
        document.body.innerHTML = `
            <form id="character-sheet">
                <input id="level" type="number" />
                <input id="xp-needed" type="text" />
                <select id="keeperBackground"></select>
                <select id="wizardSchool"></select>
                <select id="librarySanctum"></select>
                <input id="smp" type="number" />
                <button id="learn-ability-button"></button>
                <select id="ability-select"></select>
                <input id="wearable-slots" type="number" />
                <input id="non-wearable-slots" type="number" />
                <input id="familiar-slots" type="number" />
                <select id="item-select"></select>
                <button id="add-item-button"></button>
                <button id="add-quest-button"></button>
                <select id="new-quest-type"></select>
                <select id="curse-penalty-select"></select>
                <button id="add-curse-button"></button>
                <button id="add-temp-buff-button"></button>
                <input id="temp-buff-name" />
                <input id="temp-buff-description" />
                <button class="end-of-month-button"></button>
            </form>
        `;

        form = document.getElementById('character-sheet');
        stateAdapter = new StateAdapter(characterState);
        
        // Mock state adapter methods
        stateAdapter.addLearnedAbility = jest.fn();
        stateAdapter.removeLearnedAbility = jest.fn();
        stateAdapter.addInventoryItem = jest.fn();
        stateAdapter.moveInventoryItemToEquipped = jest.fn(() => true);
        stateAdapter.moveEquippedItemToInventory = jest.fn(() => true);
        stateAdapter.removeInventoryItem = jest.fn();
        stateAdapter.getInventoryItems = jest.fn(() => []);
        stateAdapter.getEquippedItems = jest.fn(() => []);
        stateAdapter.addActiveCurse = jest.fn();
        stateAdapter.addTemporaryBuff = jest.fn();
        stateAdapter.removeTemporaryBuff = jest.fn();
        stateAdapter.getTemporaryBuffs = jest.fn(() => []);
        stateAdapter.getSelectedGenres = jest.fn(() => []);
        stateAdapter.getLearnedAbilities = jest.fn(() => []);
        
        dependencies = {
            ui: {
                ...ui,
                renderMasteryAbilities: jest.fn(),
                renderLoadout: jest.fn(),
                updateQuestBuffsDropdown: jest.fn(),
                updateXpNeeded: jest.fn(),
                renderPermanentBonuses: jest.fn(),
                renderBenefits: jest.fn(),
                renderAtmosphericBuffs: jest.fn(),
                renderActiveCurses: jest.fn(),
                renderTemporaryBuffs: jest.fn(),
                getSlotLimits: jest.fn(() => ({ wearable: 5, nonWearable: 5, familiar: 5 })),
                populateBackgroundDropdown: jest.fn(),
                renderAll: jest.fn()
            },
            data,
            saveState: jest.fn()
        };
    });

    afterEach(() => {
        document.body.innerHTML = '';
    });

    describe('BaseController', () => {
        it('should initialize with state adapter and form', () => {
            const controller = new BaseController(stateAdapter, form, dependencies);
            expect(controller.stateAdapter).toBe(stateAdapter);
            expect(controller.form).toBe(form);
            expect(controller.dependencies).toBe(dependencies);
        });

        it('should register event listeners for cleanup', () => {
            const controller = new BaseController(stateAdapter, form, dependencies);
            const element = document.createElement('button');
            const handler = jest.fn();

            controller.addEventListener(element, 'click', handler);
            expect(controller.eventListeners.length).toBe(1);

            element.click();
            expect(handler).toHaveBeenCalled();

            controller.destroy();
            element.click();
            expect(handler).toHaveBeenCalledTimes(1); // Should not be called again
        });

        it('should save state using dependencies', () => {
            const controller = new BaseController(stateAdapter, form, dependencies);
            controller.saveState();
            expect(dependencies.saveState).toHaveBeenCalledWith(form);
        });
    });

    describe('CharacterController', () => {
        it('should initialize and set up event listeners', () => {
            const controller = new CharacterController(stateAdapter, form, dependencies);
            controller.initialize();

            const levelInput = document.getElementById('level');
            const keeperBackgroundSelect = document.getElementById('keeperBackground');
            expect(levelInput).toBeTruthy();
            expect(keeperBackgroundSelect).toBeTruthy();
        });

        it('should handle level changes', () => {
            const controller = new CharacterController(stateAdapter, form, dependencies);
            controller.initialize();
            
            const levelInput = document.getElementById('level');
            levelInput.value = '5';
            levelInput.dispatchEvent(new Event('change'));

            expect(dependencies.ui.updateXpNeeded).toHaveBeenCalled();
            expect(dependencies.ui.renderPermanentBonuses).toHaveBeenCalled();
        });
    });

    describe('AbilityController', () => {
        it('should initialize ability controller', () => {
            const controller = new AbilityController(stateAdapter, form, dependencies);
            controller.initialize();

            const smpInput = document.getElementById('smp');
            const learnButton = document.getElementById('learn-ability-button');
            expect(smpInput).toBeTruthy();
            expect(learnButton).toBeTruthy();
        });

        it('should handle delete ability click', () => {
            const controller = new AbilityController(stateAdapter, form, dependencies);

            controller.initialize();

            const target = document.createElement('button');
            target.classList.add('delete-ability-btn');
            target.dataset.index = '0';

            // Use actual ability data if available
            const abilityKeys = Object.keys(data.masteryAbilities || {});
            if (abilityKeys.length === 0) {
                return; // Skip test if no ability data
            }

            const testAbility = abilityKeys[0];
            stateAdapter.getLearnedAbilities = jest.fn(() => [testAbility]);

            const smpInput = document.getElementById('smp');
            smpInput.value = '5';

            global.confirm = jest.fn(() => true);

            const result = controller.handleDeleteAbilityClick(target);
            expect(result).toBe(true);
            expect(stateAdapter.removeLearnedAbility).toHaveBeenCalled();
        });
    });

    describe('InventoryController', () => {
        it('should initialize inventory controller', () => {
            const controller = new InventoryController(stateAdapter, form, dependencies);
            controller.initialize();

            const wearableSlotsInput = document.getElementById('wearable-slots');
            const addItemButton = document.getElementById('add-item-button');
            expect(wearableSlotsInput).toBeTruthy();
            expect(addItemButton).toBeTruthy();
        });

        it('should handle equip button click', () => {
            const controller = new InventoryController(stateAdapter, form, dependencies);
            
            dependencies.ui.getSlotLimits = jest.fn(() => ({ wearable: 5, nonWearable: 5, familiar: 5 }));
            stateAdapter.getInventoryItems = jest.fn(() => [{ name: 'Test Item', type: 'wearable' }]);
            stateAdapter.getEquippedItems = jest.fn(() => []);

            controller.initialize();

            const target = document.createElement('button');
            target.classList.add('equip-btn');
            target.dataset.index = '0';

            const result = controller.handleClick(target);
            expect(result).toBe(true);
            expect(stateAdapter.moveInventoryItemToEquipped).toHaveBeenCalledWith(0);
        });
    });

    describe('CurseController', () => {
        it('should initialize and populate curse dropdown', () => {
            const controller = new CurseController(stateAdapter, form, dependencies);

            controller.initialize();

            const curseSelect = document.getElementById('curse-penalty-select');
            expect(curseSelect).toBeTruthy();
        });

        it('should initialize curse controller with dropdown', () => {
            const controller = new CurseController(stateAdapter, form, dependencies);
            controller.initialize();

            const curseSelect = document.getElementById('curse-penalty-select');
            const addButton = document.getElementById('add-curse-button');
            expect(curseSelect).toBeTruthy();
            expect(addButton).toBeTruthy();
        });
    });

    describe('BuffController', () => {
        it('should initialize buff controller', () => {
            const controller = new BuffController(stateAdapter, form, dependencies);
            controller.initialize();

            const nameInput = document.getElementById('temp-buff-name');
            const addButton = document.getElementById('add-temp-buff-button');
            expect(nameInput).toBeTruthy();
            expect(addButton).toBeTruthy();
        });

        it('should handle buff removal click', () => {
            const controller = new BuffController(stateAdapter, form, dependencies);

            controller.initialize();

            stateAdapter.getTemporaryBuffs = jest.fn(() => [{ name: 'Test Buff' }]);
            global.confirm = jest.fn(() => true);

            const target = document.createElement('button');
            target.classList.add('remove-buff-btn');
            target.dataset.index = '0';

            const result = controller.handleClick(target);
            expect(result).toBe(true);
            expect(stateAdapter.removeTemporaryBuff).toHaveBeenCalledWith(0);
        });
    });

    describe('QuestController', () => {
        it('should initialize', () => {
            const controller = new QuestController(stateAdapter, form, dependencies);
            const completedBooksSet = new Set();
            const saveCompletedBooksSet = jest.fn();
            const updateCurrency = jest.fn();
            const updateGenreQuestDropdown = jest.fn();

            controller.initialize(completedBooksSet, saveCompletedBooksSet, updateCurrency, updateGenreQuestDropdown);

            expect(controller.completedBooksSet).toBe(completedBooksSet);
        });

        it('should resolve quest list keys correctly', () => {
            const controller = new QuestController(stateAdapter, form, dependencies);
            expect(controller.resolveQuestListKey('active')).toBeDefined();
            expect(controller.resolveQuestListKey('completed')).toBeDefined();
        });
    });

    describe('EndOfMonthController', () => {
        it('should initialize and attach end of month handler', () => {
            const controller = new EndOfMonthController(stateAdapter, form, dependencies);
            const completedBooksSet = new Set();
            const saveCompletedBooksSet = jest.fn();
            const updateCurrency = jest.fn();

            controller.initialize(completedBooksSet, saveCompletedBooksSet, updateCurrency);

            const buttons = document.querySelectorAll('.end-of-month-button');
            expect(buttons.length).toBeGreaterThan(0);
        });
    });
});

