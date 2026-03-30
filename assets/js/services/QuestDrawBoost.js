/**
 * Optional auto-apply for monthly quest-draw helpers: one helper consumed per deck click when enabled.
 * Master of Fates: +2 cards (3 draws total). Divination die helper: all pool decks (genre, side, dungeon, extra credit).
 */

/** Toast when Divination school die benefit is consumed via auto-apply. */
export const DIVINATION_DIE_HELPER_TOAST =
    'Monthly helper used: Divination — roll 2 dice for this Monthly Quest pick and choose which result to use (see school benefit).';

export function consumedHelperIsDivinationSchoolDie(helper) {
    return Boolean(helper && helper.sourceType === 'school' && helper.name === 'Divination');
}

import { buildQuestDrawHelperList } from '../character-sheet/questDrawHelperDiscovery.js';
import { STORAGE_KEYS } from '../character-sheet/storageKeys.js';
import * as dataModule from '../character-sheet/data.js';
import { parseIntOr } from '../utils/helpers.js';
import { TRIGGERS, effectTriggerIs } from './effectSchema.js';

export const QUEST_DECK_GENRE = 'genre';
export const QUEST_DECK_DUNGEON_ROOM = 'dungeon_room';
export const QUEST_DECK_SIDE = 'side';
export const QUEST_DECK_EXTRA_CREDIT = 'extra_credit';

const POOL_DECKS = new Set([
    QUEST_DECK_GENRE,
    QUEST_DECK_DUNGEON_ROOM,
    QUEST_DECK_SIDE,
    QUEST_DECK_EXTRA_CREDIT
]);

function findMasteryByName(name, catalog) {
    if (!name || !catalog) return null;
    if (catalog[name]) return catalog[name];
    return Object.values(catalog).find(a => a?.name === name || a?.id === name) || null;
}

function boostFromEffects(effects) {
    if (!Array.isArray(effects)) return null;
    for (const e of effects) {
        if (!effectTriggerIs(e?.trigger, TRIGGERS.ON_MONTH_START)) continue;
        const action = e?.modifier?.action;
        if (action === 'pull_extra_genre_quest') {
            return { kind: 'flicker_genre', totalDraws: 3, decks: new Set([QUEST_DECK_GENRE]) };
        }
        if (action === 'draw_extra_from_each_category') {
            return { kind: 'master_plus_one', decks: POOL_DECKS };
        }
        if (action === 'reroll_quest_die') {
            return { kind: 'divination_pool_die', decks: new Set(POOL_DECKS) };
        }
    }
    return null;
}

/**
 * Card-draw boost for a helper row, or null if this helper should not auto-consume on deck clicks.
 * @param {Object} helper - Row from buildQuestDrawHelperList
 * @param {Object} [catalogs] - Optional { masteryAbilities, schoolBenefits }; defaults to character-sheet data
 */
export function resolveQuestDrawCardBoost(helper, catalogs = {}) {
    const masteryAbilities = catalogs.masteryAbilities ?? dataModule.masteryAbilities ?? {};
    const schoolBenefits = catalogs.schoolBenefits ?? dataModule.schoolBenefits ?? {};

    if (helper.sourceType === 'ability') {
        const a = findMasteryByName(helper.name, masteryAbilities);
        return boostFromEffects(a?.effects);
    }
    if (helper.sourceType === 'school') {
        const entry = schoolBenefits[helper.name];
        const fromFx = boostFromEffects(entry?.effects);
        if (fromFx) return fromFx;
    }

    const t = ((helper.effectPlain ?? helper.effect) || '').toLowerCase();
    if (
        (t.includes('roll 2 dice') || t.includes('roll two dice')) &&
        t.includes('monthly quest')
    ) {
        return { kind: 'divination_pool_die', decks: new Set(POOL_DECKS) };
    }
    if (t.includes('draw two additional cards') && t.includes('monthly quest pool')) {
        return { kind: 'master_plus_one', decks: POOL_DECKS };
    }
    if ((t.includes('pull 3') || t.includes('three genre')) && t.includes('genre')) {
        return { kind: 'flicker_genre', totalDraws: 3, decks: new Set([QUEST_DECK_GENRE]) };
    }
    return null;
}

