/**
 * RoomVisualizationService - Resolves which stickers to show in the room visualization
 * based on active atmospheric buffs and theme config.
 */

import { getRoomTheme, atmosphericBuffs } from '../character-sheet/data.js';
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
 * Get list of sticker configs for all currently active atmospheric buffs.
 * @param {Object} characterState - Full character state (or object with ATMOSPHERIC_BUFFS key)
 * @param {string} [themeId] - Room theme id (default: 'cozy-modern')
 * @param {{ keeperBackground?: string }} [options] - Optional; keeperBackground for Grove Tender
 * @returns {Array<Object>} Array of sticker configs for active buffs
 */
export function getActiveStickers(characterState, themeId = DEFAULT_THEME_ID, options = {}) {
    const theme = getRoomTheme(themeId);
    if (!theme || !theme.stickers) return [];

    const atmosphericBuffsState = characterState?.[STORAGE_KEYS.ATMOSPHERIC_BUFFS] || {};
    const keeperBackground = options.keeperBackground || '';

    const result = [];
    if (!atmosphericBuffs) return result;

    for (const buffName of Object.keys(atmosphericBuffs)) {
        if (!isAtmosphericBuffActiveForSticker(buffName, atmosphericBuffsState, keeperBackground)) {
            continue;
        }
        const stickerConfig = getStickerForBuff(buffName, themeId);
        if (stickerConfig) {
            result.push(stickerConfig);
        }
    }
    return result;
}
