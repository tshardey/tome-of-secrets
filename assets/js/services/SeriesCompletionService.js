/**
 * SeriesCompletionService - Handles series completion and deterministic expedition advancement.
 *
 * When all books in a series are completed, the keeper can advance the shared expedition track
 * by one stop. Progress is global; each completed series advances the track once. Rewards are
 * applied in deterministic stop order via typed reward objects.
 */

import { seriesCompletionRewards, getItem } from '../character-sheet/data.js';
import { STORAGE_KEYS } from '../character-sheet/storageKeys.js';

/**
 * Normalize raw expedition data: ensure stops is an ordered array with id, order, name, story, position, reward.
 * Supports legacy shape (stops as object keyed "1".."10") and new shape (stops as array).
 * @returns {{ id?: string, name?: string, stops: Array<{ id: string, order: number, name: string, story: string, position: { x: number, y: number }, reward: object }> }}
 */
export function getSeriesExpedition() {
    const raw = seriesCompletionRewards;
    if (!raw || typeof raw !== 'object') {
        return { stops: [] };
    }
    let stops = raw.stops;
    if (Array.isArray(stops)) {
        stops = stops.map((s, i) => normalizeStop(s, i + 1));
    } else if (stops && typeof stops === 'object' && !Array.isArray(stops)) {
        stops = Object.keys(stops)
            .map(k => parseInt(k, 10))
            .filter(n => !isNaN(n) && n >= 1)
            .sort((a, b) => a - b)
            .map((order, i) => normalizeStop(stops[String(order)], order));
    } else {
        stops = [];
    }
    return {
        id: raw.id || raw.mapName,
        name: raw.name || 'Expedition',
        mapImage: raw.baseMapImage || raw.mapImage,
        coordinateSystem: raw.coordinateSystem,
        stops
    };
}

function normalizeStop(entry, order) {
    if (!entry || typeof entry !== 'object') {
        return { id: `stop-${order}`, order, name: '', story: '', position: { x: 0, y: 0 }, reward: { type: 'narrative', text: '' } };
    }
    const position = entry.position && typeof entry.position === 'object'
        ? { x: Number(entry.position.x) || 0, y: Number(entry.position.y) || 0 }
        : { x: Number(entry.x) || 0, y: Number(entry.y) || 0 };
    let reward = entry.reward;
    if (typeof reward === 'string') {
        reward = { type: 'narrative', text: reward };
    }
    if (!reward || typeof reward !== 'object') {
        reward = { type: 'narrative', text: '' };
    }
    return {
        id: entry.id || `stop-${order}`,
        order: typeof entry.order === 'number' ? entry.order : order,
        name: typeof entry.name === 'string' ? entry.name : `Stop ${order}`,
        story: typeof entry.story === 'string' ? entry.story : '',
        position,
        reward
    };
}

/**
 * Current expedition stop index (0-based). Equal to number of advances so far.
 * @param {Object} stateAdapter
 * @returns {number}
 */
export function getSeriesExpeditionStopIndex(stateAdapter) {
    if (!stateAdapter || typeof stateAdapter.getSeriesExpeditionProgress !== 'function') return 0;
    const progress = stateAdapter.getSeriesExpeditionProgress();
    return Array.isArray(progress) ? progress.length : 0;
}

/**
 * The stop the keeper has most recently reached (the last one earned), or null if none.
 * @param {Object} stateAdapter
 * @returns {Object|null} Normalized stop object or null
 */
export function getCurrentSeriesExpeditionStop(stateAdapter) {
    const expedition = getSeriesExpedition();
    const index = getSeriesExpeditionStopIndex(stateAdapter);
    if (index <= 0 || !expedition.stops.length) return null;
    return expedition.stops[index - 1] || null;
}

/**
 * The next stop the keeper will unlock when they advance (by completing a new series), or null if at end.
 * @param {Object} stateAdapter
 * @returns {Object|null} Normalized stop object or null
 */
export function getNextSeriesExpeditionStop(stateAdapter) {
    const expedition = getSeriesExpedition();
    const index = getSeriesExpeditionStopIndex(stateAdapter);
    if (index >= expedition.stops.length) return null;
    return expedition.stops[index] || null;
}

