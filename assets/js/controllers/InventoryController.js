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
            
            // Find the item in inventory
            const inventoryItems = stateAdapter.getInventoryItems();
            const itemIndex = inventoryItems.findIndex(item => item.name === slot.itemName);
            
            if (itemIndex === -1) {
                // Item not in inventory, need to add it first
                const itemData = data.allItems?.[slot.itemName];
                stateAdapter.addInventoryItem(itemData ? { name: slot.itemName, ...itemData } : { name: slot.itemName });
            }
            
            // Now equip it (this will handle removing from passive slot via clearItemFromPassiveSlots)
            const updatedInventoryItems = stateAdapter.getInventoryItems();
            const updatedItemIndex = updatedInventoryItems.findIndex(item => item.name === slot.itemName);
            
            if (updatedItemIndex !== -1) {
                const itemToEquip = updatedInventoryItems[updatedItemIndex];
                const slotLimits = uiModule.getSlotLimits(
                    slotInputs.wearableSlotsInput,
                    slotInputs.nonWearableSlotsInput,
                    slotInputs.familiarSlotsInput
                );
                // Get items in passive slots to exclude from count
                const passiveItemSlots = stateAdapter.getPassiveItemSlots() || [];
                const passiveFamiliarSlots = stateAdapter.getPassiveFamiliarSlots() || [];
                const itemsInPassiveSlots = new Set([
                    ...passiveItemSlots.map(slot => slot.itemName).filter(Boolean),
                    ...passiveFamiliarSlots.map(slot => slot.itemName).filter(Boolean)
                ]);
                
                const equippedCountForType = stateAdapter.getEquippedItems()
                    .filter(item => item.type === itemToEquip.type && 
                           !itemsInPassiveSlots.has(item.name)).length;
                
                if (equippedCountForType < slotLimits[itemToEquip.type]) {
                    // Clear from passive slot first
                    if (slotType === 'item') {
                        stateAdapter.setPassiveSlotItem(slotId, null);
                    } else {
                        stateAdapter.setPassiveFamiliarSlotItem(slotId, null);
                    }
                    
                    // Then equip it
                    if (stateAdapter.moveInventoryItemToEquipped(updatedItemIndex)) {
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

            const slotLimits = uiModule.getSlotLimits(
                slotInputs.wearableSlotsInput,
                slotInputs.nonWearableSlotsInput,
                slotInputs.familiarSlotsInput
            );
            const equippedCountForType = stateAdapter.getEquippedItems().filter(item => item.type === itemToEquip.type).length;
            
            if (equippedCountForType < slotLimits[itemToEquip.type]) {
                if (stateAdapter.moveInventoryItemToEquipped(index)) {
                    // Clear this item from any passive slots if it was assigned
                    this.clearItemFromPassiveSlots(itemToEquip.name);
                    
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
                // Remove from equipped if it's there
                const equippedItems = stateAdapter.getEquippedItems();
                const equippedIndex = equippedItems.findIndex(item => item.name === itemToDisplay.name);
                if (equippedIndex !== -1) {
                    stateAdapter.removeEquippedItem(equippedIndex);
                }
                
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
                // Remove from equipped if it's there
                const equippedItems = stateAdapter.getEquippedItems();
                const equippedIndex = equippedItems.findIndex(item => item.name === familiarToAdopt.name);
                if (equippedIndex !== -1) {
                    stateAdapter.removeEquippedItem(equippedIndex);
                }
                
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
    clearItemFromPassiveSlots(itemName) {
        const { stateAdapter } = this;
        
        // Clear from passive item slots
        const passiveItemSlots = stateAdapter.getPassiveItemSlots() || [];
        passiveItemSlots.forEach(slot => {
            if (slot.itemName === itemName) {
                stateAdapter.setPassiveSlotItem(slot.slotId, null);
            }
        });
        
        // Clear from passive familiar slots
        const passiveFamiliarSlots = stateAdapter.getPassiveFamiliarSlots() || [];
        passiveFamiliarSlots.forEach(slot => {
            if (slot.itemName === itemName) {
                stateAdapter.setPassiveFamiliarSlotItem(slot.slotId, null);
            }
        });
    }
}

