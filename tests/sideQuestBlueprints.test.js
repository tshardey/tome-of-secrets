/**
 * Regression guard: Blueprints that render must also be paid.
 *
 * Two historical bugs are pinned here:
 *  1. A side quest authoring `rewards.blueprints` showed the number and never paid it,
 *     because calculateBlueprintReward() returned 0 for '♣ Side Quest'.
 *  2. applyBlueprintRewardToQuest() overwrote pipeline-resolved Blueprints (from item
 *     ADD_FLAT effects) with the catalog base, discarding the item bonus.
 */
import { applyBlueprintRewardToQuest, calculateBlueprintReward } from '../assets/js/services/QuestRewardService.js';

describe('blueprint payout path', () => {
    test('a side quest keeps the Blueprints its rewards object already carries', () => {
        const quest = {
            type: '♣ Side Quest',
            sideQuestId: 'side-quest-hagglers-row',
            prompt: "Haggler's Row: Read a book you borrowed.",
            rewards: { xp: 0, inkDrops: 0, paperScraps: 0, blueprints: 10, items: [] },
            receipt: {
                base: { xp: 0, inkDrops: 0, paperScraps: 0, blueprints: 10 },
                modifiers: [],
                final: { xp: 0, inkDrops: 0, paperScraps: 0, blueprints: 10 }
            }
        };

        const total = applyBlueprintRewardToQuest(quest);

        expect(total).toBe(10);
        expect(quest.rewards.blueprints).toBe(10);
        expect(quest.receipt.final.blueprints).toBe(10);
    });

    test('item-granted Blueprints are added to the catalog base, not replaced by it', () => {
        // A genre quest whose catalog base is resolved by calculateBlueprintReward,
        // read alongside an equipped Haggler's Ledger that added +20 through the pipeline.
        const quest = {
            type: '♥ Organize the Stacks',
            prompt: 'Fantasy: Read a fantasy novel.',
            rewards: { xp: 0, inkDrops: 0, paperScraps: 0, blueprints: 20, items: [] },
            receipt: {
                base: { xp: 0, inkDrops: 0, paperScraps: 0, blueprints: 0 },
                modifiers: [],
                final: { xp: 0, inkDrops: 0, paperScraps: 0, blueprints: 20 }
            }
        };

        const catalogBase = calculateBlueprintReward(quest);
        const total = applyBlueprintRewardToQuest(quest);

        expect(catalogBase).toBeGreaterThan(0);
        expect(total).toBe(20 + catalogBase);
        expect(quest.rewards.blueprints).toBe(20 + catalogBase);
    });

    test('a quest with no Blueprints anywhere stays at zero', () => {
        const quest = {
            type: '♠ Dungeon Crawl',
            prompt: 'Room 3',
            rewards: { xp: 50, inkDrops: 0, paperScraps: 0, blueprints: 0, items: [] }
        };

        expect(applyBlueprintRewardToQuest(quest)).toBe(0);
        expect(quest.rewards.blueprints).toBe(0);
    });
});