/**
 * Check if the keeper can advance the expedition with this series (series is complete and not yet counted).
 * @param {string} seriesId - Series ID
 * @param {Object} stateAdapter - StateAdapter instance
 * @returns {boolean}
 */
export function canClaimSeriesCompletionReward(seriesId, stateAdapter) {
    if (!seriesId || !stateAdapter) return false;
    if (stateAdapter.hasClaimedSeriesReward && stateAdapter.hasClaimedSeriesReward(seriesId)) return false;
    if (stateAdapter.hasSeriesAdvancedExpedition && stateAdapter.hasSeriesAdvancedExpedition(seriesId)) return false;
    return stateAdapter.isSeriesComplete && stateAdapter.isSeriesComplete(seriesId);
}

/**
 * Apply a typed expedition reward to character state.
 * @param {Object} reward - Reward object with type and type-specific fields
 * @param {Object} deps - { stateAdapter, updateCurrency }
 * @returns {{ applied: boolean, rewardText: string, alreadyOwned?: boolean }}
 */
export function applyTypedReward(reward, deps) {
    const { stateAdapter, updateCurrency } = deps || {};
    const text = (reward && typeof reward === 'object' && reward.text) ? reward.text : '';
    if (!reward || typeof reward !== 'object' || !reward.type) {
        return { applied: true, rewardText: text };
    }
    switch (reward.type) {
        case 'currency': {
            const xp = typeof reward.xp === 'number' ? reward.xp : 0;
            const inkDrops = typeof reward.inkDrops === 'number' ? reward.inkDrops : 0;
            const paperScraps = typeof reward.paperScraps === 'number' ? reward.paperScraps : 0;
            if (updateCurrency && (xp !== 0 || inkDrops !== 0 || paperScraps !== 0)) {
                updateCurrency({ xp, inkDrops, paperScraps });
            }
            return { applied: true, rewardText: text };
        }
        case 'item-slot-bonus': {
            const slotId = reward.slotId || `expedition-item-${Date.now()}`;
            if (stateAdapter && typeof stateAdapter.addPassiveItemSlot === 'function') {
                stateAdapter.addPassiveItemSlot(slotId, 'series-expedition');
            }
            return { applied: true, rewardText: text };
        }
        case 'familiar-slot-bonus': {
            const famSlotId = reward.slotId || `expedition-familiar-${Date.now()}`;
            if (stateAdapter && typeof stateAdapter.addPassiveFamiliarSlot === 'function') {
                stateAdapter.addPassiveFamiliarSlot(famSlotId, 'series-expedition');
            }
            return { applied: true, rewardText: text };
        }
        case 'curse-removal': {
            const activeCurses = stateAdapter && typeof stateAdapter.getActiveCurses === 'function' ? stateAdapter.getActiveCurses() : [];
            if (activeCurses.length > 0 && stateAdapter && typeof stateAdapter.moveQuest === 'function') {
                stateAdapter.moveQuest(
                    STORAGE_KEYS.ACTIVE_CURSES,
                    0,
                    STORAGE_KEYS.COMPLETED_CURSES,
                    (q) => q
                );
            }
            return { applied: true, rewardText: text };
        }
        case 'temporary-buff': {
            if (stateAdapter && reward.buffName && typeof stateAdapter.addTemporaryBuff === 'function') {
                const monthsRemaining = typeof reward.monthsRemaining === 'number' ? reward.monthsRemaining : 1;
                stateAdapter.addTemporaryBuff({
                    name: reward.buffName,
                    description: reward.description || text,
                    duration: reward.duration || 'one-month',
                    monthsRemaining,
                    status: 'active'
                });
            }
            return { applied: true, rewardText: text };
        }
        case 'passive-rule-modifier':
        case 'narrative':
        default:
            return { applied: true, rewardText: text };
    }
}

/**
 * Advance the expedition by one stop when the given series is newly complete. Applies the next stop's reward.
 * @param {string} seriesId - Series ID
 * @param {Object} stateAdapter - StateAdapter instance
 * @param {Object} deps - { updateCurrency }
 * @returns {{ advanced: boolean, stop?: Object, applied?: Object, error?: string }}
 */
