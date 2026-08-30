/**
 * Branch resolution for side quests.
 *
 * A branching side quest is still one quest bound to one book: the branch decides which
 * prompt the player reads against and which payout they take, and nothing else.
 */
// Named with a `mock` prefix: babel-plugin-jest-hoist lifts jest.mock() above other
// statements and only allows the factory to close over variables matching /^mock/i.
const mockBranchingQuest = {
    id: 'side-quest-test-branching',
    name: 'The Test Stall',
    locale: 'the-test-bazaar',
    description: 'A stall that exists only in tests.',
    prompt: 'Branch A prompt.',
    reward: 'Branch A reward.',
    rewards: { xp: 10, inkDrops: 0, paperScraps: 0, blueprints: 0, items: [] },
    branchType: 'choice',
    rollInstruction: null,
    branches: [
        {
            key: 'A',
            roll: null,
            name: 'First',
            prompt: 'Branch A prompt.',
            reward: 'Branch A reward.',
            rewards: { xp: 10, inkDrops: 0, paperScraps: 0, blueprints: 0, items: [] }
        },
        {
            key: 'B',
            roll: null,
            name: 'Second',
            prompt: 'Branch B prompt.',
            reward: 'Branch B reward.',
            rewards: { xp: 0, inkDrops: 0, paperScraps: 5, blueprints: 15, items: [] }
        }
    ]
};

// Follows the repo convention (see tests/bonusCardState.test.js): jest.mock with
// requireActual, not unstable_mockModule — babel-jest transpiles these tests to CJS.
jest.mock('../assets/js/character-sheet/data.js', () => {
    const originalModule = jest.requireActual('../assets/js/character-sheet/data.js');
    return {
        ...originalModule,
        sideQuestsDetailed: { 99: mockBranchingQuest },
        sideQuestsById: new Map([[mockBranchingQuest.id, mockBranchingQuest]])
    };
});

const { RewardCalculator } = require('../assets/js/services/RewardCalculator.js');

describe('branch-aware side quest rewards', () => {
    test('a branchKey selects that branch\'s rewards', () => {
        const reward = RewardCalculator.getBaseRewards('♣ Side Quest', 'The Test Stall: Branch B prompt.', {
            sideQuestId: mockBranchingQuest.id,
            branchKey: 'B'
        });

        expect(reward.xp).toBe(0);
        expect(reward.paperScraps).toBe(5);
        expect(reward.blueprints).toBe(15);
        expect(reward.receipt.base.blueprints).toBe(15);
        expect(reward.receipt.final.blueprints).toBe(15);
    });

    test('no branchKey falls back to the flat rewards (branch A)', () => {
        const reward = RewardCalculator.getBaseRewards('♣ Side Quest', 'The Test Stall: Branch A prompt.', {
            sideQuestId: mockBranchingQuest.id
        });

        expect(reward.xp).toBe(10);
        expect(reward.blueprints).toBe(0);
    });

    test('an unknown branchKey falls back to the flat rewards rather than throwing', () => {
        const reward = RewardCalculator.getBaseRewards('♣ Side Quest', 'The Test Stall: Branch A prompt.', {
            sideQuestId: mockBranchingQuest.id,
            branchKey: 'Z'
        });

        expect(reward.xp).toBe(10);
    });
});
