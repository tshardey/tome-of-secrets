import { extractItemTagGroups, renderItemTagBadges, renderItemCard } from '../assets/js/character-sheet/renderComponents.js';

describe('extractItemTagGroups', () => {
    test('returns empty array for item with no effects', () => {
        expect(extractItemTagGroups({})).toEqual([]);
        expect(extractItemTagGroups({ effects: [] })).toEqual([]);
    });

    test('returns empty array for item with effects but no tagMatch', () => {
        const item = {
            effects: [
                { trigger: 'ON_QUEST_COMPLETED', modifier: { type: 'ADD_FLAT', resource: 'xp', value: 5 } }
            ]
        };
        expect(extractItemTagGroups(item)).toEqual([]);
    });

    test('extracts single-tag groups', () => {
        const item = {
            effects: [
                {
                    trigger: 'ON_QUEST_COMPLETED',
                    condition: { tagMatch: [['romance']] },
                    modifier: { type: 'ADD_FLAT', resource: 'inkDrops', value: 12 }
                }
            ]
        };
        expect(extractItemTagGroups(item)).toEqual([['romance']]);
    });

    test('extracts AND groups (multi-tag)', () => {
        const item = {
            effects: [
                {
                    trigger: 'ON_QUEST_COMPLETED',
                    condition: { tagMatch: [['fantasy', 'fae']] },
                    modifier: { type: 'ADD_FLAT', resource: 'inkDrops', value: 15 }
                }
            ]
        };
        expect(extractItemTagGroups(item)).toEqual([['fantasy', 'fae']]);
    });

    test('extracts mixed OR/AND groups', () => {
        const item = {
            effects: [
                {
                    trigger: 'ON_QUEST_COMPLETED',
                    condition: { tagMatch: [['horror'], ['fantasy', 'dark']] },
                    modifier: { type: 'ADD_FLAT', resource: 'inkDrops', value: 12 }
                }
            ]
        };
        expect(extractItemTagGroups(item)).toEqual([['horror'], ['fantasy', 'dark']]);
    });

    test('deduplicates groups across equipped and passive slot effects', () => {
        const item = {
            effects: [
                {
                    trigger: 'ON_QUEST_COMPLETED',
                    condition: { tagMatch: [['romance']] },
                    modifier: { type: 'ADD_FLAT', resource: 'inkDrops', value: 20 },
                    slot: 'equipped'
                },
                {
                    trigger: 'ON_QUEST_COMPLETED',
                    condition: { tagMatch: [['romance']] },
                    modifier: { type: 'ADD_FLAT', resource: 'inkDrops', value: 10 },
                    slot: 'passive'
                }
            ]
        };
        expect(extractItemTagGroups(item)).toEqual([['romance']]);
    });

    test('deduplicates complex groups across slots', () => {
        const item = {
            effects: [
                {
                    trigger: 'ON_QUEST_COMPLETED',
                    condition: { tagMatch: [['romance'], ['contemporary-fiction', 'social']] },
                    slot: 'equipped',
                    modifier: { type: 'ADD_FLAT', resource: 'inkDrops', value: 15 }
                },
                {
                    trigger: 'ON_QUEST_COMPLETED',
                    condition: { tagMatch: [['romance'], ['contemporary-fiction', 'social']] },
                    slot: 'passive',
                    modifier: { type: 'ADD_FLAT', resource: 'inkDrops', value: 8 }
                }
            ]
        };
        expect(extractItemTagGroups(item)).toEqual([['romance'], ['contemporary-fiction', 'social']]);
    });

    test('handles null/undefined item gracefully', () => {
        expect(extractItemTagGroups(null)).toEqual([]);
        expect(extractItemTagGroups(undefined)).toEqual([]);
    });
});

