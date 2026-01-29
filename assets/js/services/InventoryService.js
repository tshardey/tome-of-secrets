/**
 * InventoryService - Handles item hydration and inventory-related logic
 */

import * as data from '../character-sheet/data.js';

/**
 * Hydrate item object with canonical data from allItems
 * Ensures items have all required fields, fixes older saved inventory entries
 * @param {Object} item - Item object from state
 * @returns {Object} Hydrated item with all canonical fields
 */
export function hydrateItem(item) {
    if (!item || !item.name) return item;
    
    const canonical = data.allItems[item.name];
    if (canonical) {
        return { ...item, ...canonical, name: item.name };
    }
    
    // Case-insensitive fallback
    const key = Object.keys(data.allItems).find(
        k => k.toLowerCase() === String(item.name).toLowerCase()
    );
    if (key) {
        return { ...item, ...data.allItems[key], name: item.name };
    }
    
    return item;
}

/**
 * Get items currently in passive slots
 * @param {Array} passiveItemSlots - Array of passive item slots
 * @param {Array} passiveFamiliarSlots - Array of passive familiar slots
 * @returns {Set<string>} Set of item names in passive slots
 */
export function getItemsInPassiveSlots(passiveItemSlots = [], passiveFamiliarSlots = []) {
    const itemsInPassiveSlots = new Set([
        ...passiveItemSlots.map(slot => slot.itemName).filter(Boolean),
        ...passiveFamiliarSlots.map(slot => slot.itemName).filter(Boolean)
    ]);
    return itemsInPassiveSlots;
}

/**
 * Filter equipped items to exclude those in passive slots
 * This is a view-level filter (StateAdapter should enforce invariants)
 * @param {Array} equippedItems - Array of equipped items
 * @param {Set<string>} itemsInPassiveSlots - Set of item names in passive slots
 * @returns {Array} Filtered array of equipped items
 */
export function filterEquippedItems(equippedItems = [], itemsInPassiveSlots = new Set()) {
    return equippedItems.filter(item => !itemsInPassiveSlots.has(item.name));
}

/**
 * Filter inventory items to exclude those in passive slots
 * @param {Array} inventoryItems - Array of inventory items
 * @param {Set<string>} itemsInPassiveSlots - Set of item names in passive slots
 * @returns {Array} Filtered array of inventory items
 */
export function filterInventoryItems(inventoryItems = [], itemsInPassiveSlots = new Set()) {
    return inventoryItems.filter(item => !itemsInPassiveSlots.has(item.name));
}

/**
 * Count equipped items by type
 * @param {Array} equippedItems - Array of equipped items
 * @returns {Object} Object with counts for each type
 */
export function countEquippedItemsByType(equippedItems = []) {
    const counts = { 'Wearable': 0, 'Non-Wearable': 0, 'Familiar': 0 };
    equippedItems.forEach(item => {
        if (item.type && counts.hasOwnProperty(item.type)) {
            counts[item.type]++;
        }
    });
    return counts;
}

