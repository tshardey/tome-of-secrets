/**
 * @jest-environment jsdom
 */

// Mock the data module with test items
jest.mock('../assets/js/character-sheet/data.js', () => {
    const originalModule = jest.requireActual('../assets/js/character-sheet/data.js');
    return {
        ...originalModule,
        allItems: {
            'Tome-Bound Cat': {
                name: 'Tome-Bound Cat',
                bonus: 'When you choose an Atmospheric Buff for your reading session, earn a x2 Ink Drop bonus on the effect.',
                passiveBonus: 'Atmospheric Buffs grant +3 Ink Drops (passive, not multiplied).',
                excludeFromQuestBonuses: true
            },
            'Gilded Painting': {
                name: 'Gilded Painting',
                bonus: 'Earn +2 Ink Drops when reading in an ornate location.',
                passiveBonus: 'Earn +1 Ink Drop for reading in ornate locations (passive).',
                excludeFromQuestBonuses: true
            },
            'Pocket Dragon': {
                name: 'Pocket Dragon',
                bonus: 'Earn a +20 Ink Drop bonus for books in a fantasy series.',
                passiveBonus: 'Fantasy series books grant +10 Ink Drops (passive).'
            }
        }
    };
});

import * as ui from '../assets/js/character-sheet/ui.js';
import { characterState } from '../assets/js/character-sheet/state.js';
import { STORAGE_KEYS } from '../assets/js/character-sheet/storageKeys.js';
import { safeSetJSON } from '../assets/js/utils/storage.js';
import { createEmptyCharacterState } from '../assets/js/character-sheet/storageKeys.js';
import * as data from '../assets/js/character-sheet/data.js';

describe('UI Bonus Cards Filter', () => {
    beforeEach(() => {
        // Reset character state
        Object.assign(characterState, createEmptyCharacterState());
        localStorage.clear();

        // Set up DOM elements needed for renderBonusCards
        document.body.innerHTML = `
            <div id="quest-bonus-selection-container"></div>
            <input id="quest-buffs-select" type="hidden" />
            <select id="keeperBackground">
                <option value="">Select Background</option>
                <option value="groveTender">Grove Tender</option>
            </select>
        `;
    });

    test('should filter out atmospheric buff sources from bonus cards', () => {
        // Set up character state with items, including ones that should be excluded
        characterState.equippedItems = [
            { name: 'Tome-Bound Cat' }, // This has excludeFromQuestBonuses flag
            { name: 'Gilded Painting' }, // This has excludeFromQuestBonuses flag
            { name: 'Pocket Dragon' }   // This should not be excluded
        ];

        // Call updateQuestBuffsDropdown which internally calls renderBonusCards
        const wearableSlotsInput = document.createElement('input');
        const nonWearableSlotsInput = document.createElement('input');
        const familiarSlotsInput = document.createElement('input');
        
        ui.updateQuestBuffsDropdown(wearableSlotsInput, nonWearableSlotsInput, familiarSlotsInput);

        const container = document.getElementById('quest-bonus-selection-container');
        const cards = container.querySelectorAll('.quest-bonus-card');
        
        // Should only show Pocket Dragon, not Tome-Bound Cat or Gilded Painting
        const cardTexts = Array.from(cards).map(card => card.textContent);
        expect(cardTexts.some(text => text.includes('Pocket Dragon'))).toBe(true);
        expect(cardTexts.some(text => text.includes('Tome-Bound Cat'))).toBe(false);
        expect(cardTexts.some(text => text.includes('Gilded Painting'))).toBe(false);
    });

    test('should filter out atmospheric buff sources from passive item slots', () => {
        // Set up passive item slots
        characterState[STORAGE_KEYS.PASSIVE_ITEM_SLOTS] = [
            { itemName: 'Gilded Painting' },
            { itemName: 'Pocket Dragon' }
        ];

        const wearableSlotsInput = document.createElement('input');
        const nonWearableSlotsInput = document.createElement('input');
        const familiarSlotsInput = document.createElement('input');
        
        ui.updateQuestBuffsDropdown(wearableSlotsInput, nonWearableSlotsInput, familiarSlotsInput);

        const container = document.getElementById('quest-bonus-selection-container');
        const cards = container.querySelectorAll('.quest-bonus-card');
        const cardTexts = Array.from(cards).map(card => card.textContent);
        
        expect(cardTexts.some(text => text.includes('Pocket Dragon'))).toBe(true);
        expect(cardTexts.some(text => text.includes('Gilded Painting'))).toBe(false);
    });

    test('should filter out atmospheric buff sources from passive familiar slots', () => {
        // Set up passive familiar slots
        characterState[STORAGE_KEYS.PASSIVE_FAMILIAR_SLOTS] = [
            { itemName: 'Tome-Bound Cat' },
            { itemName: 'Pocket Dragon' }
        ];

        const wearableSlotsInput = document.createElement('input');
        const nonWearableSlotsInput = document.createElement('input');
        const familiarSlotsInput = document.createElement('input');
        
        ui.updateQuestBuffsDropdown(wearableSlotsInput, nonWearableSlotsInput, familiarSlotsInput);

        const container = document.getElementById('quest-bonus-selection-container');
        const cards = container.querySelectorAll('.quest-bonus-card');
        const cardTexts = Array.from(cards).map(card => card.textContent);
        
        expect(cardTexts.some(text => text.includes('Pocket Dragon'))).toBe(true);
        expect(cardTexts.some(text => text.includes('Tome-Bound Cat'))).toBe(false);
    });
});
