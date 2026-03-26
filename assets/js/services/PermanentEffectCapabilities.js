/**
 * PermanentEffectCapabilities — typed resolution of keeper permanent effects.
 *
 * Single derived layer for level-based passives, school benefits, learned mastery
 * abilities, and series expedition progress. Gameplay code should prefer this module
 * over parsing prose from JSON display fields.
 *
 * @see project-docs/permanent-effects-osm-context.md
 */

import { masteryAbilities } from '../character-sheet/data.js';
import { getSeriesExpedition } from './SeriesCompletionService.js';

/** @typedef {'auto_apply' | 'helper_manual' | 'workflow' | 'informational' | 'applied_in_codepath'} EffectDisposition */

export const DISPOSITION = Object.freeze({
    AUTO_APPLY: 'auto_apply',
    HELPER_MANUAL: 'helper_manual',
    WORKFLOW: 'workflow',
    INFORMATIONAL: 'informational',
    APPLIED_IN_CODEPATH: 'applied_in_codepath'
});

/** Mastery ability `id` values from assets/data/masteryAbilities.json */
export const MASTERY_ABILITY_ID = Object.freeze({
    WARD_AGAINST_THE_SHROUD: 'ward-against-the-shroud',
    GRAND_DISPELLING: 'grand-dispelling',
    FLICKER_OF_PROPHECY: 'flicker-of-prophecy',
    MASTER_OF_FATES: 'master-of-fates',
    QUICK_SHOT: 'quick-shot',
    CONCUSSIVE_BLAST: 'concussive-blast',
    SILVER_TONGUE: 'silver-tongue',
    IRRESISTIBLE_CHARM: 'irresistible-charm',
    EMPOWERED_BOND: 'empowered-bond',
    ECHO_CHAMBER: 'echo-chamber',
    ALCHEMIC_FOCUS: 'alchemic-focus',
    PHILOSOPHERS_STONE: 'philosophers-stone'
});

const LEVEL = Object.freeze({
    ATMOSPHERIC_FORECASTER: 3,
    NOVICES_FOCUS: 6,
    FOCUSED_ATMOSPHERE: 7,
    INSIGHTFUL_DRAW: 9
});

/**
 * @param {unknown} school
 * @returns {string|null}
 */
function normalizeSchool(school) {
    if (school === undefined || school === null) return null;
    const s = String(school).trim();
    return s.length ? s : null;
}

/**
 * Expedition stops reached: advancement is sequential; progress length equals stops claimed.
 * @param {{ seriesId?: string, stopId?: string, claimedAt?: string }[]} progress
 * @returns {Array<{ id: string, order: number, reward: object }>}
 */
export function getReachedExpeditionStops(progress) {
    const expedition = getSeriesExpedition();
    const stops = expedition.stops || [];
    const n = Array.isArray(progress) ? progress.length : 0;
    if (n <= 0 || !stops.length) return [];
    const cap = Math.min(n, stops.length);
    return stops.slice(0, cap);
}

/**
 * Whether the expedition passive "series books grant +15 Ink (was +10)" applies when completing
 * a book in the given series. Uses per-series progress entries plus global stop-7 unlock:
 * - A series that claimed stop-7 ({ stopId: 'stop-7' }) qualifies.
 * - If that series has enough expedition advances that the sliced stop list includes stop-7, qualifies.
 * - If the global track has reached stop-7 and this series has at least one advance, qualifies
 *   (so all participating series benefit once the passive is unlocked on the map).
 *
 * @param {{ seriesId?: string, stopId?: string, claimedAt?: string }[]} expeditionProgress
 * @param {string} seriesId - Archive series id (e.g. from getSeriesForBook(bookId).id)
 * @returns {boolean}
 */
export function hasSeriesBookInkBonusForSeriesId(expeditionProgress, seriesId) {
    if (!seriesId || typeof seriesId !== 'string' || !Array.isArray(expeditionProgress)) return false;

    const globalReached = getReachedExpeditionStops(expeditionProgress);
    const globalHasStop7 = globalReached.some(s => s && s.id === 'stop-7');

    const forSeries = expeditionProgress.filter(p => p && p.seriesId === seriesId);
    if (forSeries.some(p => p.stopId === 'stop-7')) return true;

    const reachedFromSeriesLength = getReachedExpeditionStops(forSeries);
    if (reachedFromSeriesLength.some(s => s && s.id === 'stop-7')) return true;

    return globalHasStop7 && forSeries.length > 0;
}

