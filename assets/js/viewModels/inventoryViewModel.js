/**
 * InventoryViewModel - Creates view model for inventory/loadout rendering
 * 
 * Transforms state + services into UI-ready data structure.
 * All calculations and business logic happen here, not in UI functions.
 */

import * as data from '../character-sheet/data.js';
import { resolvePermanentEffectCapabilities } from '../services/PermanentEffectCapabilities.js';
import { 
    getSlotLimits, 
    calculateExpectedTotalSlots, 
    calculateUnallocatedSlots 
} from '../services/SlotService.js';
import { 
    hydrateItem, 
    getItemsInPassiveSlots, 
    filterEquippedItems, 
    filterInventoryItems,
    countEquippedItemsByType 
} from '../services/InventoryService.js';
import { STORAGE_KEYS } from '../character-sheet/storageKeys.js';
import { parseIntOr } from '../utils/helpers.js';

/**
 * Create view model for inventory/loadout rendering
 * @param {Object} state - Character state object
 * @param {Object} formData - Form data (for level and slot inputs)
 * @param {HTMLInputElement} wearableSlotsInput - Wearable slots input element
 * @param {HTMLInputElement} nonWearableSlotsInput - Non-wearable slots input element
 * @param {HTMLInputElement} familiarSlotsInput - Familiar slots input element
 * @returns {Object} View model with all data needed for rendering
 */
export function createInventoryViewModel(state, formData, wearableSlotsInput, nonWearableSlotsInput, familiarSlotsInput) {
    // Calculate slot limits from form inputs
    const slotLimits = getSlotLimits(wearableSlotsInput, nonWearableSlotsInput, familiarSlotsInput);
    
    // Get passive slots
    const passiveItemSlots = state[STORAGE_KEYS.PASSIVE_ITEM_SLOTS] || [];
    const passiveFamiliarSlots = state[STORAGE_KEYS.PASSIVE_FAMILIAR_SLOTS] || [];
    
    // Get items in passive slots (for filtering)
    const itemsInPassiveSlots = getItemsInPassiveSlots(passiveItemSlots, passiveFamiliarSlots);
    
    // Get equipped and inventory items
    const rawEquippedItems = state[STORAGE_KEYS.EQUIPPED_ITEMS] || [];
    const rawInventoryItems = state[STORAGE_KEYS.INVENTORY_ITEMS] || [];
    
    // Filter out items in passive slots
    const equippedItems = filterEquippedItems(rawEquippedItems, itemsInPassiveSlots);
    const inventoryItems = filterInventoryItems(rawInventoryItems, itemsInPassiveSlots);
    
    // Hydrate items with canonical data
    const hydratedEquippedItems = equippedItems.map(item => hydrateItem(item));
    const hydratedInventoryItems = inventoryItems.map(item => hydrateItem(item));
    
    // Count equipped items by type
    const equippedCounts = countEquippedItemsByType(equippedItems);
    
    // Get equipped item names for checking button visibility
    const equippedItemNames = new Set(rawEquippedItems.map(item => item.name));
    
    // Check if there are available passive slots
    const hasAvailableItemSlots = passiveItemSlots.some(slot => !slot.itemName);
    const hasAvailableFamiliarSlots = passiveFamiliarSlots.some(slot => !slot.itemName);
    
    // Calculate expected and unallocated slots (Echo Chamber: +1 familiar slot toward allocation budget)
    const currentLevel = parseIntOr(formData?.level, 1);
    const learnedAbilities = state[STORAGE_KEYS.LEARNED_ABILITIES] || [];
    const expeditionProgress = state[STORAGE_KEYS.SERIES_EXPEDITION_PROGRESS] || [];
    const school = typeof formData?.school === 'string' && formData.school.trim()
        ? formData.school.trim()
        : null;
    const perm = resolvePermanentEffectCapabilities({
        level: currentLevel,
        school,
        learnedAbilities,
        seriesExpeditionProgress: expeditionProgress
    });
    const echoExtra = perm.slotModifiers.extraFamiliarSlotsFromEchoChamber || 0;
    const expectedTotalSlots = calculateExpectedTotalSlots(currentLevel) + echoExtra;
    const unallocatedSlots = calculateUnallocatedSlots(slotLimits.total, expectedTotalSlots);
    
    return {
        // Items data
        equippedItems: hydratedEquippedItems,
        inventoryItems: hydratedInventoryItems,
        
        // Slot data
        slotLimits,
        equippedCounts,
        passiveItemSlots,
        passiveFamiliarSlots,
        
        // Button visibility flags
        equippedItemNames,
        hasAvailableItemSlots,
        hasAvailableFamiliarSlots,
        
        // Slot warnings
        expectedTotalSlots,
        unallocatedSlots,
        
        // Metadata
        totalEquippedSlots: rawEquippedItems.length,
        totalInventoryItems: hydratedInventoryItems.length
    };
}

