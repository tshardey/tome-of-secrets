/**
 * @jest-environment jsdom
 */

jest.mock('../assets/js/character-sheet/data.js', () => {
    const originalModule = jest.requireActual('../assets/js/character-sheet/data.js');
    return {
        ...originalModule,
        allItems: {
            "Librarian's Compass": {
                name: "Librarian's Compass",
                bonus: '+5 Ink Drops for new authors',
                effects: [{
                    trigger: 'ON_QUEST_COMPLETED',
                    condition: { tagMatch: [['new-author']] },
                    modifier: { type: 'ADD_FLAT', resource: 'inkDrops', value: 5 }
                }]
            },
            'Scatter Brain Scarab': {
                name: 'Scatter Brain Scarab',
                bonus: 'Bonus for reading multiple books',
                rewardModifier: { type: 'ADD_FLAT', resource: 'inkDrops', value: 5 }
            },
            'Cloak of Story-Weaver': {
                name: 'Cloak of Story-Weaver',
                bonus: '+5 Ink Drops for series books',
                effects: [{
                    trigger: 'ON_QUEST_COMPLETED',
                    condition: { tagMatch: [['series']] },
                    modifier: { type: 'ADD_FLAT', resource: 'inkDrops', value: 5 }
                }]
            },
            "Bookwyrm's Scale": {
                name: "Bookwyrm's Scale",
                bonus: '+10 Ink Drops for long books',
                effects: [{
                    trigger: 'ON_QUEST_COMPLETED',
                    condition: { pageCount: { min: 500 } },
                    modifier: { type: 'ADD_FLAT', resource: 'inkDrops', value: 10 },
                    slot: 'equipped'
                }]
            },
            'Page Sprite': {
                name: 'Page Sprite',
                bonus: 'x2 Ink Drops for short books',
                effects: [{
                    trigger: 'ON_QUEST_COMPLETED',
                    condition: { pageCount: { max: 299 } },
                    modifier: { type: 'MULTIPLY', resource: 'inkDrops', value: 2 },
                    slot: 'equipped'
                }]
            }
        },
        keeperBackgrounds: {
            '': { name: 'None' },
            archivist: {
                name: "The Archivist's Apprentice",
                effects: [{
                    trigger: 'ON_QUEST_COMPLETED',
                    condition: { tagMatch: [['non-fiction'], ['historical-fiction']] },
                    modifier: { type: 'ADD_FLAT', resource: 'inkDrops', value: 10 }
                }]
            },
            cartographer: {
                name: "The Cartographer's Guild",
                effects: [{
                    trigger: 'ON_QUEST_DRAFTED',
                    condition: { questType: 'dungeon_crawl' },
                    modifier: { type: 'GRANT_RESOURCE', resource: 'inkDrops', value: 15 }
                }]
            }
        }
    };
});

import { classifyBonusCardState } from '../assets/js/character-sheet/ui.js';
import { characterState } from '../assets/js/character-sheet/state.js';
import { STORAGE_KEYS } from '../assets/js/character-sheet/storageKeys.js';
import { createEmptyCharacterState } from '../assets/js/character-sheet/storageKeys.js';
import * as ui from '../assets/js/character-sheet/ui.js';