/**
 * @param {string[]} learnedAbilityNames - As stored in state (object keys in masteryAbilities)
 * @returns {Set<string>} ability ids
 */
export function learnedAbilityNamesToIds(learnedAbilityNames) {
    const ids = new Set();
    if (!Array.isArray(learnedAbilityNames)) return ids;
    for (const name of learnedAbilityNames) {
        if (typeof name !== 'string') continue;
        const entry = masteryAbilities[name];
        if (entry && typeof entry.id === 'string') ids.add(entry.id);
    }
    return ids;
}

function hasLearned(learnedIds, id) {
    return learnedIds.has(id);
}

/**
 * @typedef {Object} PermanentEffectCapabilityInput
 * @property {number|string} [level] - Keeper level (from character sheet form)
 * @property {string|null|undefined} [school] - Wizard school display name, e.g. "Conjuration"
 * @property {string[]} [learnedAbilities] - Learned mastery ability names (state shape)
 * @property {{ seriesId?: string, stopId?: string, claimedAt?: string }[]} [seriesExpeditionProgress]
 */

/**
 * Derive structured permanent-effect capabilities for reward math, helpers, and UX.
 *
 * @param {PermanentEffectCapabilityInput} input
 * @returns {Object} Frozen-shaped result (mutable plain object for test assertions)
 */
