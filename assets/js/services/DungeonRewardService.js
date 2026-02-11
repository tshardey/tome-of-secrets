/**
 * DungeonRewardService - Handles claiming room rewards for completed dungeon rooms
 *
 * Phase 3.1: Make dungeon room rewards claimable.
 * Claim = scroll to Dungeon Completion Rewards; user rolls d20 and reward is applied.
 */

import { dungeonRooms, dungeonCompletionRewards, allItems, temporaryBuffs, temporaryBuffsFromRewards } from '../character-sheet/data.js';

/**
 * Check if a dungeon room is completed (challenge + at least one encounter)
 * Pure function: same logic as table-renderer checkDungeonRoomCompletion
 * @param {string} roomNumber - Room number (e.g. "1", "2")
 * @param {Array} completedQuests - Completed quest objects
 * @param {Object} rooms - Dungeon rooms data (defaults to dungeonRooms)
 * @returns {Object} { isCompleted: boolean, completedEncounters: Set<string>, challengeCompleted: boolean }
 */
export function checkRoomCompletion(roomNumber, completedQuests, rooms = dungeonRooms) {
    const completedEncounters = new Set();
    let challengeCompleted = false;
    const room = rooms[roomNumber];
    if (!room) return { isCompleted: false, completedEncounters, challengeCompleted };

    for (const quest of completedQuests) {
        if (quest.type !== '♠ Dungeon Crawl') continue;

        if (quest.roomNumber === roomNumber) {
            if (quest.isEncounter === false) {
                challengeCompleted = true;
            } else if (quest.isEncounter === true && quest.encounterName) {
                completedEncounters.add(quest.encounterName);
            }
        }

        const canUseFallback = !quest.roomNumber || quest.roomNumber === roomNumber;

        if (canUseFallback && !challengeCompleted && quest.prompt === room.challenge) {
            challengeCompleted = true;
        }

        if (canUseFallback && room.encounters) {
            for (const encounterName in room.encounters) {
                const encounterData = room.encounters[encounterName];
                if (encounterData.defeat && quest.prompt === encounterData.defeat) {
                    completedEncounters.add(encounterName);
                }
                if (encounterData.befriend && quest.prompt === encounterData.befriend) {
                    completedEncounters.add(encounterName);
                }
            }
        }

        if (canUseFallback && room.encountersDetailed) {
            for (const encounter of room.encountersDetailed) {
                if (encounter.defeat && quest.prompt && quest.prompt.includes(encounter.name) && quest.prompt.includes(encounter.defeat)) {
                    completedEncounters.add(encounter.name);
                }
                if (encounter.befriend && quest.prompt && quest.prompt.includes(encounter.name) && quest.prompt.includes(encounter.befriend)) {
                    completedEncounters.add(encounter.name);
                }
            }
        }
    }

    const isCompleted = challengeCompleted && completedEncounters.size > 0;
    return { isCompleted, completedEncounters, challengeCompleted };
}

/**
 * Whether the room reward can be claimed (room completed and not already claimed)
 * @param {string} roomNumber - Room number
 * @param {Array} completedQuests - Completed quest objects
 * @param {Array<string>} claimedRoomRewards - List of room numbers already claimed
 * @param {Object} [rooms] - Dungeon rooms data
 * @returns {boolean}
 */
export function canClaimRoomReward(roomNumber, completedQuests, claimedRoomRewards, rooms = dungeonRooms) {
    const roomStr = String(roomNumber);
    if (claimedRoomRewards && claimedRoomRewards.includes(roomStr)) {
        return false;
    }
    const { isCompleted } = checkRoomCompletion(roomStr, completedQuests || [], rooms);
    return isCompleted;
}

/**
 * Get the room rewards object for a room (for applying to character state)
 * @param {string} roomNumber - Room number
 * @param {Object} [rooms] - Dungeon rooms data
 * @returns {Object|null} { xp, inkDrops, paperScraps, items } or null if no rewards
 */
export function getRoomRewardsForClaim(roomNumber, rooms = dungeonRooms) {
    const room = rooms[String(roomNumber)];
    if (!room || !room.roomRewards) return null;
    const r = room.roomRewards;
    return {
        xp: r.xp || 0,
        inkDrops: r.inkDrops || 0,
        paperScraps: r.paperScraps || 0,
        items: Array.isArray(r.items) ? r.items : []
    };
}