export function advanceSeriesExpedition(seriesId, stateAdapter, deps) {
    if (!canClaimSeriesCompletionReward(seriesId, stateAdapter)) {
        const alreadyClaimed = stateAdapter && (
            (typeof stateAdapter.hasClaimedSeriesReward === 'function' && stateAdapter.hasClaimedSeriesReward(seriesId)) ||
            (typeof stateAdapter.hasSeriesAdvancedExpedition === 'function' && stateAdapter.hasSeriesAdvancedExpedition(seriesId))
        );
        return {
            advanced: false,
            error: alreadyClaimed ? 'Already claimed.' : 'Series not complete.'
        };
    }
    const nextStop = getNextSeriesExpeditionStop(stateAdapter);
    if (!nextStop) {
        return { advanced: false, error: 'Expedition complete; no further stops.' };
    }
    if (typeof stateAdapter.addSeriesExpeditionAdvance === 'function') {
        stateAdapter.addSeriesExpeditionAdvance(seriesId, nextStop.id);
    }
    if (typeof stateAdapter.addClaimedSeriesReward === 'function') {
        stateAdapter.addClaimedSeriesReward(seriesId);
    }
    const applied = applyTypedReward(nextStop.reward, { stateAdapter, ...deps });
    return {
        advanced: true,
        stop: nextStop,
        applied
    };
}

// --- Legacy compatibility: old roll-based API and claim entry point ---

/**
 * Get the series completion reward entry for a d10 roll (1-10). Legacy; expedition uses deterministic stops.
 * If expedition data has stops array, returns a synthetic entry for the stop at that index (1-based).
 * @param {number} roll - Result of d10 roll (1-10)
 * @returns {Object|null} Reward entry { name, reward, ... } or null
 */
export function getSeriesCompletionRewardByRoll(roll) {
    const expedition = getSeriesExpedition();
    if (expedition.stops.length > 0) {
        const index = Math.min(expedition.stops.length - 1, Math.max(0, Math.floor(Number(roll)) - 1));
        const stop = expedition.stops[index];
        if (stop) {
            const r = stop.reward || {};
            return {
                name: stop.name,
                reward: typeof r.text === 'string' ? r.text : '',
                hasLink: false,
                link: null,
                type: r.type,
                ...r
            };
        }
    }
    return null;
}

/**
 * Apply a series completion reward (legacy name-based or typed). Prefer applyTypedReward for expedition stops.
 * @param {Object} reward - Reward entry from getSeriesCompletionRewardByRoll or stop.reward
 * @param {Object} deps - { stateAdapter, updateCurrency }
 * @returns {{ applied: boolean, rewardName: string, rewardText?: string, alreadyOwned?: boolean }}
 */
export function applySeriesCompletionReward(reward, deps) {
    if (!reward || typeof reward !== 'object') {
        return { applied: false, rewardName: '', rewardText: 'Invalid reward.' };
    }
    if (reward.type && typeof reward.type === 'string') {
        const result = applyTypedReward(reward, deps);
        return {
            applied: result.applied,
            rewardName: reward.name || '',
            rewardText: result.rewardText,
            alreadyOwned: result.alreadyOwned
        };
    }
    const name = reward.name || '';
    const rewardText = reward.reward || '';
    return { applied: true, rewardName: name, rewardText };
}

/**
 * Claim the series completion reward: advance the expedition by one stop and apply the next stop's reward.
 * Replaces the old roll-and-claim flow with deterministic advancement.
 * @param {string} seriesId - Series ID
 * @param {Object} stateAdapter - StateAdapter instance
 * @param {Object} deps - { updateCurrency }
 * @param {number} [roll] - Ignored; kept for API compatibility
 * @returns {{ claimed: boolean, reward?: Object, applied?: Object, error?: string }}
 */
export function claimSeriesCompletionReward(seriesId, stateAdapter, deps, roll) {
    const result = advanceSeriesExpedition(seriesId, stateAdapter, deps);
    if (!result.advanced) {
        return {
            claimed: false,
            error: result.error
        };
    }
    const stop = result.stop;
    const applied = result.applied;
    return {
        claimed: true,
        reward: {
            name: stop.name,
            reward: (stop.reward && stop.reward.text) ? stop.reward.text : '',
            hasLink: false,
            link: null
        },
        applied: {
            applied: applied.applied,
            rewardName: stop.name,
            rewardText: applied.rewardText
        }
    };
}
