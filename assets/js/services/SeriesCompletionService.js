/**
 * SeriesCompletionService - Handles claiming series completion (souvenir) rewards.
 *
 * When all books in a series are completed, the keeper can claim one reward from
 * the series completion rewards table (d10 roll). Reward is applied and the series
 * is marked as claimed.
 */

import { seriesCompletionRewards, allItems, temporaryBuffsFromRewards, getItem } from '../character-sheet/data.js';
import { STORAGE_KEYS } from '../character-sheet/storageKeys.js';

/**
 * Check if the keeper can claim the series completion reward (series is complete and not yet claimed).
 * @param {string} seriesId - Series ID
 * @param {Object} stateAdapter - StateAdapter instance
 * @returns {boolean}
 */
export function canClaimSeriesCompletionReward(seriesId, stateAdapter) {
    if (!seriesId || !stateAdapter) return false;
    if (stateAdapter.hasClaimedSeriesReward && stateAdapter.hasClaimedSeriesReward(seriesId)) return false;
    return stateAdapter.isSeriesComplete && stateAdapter.isSeriesComplete(seriesId);
}

/**
 * Get the series completion reward entry for a d10 roll (1-10).
 * @param {number} roll - Result of d10 roll (1-10)
 * @returns {Object|null} Reward entry { name, reward, hasLink?, link? } or null
 */
export function getSeriesCompletionRewardByRoll(roll) {
    const key = String(Math.min(10, Math.max(1, Math.floor(roll))));
    return seriesCompletionRewards[key] || null;
}

/**
 * Apply a series completion reward to character state.
 * Handles items (by link), currency (by known reward name), and buffs from temporaryBuffsFromRewards.
 * @param {Object} reward - Reward entry from getSeriesCompletionRewardByRoll
 * @param {Object} deps - { stateAdapter, updateCurrency }
 * @returns {Object} { applied: boolean, alreadyOwned?: boolean, rewardName: string, rewardText?: string }
 */
export function applySeriesCompletionReward(reward, deps) {
    const { stateAdapter, updateCurrency } = deps;
    if (!reward || typeof reward !== 'object') {
        return { applied: false, rewardName: '', rewardText: 'Invalid reward.' };
    }

    const name = reward.name;
    const rewardText = reward.reward || '';

    // Item from link: resolve by display name (link.text) or id (link.id); allItems may be keyed by name or id
    if (reward.hasLink && reward.link && reward.link.text) {
        const linkText = reward.link.text;
        const linkId = reward.link.id;
        const item = getItem(linkText) || (linkId && getItem(linkId)) || (allItems && allItems[linkText]);
        if (!item) {
            return { applied: false, rewardName: name, rewardText };
        }
        const itemName = item.name || linkText;
        const owned = stateAdapter.getOwnedItemNames ? stateAdapter.getOwnedItemNames() : new Set();
        if (owned.has(itemName)) {
            return { applied: false, alreadyOwned: true, rewardName: name, rewardText };
        }
        stateAdapter.addInventoryItem({ name: itemName, ...item });
        return { applied: true, rewardName: name, rewardText };
    }

    // Temporary buff (by reward name)
    const buffData = temporaryBuffsFromRewards && temporaryBuffsFromRewards[name];
    if (buffData) {
        let monthsRemaining = 0;
        if (buffData.duration === 'two-months') monthsRemaining = 2;
        else if (buffData.duration === 'until-end-month') monthsRemaining = 1;
        else if (buffData.duration === 'one-month') monthsRemaining = 1;
        stateAdapter.addTemporaryBuff({
            name: buffData.name,
            description: buffData.description || rewardText,
            duration: buffData.duration || 'one-month',
            monthsRemaining,
            status: 'active'
        });
        return { applied: true, rewardName: name, rewardText };
    }

    // Currency by known series souvenir name
    if (name === 'Series Souvenir: Bookmark') {
        if (updateCurrency) updateCurrency({ inkDrops: 50, paperScraps: 5 });
        return { applied: true, rewardName: name, rewardText };
    }
    if (name === 'Series Souvenir: Reading Journal') {
        if (updateCurrency) updateCurrency({ xp: 75 });
        return { applied: true, rewardName: name, rewardText };
    }
    if (name === 'Series Souvenir: Dust Jacket') {
        if (updateCurrency) updateCurrency({ inkDrops: 30, paperScraps: 10 });
        return { applied: true, rewardName: name, rewardText };
    }
    if (name === 'Series Souvenir: Signed Page') {
        if (updateCurrency) updateCurrency({ xp: 100 });
        return { applied: true, rewardName: name, rewardText };
    }
    if (name === 'Series Souvenir: Collector\'s Edition') {
        if (updateCurrency) updateCurrency({ inkDrops: 80, paperScraps: 15 });
        return { applied: true, rewardName: name, rewardText };
    }

    // "You may remove one Worn Page penalty" - remove one active curse if any
    if (name === 'Series Souvenir: Bookplate') {
        const activeCurses = stateAdapter.getActiveCurses ? stateAdapter.getActiveCurses() : [];
        if (activeCurses.length > 0 && stateAdapter.moveQuest) {
            stateAdapter.moveQuest(
                STORAGE_KEYS.ACTIVE_CURSES,
                0,
                STORAGE_KEYS.COMPLETED_CURSES,
                (q) => q
            );
        }
        return { applied: true, rewardName: name, rewardText };
    }

    // Page Keeper / Epilogue: add as temporary buffs if we have definitions; otherwise just record applied
    if (name === 'Series Souvenir: Page Keeper' || name === 'Series Souvenir: Epilogue') {
        // Buff not in temporaryBuffsFromRewards yet - apply as narrative only for now
        return { applied: true, rewardName: name, rewardText };
    }

    return { applied: true, rewardName: name, rewardText };
}

/**
 * Claim the series completion reward: mark series as claimed, roll d10, apply reward.
 * @param {string} seriesId - Series ID
 * @param {Object} stateAdapter - StateAdapter instance
 * @param {Object} deps - { updateCurrency } (and stateAdapter passed separately)
 * @param {number} [roll] - Optional d10 roll (1-10); if not provided, a random roll is used
 * @returns {Object} { claimed: boolean, reward?: Object, applied?: Object, error?: string }
 */
export function claimSeriesCompletionReward(seriesId, stateAdapter, deps, roll) {
    if (!canClaimSeriesCompletionReward(seriesId, stateAdapter)) {
        const alreadyClaimed = stateAdapter && typeof stateAdapter.hasClaimedSeriesReward === 'function' && stateAdapter.hasClaimedSeriesReward(seriesId);
        return {
            claimed: false,
            error: alreadyClaimed ? 'Already claimed.' : 'Series not complete.'
        };
    }
    const actualRoll = roll != null && roll >= 1 && roll <= 10
        ? Math.floor(Number(roll))
        : Math.floor(Math.random() * 10) + 1;
    const reward = getSeriesCompletionRewardByRoll(actualRoll);
    if (!reward) {
        return { claimed: false, error: 'Invalid roll.' };
    }
    stateAdapter.addClaimedSeriesReward(seriesId);
    const applied = applySeriesCompletionReward(reward, { stateAdapter, ...deps });
    return {
        claimed: true,
        reward: { name: reward.name, reward: reward.reward, hasLink: reward.hasLink, link: reward.link },
        applied
    };
}