export function resolvePermanentEffectCapabilities(input) {
    const rawLevel = input && input.level !== undefined && input.level !== null ? Number(input.level) : 1;
    const level = Number.isFinite(rawLevel) ? Math.max(1, Math.floor(rawLevel)) : 1;
    const school = normalizeSchool(input && input.school);
    const learnedNames = input && Array.isArray(input.learnedAbilities) ? input.learnedAbilities : [];
    const expeditionProgress = input && Array.isArray(input.seriesExpeditionProgress)
        ? input.seriesExpeditionProgress
        : [];

    const learnedIds = learnedAbilityNamesToIds(learnedNames);
    const reachedStops = getReachedExpeditionStops(expeditionProgress);
    const reachedStopIds = new Set(reachedStops.map(s => s.id).filter(Boolean));

    const dispositions = {};

    const setDisp = (key, disposition) => {
        dispositions[key] = disposition;
    };

    // --- Level (permanentBonuses.json thresholds) ---
    const hasAtmosphericForecaster = level >= LEVEL.ATMOSPHERIC_FORECASTER;
    const hasNovicesFocus = level >= LEVEL.NOVICES_FOCUS;
    const hasFocusedAtmosphere = level >= LEVEL.FOCUSED_ATMOSPHERE;
    const hasInsightfulDraw = level >= LEVEL.INSIGHTFUL_DRAW;

    setDisp('level.atmospheric_forecaster', DISPOSITION.HELPER_MANUAL);
    setDisp('level.novices_focus', DISPOSITION.AUTO_APPLY);
    setDisp('level.focused_atmosphere', DISPOSITION.AUTO_APPLY);
    setDisp('level.insightful_draw', DISPOSITION.HELPER_MANUAL);

    // --- School (single selected school) ---
    const schoolEnchantmentBefriendXp = school === 'Enchantment';
    const schoolConjurationFamiliarInk = school === 'Conjuration';

    setDisp('school.abjuration.worn_page_choice', DISPOSITION.HELPER_MANUAL);
    setDisp('school.divination.double_monthly_quest_roll', DISPOSITION.HELPER_MANUAL);
    setDisp('school.evocation.dungeon_short_read', DISPOSITION.WORKFLOW);
    setDisp('school.enchantment.befriend_xp_multiplier', DISPOSITION.APPLIED_IN_CODEPATH);
    setDisp('school.conjuration.familiar_slot_quest_ink', DISPOSITION.AUTO_APPLY);
    setDisp('school.transmutation.monthly_currency_exchange', DISPOSITION.WORKFLOW);

    // --- Mastery abilities ---
    const mastery = {
        wardAgainstTheShroud: hasLearned(learnedIds, MASTERY_ABILITY_ID.WARD_AGAINST_THE_SHROUD),
        grandDispelling: hasLearned(learnedIds, MASTERY_ABILITY_ID.GRAND_DISPELLING),
        flickerOfProphecy: hasLearned(learnedIds, MASTERY_ABILITY_ID.FLICKER_OF_PROPHECY),
        masterOfFates: hasLearned(learnedIds, MASTERY_ABILITY_ID.MASTER_OF_FATES),
        quickShot: hasLearned(learnedIds, MASTERY_ABILITY_ID.QUICK_SHOT),
        concussiveBlast: hasLearned(learnedIds, MASTERY_ABILITY_ID.CONCUSSIVE_BLAST),
        silverTongue: hasLearned(learnedIds, MASTERY_ABILITY_ID.SILVER_TONGUE),
        irresistibleCharm: hasLearned(learnedIds, MASTERY_ABILITY_ID.IRRESISTIBLE_CHARM),
        empoweredBond: hasLearned(learnedIds, MASTERY_ABILITY_ID.EMPOWERED_BOND),
        echoChamber: hasLearned(learnedIds, MASTERY_ABILITY_ID.ECHO_CHAMBER),
        alchemicFocus: hasLearned(learnedIds, MASTERY_ABILITY_ID.ALCHEMIC_FOCUS),
        philosophersStone: hasLearned(learnedIds, MASTERY_ABILITY_ID.PHILOSOPHERS_STONE)
    };

    setDisp('mastery.ward_against_the_shroud', DISPOSITION.HELPER_MANUAL);
    setDisp('mastery.grand_dispelling', DISPOSITION.HELPER_MANUAL);
    setDisp('mastery.flicker_of_prophecy', DISPOSITION.HELPER_MANUAL);
    setDisp('mastery.master_of_fates', DISPOSITION.HELPER_MANUAL);
    setDisp('mastery.quick_shot', DISPOSITION.WORKFLOW);
    setDisp('mastery.concussive_blast', DISPOSITION.WORKFLOW);
    setDisp('mastery.silver_tongue', DISPOSITION.AUTO_APPLY);
    setDisp('mastery.irresistible_charm', DISPOSITION.WORKFLOW);
    setDisp('mastery.empowered_bond', DISPOSITION.AUTO_APPLY);
    setDisp('mastery.echo_chamber', DISPOSITION.AUTO_APPLY);
    setDisp('mastery.alchemic_focus', DISPOSITION.WORKFLOW);
    setDisp('mastery.philosophers_stone', DISPOSITION.WORKFLOW);

    // --- Expedition (series completion track) ---
    const hasOrganizeTheStacksBonus = reachedStopIds.has('stop-2');
    const hasJournalPaperBonus = reachedStopIds.has('stop-5');
    const hasSeriesBookInkBonus = reachedStopIds.has('stop-7');
    const hasShroudMitigationOncePerMonth = reachedStopIds.has('stop-8');
    const hasDungeonRoomXpBonus = reachedStopIds.has('stop-10');

    setDisp('expedition.stop_2.organize_the_stacks_xp', DISPOSITION.AUTO_APPLY);
    setDisp('expedition.stop_5.adventure_journal_paper', DISPOSITION.AUTO_APPLY);
    setDisp('expedition.stop_7.series_book_ink', DISPOSITION.AUTO_APPLY);
    setDisp('expedition.stop_8.shroud_or_spoon_ignore', DISPOSITION.HELPER_MANUAL);
    setDisp('expedition.stop_10.familiar_slot', DISPOSITION.APPLIED_IN_CODEPATH);
    setDisp('expedition.stop_10.dungeon_room_xp', DISPOSITION.AUTO_APPLY);

    // Numeric hints for RewardCalculator / future wiring (0 = inactive)
    const rewardModifiers = {
        /** +5 XP per completed book with pages >= 300 (Novice's Focus) */
        longBookCompletionBonusXp: hasNovicesFocus ? 5 : 0,
        /** Added to each positive atmospheric ink drop bonus (Focused Atmosphere) */
        atmosphericPositiveInkDropBonusAdd: hasFocusedAtmosphere ? 1 : 0,
        /** Extra paper scraps per side quest (Silver Tongue) */
        sideQuestPaperScrapsBonus: mastery.silverTongue ? 5 : 0,
        /** Extra ink when completing a quest with familiar equipped (Conjuration school) */
        questCompletionFamiliarEquippedInkBonus: schoolConjurationFamiliarInk ? 5 : 0,
        /** Flat add to familiar roll reward (Empowered Bond) */
        familiarRewardFlatBonus: mastery.empoweredBond ? 5 : 0,
        /** Override base XP for ♥ Organize the Stacks when expedition stop 2 reached; null = use table default */
        organizeTheStacksBaseXp: hasOrganizeTheStacksBonus ? 20 : null,
        /** Override paper for Adventure Journal entries; null = use default */
        adventureJournalPaperScraps: hasJournalPaperBonus ? 10 : null,
        /** Ink per book read for a series; null = use default */
        seriesBookInkDropsPerBook: hasSeriesBookInkBonus ? 15 : null,
        /** Added to each dungeon room XP reward (expedition stop 10 text bundle) */
        dungeonRoomXpPerRoomAdd: hasDungeonRoomXpBonus ? 10 : 0
    };

    const slotModifiers = {
        extraFamiliarSlotsFromEchoChamber: mastery.echoChamber ? 1 : 0
    };

    const flags = {
        level: {
            atmosphericForecasterUnlocked: hasAtmosphericForecaster,
            novicesFocusUnlocked: hasNovicesFocus,
            focusedAtmosphereUnlocked: hasFocusedAtmosphere,
            insightfulDrawUnlocked: hasInsightfulDraw
        },
        school: {
            selected: school,
            enchantmentBefriendXpMultiplierActive: schoolEnchantmentBefriendXp,
            conjurationFamiliarInkBonusActive: schoolConjurationFamiliarInk
        },
        mastery,
        expedition: {
            advanceCount: expeditionProgress.length,
            reachedStopIds: [...reachedStopIds],
            hasOrganizeTheStacksBonus,
            hasJournalPaperBonus,
            hasSeriesBookInkBonus,
            hasShroudMitigationOncePerMonth,
            hasDungeonRoomXpBonus
        },
        helpers: {
            /** Quest / atmospheric draw helpers */
            canUseAtmosphericForecaster: hasAtmosphericForecaster,
            canUseInsightfulDraw: hasInsightfulDraw,
            canUseMasterOfFates: mastery.masterOfFates,
            canUseFlickerOfProphecy: mastery.flickerOfProphecy,
            /** Curse / worn page helpers */
            canUseWardAgainstTheShroud: mastery.wardAgainstTheShroud,
            canUseGrandDispelling: mastery.grandDispelling,
            canIgnoreOneShroudOrSpoonPerMonth: hasShroudMitigationOncePerMonth
        }
    };

    return {
        version: 1,
        inputs: {
            level,
            school,
            learnedAbilityIds: Array.from(learnedIds),
            expeditionAdvanceCount: expeditionProgress.length
        },
        dispositions,
        rewardModifiers,
        slotModifiers,
        flags
    };
}

/**
 * Convenience: resolve from StateAdapter + form snapshot (level/school are form-backed).
 *
 * @param {{ getLearnedAbilities?: () => string[], getSeriesExpeditionProgress?: () => object[] }} stateAdapter
 * @param {{ level?: number|string, school?: string|null }} formSnapshot
 */
export function resolvePermanentEffectCapabilitiesFromAdapter(stateAdapter, formSnapshot) {
    const learned = stateAdapter && typeof stateAdapter.getLearnedAbilities === 'function'
        ? stateAdapter.getLearnedAbilities()
        : [];
    const progress = stateAdapter && typeof stateAdapter.getSeriesExpeditionProgress === 'function'
        ? stateAdapter.getSeriesExpeditionProgress()
        : [];
    return resolvePermanentEffectCapabilities({
        level: formSnapshot && formSnapshot.level,
        school: formSnapshot && formSnapshot.school,
        learnedAbilities: learned,
        seriesExpeditionProgress: progress
    });
}