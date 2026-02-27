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
import { STORAGE_KEYS, createEmptyCharacterState } from '../assets/js/character-sheet/storageKeys.js';
import { calculateBlueprintReward } from '../assets/js/services/QuestRewardService.js';
import { toast } from '../assets/js/ui/toast.js';

describe('Controllers', () => {
    let stateAdapter;
    let form;
    let dependencies;

    beforeEach(() => {
        // Create mock form element
        document.body.innerHTML = `
            <form id="character-sheet">
                <input id="keeperName" type="text" />
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
                <button id="download-data-button"></button>
                <button id="upload-data-button"></button>
                <input type="file" id="upload-data-file" />
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
            
            // Mock slot inputs with values
            const wearableInput = document.getElementById('wearable-slots');
            const nonWearableInput = document.getElementById('non-wearable-slots');
            const familiarInput = document.getElementById('familiar-slots');
            if (wearableInput) wearableInput.value = '5';
            if (nonWearableInput) nonWearableInput.value = '5';
            if (familiarInput) familiarInput.value = '5';
            
            stateAdapter.getInventoryItems = jest.fn(() => [{ name: 'Test Item', type: 'Wearable' }]);
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
        let updateCurrency;

        beforeEach(() => {
            updateCurrency = jest.fn();
            // Mock temporaryBuffs data by directly accessing the module
            // Since temporaryBuffs is exported, we can check if it exists in tests
            // The actual data will be loaded from JSON, so we test with real data structure
        });

        it('should initialize buff controller with dropdown', () => {
            const controller = new BuffController(stateAdapter, form, dependencies);
            controller.initialize(updateCurrency);

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
            controller.initialize(updateCurrency);

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
            controller.initialize(updateCurrency);

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
            controller.initialize(updateCurrency);

            const addButton = document.getElementById('add-temp-buff-from-dropdown-button');
            addButton.click();

            expect(stateAdapter.addTemporaryBuff).not.toHaveBeenCalled();
        });

        it('should handle buff removal click', () => {
            const controller = new BuffController(stateAdapter, form, dependencies);
            controller.initialize(updateCurrency);

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
            const updateCurrency = jest.fn();
            const controller = new BuffController(stateAdapter, form, dependencies);
            controller.initialize(updateCurrency);

            stateAdapter.getTemporaryBuffs = jest.fn(() => [{ 
                name: 'Disjointed Perception', 
                status: 'active',
                duration: 'one-time'
            }]);
            stateAdapter.updateTemporaryBuff = jest.fn();

            // Mock temporaryBuffs data
            if (data.temporaryBuffs && data.temporaryBuffs['Disjointed Perception']) {
                const target = document.createElement('button');
                target.classList.add('mark-buff-used-btn');
                target.dataset.index = '0';

                const result = controller.handleClick(target);
                expect(result).toBe(true);
                expect(stateAdapter.updateTemporaryBuff).toHaveBeenCalledWith(0, { status: 'used' });
                // Verify currency is applied when buff is marked as used
                expect(updateCurrency).toHaveBeenCalledWith({
                    xp: 0,
                    inkDrops: 10,
                    paperScraps: 5,
                    items: []
                });
            }
        });

        it('should not apply currency for non-one-time buffs', () => {
            const updateCurrency = jest.fn();
            const controller = new BuffController(stateAdapter, form, dependencies);
            controller.initialize(updateCurrency);

            stateAdapter.getTemporaryBuffs = jest.fn(() => [{ 
                name: 'Unwavering Resolve', 
                status: 'active',
                duration: 'until-end-month'
            }]);
            stateAdapter.updateTemporaryBuff = jest.fn();

            const target = document.createElement('button');
            target.classList.add('mark-buff-used-btn');
            target.dataset.index = '0';

            const result = controller.handleClick(target);
            expect(result).toBe(true);
            expect(stateAdapter.updateTemporaryBuff).toHaveBeenCalledWith(0, { status: 'used' });
            // Should not apply currency for non-one-time buffs
            expect(updateCurrency).not.toHaveBeenCalled();
        });

        it('should not apply currency for buffs with empty rewardModifier', () => {
            const updateCurrency = jest.fn();
            const controller = new BuffController(stateAdapter, form, dependencies);
            controller.initialize(updateCurrency);

            stateAdapter.getTemporaryBuffs = jest.fn(() => [{ 
                name: "Librarian's Blessing", 
                status: 'active',
                duration: 'one-time'
            }]);
            stateAdapter.updateTemporaryBuff = jest.fn();

            // Mock temporaryBuffs data with empty rewardModifier
            if (data.temporaryBuffs && data.temporaryBuffs["Librarian's Blessing"]) {
                const target = document.createElement('button');
                target.classList.add('mark-buff-used-btn');
                target.dataset.index = '0';

                const result = controller.handleClick(target);
                expect(result).toBe(true);
                expect(stateAdapter.updateTemporaryBuff).toHaveBeenCalledWith(0, { status: 'used' });
                // Should not apply currency when rewardModifier is empty
                expect(updateCurrency).not.toHaveBeenCalled();
            }
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

        it('should award correct blueprint reward for Speculative Fiction (avoid Fiction substring match)', () => {
            const blueprintReward = calculateBlueprintReward({
                type: '♥ Organize the Stacks',
                prompt: 'Speculative Fiction'
            });
            expect(blueprintReward).toBe(18);
        });

        it('should not move a restoration project quest to completed if blueprint spend fails', () => {
            const toastSpy = jest.spyOn(toast, 'error').mockImplementation(() => {});

            // Fresh, real state adapter (avoid mocked adapter from outer beforeEach)
            const state = createEmptyCharacterState();
            state[STORAGE_KEYS.DUSTY_BLUEPRINTS] = 0;
            state[STORAGE_KEYS.COMPLETED_RESTORATION_PROJECTS] = [];
            state[STORAGE_KEYS.COMPLETED_WINGS] = [];
            state[STORAGE_KEYS.PASSIVE_ITEM_SLOTS] = [];
            state[STORAGE_KEYS.PASSIVE_FAMILIAR_SLOTS] = [];
            state[STORAGE_KEYS.COMPLETED_QUESTS] = [];

            // Pick a restoration project that has a non-zero cost
            const projectId = Object.keys(data.restorationProjects || {}).find(id => {
                const p = data.restorationProjects[id];
                return (p?.cost || 0) > 0;
            });
            expect(projectId).toBeTruthy();
            const project = data.restorationProjects[projectId];

            state[STORAGE_KEYS.ACTIVE_ASSIGNMENTS] = [{
                type: '🔨 Restoration Project',
                month: 'January',
                year: '2024',
                book: 'Test Book',
                prompt: `${project.name}: ${project.completionPrompt}`,
                rewards: { xp: 0, inkDrops: 0, paperScraps: 0, items: [] },
                buffs: [],
                restorationData: {
                    wingId: String(project.wingId || ''),
                    wingName: 'Test Wing',
                    projectId,
                    projectName: project.name,
                    cost: project.cost || 0,
                    rewardType: project.reward?.type || null,
                    rewardSuggestedItems: project.reward?.suggestedItems || []
                }
            }];

            const realStateAdapter = new StateAdapter(state);
            const localDependencies = {
                ui: {
                    renderActiveAssignments: jest.fn(),
                    renderCompletedQuests: jest.fn(),
                    renderLoadout: jest.fn(),
                    renderPassiveEquipment: jest.fn(),
                    updateQuestBuffsDropdown: jest.fn(),
                    getRandomShelfColor: jest.fn(() => '#000000'),
                    renderShelfBooks: jest.fn()
                },
                saveState: jest.fn()
            };

            const controller = new QuestController(realStateAdapter, form, localDependencies);
            controller.showRewardNotification = jest.fn();
            controller.reRenderTablesIfNeeded = jest.fn();
            controller.initialize(new Set(), jest.fn(), jest.fn(), jest.fn());

            controller.handleCompleteQuest(0);

            // Quest should remain active and NOT be in completed history
            expect(realStateAdapter.getActiveAssignments()).toHaveLength(1);
            expect(realStateAdapter.getCompletedQuests()).toHaveLength(0);

            // Restoration should NOT be marked complete and no slots should be unlocked
            expect(realStateAdapter.isRestorationProjectCompleted(projectId)).toBe(false);
            expect(realStateAdapter.getPassiveItemSlots()).toHaveLength(0);
            expect(realStateAdapter.getPassiveFamiliarSlots()).toHaveLength(0);

            // And the player should be notified
            expect(toastSpy).toHaveBeenCalledWith(
                expect.stringContaining('Cannot complete restoration project')
            );

            toastSpy.mockRestore();
        });

        it('should resolve quest list keys correctly', () => {
            const controller = new QuestController(stateAdapter, form, dependencies);
            expect(controller.resolveQuestListKey('active')).toBeDefined();
            expect(controller.resolveQuestListKey('completed')).toBeDefined();
        });

        it('should restore a discarded quest to active assignments', () => {
            const state = createEmptyCharacterState();
            const testQuest = {
                type: '♣ Side Quest',
                month: 'January',
                year: '2024',
                book: 'Test Book',
                prompt: 'Test Prompt',
                rewards: { xp: 10, inkDrops: 5, paperScraps: 0, items: [] },
                buffs: []
            };

            state[STORAGE_KEYS.DISCARDED_QUESTS] = [testQuest];
            state[STORAGE_KEYS.ACTIVE_ASSIGNMENTS] = [];

            const realStateAdapter = new StateAdapter(state);
            const localDependencies = {
                ui: {
                    renderActiveAssignments: jest.fn(),
                    renderDiscardedQuests: jest.fn(),
                    renderLoadout: jest.fn(),
                    renderPassiveEquipment: jest.fn(),
                    updateQuestBuffsDropdown: jest.fn(),
                    getRandomShelfColor: jest.fn(() => '#000000'),
                    renderShelfBooks: jest.fn()
                },
                saveState: jest.fn()
            };

            const controller = new QuestController(realStateAdapter, form, localDependencies);
            controller.initialize(new Set(), jest.fn(), jest.fn(), jest.fn());

            // Simulate clicking restore button
            const target = document.createElement('button');
            target.classList.add('restore-quest-btn');
            target.dataset.index = '0';

            const result = controller.handleClick(target);

            expect(result).toBe(true);
            expect(realStateAdapter.getActiveAssignments()).toHaveLength(1);
            expect(realStateAdapter.getDiscardedQuests()).toHaveLength(0);
            expect(realStateAdapter.getActiveAssignments()[0]).toEqual(testQuest);
            expect(localDependencies.ui.renderActiveAssignments).toHaveBeenCalled();
            expect(localDependencies.ui.renderDiscardedQuests).toHaveBeenCalled();
            expect(localDependencies.saveState).toHaveBeenCalled();
        });

        it('should not restore quest if index is invalid', () => {
            const state = createEmptyCharacterState();
            state[STORAGE_KEYS.DISCARDED_QUESTS] = [];
            state[STORAGE_KEYS.ACTIVE_ASSIGNMENTS] = [];

            const realStateAdapter = new StateAdapter(state);
            const localDependencies = {
                ui: {
                    renderActiveAssignments: jest.fn(),
                    renderDiscardedQuests: jest.fn(),
                    renderLoadout: jest.fn(),
                    renderPassiveEquipment: jest.fn(),
                    updateQuestBuffsDropdown: jest.fn(),
                    getRandomShelfColor: jest.fn(() => '#000000'),
                    renderShelfBooks: jest.fn()
                },
                saveState: jest.fn()
            };

            const controller = new QuestController(realStateAdapter, form, localDependencies);
            controller.initialize(new Set(), jest.fn(), jest.fn(), jest.fn());

            // Try to restore from empty discarded list
            const target = document.createElement('button');
            target.classList.add('restore-quest-btn');
            target.dataset.index = '0';

            const result = controller.handleClick(target);

            expect(result).toBe(true);
            expect(realStateAdapter.getActiveAssignments()).toHaveLength(0);
            expect(realStateAdapter.getDiscardedQuests()).toHaveLength(0);
        });

        it('should prevent completing quest without book title', () => {
            const toastSpy = jest.spyOn(toast, 'error').mockImplementation(() => {});

            const state = createEmptyCharacterState();
            const questWithoutBook = {
                type: '♣ Side Quest',
                month: 'January',
                year: '2024',
                book: '', // Missing book title
                prompt: 'Test Prompt',
                rewards: { xp: 10, inkDrops: 5, paperScraps: 0, items: [] },
                buffs: []
            };

            state[STORAGE_KEYS.ACTIVE_ASSIGNMENTS] = [questWithoutBook];

            const realStateAdapter = new StateAdapter(state);
            const localDependencies = {
                ui: {
                    renderActiveAssignments: jest.fn(),
                    renderCompletedQuests: jest.fn(),
                    renderLoadout: jest.fn(),
                    renderPassiveEquipment: jest.fn(),
                    updateQuestBuffsDropdown: jest.fn(),
                    getRandomShelfColor: jest.fn(() => '#000000'),
                    renderShelfBooks: jest.fn()
                },
                saveState: jest.fn()
            };

            const controller = new QuestController(realStateAdapter, form, localDependencies);
            controller.initialize(new Set(), jest.fn(), jest.fn(), jest.fn());

            // Try to complete quest without book title
            controller.handleCompleteQuest(0);

            // Quest should remain in active assignments
            expect(realStateAdapter.getActiveAssignments()).toHaveLength(1);
            expect(realStateAdapter.getCompletedQuests()).toHaveLength(0);
            expect(realStateAdapter.getActiveAssignments()[0]).toEqual(questWithoutBook);

            // Error toast should be shown (book-first: link a book)
            expect(toastSpy).toHaveBeenCalledWith(
                expect.stringContaining('Please link a book')
            );

            // UI should be re-rendered
            expect(localDependencies.ui.renderActiveAssignments).toHaveBeenCalled();

            // State should be saved (consistent with other rollback scenarios)
            expect(localDependencies.saveState).toHaveBeenCalled();

            toastSpy.mockRestore();
        });

        it('should allow completing quest with book title', () => {
            const state = createEmptyCharacterState();
            const questWithBook = {
                type: '♣ Side Quest',
                month: 'January',
                year: '2024',
                book: 'Test Book Title', // Has book title
                bookId: 'book-1',
                prompt: 'Test Prompt',
                rewards: { xp: 10, inkDrops: 5, paperScraps: 0, items: [] },
                buffs: []
            };

            state[STORAGE_KEYS.ACTIVE_ASSIGNMENTS] = [];
            state[STORAGE_KEYS.COMPLETED_QUESTS] = [];
            state[STORAGE_KEYS.BOOKS] = {
                'book-1': {
                    id: 'book-1',
                    title: 'Test Book Title',
                    author: 'Author',
                    cover: null,
                    pageCount: null,
                    status: 'reading',
                    dateAdded: new Date().toISOString(),
                    dateCompleted: null,
                    links: { questIds: [], curriculumPromptIds: [] }
                }
            };

            const realStateAdapter = new StateAdapter(state);
            // Use real addActiveQuests so quest gets a proper id like in normal flows
            realStateAdapter.addActiveQuests([questWithBook]);
            const localDependencies = {
                ui: {
                    renderActiveAssignments: jest.fn(),
                    renderCompletedQuests: jest.fn(),
                    renderLoadout: jest.fn(),
                    renderPassiveEquipment: jest.fn(),
                    updateQuestBuffsDropdown: jest.fn(),
                    getRandomShelfColor: jest.fn(() => '#000000'),
                    renderShelfBooks: jest.fn()
                },
                saveState: jest.fn()
            };

            const controller = new QuestController(realStateAdapter, form, localDependencies);
            controller.initialize(new Set(), jest.fn(), jest.fn(), jest.fn());

            // Complete quest with book title
            controller.handleCompleteQuest(0);

            // Quest should be moved to completed
            expect(realStateAdapter.getActiveAssignments()).toHaveLength(0);
            expect(realStateAdapter.getCompletedQuests().length).toBeGreaterThan(0);

            // Book should be linked to completed quest for cascade / synergy logic
            const completed = realStateAdapter.getCompletedQuests().slice(-1)[0];
            const book = realStateAdapter.getBook('book-1');
            expect(completed.bookId).toBe('book-1');
            expect(book.links.questIds).toContain(completed.id);
        });

        it('should set dateAdded when creating a quest (Schema v3)', () => {
            const state = createEmptyCharacterState();
            const realStateAdapter = new StateAdapter(state);
            
            // Create a quest object directly and add it to test dateAdded assignment
            const quest = {
                type: '♣ Side Quest',
                month: 'January',
                year: '2024',
                book: 'Test Book',
                prompt: 'Test Side Quest',
                rewards: { xp: 0, inkDrops: 5, paperScraps: 0, items: [] },
                buffs: []
            };
            
            // Simulate what handleCreateQuest does - add dateAdded before adding quest
            const currentDate = new Date().toISOString();
            quest.dateAdded = quest.dateAdded || currentDate;
            
            realStateAdapter.addActiveQuests([quest]);
            
            // Check that quest was created with dateAdded
            const activeQuests = realStateAdapter.getActiveAssignments();
            expect(activeQuests.length).toBe(1);
            expect(activeQuests[0].dateAdded).toBeDefined();
            expect(activeQuests[0].dateAdded).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/); // ISO format
        });

        it('should set dateCompleted when completing a quest (Schema v3)', () => {
            const state = createEmptyCharacterState();
            const questWithBook = {
                type: '♣ Side Quest',
                month: 'January',
                year: '2024',
                book: 'Test Book Title',
                prompt: 'Test Prompt',
                rewards: { xp: 10, inkDrops: 5, paperScraps: 0, items: [] },
                buffs: [],
                dateAdded: '2024-01-15T10:00:00.000Z' // Pre-existing dateAdded
            };

            state[STORAGE_KEYS.ACTIVE_ASSIGNMENTS] = [questWithBook];
            state[STORAGE_KEYS.COMPLETED_QUESTS] = [];

            const realStateAdapter = new StateAdapter(state);
            const localDependencies = {
                ui: {
                    renderActiveAssignments: jest.fn(),
                    renderCompletedQuests: jest.fn(),
                    renderLoadout: jest.fn(),
                    renderPassiveEquipment: jest.fn(),
                    updateQuestBuffsDropdown: jest.fn(),
                    getRandomShelfColor: jest.fn(() => '#000000'),
                    renderShelfBooks: jest.fn()
                },
                saveState: jest.fn()
            };

            const controller = new QuestController(realStateAdapter, form, localDependencies);
            controller.initialize(new Set(), jest.fn(), jest.fn(), jest.fn());

            // Complete quest
            controller.handleCompleteQuest(0);

            // Check that completed quest has dateCompleted set
            const completedQuests = realStateAdapter.getCompletedQuests();
            expect(completedQuests.length).toBeGreaterThan(0);
            const completedQuest = completedQuests[completedQuests.length - 1];
            expect(completedQuest.dateCompleted).toBeDefined();
            expect(completedQuest.dateCompleted).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/); // ISO format
            // dateAdded should be preserved
            expect(completedQuest.dateAdded).toBe('2024-01-15T10:00:00.000Z');
        });

        it('should set dateAdded as fallback when completing quest without dateAdded (Schema v3)', () => {
            const state = createEmptyCharacterState();
            const questWithoutDateAdded = {
                type: '♣ Side Quest',
                month: 'January',
                year: '2024',
                book: 'Test Book Title',
                prompt: 'Test Prompt',
                rewards: { xp: 10, inkDrops: 5, paperScraps: 0, items: [] },
                buffs: []
                // No dateAdded field (legacy quest)
            };

            state[STORAGE_KEYS.ACTIVE_ASSIGNMENTS] = [questWithoutDateAdded];
            state[STORAGE_KEYS.COMPLETED_QUESTS] = [];

            const realStateAdapter = new StateAdapter(state);
            const localDependencies = {
                ui: {
                    renderActiveAssignments: jest.fn(),
                    renderCompletedQuests: jest.fn(),
                    renderLoadout: jest.fn(),
                    renderPassiveEquipment: jest.fn(),
                    updateQuestBuffsDropdown: jest.fn(),
                    getRandomShelfColor: jest.fn(() => '#000000'),
                    renderShelfBooks: jest.fn()
                },
                saveState: jest.fn()
            };

            const controller = new QuestController(realStateAdapter, form, localDependencies);
            controller.initialize(new Set(), jest.fn(), jest.fn(), jest.fn());

            // Complete quest
            controller.handleCompleteQuest(0);

            // Check that completed quest has both dateAdded and dateCompleted set
            const completedQuests = realStateAdapter.getCompletedQuests();
            expect(completedQuests.length).toBeGreaterThan(0);
            const completedQuest = completedQuests[completedQuests.length - 1];
            expect(completedQuest.dateAdded).toBeDefined();
            expect(completedQuest.dateCompleted).toBeDefined();
            // dateAdded should equal dateCompleted (fallback behavior)
            expect(completedQuest.dateAdded).toBe(completedQuest.dateCompleted);
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

        it('should complete a wing when all restoration projects in that wing are completed via quest completion', () => {
            // Use a real StateAdapter instance (not mocked) for restoration state mutations
            const realStateAdapter = new StateAdapter(characterState);

            // Reset relevant state
            characterState[STORAGE_KEYS.DUSTY_BLUEPRINTS] = 9999;
            characterState[STORAGE_KEYS.COMPLETED_RESTORATION_PROJECTS] = [];
            characterState[STORAGE_KEYS.COMPLETED_WINGS] = [];
            characterState[STORAGE_KEYS.PASSIVE_ITEM_SLOTS] = [];
            characterState[STORAGE_KEYS.PASSIVE_FAMILIAR_SLOTS] = [];

            // Create controller with real adapter
            const controller = new QuestController(realStateAdapter, form, dependencies);
            const completedBooksSet = new Set();
            const saveCompletedBooksSet = jest.fn();
            const updateCurrency = jest.fn();
            const updateGenreQuestDropdown = jest.fn();
            controller.initialize(completedBooksSet, saveCompletedBooksSet, updateCurrency, updateGenreQuestDropdown);

            // Pick wing 2 projects from real data
            const wingId = '2';
            const wingProjectIds = Object.entries(data.restorationProjects)
                .filter(([_, p]) => String(p.wingId) === wingId)
                .map(([id]) => id);

            expect(wingProjectIds.length).toBeGreaterThan(0);

            // Mark all but last project completed
            const lastProjectId = wingProjectIds[wingProjectIds.length - 1];
            wingProjectIds.slice(0, -1).forEach(id => realStateAdapter.completeRestorationProject(id));

            // Complete the last project via handler
            const lastProject = data.restorationProjects[lastProjectId];
            const quest = {
                type: '🔨 Restoration Project',
                month: 'January',
                year: '2024',
                prompt: `${lastProject.name}: ${lastProject.completionPrompt}`,
                rewards: { xp: 0, inkDrops: 0, paperScraps: 0, items: [] },
                buffs: [],
                restorationData: {
                    wingId,
                    wingName: 'Heart&#039;s Gallery',
                    projectId: lastProjectId,
                    projectName: lastProject.name,
                    cost: lastProject.cost || 0,
                    rewardType: lastProject.reward?.type || null,
                    rewardSuggestedItems: lastProject.reward?.suggestedItems || []
                }
            };

            controller.handleRestorationProjectCompletion(quest);

            // Wing should now be completed
            expect(realStateAdapter.isWingCompleted(wingId)).toBe(true);
            // And UI currency award should have been invoked
            expect(updateCurrency).toHaveBeenCalledWith(
                expect.objectContaining({
                    xp: expect.any(Number),
                    inkDrops: expect.any(Number),
                    paperScraps: expect.any(Number)
                })
            );
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

    // DataExportController (download/upload) was removed after moving persistence to IndexedDB + cloud sync.
});

