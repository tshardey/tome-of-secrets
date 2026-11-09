import { allItems, xpLevels, permanentBonuses, genreQuests, sideQuestsDetailed, dungeonRooms, sideQuests } from './../assets/js/character-sheet/data.js';

describe('Game Data Integrity', () => {

    test('xpLevels should have level 20 as Max', () => {
        expect(xpLevels[20]).toBe("Max");
    });

    test('permanentBonuses should have entries at specific levels', () => {
        expect(permanentBonuses[3]).toBeDefined();
        expect(permanentBonuses[6]).toBeDefined();
        expect(permanentBonuses[7]).toBeDefined();
        expect(permanentBonuses[9]).toBeDefined();
        expect(permanentBonuses[10]).toBeUndefined();
    });

    test('allItems should contain items with required properties', () => {
        for (const itemName in allItems) {
            expect(allItems[itemName]).toHaveProperty('type');
            expect(allItems[itemName]).toHaveProperty('img');
            expect(allItems[itemName]).toHaveProperty('bonus');
        }
    });

    test('genreQuests should have rewards property with correct structure', () => {
        Object.values(genreQuests).forEach(quest => {
            expect(quest).toHaveProperty('rewards');
            expect(quest.rewards).toHaveProperty('xp');
            expect(quest.rewards).toHaveProperty('inkDrops');
            expect(quest.rewards).toHaveProperty('paperScraps');
            expect(quest.rewards).toHaveProperty('items');
            expect(Array.isArray(quest.rewards.items)).toBe(true);
        });
    });

    test('sideQuestsDetailed should have rewards property with correct structure', () => {
        Object.values(sideQuestsDetailed).forEach(quest => {
            expect(quest).toHaveProperty('rewards');
            expect(quest.rewards).toHaveProperty('xp');
            expect(quest.rewards).toHaveProperty('inkDrops');
            expect(quest.rewards).toHaveProperty('paperScraps');
            expect(quest.rewards).toHaveProperty('items');
            expect(Array.isArray(quest.rewards.items)).toBe(true);
        });
    });

    test('sideQuests derivation matches detailed JSON (label contains name and prompt)', () => {
        const label = sideQuests['1'];
        expect(typeof label).toBe('string');
        expect(label).toContain('The Arcane Grimoire');
        expect(label).toContain('Read the book on your TBR the longest.');
    });

    test('dungeonRooms should have encountersDetailed with rewards', () => {
        Object.values(dungeonRooms).forEach(room => {
            if (room.encountersDetailed && room.encountersDetailed.length > 0) {
                room.encountersDetailed.forEach(encounter => {
                    expect(encounter).toHaveProperty('rewards');
                    expect(encounter.rewards).toHaveProperty('xp');
                    expect(encounter.rewards).toHaveProperty('inkDrops');
                    expect(encounter.rewards).toHaveProperty('paperScraps');
                    expect(encounter.rewards).toHaveProperty('items');
                    expect(Array.isArray(encounter.rewards.items)).toBe(true);
                });
            }
        });
    });
});