describe('classifyBonusCardState', () => {
    test('auto-applied when item has tagMatch and book tags match', () => {
        const bonus = {
            type: 'item',
            itemData: {
                effects: [{
                    trigger: 'ON_QUEST_COMPLETED',
                    condition: { tagMatch: [['new-author']] },
                    modifier: { type: 'ADD_FLAT', resource: 'inkDrops', value: 5 }
                }]
            }
        };
        expect(classifyBonusCardState(bonus, ['new-author', 'fantasy'])).toBe('auto-applied');
    });

    test('unmatched when item has tagMatch but book tags do not match', () => {
        const bonus = {
            type: 'item',
            itemData: {
                effects: [{
                    trigger: 'ON_QUEST_COMPLETED',
                    condition: { tagMatch: [['new-author']] },
                    modifier: { type: 'ADD_FLAT', resource: 'inkDrops', value: 5 }
                }]
            }
        };
        expect(classifyBonusCardState(bonus, ['fantasy', 'series'])).toBe('unmatched');
    });

    test('subjective when item has no tagMatch (legacy rewardModifier)', () => {
        const bonus = {
            type: 'item',
            itemData: {
                rewardModifier: { type: 'ADD_FLAT', resource: 'inkDrops', value: 5 }
            }
        };
        expect(classifyBonusCardState(bonus, ['fantasy'])).toBe('subjective');
    });

    test('subjective for temp buffs (no itemData)', () => {
        const bonus = {
            type: 'tempBuff'
        };
        expect(classifyBonusCardState(bonus, ['fantasy'])).toBe('subjective');
    });

    test('unmatched when bookTags is null (no book linked)', () => {
        const bonus = {
            type: 'item',
            itemData: {
                effects: [{
                    trigger: 'ON_QUEST_COMPLETED',
                    condition: { tagMatch: [['new-author']] },
                    modifier: { type: 'ADD_FLAT', resource: 'inkDrops', value: 5 }
                }]
            }
        };
        expect(classifyBonusCardState(bonus, null)).toBe('unmatched');
    });

    test('unmatched when bookTags is empty array and item has tagMatch', () => {
        const bonus = {
            type: 'item',
            itemData: {
                effects: [{
                    trigger: 'ON_QUEST_COMPLETED',
                    condition: { tagMatch: [['new-author']] },
                    modifier: { type: 'ADD_FLAT', resource: 'inkDrops', value: 5 }
                }]
            }
        };
        expect(classifyBonusCardState(bonus, [])).toBe('unmatched');
    });

    test('auto-applied for background with matching tagMatch', () => {
        const bonus = {
            type: 'background',
            backgroundData: {
                effects: [{
                    trigger: 'ON_QUEST_COMPLETED',
                    condition: { tagMatch: [['non-fiction'], ['historical-fiction']] },
                    modifier: { type: 'ADD_FLAT', resource: 'inkDrops', value: 10 }
                }]
            }
        };
        expect(classifyBonusCardState(bonus, ['non-fiction', 'award-winner'])).toBe('auto-applied');
    });

    test('unmatched for background with non-matching tagMatch', () => {
        const bonus = {
            type: 'background',
            backgroundData: {
                effects: [{
                    trigger: 'ON_QUEST_COMPLETED',
                    condition: { tagMatch: [['non-fiction'], ['historical-fiction']] },
                    modifier: { type: 'ADD_FLAT', resource: 'inkDrops', value: 10 }
                }]
            }
        };
        expect(classifyBonusCardState(bonus, ['fantasy', 'series'])).toBe('unmatched');
    });

    test('subjective for background without tagMatch (cartographer)', () => {
        const bonus = {
            type: 'background',
            backgroundData: {
                effects: [{
                    trigger: 'ON_QUEST_DRAFTED',
                    condition: { questType: 'dungeon_crawl' },
                    modifier: { type: 'GRANT_RESOURCE', resource: 'inkDrops', value: 15 }
                }]
            }
        };
        expect(classifyBonusCardState(bonus, ['fantasy'])).toBe('subjective');
    });

    test('handles OR groups in tagMatch (matches second group)', () => {
        const bonus = {
            type: 'background',
            backgroundData: {
                effects: [{
                    trigger: 'ON_QUEST_COMPLETED',
                    condition: { tagMatch: [['non-fiction'], ['historical-fiction']] },
                    modifier: { type: 'ADD_FLAT', resource: 'inkDrops', value: 10 }
                }]
            }
        };
        expect(classifyBonusCardState(bonus, ['historical-fiction', 'award-winner'])).toBe('auto-applied');
    });

    test('auto-applied when pageCount min condition met', () => {
        const bonus = {
            type: 'item',
            itemData: {
                effects: [{
                    trigger: 'ON_QUEST_COMPLETED',
                    condition: { pageCount: { min: 500 } },
                    modifier: { type: 'ADD_FLAT', resource: 'inkDrops', value: 10 }
                }]
            }
        };
        expect(classifyBonusCardState(bonus, ['fantasy'], 600)).toBe('auto-applied');
    });

    test('unmatched when pageCount min condition not met', () => {
        const bonus = {
            type: 'item',
            itemData: {
                effects: [{
                    trigger: 'ON_QUEST_COMPLETED',
                    condition: { pageCount: { min: 500 } },
                    modifier: { type: 'ADD_FLAT', resource: 'inkDrops', value: 10 }
                }]
            }
        };
        expect(classifyBonusCardState(bonus, ['fantasy'], 300)).toBe('unmatched');
    });

    test('auto-applied when pageCount max condition met', () => {
        const bonus = {
            type: 'item',
            itemData: {
                effects: [{
                    trigger: 'ON_QUEST_COMPLETED',
                    condition: { pageCount: { max: 299 } },
                    modifier: { type: 'MULTIPLY', resource: 'inkDrops', value: 2 }
                }]
            }
        };
        expect(classifyBonusCardState(bonus, ['fantasy'], 250)).toBe('auto-applied');
    });

    test('unmatched when pageCount max condition not met', () => {
        const bonus = {
            type: 'item',
            itemData: {
                effects: [{
                    trigger: 'ON_QUEST_COMPLETED',
                    condition: { pageCount: { max: 299 } },
                    modifier: { type: 'MULTIPLY', resource: 'inkDrops', value: 2 }
                }]
            }
        };
        expect(classifyBonusCardState(bonus, ['fantasy'], 400)).toBe('unmatched');
    });

    test('subjective when pageCount condition exists but bookPageCount is null', () => {
        const bonus = {
            type: 'item',
            itemData: {
                effects: [{
                    trigger: 'ON_QUEST_COMPLETED',
                    condition: { pageCount: { min: 500 } },
                    modifier: { type: 'ADD_FLAT', resource: 'inkDrops', value: 10 }
                }]
            }
        };
        expect(classifyBonusCardState(bonus, ['fantasy'], null)).toBe('subjective');
    });

    test('auto-applied when pageCount exactly equals min boundary', () => {
        const bonus = {
            type: 'item',
            itemData: {
                effects: [{
                    trigger: 'ON_QUEST_COMPLETED',
                    condition: { pageCount: { min: 500 } },
                    modifier: { type: 'ADD_FLAT', resource: 'inkDrops', value: 10 }
                }]
            }
        };
        expect(classifyBonusCardState(bonus, ['fantasy'], 500)).toBe('auto-applied');
    });
});

