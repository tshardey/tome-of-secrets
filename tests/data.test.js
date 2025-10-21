import { allItems, xpLevels, permanentBonuses, curseTable } from './../assets/js/character-sheet/data.js';

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
});