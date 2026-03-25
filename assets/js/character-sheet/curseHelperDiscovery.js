/**
 * Curse tab mitigation helper discovery (Worn Page, monthly Shroud/Spoon ignores): allowlist matching and cadence detection.
 * Centralizes logic for identifying mitigation text and stable source-ID generation.
 */

import { STORAGE_KEYS } from './storageKeys.js';

/** Substrings that indicate Worn Page mitigation (avoid false positives like "Worn Page curse"). */
const WORN_PAGE_MITIGATION_PHRASES = Object.freeze([
    'remove a Worn Page penalty',
    'remove one Worn Page penalty',
    'remove up to two Worn Page penalties',
    'Remove all active Worn Page penalties',
    'negate it', // "when you would gain a Worn Page penalty... you may choose to completely negate it"
    'immune to Worn Page penalties',
    'Worn Page penalty, you may instead', // school: draw a card instead of gaining penalty
]);

/**
 * Returns true if the given text describes a Worn Page mitigation effect.
 * @param {string} text - Benefit, description, or reward text
 * @returns {boolean}
 */
export function isWornPageMitigation(text) {
    if (!text || typeof text !== 'string') return false;
    const t = text.trim();
    if (!t.includes('Worn Page')) return false;
    return WORN_PAGE_MITIGATION_PHRASES.some(phrase => t.includes(phrase));
}

/**
 * Text eligible for the Curse tab mitigation helper list: Worn Page effects plus
 * monthly Shroud / Spoon ignores (e.g. series expedition passive) that do not use "Worn Page" wording.
 * @param {string} text
 * @returns {boolean}
 */
export function isCurseMitigationHelperText(text) {
    if (isWornPageMitigation(text)) return true;
    if (!text || typeof text !== 'string') return false;
    const t = text.trim().toLowerCase();
    if (!t.includes('once per month')) return false;
    if (t.includes('ignore any single shroud penalty')) return true;
    if (t.includes('shroud penalty') && t.includes('spoon loss')) return true;
    return false;
}

/**
 * Infer cadence from text.
 * @param {string} text
 * @returns {'monthly'|'every-2-months'|'one-time'}
 */
export function getCadenceFromText(text) {
    if (!text || typeof text !== 'string') return 'one-time';
    const t = text.toLowerCase();
    if (t.includes('once every 2 months') || t.includes('every 2 months')) return 'every-2-months';
    if (t.includes('once per month')) return 'monthly';
    return 'one-time';
}

/**
 * Build a stable source ID for a helper (sourceType + slot mode + identifier).
 * @param {string} sourceType - 'item' | 'tempBuff' | 'ability' | 'school' | 'seriesExpedition'
 * @param {string} [slotMode] - 'equipped' | 'inventory' | 'passiveItem' | 'passiveFamiliar' (for items)
 * @param {string} identifier - Unique part (e.g. index:name, slotId:name, or just name)
 * @returns {string}
 */
export function buildSourceId(sourceType, slotMode, identifier) {
    const parts = [sourceType];
    if (slotMode) parts.push(slotMode);
    const safe = String(identifier ?? '').replace(/\|/g, '_').replace(/:/g, '_');
    parts.push(safe);
    return parts.join(':');
}

/**
 * Normalize expedition stops to an array. Handles raw seriesCompletionRewards shape.
 * @param {{ stops?: unknown }} raw
 * @returns {Array<{ id: string, name: string, reward: { type?: string, text?: string } }>}
 */
function getExpeditionStops(raw) {
    if (!raw || typeof raw !== 'object') return [];
    let stops = raw.stops;
    if (Array.isArray(stops)) {
        return stops.map(s => ({
            id: s?.id ?? '',
            name: s?.name ?? '',
            reward: s?.reward && typeof s.reward === 'object' ? s.reward : { type: 'narrative', text: '' }
        }));
    }
    if (stops && typeof stops === 'object' && !Array.isArray(stops)) {
        const keys = Object.keys(stops)
            .map(k => parseInt(k, 10))
            .filter(n => !isNaN(n) && n >= 1)
            .sort((a, b) => a - b);
        return keys.map(order => {
            const s = stops[String(order)];
            return {
                id: s?.id ?? `stop-${order}`,
                name: s?.name ?? `Stop ${order}`,
                reward: s?.reward && typeof s.reward === 'object' ? s.reward : { type: 'narrative', text: '' }
            };
        });
    }
    return [];
}