/** Sort auto-apply: wider deck coverage first; same width → Master before Divination before Flicker on narrow. */
const AUTO_APPLY_KIND_PRIORITY = Object.freeze({
    master_plus_one: 0,
    flicker_genre: 1,
    divination_pool_die: 2
});

function compareAutoApplyCandidates(a, b) {
    const wa = a.boost.decks.size;
    const wb = b.boost.decks.size;
    if (wb !== wa) return wb - wa;
    const ra = AUTO_APPLY_KIND_PRIORITY[a.boost.kind] ?? 1;
    const rb = AUTO_APPLY_KIND_PRIORITY[b.boost.kind] ?? 1;
    return ra - rb;
}

function entryAllowsUse(helper, helperState) {
    if (helper.cadence === 'always') return false;
    const entry = helperState[helper.sourceId];
    if (entry?.used) return false;
    if (helper.cadence === 'every-2-months' && (entry?.cooldownCyclesRemaining ?? 0) > 0) {
        return false;
    }
    return true;
}

function buildCatalogsOverride(overrides = {}) {
    const temp = { ...(dataModule.temporaryBuffs || {}), ...(dataModule.temporaryBuffsFromRewards || {}) };
    return {
        allItems: overrides.allItems ?? dataModule.allItems ?? {},
        temporaryBuffs: overrides.temporaryBuffs ?? temp,
        masteryAbilities: overrides.masteryAbilities ?? dataModule.masteryAbilities ?? {},
        schoolBenefits: overrides.schoolBenefits ?? dataModule.schoolBenefits ?? {},
        seriesExpedition: overrides.seriesExpedition ?? dataModule.seriesCompletionRewards ?? {},
        permanentBonuses: overrides.permanentBonuses ?? dataModule.permanentBonuses ?? {}
    };
}

/**
 * How many cards/slots to draw this deck click; may mark one helper used when auto-apply is on.
 * @param {import('../character-sheet/stateAdapter.js').StateAdapter} stateAdapter
 * @param {'genre'|'dungeon_room'|'side'|'extra_credit'} deckKey
 * @param {{ school?: string, level?: number, catalogs?: Object }} [options]
 * @returns {{ drawCount: number, consumedHelper: Object|null }}
 */
export function computeQuestDeckDrawCount(stateAdapter, deckKey, options = {}) {
    const settings = stateAdapter.getQuestDrawHelperSettings?.() || { autoApplyOnDraw: false };
    const school =
        options.school ??
        (typeof document !== 'undefined' ? document.getElementById('wizardSchool')?.value : '') ??
        '';
    const level =
        options.level ??
        parseIntOr(
            typeof document !== 'undefined' ? document.getElementById('level')?.value : null,
            1
        );
    const catalogs = buildCatalogsOverride(options.catalogs);

    if (!settings.autoApplyOnDraw) {
        return { drawCount: 1, consumedHelper: null };
    }

    const helpers = buildQuestDrawHelperList(stateAdapter.state, catalogs, { school, level });
    const helperState = stateAdapter.getQuestDrawHelperState();

    const candidates = [];
    for (const h of helpers) {
        if (!entryAllowsUse(h, helperState)) continue;
        const boost = resolveQuestDrawCardBoost(h, catalogs);
        if (!boost || !boost.decks?.has(deckKey)) continue;
        candidates.push({ h, boost });
    }

    // Prefer pool-wide helpers first; among same width, Flicker/card boosts before Divination die helper.
    candidates.sort(compareAutoApplyCandidates);

    for (const { h, boost } of candidates) {
        const ok = stateAdapter.markQuestDrawHelperUsed(h.sourceId, { cadence: h.cadence });
        if (!ok) continue;

        let drawCount = 1;
        if (boost.kind === 'flicker_genre') {
            drawCount = Math.max(1, boost.totalDraws || 3);
        } else if (boost.kind === 'master_plus_one') {
            // Benefit: draw two *additional* cards (1 baseline pool draw + 2 extras).
            drawCount = 3;
        } else if (boost.kind === 'divination_pool_die') {
            drawCount = 1;
        }
        return { drawCount, consumedHelper: h };
    }

    return { drawCount: 1, consumedHelper: null };
}
