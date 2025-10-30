import { allItems, xpLevels, permanentBonuses, curseTable, genreQuests, sideQuestsDetailed, dungeonRooms } from './../assets/js/character-sheet/data.js';

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

    test('curseTable should contain all four curse types with required properties', () => {
        const expectedCurses = ['The Unread Tome', 'The Lost Lore', 'The Forgotten Pages', 'The Ravenous Shadow'];
        
        expectedCurses.forEach(curseName => {
            expect(curseTable[curseName]).toBeDefined();
            expect(curseTable[curseName]).toHaveProperty('name');
            expect(curseTable[curseName]).toHaveProperty('requirement');
            expect(curseTable[curseName]).toHaveProperty('description');
            expect(curseTable[curseName].name).toBe(curseName);
        });
    });

    test('curseTable should have unique requirements for each curse', () => {
        const requirements = Object.values(curseTable).map(curse => curse.requirement);
        const uniqueRequirements = [...new Set(requirements)];
        expect(requirements.length).toBe(uniqueRequirements.length);
    });

    test('curseTable should NOT have rewards property (completing removes penalty)', () => {
        Object.values(curseTable).forEach(curse => {
            // Curses should not have rewards - the reward is removing the penalty
            expect(curse).not.toHaveProperty('rewards');
            expect(curse).toHaveProperty('name');
            expect(curse).toHaveProperty('requirement');
            expect(curse).toHaveProperty('description');
        });
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