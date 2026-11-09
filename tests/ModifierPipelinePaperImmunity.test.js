import { ModifierPipeline } from '../assets/js/services/ModifierPipeline.js';
import { Reward } from '../assets/js/services/RewardCalculator.js';

describe('ModifierPipeline resource isolation', () => {
    test('an xp MULTIPLY must not scale dollars', () => {
        const base = new Reward({ xp: 10, dollars: 15, items: [] });
        const effects = [
            {
                trigger: 'ON_QUEST_COMPLETED',
                modifier: { type: 'ADD_FLAT', resource: 'dollars', value: 3 },
                source: 'Amulet of Duality'
            },
            {
                trigger: 'ON_QUEST_COMPLETED',
                modifier: { type: 'MULTIPLY', resource: 'xp', value: 3 },
                source: 'Tome of Potential'
            }
        ];

        const resolved = ModifierPipeline.resolve('ON_QUEST_COMPLETED', {}, effects, base);

        expect(resolved.xp).toBe(30);
        expect(resolved.dollars).toBe(18);
    });

    test('a legacy inkDrops/paperScraps effect is inert: it targets no Reward field', () => {
        const base = new Reward({ xp: 10, dollars: 15 });
        const effects = [
            { trigger: 'ON_QUEST_COMPLETED', modifier: { type: 'ADD_FLAT', resource: 'inkDrops', value: 10 } },
            { trigger: 'ON_QUEST_COMPLETED', modifier: { type: 'ADD_FLAT', resource: 'paperScraps', value: 5 } }
        ];

        const resolved = ModifierPipeline.resolve('ON_QUEST_COMPLETED', {}, effects, base);

        expect(resolved.dollars).toBe(15);
        expect(resolved).not.toHaveProperty('inkDrops');
        expect(resolved.receipt.modifiers).toEqual([]);
    });
});