describe('renderItemTagBadges', () => {
    const mockBookTags = [
        { id: 'romance', label: 'Romance', category: 'genre' },
        { id: 'fantasy', label: 'Fantasy', category: 'genre' },
        { id: 'fae', label: 'Fae / Faerie', category: 'content' },
        { id: 'horror', label: 'Horror', category: 'genre' },
        { id: 'dark', label: 'Dark Themes', category: 'content' },
        { id: 'contemporary-fiction', label: 'Contemporary Fiction', category: 'genre' },
        { id: 'social', label: 'Social Gatherings / Events', category: 'content' },
        { id: 'new-author', label: 'New-to-You Author', category: 'content' }
    ];

    test('returns null for empty groups', () => {
        expect(renderItemTagBadges([], mockBookTags)).toBeNull();
    });

    test('renders single-tag group without connectors', () => {
        const el = renderItemTagBadges([['romance']], mockBookTags);
        expect(el.querySelector('.item-tag-label').textContent).toBe('Responds to:');
        const badges = el.querySelectorAll('.item-tag-badge');
        expect(badges).toHaveLength(1);
        expect(badges[0].textContent).toBe('Romance');
        expect(el.querySelector('.item-tag-connector')).toBeNull();
    });

    test('renders multiple single-tag groups without connectors', () => {
        const el = renderItemTagBadges([['romance'], ['fantasy']], mockBookTags);
        const badges = el.querySelectorAll('.item-tag-badge');
        expect(badges).toHaveLength(2);
        expect(badges[0].textContent).toBe('Romance');
        expect(badges[1].textContent).toBe('Fantasy');
        expect(el.querySelector('.item-tag-connector')).toBeNull();
    });

    test('renders AND group with + connector', () => {
        const el = renderItemTagBadges([['fantasy', 'fae']], mockBookTags);
        const badges = el.querySelectorAll('.item-tag-badge');
        expect(badges).toHaveLength(2);
        expect(badges[0].textContent).toBe('Fantasy');
        expect(badges[1].textContent).toBe('Fae / Faerie');
        const connectors = el.querySelectorAll('.item-tag-connector');
        expect(connectors).toHaveLength(1);
        expect(connectors[0].textContent).toBe('+');
    });

    test('renders mixed groups with or and + connectors', () => {
        const el = renderItemTagBadges([['horror'], ['fantasy', 'dark']], mockBookTags);
        const badges = el.querySelectorAll('.item-tag-badge');
        expect(badges).toHaveLength(3);
        expect(badges[0].textContent).toBe('Horror');
        expect(badges[1].textContent).toBe('Fantasy');
        expect(badges[2].textContent).toBe('Dark Themes');
        const connectors = el.querySelectorAll('.item-tag-connector');
        expect(connectors).toHaveLength(2);
        expect(connectors[0].textContent).toBe('or');
        expect(connectors[1].textContent).toBe('+');
    });

    test('falls back to tag ID when tag not found in bookTags', () => {
        const el = renderItemTagBadges([['unknown-tag']], mockBookTags);
        const badges = el.querySelectorAll('.item-tag-badge');
        expect(badges).toHaveLength(1);
        expect(badges[0].textContent).toBe('unknown-tag');
    });
});

describe('renderItemCard tag integration', () => {
    test('renders tag badges on item card with tagMatch effects', () => {
        const item = {
            name: 'Test Item',
            type: 'Wearable',
            bonus: 'Test bonus text',
            img: '',
            effects: [
                {
                    trigger: 'ON_QUEST_COMPLETED',
                    condition: { tagMatch: [['romance'], ['fantasy']] },
                    modifier: { type: 'ADD_FLAT', resource: 'inkDrops', value: 10 },
                    slot: 'equipped'
                }
            ]
        };
        const card = renderItemCard(item, 0, { showEquip: true });
        const tagSection = card.querySelector('.item-tag-section');
        expect(tagSection).not.toBeNull();
        const badges = tagSection.querySelectorAll('.item-tag-badge');
        expect(badges).toHaveLength(2);
    });

    test('does not render tag section on item without tagMatch', () => {
        const item = {
            name: 'Plain Item',
            type: 'Wearable',
            bonus: 'Some bonus',
            img: ''
        };
        const card = renderItemCard(item, 0, { showEquip: true });
        expect(card.querySelector('.item-tag-section')).toBeNull();
    });
});
