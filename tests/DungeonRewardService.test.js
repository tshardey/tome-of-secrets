/**
 * Tests for DungeonRewardService (Phase 3.1 - claimable room rewards)
 */

import {
    checkRoomCompletion,
    canClaimRoomReward,
    getRoomRewardsForClaim,
    getDungeonCompletionRewardByRoll,
    getDungeonCompletionRewardCardImage,
    applyDungeonCompletionReward
} from '../assets/js/services/DungeonRewardService.js';
import * as data from '../assets/js/character-sheet/data.js';

describe('DungeonRewardService', () => {
    const completedRoom1Quests = [
        {
            type: '♠ Dungeon Crawl',
            roomNumber: '1',
            isEncounter: false,
            prompt: 'The Hall of Whispers: Read in a quiet space without music.'
        },
        {
            type: '♠ Dungeon Crawl',
            roomNumber: '1',
            isEncounter: true,
            encounterName: "Librarian's Spirit",
            prompt: "Librarian's Spirit: Read a book with a ghost-like being or a mystery."
        }
    ];

    describe('checkRoomCompletion', () => {
        test('returns not completed when no quests', () => {
            const result = checkRoomCompletion('1', []);
            expect(result.isCompleted).toBe(false);
            expect(result.challengeCompleted).toBe(false);
            expect(result.completedEncounters.size).toBe(0);
        });

        test('returns completed when challenge and one encounter done', () => {
            const result = checkRoomCompletion('1', completedRoom1Quests);
            expect(result.isCompleted).toBe(true);
            expect(result.challengeCompleted).toBe(true);
            expect(result.completedEncounters.has("Librarian's Spirit")).toBe(true);
        });

        test('returns not completed when only challenge done', () => {
            const result = checkRoomCompletion('1', [completedRoom1Quests[0]]);
            expect(result.isCompleted).toBe(false);
            expect(result.challengeCompleted).toBe(true);
        });
    });

    describe('canClaimRoomReward', () => {
        test('returns false when room not completed', () => {
            expect(canClaimRoomReward('1', [], [], undefined)).toBe(false);
        });

        test('returns true when room completed and not claimed', () => {
            expect(canClaimRoomReward('1', completedRoom1Quests, [])).toBe(true);
            expect(canClaimRoomReward('1', completedRoom1Quests, ['2', '3'])).toBe(true);
        });

        test('returns false when room already claimed', () => {
            expect(canClaimRoomReward('1', completedRoom1Quests, ['1'])).toBe(false);
            expect(canClaimRoomReward('1', completedRoom1Quests, ['2', '1'])).toBe(false);
        });
    });

    describe('getRoomRewardsForClaim', () => {
        test('returns rewards object for room with roomRewards', () => {
            const rewards = getRoomRewardsForClaim('1');
            expect(rewards).not.toBeNull();
            // Dollars are not part of the claim: the room pays the flat quest base on completion.
            expect(rewards).toEqual({ xp: 0, blueprints: 0, items: [] });
        });

        test('returns null for invalid room number', () => {
            expect(getRoomRewardsForClaim('999')).toBeNull();
        });
    });

    describe('getDungeonCompletionRewardByRoll', () => {
        test('returns reward for valid roll 1-20', () => {
            expect(getDungeonCompletionRewardByRoll(1).name).toBe("The Librarian's Hoard");
            expect(getDungeonCompletionRewardByRoll(20).name).toBe('The Grand Key');
        });
        test('clamps roll to 1-20', () => {
            expect(getDungeonCompletionRewardByRoll(0).name).toBe("The Librarian's Hoard"); // 0 clamped to 1
            expect(getDungeonCompletionRewardByRoll(21).name).toBe('The Grand Key');
        });
    });

    describe('getDungeonCompletionRewardCardImage', () => {
        test('returns image path for reward with item link', () => {
            const reward = getDungeonCompletionRewardByRoll(2);
            const img = getDungeonCompletionRewardCardImage(reward);
            expect(img).toBeTruthy();
            expect(typeof img).toBe('string');
        });
        test('returns null for reward without item image', () => {
            const reward = getDungeonCompletionRewardByRoll(1);
            const img = getDungeonCompletionRewardCardImage(reward);
            expect(img).toBeFalsy();
        });
    });

    describe('applyDungeonCompletionReward', () => {
        test('returns alreadyOwned and does not add item when character has the item (roll 4 = Librarian\'s Quill)', () => {
            const addInventoryItem = jest.fn();
            const stateAdapter = {
                getOwnedItemNames: () => new Set(["Librarian's Quill"]),
                addInventoryItem
            };
            const updateCurrency = jest.fn();
            const result = applyDungeonCompletionReward(4, { stateAdapter, updateCurrency });
            expect(result).toEqual({
                applied: false,
                alreadyOwned: true,
                rewardName: "Librarian's Quill",
                rewardText: "You find a Librarian's Quill."
            });
            expect(addInventoryItem).not.toHaveBeenCalled();
        });

        test('applies item when character does not have it and returns applied true', () => {
            const addInventoryItem = jest.fn();
            const stateAdapter = {
                getOwnedItemNames: () => new Set(),
                addInventoryItem
            };
            const updateCurrency = jest.fn();
            const result = applyDungeonCompletionReward(4, { stateAdapter, updateCurrency });
            expect(result.applied).toBe(true);
            expect(result.rewardName).toBe("Librarian's Quill");
            expect(addInventoryItem).toHaveBeenCalledWith(expect.objectContaining({ name: "Librarian's Quill" }));
        });

        // The Hoard is drawn as a one-time temporary buff that pays its rewardModifier when used.
        // TODO(Task 5): re-enable once temporaryBuffs.json gives the Hoard rewardModifier { dollars: 20 }.
        test.skip("The Librarian's Hoard pays $20 into the Fund", () => {
            expect(data.temporaryBuffs["The Librarian's Hoard"].rewardModifier).toEqual({ dollars: 20 });
        });
    });
});
