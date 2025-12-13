/**
 * InventoryController - Handles inventory and equipment management
 * 
 * Manages:
 * - Adding items to inventory
 * - Equipping/unequipping items
 * - Deleting items
 * - Slot management
 */

import { BaseController } from './BaseController.js';
import { parseIntOr } from '../utils/helpers.js';
import { clearFormError, showFormError } from '../utils/formErrors.js';
import * as data from '../character-sheet/data.js';

export class InventoryController extends BaseController {
    initialize() {
        const { stateAdapter } = this;
        const { ui: uiModule } = this.dependencies;

        if (!uiModule) return;

        const wearableSlotsInput = document.getElementById('wearable-slots');
        const nonWearableSlotsInput = document.getElementById('non-wearable-slots');
        const familiarSlotsInput = document.getElementById('familiar-slots');
        const itemSelect = document.getElementById('item-select');
        const addItemButton = document.getElementById('add-item-button');

        if (!wearableSlotsInput || !addItemButton) return;

        const renderLoadout = () => {
            uiModule.renderLoadout(wearableSlotsInput, nonWearableSlotsInput, familiarSlotsInput);
            uiModule.updateQuestBuffsDropdown(wearableSlotsInput, nonWearableSlotsInput, familiarSlotsInput);
        };

        // Handle slot changes - save all form data and re-render
        // The unallocated slots warning is calculated dynamically in renderLoadout
        const handleSlotChange = () => {
            // Use saveState to preserve all form fields, not just the slot value
            this.saveState();
            renderLoadout();
        };

        this.addEventListener(wearableSlotsInput, 'change', handleSlotChange);
        this.addEventListener(nonWearableSlotsInput, 'change', handleSlotChange);
        this.addEventListener(familiarSlotsInput, 'change', handleSlotChange);

        this.addEventListener(addItemButton, 'click', () => {
            const itemName = itemSelect?.value;
            if (itemName && data.allItems[itemName]) {
                stateAdapter.addInventoryItem({ name: itemName, ...data.allItems[itemName] });
                renderLoadout();
                uiModule.updateQuestBuffsDropdown(wearableSlotsInput, nonWearableSlotsInput, familiarSlotsInput);
                this.saveState();
            }
        });

        // Store renderLoadout for use in delegated handlers
        this.renderLoadout = renderLoadout;
        this.slotInputs = { wearableSlotsInput, nonWearableSlotsInput, familiarSlotsInput };
    }

    /**
     * Handle inventory-related clicks - called from main delegated handler
     */
    handleClick(target) {
        const { stateAdapter } = this;
        const { ui: uiModule } = this.dependencies;
        const { renderLoadout, slotInputs } = this;

        if (!target.dataset.index) return false;

        const index = parseInt(target.dataset.index || '0', 10);

        if (target.classList.contains('equip-btn')) {
            const inventoryItems = stateAdapter.getInventoryItems();
            const itemToEquip = inventoryItems[index];
            if (!itemToEquip) return true;

            // Quest type items cannot be equipped
            if (itemToEquip.type === 'Quest') {
                const container = document.querySelector('.inventory-container');
                if (container) {
                    clearFormError(container);
                    showFormError(container, 'Quest items cannot be equipped. They remain in your inventory.');
                }
                return true;
            }

            const slotLimits = uiModule.getSlotLimits(
                slotInputs.wearableSlotsInput,
                slotInputs.nonWearableSlotsInput,
                slotInputs.familiarSlotsInput
            );
            const equippedCountForType = stateAdapter.getEquippedItems().filter(item => item.type === itemToEquip.type).length;
            
            if (equippedCountForType < slotLimits[itemToEquip.type]) {
                if (stateAdapter.moveInventoryItemToEquipped(index)) {
                    renderLoadout();
                    this.saveState();
                }
            } else {
                const container = document.querySelector('.inventory-container');
                if (container) {
                    clearFormError(container);
                    showFormError(container, `No empty ${itemToEquip.type} slots available!`);
                }
            }
            return true;
        }

        if (target.classList.contains('unequip-btn')) {
            if (stateAdapter.moveEquippedItemToInventory(index)) {
                renderLoadout();
                this.saveState();
            }
            return true;
        }

        if (target.classList.contains('delete-item-btn')) {
            const inventoryItems = stateAdapter.getInventoryItems();
            const itemName = inventoryItems[index] ? inventoryItems[index].name : 'this item';
            if (confirm(`Are you sure you want to permanently delete ${itemName}?`)) {
                stateAdapter.removeInventoryItem(index);
                renderLoadout();
                this.saveState();
            }
            return true;
        }

        return false;
    }
}