/**
 * @param {Object} base - Helper row without img
 * @param {{ img?: string } | null | undefined} source - Catalog object that may carry `img`
 * @returns {Object}
 */
function withOptionalImg(base, source) {
    const img = source?.img;
    if (img && typeof img === 'string' && img.trim()) {
        return { ...base, img: img.trim() };
    }
    return base;
}

/**
 * Build the current list of curse mitigation helpers (Worn Page, Shroud, Spoon) from character state and data catalogs.
 * Each helper has: sourceId, sourceType, slotMode (optional), name, effect, cadence, and optional img for items/buffs.
 * @param {Object} state - Character state (from StateAdapter)
 * @param {Object} catalogs - Data: { allItems, temporaryBuffs, masteryAbilities, schoolBenefits, seriesExpedition }
 * @param {{ school?: string }} [options] - Optional: current wizard school (from DOM)
 * @returns {Array<{ sourceId: string, sourceType: string, slotMode?: string, name: string, effect: string, cadence: 'monthly'|'every-2-months'|'one-time', img?: string }>}
 */
export function buildCurseHelperList(state, catalogs, options = {}) {
    const out = [];
    const { allItems = {}, temporaryBuffs = {}, masteryAbilities = {}, schoolBenefits = {}, seriesExpedition } = catalogs;
    const { school } = options;

    // ---- Items: equipped ----
    const equipped = state[STORAGE_KEYS.EQUIPPED_ITEMS];
    if (Array.isArray(equipped)) {
        equipped.forEach((entry, index) => {
            const name = entry?.name ?? entry;
            const item = typeof name === 'string' ? (allItems[name] ?? Object.values(allItems).find(i => i?.name === name)) : null;
            if (!item) return;
            const bonus = item.bonus;
            if (bonus && isCurseMitigationHelperText(bonus)) {
                out.push(withOptionalImg({
                    sourceId: buildSourceId('item', 'equipped', `${index}|${item.name ?? name}`),
                    sourceType: 'item',
                    slotMode: 'equipped',
                    name: item.name ?? name,
                    effect: bonus,
                    cadence: getCadenceFromText(bonus)
                }, item));
            }
        });
    }

    // ---- Items: inventory ----
    const inventory = state[STORAGE_KEYS.INVENTORY_ITEMS];
    if (Array.isArray(inventory)) {
        inventory.forEach((entry, index) => {
            const name = entry?.name ?? entry;
            const item = typeof name === 'string' ? (allItems[name] ?? Object.values(allItems).find(i => i?.name === name)) : null;
            if (!item) return;
            const bonus = item.bonus;
            if (bonus && isCurseMitigationHelperText(bonus)) {
                out.push(withOptionalImg({
                    sourceId: buildSourceId('item', 'inventory', `${index}|${item.name ?? name}`),
                    sourceType: 'item',
                    slotMode: 'inventory',
                    name: item.name ?? name,
                    effect: bonus,
                    cadence: getCadenceFromText(bonus)
                }, item));
            }
        });
    }

    // ---- Items: passive item slots ----
    const passiveItemSlots = state[STORAGE_KEYS.PASSIVE_ITEM_SLOTS];
    if (Array.isArray(passiveItemSlots)) {
        passiveItemSlots.forEach(slot => {
            const itemName = slot?.itemName;
            if (!itemName) return;
            const item = allItems[itemName] ?? Object.values(allItems).find(i => i?.name === itemName);
            if (!item) return;
            const passiveBonus = item.passiveBonus;
            if (passiveBonus && isCurseMitigationHelperText(passiveBonus)) {
                const slotId = slot?.slotId ?? 'unknown';
                out.push(withOptionalImg({
                    sourceId: buildSourceId('item', 'passiveItem', `${slotId}|${item.name ?? itemName}`),
                    sourceType: 'item',
                    slotMode: 'passiveItem',
                    name: item.name ?? itemName,
                    effect: passiveBonus,
                    cadence: getCadenceFromText(passiveBonus)
                }, item));
            }
        });
    }

    // ---- Items: passive familiar slots ----
    const passiveFamiliarSlots = state[STORAGE_KEYS.PASSIVE_FAMILIAR_SLOTS];
    if (Array.isArray(passiveFamiliarSlots)) {
        passiveFamiliarSlots.forEach(slot => {
            const itemName = slot?.itemName;
            if (!itemName) return;
            const item = allItems[itemName] ?? Object.values(allItems).find(i => i?.name === itemName);
            if (!item) return;
            const passiveBonus = item.passiveBonus;
            if (passiveBonus && isCurseMitigationHelperText(passiveBonus)) {
                const slotId = slot?.slotId ?? 'unknown';
                out.push(withOptionalImg({
                    sourceId: buildSourceId('item', 'passiveFamiliar', `${slotId}|${item.name ?? itemName}`),
                    sourceType: 'item',
                    slotMode: 'passiveFamiliar',
                    name: item.name ?? itemName,
                    effect: passiveBonus,
                    cadence: getCadenceFromText(passiveBonus)
                }, item));
            }
        });
    }

    // ---- Temporary buffs ----
    const tempBuffs = state[STORAGE_KEYS.TEMPORARY_BUFFS];
    if (Array.isArray(tempBuffs)) {
        tempBuffs.forEach((entry, index) => {
            const name = entry?.name ?? entry?.id ?? `Buff ${index}`;
            const catalogBuff = temporaryBuffs[name] ?? Object.values(temporaryBuffs).find(b => b?.name === name || b?.id === name);
            const description = catalogBuff?.description ?? entry?.description;
            if (description && isCurseMitigationHelperText(description)) {
                out.push(withOptionalImg({
                    sourceId: buildSourceId('tempBuff', null, `${index}|${name}`),
                    sourceType: 'tempBuff',
                    name: catalogBuff?.name ?? name,
                    effect: description,
                    cadence: getCadenceFromText(description)
                }, catalogBuff));
            }
        });
    }

    // ---- Learned mastery abilities ----
    const learned = state[STORAGE_KEYS.LEARNED_ABILITIES];
    if (Array.isArray(learned)) {
        learned.forEach(abilityName => {
            const ability = masteryAbilities[abilityName] ?? Object.values(masteryAbilities).find(a => a?.name === abilityName);
            if (!ability) return;
            const benefit = ability.benefit;
            if (benefit && isCurseMitigationHelperText(benefit)) {
                out.push({
                    sourceId: buildSourceId('ability', null, ability.name ?? abilityName),
                    sourceType: 'ability',
                    name: ability.name ?? abilityName,
                    effect: benefit,
                    cadence: getCadenceFromText(benefit)
                });
            }
        });
    }

    // ---- School passive ----
    if (school && schoolBenefits[school]) {
        const benefit = schoolBenefits[school].benefit;
        if (benefit && isCurseMitigationHelperText(benefit)) {
            out.push({
                sourceId: buildSourceId('school', null, school),
                sourceType: 'school',
                name: school,
                effect: benefit,
                cadence: getCadenceFromText(benefit)
            });
        }
    }

    // ---- Series expedition passive-rule-modifier stops ----
    const progress = state[STORAGE_KEYS.SERIES_EXPEDITION_PROGRESS];
    const claimedCount = Array.isArray(progress) ? progress.length : 0;
    const stops = getExpeditionStops(seriesExpedition);
    stops.slice(0, claimedCount).forEach(stop => {
        const reward = stop.reward;
        if (reward?.type !== 'passive-rule-modifier') return;
        const text = reward?.text ?? '';
        if (text && isCurseMitigationHelperText(text)) {
            out.push({
                sourceId: buildSourceId('seriesExpedition', null, `${stop.id}|${stop.name}`),
                sourceType: 'seriesExpedition',
                name: stop.name || stop.id,
                effect: text,
                cadence: getCadenceFromText(text)
            });
        }
    });

    return out;
}