/**
 * Get the dungeon completion reward entry for a d20 roll (1-20)
 * @param {number} roll - Result of d20 roll (1-20)
 * @returns {Object|null} Reward entry { name, reward, hasLink?, link? } or null
 */
export function getDungeonCompletionRewardByRoll(roll) {
    const key = String(Math.min(20, Math.max(1, Math.floor(roll))));
    return dungeonCompletionRewards[key] || null;
}

/**
 * Get card image path for a dungeon completion reward (from Rewards section / allItems)
 * @param {Object} reward - Reward entry from getDungeonCompletionRewardByRoll
 * @returns {string|null} Image path or null if no image
 */
export function getDungeonCompletionRewardCardImage(reward) {
    if (!reward) return null;
    if (reward.hasLink && reward.link && reward.link.text && allItems && allItems[reward.link.text] && allItems[reward.link.text].img) {
        return allItems[reward.link.text].img;
    }
    return null;
}

/**
 * Apply a dungeon completion reward (from d20 roll) to character state.
 * Handles items (inventory), temporary buffs, and currency (XP, ink, paper, blueprints).
 * Skips adding items already in inventory.
 * @param {number} roll - d20 roll result (1-20)
 * @param {Object} deps - { stateAdapter, updateCurrency }
 * @returns {Object} { applied: boolean, alreadyOwned?: boolean, rewardName: string, rewardText?: string }
 */
export function applyDungeonCompletionReward(roll, deps) {
    const { stateAdapter, updateCurrency } = deps;
    const reward = getDungeonCompletionRewardByRoll(roll);
    if (!reward) {
        return { applied: false, rewardName: '', rewardText: 'Invalid roll.' };
    }

    const name = reward.name;
    const rewardText = reward.reward || '';

    // Item from link (e.g. "You find a Chalice of Restoration") - skip if already owned (inventory, equipped, or passive)
    if (reward.hasLink && reward.link && reward.link.text) {
        const itemName = reward.link.text;
        if (allItems && allItems[itemName]) {
            const owned = stateAdapter.getOwnedItemNames ? stateAdapter.getOwnedItemNames() : new Set();
            if (owned.has(itemName)) {
                return { applied: false, alreadyOwned: true, rewardName: name, rewardText };
            }
            stateAdapter.addInventoryItem({ name: itemName, ...allItems[itemName] });
            return { applied: true, rewardName: name, rewardText };
        }
    }

    // Temporary buff (by reward name)
    const buffData = (temporaryBuffs && temporaryBuffs[name]) || (temporaryBuffsFromRewards && temporaryBuffsFromRewards[name]);
    if (buffData) {
        let monthsRemaining = 0;
        if (buffData.duration === 'two-months') monthsRemaining = 2;
        else if (buffData.duration === 'until-end-month') monthsRemaining = 1;
        stateAdapter.addTemporaryBuff({
            name: buffData.name,
            description: buffData.description,
            duration: buffData.duration,
            monthsRemaining,
            status: 'active'
        });
        return { applied: true, rewardName: name, rewardText };
    }

    // Currency / one-off rewards
    if (name === "The Librarian's Hoard") {
        if (updateCurrency) updateCurrency({ inkDrops: 150, paperScraps: 20 });
        return { applied: true, rewardName: name, rewardText };
    }
    if (name === "Keeper's Blessing") {
        if (updateCurrency) updateCurrency({ xp: 200 });
        if (stateAdapter.addDustyBlueprints) stateAdapter.addDustyBlueprints(50);
        return { applied: true, rewardName: name, rewardText };
    }

    // Fallback: try item by name (skip if already owned)
    if (allItems && allItems[name]) {
        const owned = stateAdapter.getOwnedItemNames ? stateAdapter.getOwnedItemNames() : new Set();
        if (owned.has(name)) {
            return { applied: false, alreadyOwned: true, rewardName: name, rewardText };
        }
        stateAdapter.addInventoryItem({ name, ...allItems[name] });
        return { applied: true, rewardName: name, rewardText };
    }

    return { applied: true, rewardName: name, rewardText };
}
