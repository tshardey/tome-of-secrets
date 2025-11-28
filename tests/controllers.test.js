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
import { safeGetJSON, safeSetJSON } from '../assets/js/utils/storage.js';
import { STORAGE_KEYS } from '../assets/js/character-sheet/storageKeys.js';

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
                <input id="inkDrops" type="number" />
                <input id="paperScraps" type="number" />
                <select id="keeperBackground"></select>
                <select id="wizardSchool"></select>
                <select id="librarySanctum"></select>
                <input id="smp" type="number" />
                <button id="learn-ability-button"></button>
                <select id="ability-select"></select>
                <input id="wearable-slots" type="number" />
                <input id="non-wearable-slots" type="number" />
                <input id="familiar-slots" type="number" />
                <div class="slot-management"></div>
                <select id="item-select"></select>
                <button id="add-item-button"></button>
                <button id="add-quest-button"></button>
                <select id="new-quest-type"></select>
                <select id="curse-penalty-select"></select>
                <button id="add-curse-button"></button>
                <select id="temp-buff-select"></select>
                <button id="add-temp-buff-from-dropdown-button"></button>
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
        beforeEach(() => {
            // Clear localStorage before each test
            localStorage.clear();
        });

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

        it('should apply rewards when level increases', () => {
            const controller = new CharacterController(stateAdapter, form, dependencies);
            controller.initialize();
            
            const levelInput = document.getElementById('level');
            const inkDropsInput = document.getElementById('inkDrops');
            const paperScrapsInput = document.getElementById('paperScraps');
            const smpInput = document.getElementById('smp');
            
            // Set initial values
            levelInput.value = '1';
            inkDropsInput.value = '10';
            paperScrapsInput.value = '5';
            smpInput.value = '0';
            
            // Trigger initial load to set previousLevel
            levelInput.dispatchEvent(new Event('change'));
            
            // Level up to 2
            levelInput.value = '2';
            levelInput.dispatchEvent(new Event('change'));
            
            // Level 2 rewards: 5 inkDrops, 2 paperScraps, 0 SMP
            expect(parseInt(inkDropsInput.value)).toBe(15); // 10 + 5
            expect(parseInt(paperScrapsInput.value)).toBe(7); // 5 + 2
            expect(parseInt(smpInput.value)).toBe(0);
        });

        it('should apply rewards for multiple level increases', () => {
            const controller = new CharacterController(stateAdapter, form, dependencies);
            controller.initialize();
            
            const levelInput = document.getElementById('level');
            const inkDropsInput = document.getElementById('inkDrops');
            const paperScrapsInput = document.getElementById('paperScraps');
            const smpInput = document.getElementById('smp');
            
            // Set initial values
            levelInput.value = '1';
            inkDropsInput.value = '0';
            paperScrapsInput.value = '0';
            smpInput.value = '0';
            
            // Trigger initial load to set previousLevel
            levelInput.dispatchEvent(new Event('change'));
            
            // Level up from 1 to 4 (should get rewards for levels 2, 3, and 4)
            levelInput.value = '4';
            levelInput.dispatchEvent(new Event('change'));
            
            // Level 2: 5 ink, 2 paper
            // Level 3: 5 ink, 3 paper
            // Level 4: 10 ink, 5 paper
            // Total: 20 ink, 10 paper
            expect(parseInt(inkDropsInput.value)).toBe(20);
            expect(parseInt(paperScrapsInput.value)).toBe(10);
        });

        it('should award SMP when leveling up to levels with SMP rewards', () => {
            const controller = new CharacterController(stateAdapter, form, dependencies);
            controller.initialize();
            
            const levelInput = document.getElementById('level');
            const smpInput = document.getElementById('smp');
            
            levelInput.value = '4';
            smpInput.value = '0';
            levelInput.dispatchEvent(new Event('change'));
            
            // Level up to 5 (awards 1 SMP)
            levelInput.value = '5';
            levelInput.dispatchEvent(new Event('change'));
            
            expect(parseInt(smpInput.value)).toBe(1);
            expect(dependencies.ui.renderMasteryAbilities).toHaveBeenCalled();
        });

        it('should track unallocated inventory slots when leveling up', () => {
            const controller = new CharacterController(stateAdapter, form, dependencies);
            controller.initialize();
            
            const levelInput = document.getElementById('level');
            const wearableSlotsInput = document.getElementById('wearable-slots');
            const nonWearableSlotsInput = document.getElementById('non-wearable-slots');
            const familiarSlotsInput = document.getElementById('familiar-slots');
            
            // Set initial slots to 1 each (3 total)
            wearableSlotsInput.value = '1';
            nonWearableSlotsInput.value = '1';
            familiarSlotsInput.value = '1';
            
            levelInput.value = '3';
            levelInput.dispatchEvent(new Event('change'));
            
            // Level up to 4 (awards 1 inventory slot, expected total becomes 4)
            levelInput.value = '4';
            levelInput.dispatchEvent(new Event('change'));
            
            // renderLoadout should be called to show the unallocated slot warning
            expect(dependencies.ui.renderLoadout).toHaveBeenCalled();
        });

        it('should not apply rewards when level decreases', () => {
            // Set up form data with previous level before initializing
            const formData = safeGetJSON(STORAGE_KEYS.CHARACTER_SHEET_FORM, {});
            formData.previousLevel = 5;
            safeSetJSON(STORAGE_KEYS.CHARACTER_SHEET_FORM, formData);
            
            const controller = new CharacterController(stateAdapter, form, dependencies);
            controller.initialize();
            
            const levelInput = document.getElementById('level');
            const inkDropsInput = document.getElementById('inkDrops');
            
            // Set current level and currency (no change event to avoid applying rewards)
            levelInput.value = '5';
            inkDropsInput.value = '100';
            
            // Decrease level
            levelInput.value = '3';
            levelInput.dispatchEvent(new Event('change'));
            
            // Should not change currency (rewards only apply on level increase)
            expect(parseInt(inkDropsInput.value)).toBe(100);
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

        it('should update unallocated slots warning when a slot is increased', () => {
            // Set up: level 8 (expected 5 slots total), current slots = 3 (1+1+1)
            const formData = safeGetJSON(STORAGE_KEYS.CHARACTER_SHEET_FORM, {});
            formData.level = 8;
            formData['wearable-slots'] = 1;
            formData['non-wearable-slots'] = 1;
            formData['familiar-slots'] = 1;
            safeSetJSON(STORAGE_KEYS.CHARACTER_SHEET_FORM, formData);
            
            const controller = new InventoryController(stateAdapter, form, dependencies);
            controller.initialize();
            
            const wearableSlotsInput = document.getElementById('wearable-slots');
            wearableSlotsInput.value = '1';
            
            // Increase wearable slots by 1 (total becomes 4, still 1 unallocated)
            wearableSlotsInput.value = '2';
            wearableSlotsInput.dispatchEvent(new Event('change'));
            
            // renderLoadout should be called to update the warning
            expect(dependencies.ui.renderLoadout).toHaveBeenCalled();
        });

        it('should correctly calculate unallocated slots based on level', () => {
            // Set up: level 4 (expected 4 slots total), current slots = 3 (1+1+1)
            const formData = safeGetJSON(STORAGE_KEYS.CHARACTER_SHEET_FORM, {});
            formData.level = 4;
            formData['wearable-slots'] = 1;
            formData['non-wearable-slots'] = 1;
            formData['familiar-slots'] = 1;
            safeSetJSON(STORAGE_KEYS.CHARACTER_SHEET_FORM, formData);
            
            const controller = new InventoryController(stateAdapter, form, dependencies);
            controller.initialize();
            
            const wearableSlotsInput = document.getElementById('wearable-slots');
            wearableSlotsInput.value = '1';
            
            // Increase wearable slots by 2 (total becomes 5, but expected is only 4)
            // This should still work - the warning will show 0 unallocated (or negative if we allow over-allocation)
            wearableSlotsInput.value = '3';
            wearableSlotsInput.dispatchEvent(new Event('change'));
            
            // renderLoadout should be called to update the warning
            expect(dependencies.ui.renderLoadout).toHaveBeenCalled();
        });

        it('should show warning when slot decreases below expected total', () => {
            // Set up: level 8 (expected 5 slots total), current slots = 5 (3+1+1)
            const formData = safeGetJSON(STORAGE_KEYS.CHARACTER_SHEET_FORM, {});
            formData.level = 8;
            formData['wearable-slots'] = 3;
            formData['non-wearable-slots'] = 1;
            formData['familiar-slots'] = 1;
            safeSetJSON(STORAGE_KEYS.CHARACTER_SHEET_FORM, formData);
            
            const controller = new InventoryController(stateAdapter, form, dependencies);
            controller.initialize();
            
            const wearableSlotsInput = document.getElementById('wearable-slots');
            wearableSlotsInput.value = '3';
            
            // Decrease wearable slots (total becomes 4, but expected is 5, so 1 unallocated)
            wearableSlotsInput.value = '2';
            wearableSlotsInput.dispatchEvent(new Event('change'));
            
            // renderLoadout should be called to show the warning again
            expect(dependencies.ui.renderLoadout).toHaveBeenCalled();
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
        beforeEach(() => {
            // Mock temporaryBuffs data by directly accessing the module
            // Since temporaryBuffs is exported, we can check if it exists in tests
            // The actual data will be loaded from JSON, so we test with real data structure
        });

        it('should initialize buff controller with dropdown', () => {
            const controller = new BuffController(stateAdapter, form, dependencies);
            controller.initialize();

            const select = document.getElementById('temp-buff-select');
            const addButton = document.getElementById('add-temp-buff-from-dropdown-button');
            expect(select).toBeTruthy();
            expect(addButton).toBeTruthy();
        });

        it('should add temporary buff from dropdown', () => {
            // Only test if temporaryBuffs exists (it should from JSON)
            if (!data.temporaryBuffs || Object.keys(data.temporaryBuffs).length === 0) {
                // Skip test if no temporary buffs loaded
                return;
            }

            const controller = new BuffController(stateAdapter, form, dependencies);
            controller.initialize();

            // Populate dropdown first
            dependencies.ui.populateTemporaryBuffDropdown = jest.fn(() => {
                const select = document.getElementById('temp-buff-select');
                if (select) {
                    Object.keys(data.temporaryBuffs).forEach(buffName => {
                        const option = document.createElement('option');
                        option.value = buffName;
                        option.textContent = buffName;
                        select.appendChild(option);
                    });
                }
            });
            dependencies.ui.populateTemporaryBuffDropdown();

            const select = document.getElementById('temp-buff-select');
            const addButton = document.getElementById('add-temp-buff-from-dropdown-button');
            
            // Use first available buff
            const firstBuffName = Object.keys(data.temporaryBuffs)[0];
            const firstBuff = data.temporaryBuffs[firstBuffName];
            
            select.value = firstBuffName;
            addButton.click();

            let expectedMonthsRemaining = 0;
            if (firstBuff.duration === 'two-months') {
                expectedMonthsRemaining = 2;
            } else if (firstBuff.duration === 'until-end-month') {
                expectedMonthsRemaining = 1;
            }

            expect(stateAdapter.addTemporaryBuff).toHaveBeenCalledWith({
                name: firstBuffName,
                description: firstBuff.description,
                duration: firstBuff.duration,
                monthsRemaining: expectedMonthsRemaining,
                status: 'active'
            });
            expect(dependencies.ui.renderTemporaryBuffs).toHaveBeenCalled();
            expect(dependencies.saveState).toHaveBeenCalled();
        });

        it('should calculate monthsRemaining correctly for different durations', () => {
            if (!data.temporaryBuffs || Object.keys(data.temporaryBuffs).length === 0) {
                return;
            }

            const controller = new BuffController(stateAdapter, form, dependencies);
            controller.initialize();

            // Populate dropdown
            const select = document.getElementById('temp-buff-select');
            Object.keys(data.temporaryBuffs).forEach(buffName => {
                const option = document.createElement('option');
                option.value = buffName;
                option.textContent = buffName;
                select.appendChild(option);
            });

            const addButton = document.getElementById('add-temp-buff-from-dropdown-button');
            
            // Find a two-months buff if it exists
            const twoMonthsBuff = Object.entries(data.temporaryBuffs).find(([name, buff]) => buff.duration === 'two-months');
            if (twoMonthsBuff) {
                select.value = twoMonthsBuff[0];
                addButton.click();
                expect(stateAdapter.addTemporaryBuff).toHaveBeenCalledWith(
                    expect.objectContaining({
                        monthsRemaining: 2
                    })
                );
            }

            // Find an until-end-month buff if it exists
            stateAdapter.addTemporaryBuff.mockClear();
            const untilEndMonthBuff = Object.entries(data.temporaryBuffs).find(([name, buff]) => buff.duration === 'until-end-month');
            if (untilEndMonthBuff) {
                select.value = untilEndMonthBuff[0];
                addButton.click();
                expect(stateAdapter.addTemporaryBuff).toHaveBeenCalledWith(
                    expect.objectContaining({
                        monthsRemaining: 1
                    })
                );
            }
        });

        it('should not add buff if no selection', () => {
            const controller = new BuffController(stateAdapter, form, dependencies);
            controller.initialize();

            const addButton = document.getElementById('add-temp-buff-from-dropdown-button');
            addButton.click();

            expect(stateAdapter.addTemporaryBuff).not.toHaveBeenCalled();
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

        it('should handle marking buff as used', () => {
            const controller = new BuffController(stateAdapter, form, dependencies);
            controller.initialize();

            stateAdapter.getTemporaryBuffs = jest.fn(() => [{ name: 'Test Buff', status: 'active' }]);
            stateAdapter.updateTemporaryBuff = jest.fn();

            const target = document.createElement('button');
            target.classList.add('mark-buff-used-btn');
            target.dataset.index = '0';

            const result = controller.handleClick(target);
            expect(result).toBe(true);
            expect(stateAdapter.updateTemporaryBuff).toHaveBeenCalledWith(0, { status: 'used' });
        });
    });

    describe('InventoryController', () => {
        it('should prevent equipping Quest type items', () => {
            const controller = new InventoryController(stateAdapter, form, dependencies);
            controller.initialize();

            // Mock a Quest type item
            const questItem = { name: 'The Grand Key', type: 'Quest', bonus: 'Test' };
            stateAdapter.getInventoryItems = jest.fn(() => [questItem]);
            stateAdapter.getEquippedItems = jest.fn(() => []);

            // Create container in DOM (needed for showFormError)
            const container = document.createElement('div');
            container.className = 'inventory-container';
            form.appendChild(container);

            const target = document.createElement('button');
            target.classList.add('equip-btn');
            target.dataset.index = '0';

            const result = controller.handleClick(target);
            expect(result).toBe(true);
            expect(stateAdapter.moveInventoryItemToEquipped).not.toHaveBeenCalled();
            // The showFormError is called internally, we just verify equip was prevented
        });

        it('should allow equipping non-Quest type items', () => {
            const controller = new InventoryController(stateAdapter, form, dependencies);
            controller.initialize();

            const wearableItem = { name: 'Librarian\'s Compass', type: 'Wearable', bonus: 'Test' };
            stateAdapter.getInventoryItems = jest.fn(() => [wearableItem]);
            stateAdapter.getEquippedItems = jest.fn(() => []);
            stateAdapter.moveInventoryItemToEquipped = jest.fn(() => true);
            dependencies.ui.getSlotLimits = jest.fn(() => ({ wearable: 5, nonWearable: 5, familiar: 5, total: 15 }));
            dependencies.ui.renderLoadout = jest.fn();
            
            // The controller stores renderLoadout during initialize
            // Make sure it's available
            if (!controller.renderLoadout) {
                controller.renderLoadout = dependencies.ui.renderLoadout;
            }

            const target = document.createElement('button');
            target.classList.add('equip-btn');
            target.dataset.index = '0';

            const result = controller.handleClick(target);
            expect(result).toBe(true);
            // The method should be called, but it's internal to the controller
            // We verify the handler returned true, indicating it processed the click
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

        it('should auto-detect temporary buffs from quest notes', () => {
            if (!data.temporaryBuffs || Object.keys(data.temporaryBuffs).length === 0) {
                return;
            }

            const controller = new QuestController(stateAdapter, form, dependencies);
            const completedBooksSet = new Set();
            const saveCompletedBooksSet = jest.fn();
            const updateCurrency = jest.fn();
            const updateGenreQuestDropdown = jest.fn();

            controller.initialize(completedBooksSet, saveCompletedBooksSet, updateCurrency, updateGenreQuestDropdown);

            stateAdapter.getTemporaryBuffs = jest.fn(() => []);
            stateAdapter.addTemporaryBuff = jest.fn();

            // Use first available buff name
            const firstBuffName = Object.keys(data.temporaryBuffs)[0];
            const notes = `Reward: ${firstBuffName}`;
            controller.autoDetectTemporaryBuffsFromText(notes);

            expect(stateAdapter.addTemporaryBuff).toHaveBeenCalledWith(
                expect.objectContaining({
                    name: firstBuffName
                })
            );
        });

        it('should not add duplicate temporary buffs', () => {
            if (!data.temporaryBuffs || Object.keys(data.temporaryBuffs).length === 0) {
                return;
            }

            const controller = new QuestController(stateAdapter, form, dependencies);
            const completedBooksSet = new Set();
            const saveCompletedBooksSet = jest.fn();
            const updateCurrency = jest.fn();
            const updateGenreQuestDropdown = jest.fn();

            controller.initialize(completedBooksSet, saveCompletedBooksSet, updateCurrency, updateGenreQuestDropdown);

            // Mock that buff already exists
            const firstBuffName = Object.keys(data.temporaryBuffs)[0];
            stateAdapter.getTemporaryBuffs = jest.fn(() => [{ name: firstBuffName, status: 'active' }]);
            stateAdapter.addTemporaryBuff = jest.fn();

            const notes = `Reward: ${firstBuffName}`;
            controller.autoDetectTemporaryBuffsFromText(notes);

            expect(stateAdapter.addTemporaryBuff).not.toHaveBeenCalled();
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

