/**
 * Tests for Reusable Rendering Components
 */

import {
    renderQuestRow,
    renderItemCard,
    renderEmptySlot,
    renderCurseRow,
    renderTemporaryBuffRow,
    renderAbilityCard
} from '../assets/js/character-sheet/renderComponents.js';

describe('Render Components', () => {
    beforeEach(() => {
        document.body.innerHTML = '';
    });

    describe('renderQuestRow', () => {
        test('should render quest row with all fields', () => {
            const quest = {
                type: '♥ Organize the Stacks',
                prompt: 'Fantasy: Read a book with magical creatures',
                book: 'Test Book',
                month: 'January',
                year: '2024',
                notes: 'Test notes',
                rewards: { xp: 15, inkDrops: 10, paperScraps: 0, items: [] },
                buffs: []
            };

            const row = renderQuestRow(quest, 0, 'active');
            
            expect(row.tagName).toBe('TR');
            expect(row.querySelectorAll('td').length).toBeGreaterThan(0);
        });

        test('should escape user-generated content', () => {
            const quest = {
                type: '♥ Organize the Stacks',
                prompt: '<script>alert("xss")</script>',
                book: 'Test & Book',
                month: 'January',
                year: '2024',
                notes: 'Test "notes"',
                rewards: { xp: 15, inkDrops: 10, paperScraps: 0, items: [] },
                buffs: []
            };

            const row = renderQuestRow(quest, 0, 'active');
            const cells = row.querySelectorAll('td');
            
            // Check that script tags are escaped
            const promptCell = Array.from(cells).find(cell => cell.textContent.includes('script'));
            expect(promptCell).toBeDefined();
            expect(promptCell.innerHTML).toContain('&lt;script&gt;');
        });

        test('should show buff indicator for active quests with buffs', () => {
            const quest = {
                type: '♥ Organize the Stacks',
                prompt: 'Fantasy',
                book: 'Test',
                month: 'Jan',
                year: '2024',
                rewards: { xp: 15, inkDrops: 10, paperScraps: 0, items: [] },
                buffs: ['[Item] Librarian\'s Compass']
            };

            const row = renderQuestRow(quest, 0, 'active');
            const xpCell = Array.from(row.querySelectorAll('td'))[5]; // XP column
            expect(xpCell.innerHTML).toContain('*');
        });

        test('should show modified indicator for completed quests', () => {
            const quest = {
                type: '♥ Organize the Stacks',
                prompt: 'Fantasy',
                book: 'Test',
                month: 'Jan',
                year: '2024',
                rewards: { 
                    xp: 15, 
                    inkDrops: 10, 
                    paperScraps: 0, 
                    items: [],
                    modifiedBy: ['Librarian\'s Compass']
                },
                buffs: []
            };

            const row = renderQuestRow(quest, 0, 'completed');
            const xpCell = Array.from(row.querySelectorAll('td'))[5]; // XP column
            expect(xpCell.innerHTML).toContain('✓');
        });

        test('should include action buttons', () => {
            const quest = {
                type: '♥ Organize the Stacks',
                prompt: 'Fantasy',
                book: 'Test',
                month: 'Jan',
                year: '2024',
                rewards: { xp: 15, inkDrops: 10, paperScraps: 0, items: [] },
                buffs: []
            };

            const row = renderQuestRow(quest, 0, 'active');
            const actionCell = row.querySelector('.action-cell');
            
            expect(actionCell).toBeDefined();
            expect(actionCell.querySelector('.complete-quest-btn')).toBeDefined();
            expect(actionCell.querySelector('.edit-quest-btn')).toBeDefined();
        });
    });

    describe('renderItemCard', () => {
        test('should render item card with all fields', () => {
            const item = {
                name: 'Test Item',
                type: 'Wearable',
                img: 'test.png',
                bonus: 'Test bonus'
            };

            const card = renderItemCard(item, 0, { showEquip: true });
            
            expect(card.classList.contains('item-card')).toBe(true);
            expect(card.querySelector('h4').textContent).toBe('Test Item');
        });

        test('should escape item name and bonus', () => {
            const item = {
                name: '<script>alert("xss")</script>',
                type: 'Wearable',
                img: 'test.png',
                bonus: 'Test & bonus'
            };

            const card = renderItemCard(item, 0, {});
            const nameElement = card.querySelector('h4');
            
            expect(nameElement.textContent).toContain('script');
            expect(nameElement.innerHTML).not.toContain('<script>');
        });

        test('should show correct buttons based on options', () => {
            const item = {
                name: 'Test Item',
                type: 'Wearable',
                img: 'test.png',
                bonus: 'Test'
            };

            const cardWithEquip = renderItemCard(item, 0, { showEquip: true });
            expect(cardWithEquip.querySelector('.equip-btn')).toBeDefined();

            const cardWithUnequip = renderItemCard(item, 0, { showUnequip: true });
            expect(cardWithUnequip.querySelector('.unequip-btn')).toBeDefined();

            const cardWithDelete = renderItemCard(item, 0, { showDelete: true });
            expect(cardWithDelete.querySelector('.delete-item-btn')).toBeDefined();
        });

        test('should not show equip button for Quest type items', () => {
            const questItem = {
                name: 'The Grand Key',
                type: 'Quest',
                img: 'test.png',
                bonus: 'You find a master key for a special, rare quest.'
            };

            const card = renderItemCard(questItem, 0, { showEquip: true });
            expect(card.querySelector('.equip-btn')).toBeNull();
            
            // Should still show delete button if requested
            const cardWithDelete = renderItemCard(questItem, 0, { showEquip: true, showDelete: true });
            expect(cardWithDelete.querySelector('.delete-item-btn')).toBeDefined();
        });
    });

    describe('renderEmptySlot', () => {
        test('should render empty slot card', () => {
            const slot = renderEmptySlot('Wearable');
            
            expect(slot.classList.contains('item-card')).toBe(true);
            expect(slot.classList.contains('empty-slot')).toBe(true);
            expect(slot.textContent).toContain('Empty Wearable Slot');
        });
    });

    describe('renderCurseRow', () => {
        test('should render curse row with all fields', () => {
            const curse = {
                name: 'Test Curse',
                requirement: 'Test requirement',
                book: 'Test Book'
            };

            const row = renderCurseRow(curse, 0, 'Active');
            
            expect(row.tagName).toBe('TR');
            expect(row.querySelectorAll('td').length).toBe(5); // 4 data cells + 1 action cell
        });

        test('should escape curse name and requirement', () => {
            const curse = {
                name: '<script>alert("xss")</script>',
                requirement: 'Test & requirement',
                book: 'Test Book'
            };

            const row = renderCurseRow(curse, 0, 'Active');
            const cells = row.querySelectorAll('td');
            
            expect(cells[0].textContent).toContain('script');
            expect(cells[0].innerHTML).not.toContain('<script>');
        });

        test('should show correct buttons for active vs completed', () => {
            const curse = {
                name: 'Test Curse',
                requirement: 'Test',
                book: 'Test'
            };

            const activeRow = renderCurseRow(curse, 0, 'Active');
            expect(activeRow.querySelector('.complete-curse-btn')).toBeDefined();
            expect(activeRow.querySelector('.edit-curse-btn')).toBeDefined();

            const completedRow = renderCurseRow(curse, 0, 'Completed');
            expect(completedRow.querySelector('.complete-curse-btn')).toBeNull();
            expect(completedRow.querySelector('.edit-curse-btn')).toBeNull();
        });
    });

    describe('renderTemporaryBuffRow', () => {
        test('should render temporary buff row', () => {
            const buff = {
                name: 'Test Buff',
                description: 'Test description',
                duration: 'two-months',
                monthsRemaining: 2,
                status: 'active'
            };

            const row = renderTemporaryBuffRow(buff, 0);
            
            expect(row.tagName).toBe('TR');
            expect(row.querySelectorAll('td').length).toBe(5);
        });

        test('should escape buff name and description', () => {
            const buff = {
                name: '<script>alert("xss")</script>',
                description: 'Test & description',
                duration: 'two-months',
                monthsRemaining: 2,
                status: 'active'
            };

            const row = renderTemporaryBuffRow(buff, 0);
            const cells = row.querySelectorAll('td');
            
            expect(cells[0].textContent).toContain('script');
            expect(cells[0].innerHTML).not.toContain('<script>');
        });

        test('should format duration correctly', () => {
            const buffTwoMonths = {
                name: 'Test',
                description: 'Test',
                duration: 'two-months',
                monthsRemaining: 2,
                status: 'active'
            };

            const row = renderTemporaryBuffRow(buffTwoMonths, 0);
            const cells = row.querySelectorAll('td');
            expect(cells[2].textContent).toContain('2 Months Remaining');
        });

        test('should show correct buttons based on status and duration', () => {
            const oneTimeBuff = {
                name: 'Test',
                description: 'Test',
                duration: 'one-time',
                status: 'active'
            };

            const row = renderTemporaryBuffRow(oneTimeBuff, 0);
            expect(row.querySelector('.mark-buff-used-btn')).toBeDefined();
        });
    });

    describe('renderAbilityCard', () => {
        test('should render ability card', () => {
            const ability = {
                benefit: 'Test benefit',
                school: 'Divination',
                cost: 5
            };

            const card = renderAbilityCard('Test Ability', ability, 0);
            
            expect(card.classList.contains('item-card')).toBe(true);
            expect(card.querySelector('h4').textContent).toBe('Test Ability');
        });

        test('should escape ability name', () => {
            const ability = {
                benefit: 'Test',
                school: 'Divination',
                cost: 5
            };

            const card = renderAbilityCard('<script>alert("xss")</script>', ability, 0);
            const nameElement = card.querySelector('h4');
            
            expect(nameElement.textContent).toContain('script');
            expect(nameElement.innerHTML).not.toContain('<script>');
        });
    });
});

