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
    rewards: { xp: 10, blueprints: 0, items: [] },
    branchType: 'choice',
    rollInstruction: null,
    branches: [
        {
            key: 'A',
            roll: null,
            name: 'First',
            prompt: 'Branch A prompt.',
            reward: 'Branch A reward.',
            rewards: { xp: 10, blueprints: 0, items: [] }
        },
        {
            key: 'B',
            roll: null,
            name: 'Second',
            prompt: 'Branch B prompt.',
            reward: 'Branch B reward.',
            rewards: { xp: 0, blueprints: 15, items: [] }
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
        expect(reward.dollars).toBe(15); // authored Scraps ignored; flat quest base
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

describe('the ten Beyond the Library Doors quests', () => {
    // Read the catalog directly: the mocked data module above only carries the fixture.
    const catalog = JSON.parse(
        require('fs').readFileSync(
            require('path').join(__dirname, '../assets/data/sideQuestsDetailed.json'),
            'utf8'
        )
    );
    const NEW_KEYS = ['9', '10', '11', '12', '13', '14', '15', '16', '17', '18'];

    test('all ten exist and carry a locale and branches', () => {
        for (const key of NEW_KEYS) {
            const quest = catalog[key];
            expect(quest).toBeDefined();
            expect(typeof quest.locale).toBe('string');
            expect(quest.locale.length).toBeGreaterThan(0);
            expect(Array.isArray(quest.branches)).toBe(true);
            expect(quest.branches.length).toBeGreaterThanOrEqual(2);
        }
    });

    test('thirty-three branch prompts across the ten quests', () => {
        const total = NEW_KEYS.reduce((sum, key) => sum + catalog[key].branches.length, 0);
        expect(total).toBe(33);
    });

    test('no new quest or branch carries Ink/Paper rewards', () => {
        for (const key of NEW_KEYS) {
            const quest = catalog[key];
            expect(quest.rewards).not.toHaveProperty('inkDrops');
            expect(quest.rewards).not.toHaveProperty('paperScraps');
            for (const branch of quest.branches) {
                expect(branch.rewards).not.toHaveProperty('inkDrops');
                expect(branch.rewards).not.toHaveProperty('paperScraps');
            }
        }
    });

    describe('stakes are flat amounts that never touch the $15 base', () => {
        const stakeOf = (name) => Object.values(catalog).find((quest) => quest.name === name).stake;

        test("Haggler's Row win adds the quest's blueprint reward again as a flat number", () => {
            const hagglers = Object.values(catalog).find((quest) => quest.name === "Haggler's Row");
            expect(hagglers.stake.onSuccess).toEqual({ blueprints: hagglers.rewards.blueprints });
        });

        test('The Communal Table failure removes half the authored XP as a flat number', () => {
            const table = Object.values(catalog).find((quest) => quest.name === 'The Communal Table');
            expect(table.stake.onFailure.xp).toBe(-table.rewards.xp / 2);
        });

        test('The Blind Stall still forfeits XP (a removal, not a multiplier)', () => {
            expect(stakeOf('The Blind Stall').onFailure.forfeit).toEqual(['xp']);
        });

        test('The Masked Procession stake has a non-journaling condition worth $3', () => {
            const stake = stakeOf('The Masked Procession');
            expect(stake.condition).not.toMatch(/journal/i);
            expect(stake.onSuccess).toEqual({ dollars: 3 });
        });

        test('no stake changes dollars on failure, so a failed stake leaves the $15 base', () => {
            for (const quest of Object.values(catalog)) {
                if (!quest.stake) continue;
                expect(quest.stake.onFailure).not.toHaveProperty('dollars');
                expect(quest.stake.onSuccess).not.toHaveProperty('multiply');
                expect(quest.stake.onFailure).not.toHaveProperty('halve');
            }
        });
    });

    test('the flat fields mirror the first branch', () => {
        for (const key of NEW_KEYS) {
            const quest = catalog[key];
            const first = quest.branches[0];
            expect(quest.prompt).toBe(first.prompt);
            expect(quest.reward).toBe(first.reward);
            expect(quest.rewards).toEqual(first.rewards);
        }
    });

    test('branch keys are unique within each quest', () => {
        for (const key of NEW_KEYS) {
            const keys = catalog[key].branches.map(b => b.key);
            expect(new Set(keys).size).toBe(keys.length);
        }
    });

    test('the four locales are the ones the design names', () => {
        const locales = new Set(NEW_KEYS.map(key => catalog[key].locale));
        expect(locales).toEqual(new Set([
            'the-ninefold-bazaar',
            'the-festival-of-turning',
            'the-exchange',
            'the-open-road'
        ]));
    });
});
