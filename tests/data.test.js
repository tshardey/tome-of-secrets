import { allItems, xpLevels, permanentBonuses } from './../assets/js/character-sheet/data.js';

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
});