describe('renderBonusCards with bookTags', () => {
    beforeEach(() => {
        Object.assign(characterState, createEmptyCharacterState());
        localStorage.clear();

        document.body.innerHTML = `
            <div id="edit-quest-bonus-selection-container"></div>
            <input id="edit-quest-buffs-select" type="hidden" />
            <select id="keeperBackground">
                <option value="">Select Background</option>
                <option value="archivist">Archivist</option>
                <option value="cartographer">Cartographer</option>
            </select>
        `;
    });

    it('renders auto-applied card with auto-applied class when tags match', () => {
        characterState.equippedItems = [{ name: "Librarian's Compass" }];
        document.getElementById('keeperBackground').value = '';

        ui.updateEditQuestBuffsDropdown([], ['new-author']);

        const container = document.getElementById('edit-quest-bonus-selection-container');
        const cards = container.querySelectorAll('.quest-bonus-card');
        expect(cards.length).toBe(1);
        expect(cards[0].classList.contains('auto-applied')).toBe(true);
        expect(cards[0].textContent).toContain("Librarian's Compass");
    });

    it('renders unmatched card with unmatched class when tags do not match', () => {
        characterState.equippedItems = [{ name: 'Cloak of Story-Weaver' }];
        document.getElementById('keeperBackground').value = '';

        ui.updateEditQuestBuffsDropdown([], ['fantasy']);

        const container = document.getElementById('edit-quest-bonus-selection-container');
        const cards = container.querySelectorAll('.quest-bonus-card');
        expect(cards.length).toBe(1);
        expect(cards[0].classList.contains('unmatched')).toBe(true);
    });

    it('renders subjective card with subjective class for legacy items', () => {
        characterState.equippedItems = [{ name: 'Scatter Brain Scarab' }];
        document.getElementById('keeperBackground').value = '';

        ui.updateEditQuestBuffsDropdown([], ['fantasy']);

        const container = document.getElementById('edit-quest-bonus-selection-container');
        const cards = container.querySelectorAll('.quest-bonus-card');
        expect(cards.length).toBe(1);
        expect(cards[0].classList.contains('subjective')).toBe(true);
    });

    it('auto-applied cards are included in hidden input value', () => {
        characterState.equippedItems = [{ name: "Librarian's Compass" }];
        document.getElementById('keeperBackground').value = '';

        ui.updateEditQuestBuffsDropdown([], ['new-author']);

        const hiddenInput = document.getElementById('edit-quest-buffs-select');
        const selectedValues = JSON.parse(hiddenInput.value);
        expect(selectedValues).toContain("[Item] Librarian's Compass");
    });

    it('unmatched cards are NOT included in hidden input value', () => {
        characterState.equippedItems = [{ name: 'Cloak of Story-Weaver' }];
        document.getElementById('keeperBackground').value = '';

        ui.updateEditQuestBuffsDropdown([], ['fantasy']);

        const hiddenInput = document.getElementById('edit-quest-buffs-select');
        const selectedValues = JSON.parse(hiddenInput.value);
        expect(selectedValues).not.toContain('[Item] Cloak of Story-Weaver');
    });

    it('falls back to all-manual when bookTags is not provided', () => {
        characterState.equippedItems = [{ name: "Librarian's Compass" }];
        document.getElementById('keeperBackground').value = '';

        ui.updateEditQuestBuffsDropdown([]);

        const container = document.getElementById('edit-quest-bonus-selection-container');
        const cards = container.querySelectorAll('.quest-bonus-card');
        expect(cards.length).toBe(1);
        expect(cards[0].classList.contains('auto-applied')).toBe(false);
        expect(cards[0].classList.contains('unmatched')).toBe(false);
        expect(cards[0].classList.contains('subjective')).toBe(false);
    });

    it('renders background bonus as auto-applied when tags match', () => {
        characterState.equippedItems = [];
        document.getElementById('keeperBackground').value = 'archivist';

        ui.updateEditQuestBuffsDropdown([], ['non-fiction']);

        const container = document.getElementById('edit-quest-bonus-selection-container');
        const cards = container.querySelectorAll('.quest-bonus-card');
        expect(cards.length).toBe(1);
        expect(cards[0].classList.contains('auto-applied')).toBe(true);
    });

    it('renders cartographer background as subjective (no tagMatch)', () => {
        characterState.equippedItems = [];
        document.getElementById('keeperBackground').value = 'cartographer';

        ui.updateEditQuestBuffsDropdown([], ['fantasy']);

        const container = document.getElementById('edit-quest-bonus-selection-container');
        const cards = container.querySelectorAll('.quest-bonus-card');
        expect(cards.length).toBe(1);
        expect(cards[0].classList.contains('subjective')).toBe(true);
    });

    it('renders mixed card states correctly in one drawer', () => {
        // Set up: one matching item, one non-matching, one subjective
        characterState.equippedItems = [
            { name: "Librarian's Compass" },    // tagMatch: new-author → will match
            { name: 'Cloak of Story-Weaver' },  // tagMatch: series → won't match
            { name: 'Scatter Brain Scarab' }     // no tagMatch → subjective
        ];
        document.getElementById('keeperBackground').value = 'archivist'; // tagMatch: non-fiction/historical-fiction → will match

        ui.updateEditQuestBuffsDropdown([], ['new-author', 'non-fiction']);

        const container = document.getElementById('edit-quest-bonus-selection-container');
        const autoApplied = container.querySelectorAll('.quest-bonus-card.auto-applied');
        const unmatched = container.querySelectorAll('.quest-bonus-card.unmatched');
        const subjective = container.querySelectorAll('.quest-bonus-card.subjective');

        expect(autoApplied.length).toBe(2); // Compass + Archivist
        expect(unmatched.length).toBe(1);   // Cloak
        expect(subjective.length).toBe(1);  // Scarab

        // Check hidden input includes auto-applied and not unmatched
        const hiddenInput = document.getElementById('edit-quest-buffs-select');
        const selectedValues = JSON.parse(hiddenInput.value);
        expect(selectedValues).toContain("[Item] Librarian's Compass");
        expect(selectedValues).toContain('[Background] Archivist Bonus');
        expect(selectedValues).not.toContain('[Item] Cloak of Story-Weaver');
        expect(selectedValues).not.toContain('[Item] Scatter Brain Scarab');
    });

    it('subjective card can be toggled and appears in hidden input when selected', () => {
        characterState.equippedItems = [{ name: 'Scatter Brain Scarab' }];
        document.getElementById('keeperBackground').value = '';

        ui.updateEditQuestBuffsDropdown([], ['fantasy']);

        const container = document.getElementById('edit-quest-bonus-selection-container');
        const card = container.querySelector('.quest-bonus-card.subjective');
        expect(card).not.toBeNull();

        // Click to select
        card.click();
        expect(card.classList.contains('selected')).toBe(true);

        const hiddenInput = document.getElementById('edit-quest-buffs-select');
        const selectedValues = JSON.parse(hiddenInput.value);
        expect(selectedValues).toContain('[Item] Scatter Brain Scarab');

        // Click again to deselect
        card.click();
        expect(card.classList.contains('selected')).toBe(false);
        const updatedValues = JSON.parse(hiddenInput.value);
        expect(updatedValues).not.toContain('[Item] Scatter Brain Scarab');
    });

    it('renders tag badges on unmatched cards showing needed tags', () => {
        characterState.equippedItems = [{ name: 'Cloak of Story-Weaver' }];
        document.getElementById('keeperBackground').value = '';

        ui.updateEditQuestBuffsDropdown([], ['fantasy']);

        const container = document.getElementById('edit-quest-bonus-selection-container');
        const card = container.querySelector('.quest-bonus-card.unmatched');
        expect(card).not.toBeNull();

        const needsSection = card.querySelector('.quest-bonus-card-needs');
        expect(needsSection).not.toBeNull();
        expect(needsSection.textContent).toContain('Needs:');
        expect(needsSection.textContent).toMatch(/series/i);
    });

    it('shows no-tags message when bookTags is empty array', () => {
        characterState.equippedItems = [{ name: "Librarian's Compass" }];
        document.getElementById('keeperBackground').value = '';

        ui.updateEditQuestBuffsDropdown([], []);

        const container = document.getElementById('edit-quest-bonus-selection-container');
        const cards = container.querySelectorAll('.quest-bonus-card');
        expect(cards.length).toBe(1);
        expect(cards[0].classList.contains('unmatched')).toBe(true);
    });

    it('renders pageCount item as auto-applied when page count meets condition', () => {
        characterState.equippedItems = [{ name: "Bookwyrm's Scale" }];
        document.getElementById('keeperBackground').value = '';

        ui.updateEditQuestBuffsDropdown([], ['fantasy'], 600);

        const container = document.getElementById('edit-quest-bonus-selection-container');
        const cards = container.querySelectorAll('.quest-bonus-card');
        expect(cards.length).toBe(1);
        expect(cards[0].classList.contains('auto-applied')).toBe(true);
    });

    it('renders pageCount item as unmatched with "Needs:" page info when not met', () => {
        characterState.equippedItems = [{ name: "Bookwyrm's Scale" }];
        document.getElementById('keeperBackground').value = '';

        ui.updateEditQuestBuffsDropdown([], ['fantasy'], 300);

        const container = document.getElementById('edit-quest-bonus-selection-container');
        const card = container.querySelector('.quest-bonus-card.unmatched');
        expect(card).not.toBeNull();
        const needsSection = card.querySelector('.quest-bonus-card-needs');
        expect(needsSection).not.toBeNull();
        expect(needsSection.textContent).toContain('500+ pages');
    });

    it('renders pageCount item as subjective when bookPageCount is null', () => {
        characterState.equippedItems = [{ name: "Bookwyrm's Scale" }];
        document.getElementById('keeperBackground').value = '';

        ui.updateEditQuestBuffsDropdown([], ['fantasy'], null);

        const container = document.getElementById('edit-quest-bonus-selection-container');
        const cards = container.querySelectorAll('.quest-bonus-card');
        expect(cards.length).toBe(1);
        expect(cards[0].classList.contains('subjective')).toBe(true);
    });

    it('renders Page Sprite unmatched with "Under X pages" when condition not met', () => {
        characterState.equippedItems = [{ name: 'Page Sprite' }];
        document.getElementById('keeperBackground').value = '';

        ui.updateEditQuestBuffsDropdown([], ['fantasy'], 400);

        const container = document.getElementById('edit-quest-bonus-selection-container');
        const card = container.querySelector('.quest-bonus-card.unmatched');
        expect(card).not.toBeNull();
        const needsSection = card.querySelector('.quest-bonus-card-needs');
        expect(needsSection).not.toBeNull();
        expect(needsSection.textContent).toContain('Under 300 pages');
    });

    it('all items become unmatched when bookTags is null (no book linked)', () => {
        characterState.equippedItems = [
            { name: "Librarian's Compass" },
            { name: "Bookwyrm's Scale" },
            { name: 'Scatter Brain Scarab' }
        ];
        document.getElementById('keeperBackground').value = '';

        ui.updateEditQuestBuffsDropdown([], null);

        const container = document.getElementById('edit-quest-bonus-selection-container');
        const subjective = container.querySelectorAll('.quest-bonus-card.subjective');
        const autoApplied = container.querySelectorAll('.quest-bonus-card.auto-applied');
        const unmatched = container.querySelectorAll('.quest-bonus-card.unmatched');
        expect(subjective.length).toBe(0);
        expect(autoApplied.length).toBe(0);
        expect(unmatched.length).toBe(3);
    });
});
