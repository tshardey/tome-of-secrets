/**
 * End-to-end seam tests for branching side quests.
 *
 * Both bugs pinned here shipped behind a fully green unit-test suite, because every
 * existing test exercised its own layer in isolation:
 *
 *  1. `BaseQuestHandler.completeActiveQuest()` recomputes the base reward from scratch
 *     and did not forward `sideQuestId`/`branchKey`, so a quest completed on branch C
 *     silently paid branch A's numbers. The deck controller stored the right rewards;
 *     the completion path threw them away.
 *
 *  2. `validateRewards()` rebuilt the rewards object without a `blueprints` key, so an
 *     active quest's authored Blueprints were stripped on every page load — the exact
 *     "renders but never pays" failure the additive payout change exists to prevent.
 *
 * These tests drive the real seams rather than the units either side of them.
 */

import { BaseQuestHandler } from '../assets/js/quest-handlers/BaseQuestHandler.js';
import { validateCharacterState } from '../assets/js/character-sheet/dataValidator.js';
import { createEmptyCharacterState, STORAGE_KEYS } from '../assets/js/character-sheet/storageKeys.js';
import { sideQuestsDetailed } from '../assets/js/character-sheet/data.js';

/** Build the active quest the deck controller would have stored for a chosen branch. */
function activeQuestForBranch(questKey, branchKey) {
    const quest = sideQuestsDetailed[questKey];
    const branch = quest.branches.find(b => b.key === branchKey);
    if (!branch) throw new Error(`No branch ${branchKey} on side quest ${questKey}`);

    return {
        type: '♣ Side Quest',
        sideQuestId: quest.id,
        branchKey: branch.key,
        branchName: branch.name,
        prompt: `${quest.name}: ${branch.prompt}`,
        rewards: { ...branch.rewards },
        buffs: [],
        month: 'January',
        year: '2026'
    };
}

describe('completing a branching side quest pays the branch that was chosen', () => {
    test('Haggler\'s Row branch C pays branch C Blueprints, not branch A', () => {
        // Branch A grants 10 Blueprints, branch C grants 20. Before the fix this returned 10.
        const branchA = sideQuestsDetailed['9'].branches.find(b => b.key === 'A');
        const branchC = sideQuestsDetailed['9'].branches.find(b => b.key === 'C');
        expect(branchA.rewards.blueprints).not.toBe(branchC.rewards.blueprints);

        const completed = BaseQuestHandler.completeActiveQuest(
            activeQuestForBranch('9', 'C'), '', null, null
        );

        expect(completed.rewards.blueprints).toBe(branchC.rewards.blueprints);
    });

    test('a roll quest pays the branch rolled, not the first branch in the array', () => {
        // The Blind Stall: branch "1" is +40 XP / +10 Scraps, branch "6" is +80 / +20.
        const first = sideQuestsDetailed['10'].branches[0];
        const lot = sideQuestsDetailed['10'].branches.find(b => b.key === '6');
        expect(lot.rewards.xp).not.toBe(first.rewards.xp);

        const completed = BaseQuestHandler.completeActiveQuest(
            activeQuestForBranch('10', '6'), '', null, null
        );

        expect(completed.rewards.xp).toBe(lot.rewards.xp);
        expect(completed.rewards.paperScraps).toBe(lot.rewards.paperScraps);
    });

    test('every branch of every new quest completes to its own reward', () => {
        for (const key of ['9', '10', '11', '12', '13', '14', '15', '16', '17', '18']) {
            for (const branch of sideQuestsDetailed[key].branches) {
                const completed = BaseQuestHandler.completeActiveQuest(
                    activeQuestForBranch(key, branch.key), '', null, null
                );
                expect({
                    key,
                    branch: branch.key,
                    xp: completed.rewards.xp,
                    paperScraps: completed.rewards.paperScraps,
                    blueprints: completed.rewards.blueprints
                }).toEqual({
                    key,
                    branch: branch.key,
                    xp: branch.rewards.xp,
                    paperScraps: branch.rewards.paperScraps,
                    blueprints: branch.rewards.blueprints
                });
            }
        }
    });

    test('the branch identity survives completion', () => {
        const completed = BaseQuestHandler.completeActiveQuest(
            activeQuestForBranch('17', 'B'), '', null, null
        );

        expect(completed.sideQuestId).toBe('side-quest-the-lending-cart');
        expect(completed.branchKey).toBe('B');
    });
});

describe('an active quest survives a page load with its Blueprints intact', () => {
    test('validateCharacterState preserves rewards.blueprints on an active quest', () => {
        const state = {
            ...createEmptyCharacterState(),
            [STORAGE_KEYS.ACTIVE_ASSIGNMENTS]: [activeQuestForBranch('17', 'A')]
        };

        const validated = validateCharacterState(state);
        const quest = validated[STORAGE_KEYS.ACTIVE_ASSIGNMENTS][0];

        // The Lending Cart branch A grants 25 Blueprints.
        expect(quest.rewards.blueprints).toBe(25);
    });

    test('a rewards object with no blueprints key validates to zero, not undefined', () => {
        const state = {
            ...createEmptyCharacterState(),
            [STORAGE_KEYS.ACTIVE_ASSIGNMENTS]: [{
                type: '♠ Dungeon Crawl',
                prompt: 'Room 3',
                rewards: { xp: 50, inkDrops: 0, paperScraps: 0, items: [] },
                month: 'January',
                year: '2026'
            }]
        };

        const validated = validateCharacterState(state);

        expect(validated[STORAGE_KEYS.ACTIVE_ASSIGNMENTS][0].rewards.blueprints).toBe(0);
    });

    test('a quest reloaded then completed still pays its Blueprints', () => {
        // The full round trip: store, reload (validate), complete.
        const state = {
            ...createEmptyCharacterState(),
            [STORAGE_KEYS.ACTIVE_ASSIGNMENTS]: [activeQuestForBranch('9', 'C')]
        };

        const reloaded = validateCharacterState(state)[STORAGE_KEYS.ACTIVE_ASSIGNMENTS][0];
        const completed = BaseQuestHandler.completeActiveQuest(reloaded, '', null, null);

        expect(completed.rewards.blueprints).toBe(20);
    });
});
