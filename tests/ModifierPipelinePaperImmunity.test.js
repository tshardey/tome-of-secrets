import { ModifierPipeline } from '../assets/js/services/ModifierPipeline.js';
import { Reward } from '../assets/js/services/RewardCalculator.js';

describe('ModifierPipeline resource isolation', () => {
    test('an inkDrops MULTIPLY must not scale paperScraps', () => {
        const base = new Reward({ xp: 0, inkDrops: 10, paperScraps: 10, items: [] });
        const effects = [
            {
                trigger: 'ON_QUEST_COMPLETED',
                modifier: { type: 'ADD_FLAT', resource: 'paperScraps', value: 5 },
                source: 'Amulet of Duality'
            },
            {
                trigger: 'ON_QUEST_COMPLETED',
                modifier: { type: 'MULTIPLY', resource: 'inkDrops', value: 3 },
                source: 'Tome of Potential'
            }
        ];

        const resolved = ModifierPipeline.resolve('ON_QUEST_COMPLETED', {}, effects, base);

        expect(resolved.inkDrops).toBe(30);
        expect(resolved.paperScraps).toBe(15);
    });
});
