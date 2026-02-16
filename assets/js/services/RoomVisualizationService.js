/**
 * RoomVisualizationService - Resolves which stickers to show in the room visualization
 * based on active atmospheric buffs and theme config.
 */

import { getRoomTheme, atmosphericBuffs, allItems } from '../character-sheet/data.js';
import { STORAGE_KEYS } from '../character-sheet/storageKeys.js';
import { isGroveTenderBuff } from './AtmosphericBuffService.js';

const DEFAULT_THEME_ID = 'cozy-modern';

/**
 * Check if an atmospheric buff is active for sticker display (including Grove Tender always-on).
 * @param {string} buffName - Atmospheric buff name
 * @param {Object} atmosphericBuffsState - State slice: atmospheric buffs from character state
 * @param {string} [keeperBackground] - Keeper background key (e.g. 'groveTender')
 * @returns {boolean}
 */
export function isAtmosphericBuffActiveForSticker(buffName, atmosphericBuffsState, keeperBackground = '') {
    if (isGroveTenderBuff(buffName, keeperBackground)) {
        return true;
    }
    if (!atmosphericBuffsState || typeof atmosphericBuffsState !== 'object') {
        return false;
    }
    const buff = atmosphericBuffsState[buffName];
    return !!(buff && buff.isActive === true);
}

/**
 * Get layer config for a single buff in a theme (or null if no layer).
 * @param {string} buffName - Display name of the atmospheric buff (e.g. 'The Candlight Study')
 * @param {string} [themeId] - Room theme id (default: 'cozy-modern')
 * @returns {Object|null} Layer config { slug, image } or null (layers stack full-bleed, no positioning)
 */
export function getStickerForBuff(buffName, themeId = DEFAULT_THEME_ID) {
    const theme = getRoomTheme(themeId);
    if (!theme || !theme.stickers) return null;

    const buffData = atmosphericBuffs[buffName];
    const stickerSlug = buffData?.stickerSlug;
    if (!stickerSlug) return null;

    const sticker = theme.stickers[stickerSlug];
    if (!sticker) return null;

    const imagePath = typeof sticker === 'string' ? sticker : sticker?.image;
    if (!imagePath) return null;

    return { slug: stickerSlug, image: imagePath };
}

/**
 * Get item names that are equipped or in display (passive) slots.
 * @param {Object} characterState - Full character state
 * @returns {Array<string>} Item names
 */
function getEquippedOrDisplayedItemNames(characterState) {
    const names = [];
    const equipped = characterState?.[STORAGE_KEYS.EQUIPPED_ITEMS];
    if (Array.isArray(equipped)) {
        equipped.forEach((item) => { if (item?.name) names.push(item.name); });
    }
    const passiveItems = characterState?.[STORAGE_KEYS.PASSIVE_ITEM_SLOTS] || [];
    passiveItems.forEach((slot) => { if (slot?.itemName) names.push(slot.itemName); });
    const passiveFamiliars = characterState?.[STORAGE_KEYS.PASSIVE_FAMILIAR_SLOTS] || [];
    passiveFamiliars.forEach((slot) => { if (slot?.itemName) names.push(slot.itemName); });
    return names;
}

/**
 * Get list of sticker configs for all currently active atmospheric buffs and for
 * equipped/displayed atmospheric reward items (e.g. Tome-Bound Cat, Garden Gnome).
 * @param {Object} characterState - Full character state (or object with ATMOSPHERIC_BUFFS key)
 * @param {string} [themeId] - Room theme id (default: 'cozy-modern')
 * @param {{ keeperBackground?: string }} [options] - Optional; keeperBackground for Grove Tender
 * @returns {Array<Object>} Array of sticker configs for active buffs and items
 */
export function getActiveStickers(characterState, themeId = DEFAULT_THEME_ID, options = {}) {
    const theme = getRoomTheme(themeId);
    if (!theme || !theme.stickers) return [];

    const atmosphericBuffsState = characterState?.[STORAGE_KEYS.ATMOSPHERIC_BUFFS] || {};
    const keeperBackground = options.keeperBackground || '';

    const result = [];
    if (atmosphericBuffs) {
        for (const buffName of Object.keys(atmosphericBuffs)) {
            if (!isAtmosphericBuffActiveForSticker(buffName, atmosphericBuffsState, keeperBackground)) {
                continue;
            }
            const stickerConfig = getStickerForBuff(buffName, themeId);
            if (stickerConfig) {
                result.push(stickerConfig);
            }
        }
    }

    // Add stickers for equipped/displayed atmospheric reward items
    const itemNames = getEquippedOrDisplayedItemNames(characterState);
    for (const itemName of itemNames) {
        const itemData = allItems?.[itemName];
        if (!itemData?.atmosphericReward || !itemData?.atmosphericStickerSlug) continue;
        const sticker = theme.stickers[itemData.atmosphericStickerSlug];
        if (!sticker) continue;
        const imagePath = typeof sticker === 'object' && sticker !== null ? sticker.image : sticker;
        if (!imagePath) continue;
        result.push({ slug: itemData.atmosphericStickerSlug, image: imagePath });
    }

    return result;
}