/**
 * Monthly quest-draw / dice helper discovery: allowlist matching and cadence classification.
 * Mirrors curse helper inventory scans; uses stable IDs from curseHelperDiscovery.
 */

import { STORAGE_KEYS } from './storageKeys.js';
import { buildSourceId, getCadenceFromText } from './curseHelperDiscovery.js';

/** Lowercase substrings — avoid bare "monthly quest pool" (e.g. Alchemic Focus "outside of your…"). */
const QUEST_DRAW_HELPER_PHRASES_LC = Object.freeze([
    'before drawing your monthly quest pool',
    'when drawing your monthly quest pool',
    'establishing your monthly quest pool',
    'drawing your monthly quest pool',
    'roll 2 dice instead of 1 for a monthly quest',
    'rolling a d6 for a genre quest',
    'draw two additional cards',
    're-roll a prompt or a die roll',
    'choose one: reroll a prompt',
    'switch the genre of any quest you roll',
    'switch a genre-based quest to its opposing genre',
    'genre quest to its opposing genre (passive)'
]);

/**
 * Strip simple HTML tags for matching / display (permanent level bonuses).
 * @param {string} html
 * @returns {string}
 */
export function stripSimpleHtml(html) {
    if (!html || typeof html !== 'string') return '';
    return html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

function isExcludedWornPageAlternateDraw(lowered) {
    return lowered.includes('worn page') && lowered.includes('instead') && lowered.includes('draw a card');
}

/**
 * @param {string} text - Plain text (strip HTML for permanent bonuses first)
 * @returns {boolean}
 */
export function isQuestDrawHelperText(text) {
    if (!text || typeof text !== 'string') return false;
    const t = text.trim().toLowerCase();
    if (!t || isExcludedWornPageAlternateDraw(t)) return false;
    return QUEST_DRAW_HELPER_PHRASES_LC.some(phrase => t.includes(phrase));
}

/**
 * @param {string} plainText
 * @param {{ sourceType?: string }} [meta]
 * @returns {'monthly'|'every-2-months'|'one-time'|'always'}
 */
export function classifyQuestDrawCadence(plainText, meta = {}) {
    const t = plainText || '';
    const lower = t.toLowerCase();
    const sourceType = meta.sourceType;

    if (lower.includes('rolling a d6 for a genre quest')) return 'always';

    if (lower.includes('draw one extra quest card') && lower.includes('monthly quest pool')) {
        return 'always';
    }

    const fromText = getCadenceFromText(t);
    if (fromText === 'monthly' || fromText === 'every-2-months') return fromText;

    if (sourceType === 'permanentBonus') {
        if (
            lower.includes('before drawing your monthly quest pool') ||
            lower.includes('atmospheric forecaster')
        ) {
            return 'monthly';
        }
        if (lower.includes('insightful draw')) return 'always';
    }

    return fromText;
}

/**
 * Normalize expedition stops (same shape as curseHelperDiscovery).
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

function pushHelper(out, fields) {
    const plainEffect = fields.effectPlain ?? fields.effect;
    const cadence = classifyQuestDrawCadence(plainEffect, { sourceType: fields.sourceType });
    out.push({
        sourceId: fields.sourceId,
        sourceType: fields.sourceType,
        slotMode: fields.slotMode,
        name: fields.name,
        effect: fields.effectDisplay ?? plainEffect,
        cadence
    });
}

/**
 * @param {Object} state
 * @param {Object} catalogs - { allItems, temporaryBuffs, masteryAbilities, schoolBenefits, seriesExpedition, permanentBonuses }
 * @param {{ school?: string, level?: number }} [options]
 * @returns {Array<{ sourceId: string, sourceType: string, slotMode?: string, name: string, effect: string, cadence: string }>}
 */
export function buildQuestDrawHelperList(state, catalogs, options = {}) {
    const out = [];
    const {
        allItems = {},
        temporaryBuffs = {},
        masteryAbilities = {},
        schoolBenefits = {},
        seriesExpedition,
        permanentBonuses = {}
    } = catalogs;
    const { school } = options;
    const level = typeof options.level === 'number' && !isNaN(options.level) ? Math.max(1, Math.floor(options.level)) : 1;

    const equipped = state[STORAGE_KEYS.EQUIPPED_ITEMS];
    if (Array.isArray(equipped)) {
        equipped.forEach((entry, index) => {
            const name = entry?.name ?? entry;
            const item = typeof name === 'string' ? (allItems[name] ?? Object.values(allItems).find(i => i?.name === name)) : null;
            if (!item) return;
            const bonus = item.bonus;
            if (bonus && isQuestDrawHelperText(bonus)) {
                pushHelper(out, {
                    sourceId: buildSourceId('item', 'equipped', `${index}|${item.name ?? name}`),
                    sourceType: 'item',
                    slotMode: 'equipped',
                    name: item.name ?? name,
                    effect: bonus,
                    effectPlain: bonus
                });
            }
        });
    }

    const inventory = state[STORAGE_KEYS.INVENTORY_ITEMS];
    if (Array.isArray(inventory)) {
        inventory.forEach((entry, index) => {
            const name = entry?.name ?? entry;
            const item = typeof name === 'string' ? (allItems[name] ?? Object.values(allItems).find(i => i?.name === name)) : null;
            if (!item) return;
            const bonus = item.bonus;
            if (bonus && isQuestDrawHelperText(bonus)) {
                pushHelper(out, {
                    sourceId: buildSourceId('item', 'inventory', `${index}|${item.name ?? name}`),
                    sourceType: 'item',
                    slotMode: 'inventory',
                    name: item.name ?? name,
                    effect: bonus,
                    effectPlain: bonus
                });
            }
        });
    }

    const passiveItemSlots = state[STORAGE_KEYS.PASSIVE_ITEM_SLOTS];
    if (Array.isArray(passiveItemSlots)) {
        passiveItemSlots.forEach(slot => {
            const itemName = slot?.itemName;
            if (!itemName) return;
            const item = allItems[itemName] ?? Object.values(allItems).find(i => i?.name === itemName);
            if (!item) return;
            const passiveBonus = item.passiveBonus;
            if (passiveBonus && isQuestDrawHelperText(passiveBonus)) {
                const slotId = slot?.slotId ?? 'unknown';
                pushHelper(out, {
                    sourceId: buildSourceId('item', 'passiveItem', `${slotId}|${item.name ?? itemName}`),
                    sourceType: 'item',
                    slotMode: 'passiveItem',
                    name: item.name ?? itemName,
                    effect: passiveBonus,
                    effectPlain: passiveBonus
                });
            }
        });
    }

    const passiveFamiliarSlots = state[STORAGE_KEYS.PASSIVE_FAMILIAR_SLOTS];
    if (Array.isArray(passiveFamiliarSlots)) {
        passiveFamiliarSlots.forEach(slot => {
            const itemName = slot?.itemName;
            if (!itemName) return;
            const item = allItems[itemName] ?? Object.values(allItems).find(i => i?.name === itemName);
            if (!item) return;
            const passiveBonus = item.passiveBonus;
            if (passiveBonus && isQuestDrawHelperText(passiveBonus)) {
                const slotId = slot?.slotId ?? 'unknown';
                pushHelper(out, {
                    sourceId: buildSourceId('item', 'passiveFamiliar', `${slotId}|${item.name ?? itemName}`),
                    sourceType: 'item',
                    slotMode: 'passiveFamiliar',
                    name: item.name ?? itemName,
                    effect: passiveBonus,
                    effectPlain: passiveBonus
                });
            }
        });
    }

    const tempBuffs = state[STORAGE_KEYS.TEMPORARY_BUFFS];
    if (Array.isArray(tempBuffs)) {
        tempBuffs.forEach((entry, index) => {
            const name = entry?.name ?? entry?.id ?? `Buff ${index}`;
            const catalogBuff = temporaryBuffs[name] ?? Object.values(temporaryBuffs).find(b => b?.name === name || b?.id === name);
            const description = catalogBuff?.description ?? entry?.description;
            if (description && isQuestDrawHelperText(description)) {
                pushHelper(out, {
                    sourceId: buildSourceId('tempBuff', null, `${index}|${name}`),
                    sourceType: 'tempBuff',
                    name: catalogBuff?.name ?? name,
                    effect: description,
                    effectPlain: description
                });
            }
        });
    }

    const learned = state[STORAGE_KEYS.LEARNED_ABILITIES];
    if (Array.isArray(learned)) {
        learned.forEach(abilityName => {
            const ability = masteryAbilities[abilityName] ?? Object.values(masteryAbilities).find(a => a?.name === abilityName);
            if (!ability) return;
            const benefit = ability.benefit;
            if (benefit && isQuestDrawHelperText(benefit)) {
                pushHelper(out, {
                    sourceId: buildSourceId('ability', null, ability.name ?? abilityName),
                    sourceType: 'ability',
                    name: ability.name ?? abilityName,
                    effect: benefit,
                    effectPlain: benefit
                });
            }
        });
    }

    if (school && schoolBenefits[school]) {
        const benefit = schoolBenefits[school].benefit;
        if (benefit && isQuestDrawHelperText(benefit)) {
            pushHelper(out, {
                sourceId: buildSourceId('school', null, school),
                sourceType: 'school',
                name: school,
                effect: benefit,
                effectPlain: benefit
            });
        }
    }

    const progress = state[STORAGE_KEYS.SERIES_EXPEDITION_PROGRESS];
    const claimedCount = Array.isArray(progress) ? progress.length : 0;
    const stops = getExpeditionStops(seriesExpedition);
    stops.slice(0, claimedCount).forEach(stop => {
        const reward = stop.reward;
        if (reward?.type !== 'passive-rule-modifier') return;
        const text = reward?.text ?? '';
        if (text && isQuestDrawHelperText(text)) {
            pushHelper(out, {
                sourceId: buildSourceId('seriesExpedition', null, `${stop.id}|${stop.name}`),
                sourceType: 'seriesExpedition',
                name: stop.name || stop.id,
                effect: text,
                effectPlain: text
            });
        }
    });

    for (let L = 1; L <= level; L += 1) {
        const rawHtml = permanentBonuses[String(L)];
        if (!rawHtml || typeof rawHtml !== 'string') continue;
        const plain = stripSimpleHtml(rawHtml);
        if (!isQuestDrawHelperText(plain)) continue;
        pushHelper(out, {
            sourceId: buildSourceId('permanentBonus', null, `level-${L}`),
            sourceType: 'permanentBonus',
            name: `Level ${L} bonus`,
            effect: plain,
            effectPlain: plain,
            effectDisplay: plain
        });
    }

    return out;
}
