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
import { STORAGE_KEYS } from '../character-sheet/storageKeys.js';
import * as data from '../character-sheet/data.js';
import { getSlotLimits } from '../services/SlotService.js';

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

        // Handle remove passive item button (doesn't have index)
        if (target.classList.contains('remove-passive-item-btn')) {
            const slotId = target.getAttribute('data-slot-id');
            const slotType = target.getAttribute('data-slot-type');

            // If removing from a slot, return the item to inventory (if not already there)
            const slots = slotType === 'item'
                ? (stateAdapter.getPassiveItemSlots() || [])
                : (stateAdapter.getPassiveFamiliarSlots() || []);
            const slot = slots.find(s => s.slotId === slotId);
            const itemName = slot?.itemName;
            if (itemName) {
                const inventoryItems = stateAdapter.getInventoryItems();
                const inInventory = inventoryItems.some(i => i.name === itemName);
                if (!inInventory) {
                    const canonical = data.allItems?.[itemName];
                    stateAdapter.addInventoryItem(canonical ? { name: itemName, ...canonical } : { name: itemName });
                }
            }
            
            if (slotType === 'item') {
                stateAdapter.setPassiveSlotItem(slotId, null);
            } else {
                stateAdapter.setPassiveFamiliarSlotItem(slotId, null);
            }
            
            renderLoadout();
            if (uiModule.renderPassiveEquipment) {
                uiModule.renderPassiveEquipment();
            }
            this.saveState();
            return true;
        }

        // Handle equip button from passive slot (doesn't have index)
        if (target.classList.contains('equip-from-passive-btn')) {
            const slotId = target.getAttribute('data-passive-slot-id');
            const slotType = target.getAttribute('data-passive-slot-type');
            
            // Get the item from the passive slot
            const passiveItemSlots = stateAdapter.getPassiveItemSlots() || [];
            const passiveFamiliarSlots = stateAdapter.getPassiveFamiliarSlots() || [];
            const slots = slotType === 'item' ? passiveItemSlots : passiveFamiliarSlots;
            const slot = slots.find(s => s.slotId === slotId);
            
            if (!slot || !slot.itemName) return true;
            
            // Get item data for adding to inventory if needed
            const itemName = slot.itemName;
            const itemData = data.allItems?.[itemName];
            
            // Ensure item is in inventory (items in passive slots are removed from inventory)
            const inventoryItems = stateAdapter.getInventoryItems();
            const itemIndex = inventoryItems.findIndex(item => item.name === itemName);
            
            if (itemIndex === -1) {
                // Item not in inventory, add it first
                stateAdapter.addInventoryItem(itemData ? { name: itemName, ...itemData } : { name: itemName });
            }
            
            // Now find the item in inventory (it should be there now)
            const updatedInventoryItems = stateAdapter.getInventoryItems();
            const updatedItemIndex = updatedInventoryItems.findIndex(item => item.name === itemName);
            
            if (updatedItemIndex === -1) {
                // This shouldn't happen, but handle gracefully
                return true;
            }
            
                const itemToEquip = updatedInventoryItems[updatedItemIndex];
                const slotLimits = getSlotLimits(
                    slotInputs.wearableSlotsInput,
                    slotInputs.nonWearableSlotsInput,
                    slotInputs.familiarSlotsInput
                );
            
            // Get items in passive slots to exclude from count (for slot limit checking)
            const itemsInPassiveSlots = new Set([
                ...passiveItemSlots.map(s => s.itemName).filter(Boolean),
                ...passiveFamiliarSlots.map(s => s.itemName).filter(Boolean)
            ]);
            
            const equippedCountForType = stateAdapter.getEquippedItems()
                .filter(item => item.type === itemToEquip.type && 
                       !itemsInPassiveSlots.has(item.name)).length;
            
            if (equippedCountForType < slotLimits[itemToEquip.type]) {
                // Clear from passive slot first (this doesn't automatically add to inventory, but we already added it)
                if (slotType === 'item') {
                    stateAdapter.setPassiveSlotItem(slotId, null);
                } else {
                    stateAdapter.setPassiveFamiliarSlotItem(slotId, null);
                }
                
                // Now equip it from inventory
                // Re-find index after clearing slot in case order changed
                const finalInventoryItems = stateAdapter.getInventoryItems();
                const finalItemIndex = finalInventoryItems.findIndex(item => item.name === itemName);
                
                if (finalItemIndex !== -1 && stateAdapter.moveInventoryItemToEquipped(finalItemIndex)) {
                    renderLoadout();
                    if (uiModule.renderPassiveEquipment) {
                        uiModule.renderPassiveEquipment();
                    }
                    this.saveState();
                }
            } else {
                const container = document.querySelector('.passive-equipment-section');
                if (container) {
                    clearFormError(container);
                    showFormError(container, `No empty ${itemToEquip.type} slots available!`);
                }
            }
            
            return true;
        }

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

            const slotLimits = getSlotLimits(
                slotInputs.wearableSlotsInput,
                slotInputs.nonWearableSlotsInput,
                slotInputs.familiarSlotsInput
            );
            const equippedCountForType = stateAdapter.getEquippedItems().filter(item => item.type === itemToEquip.type).length;
            
            if (equippedCountForType < slotLimits[itemToEquip.type]) {
                // StateAdapter automatically enforces invariant: removes item from passive slots
                if (stateAdapter.moveInventoryItemToEquipped(index)) {
                    renderLoadout();
                    // Refresh passive equipment if it exists
                    if (uiModule.renderPassiveEquipment) {
                        uiModule.renderPassiveEquipment();
                    }
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

        if (target.classList.contains('display-item-btn')) {
            const inventoryItems = stateAdapter.getInventoryItems();
            const itemToDisplay = inventoryItems[index];
            if (!itemToDisplay) return true;

            // Find an empty passive item slot
            const passiveItemSlots = stateAdapter.getPassiveItemSlots() || [];
            const emptySlot = passiveItemSlots.find(slot => !slot.itemName);
            
            if (emptySlot) {
                // StateAdapter automatically enforces invariant: unequips item if equipped
                // Assign to passive slot
                stateAdapter.setPassiveSlotItem(emptySlot.slotId, itemToDisplay.name);

                // Remove from inventory while displayed
                stateAdapter.removeInventoryItem(index);
                
                renderLoadout();
                if (uiModule.renderPassiveEquipment) {
                    uiModule.renderPassiveEquipment();
                }
                this.saveState();
            } else {
                const container = document.querySelector('.inventory-container');
                if (container) {
                    clearFormError(container);
                    showFormError(container, 'No empty passive item slots available!');
                }
            }
            return true;
        }

        if (target.classList.contains('adopt-familiar-btn')) {
            const inventoryItems = stateAdapter.getInventoryItems();
            const familiarToAdopt = inventoryItems[index];
            if (!familiarToAdopt) return true;

            // Find an empty passive familiar slot
            const passiveFamiliarSlots = stateAdapter.getPassiveFamiliarSlots() || [];
            const emptySlot = passiveFamiliarSlots.find(slot => !slot.itemName);
            
            if (emptySlot) {
                // StateAdapter automatically enforces invariant: unequips familiar if equipped
                // Assign to passive slot
                stateAdapter.setPassiveFamiliarSlotItem(emptySlot.slotId, familiarToAdopt.name);

                // Remove from inventory while adopted
                stateAdapter.removeInventoryItem(index);
                
                renderLoadout();
                if (uiModule.renderPassiveEquipment) {
                    uiModule.renderPassiveEquipment();
                }
                this.saveState();
            } else {
                const container = document.querySelector('.inventory-container');
                if (container) {
                    clearFormError(container);
                    showFormError(container, 'No empty passive familiar slots available!');
                }
            }
            return true;
        }

        return false;
    }

    /**
     * Clear an item from all passive slots (when it's equipped)
     * @param {string} itemName - Name of the item to clear
     */
}

