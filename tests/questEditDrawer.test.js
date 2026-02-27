/**
 * @jest-environment jsdom
 */
import { initializeCharacterSheet } from '../assets/js/character-sheet.js';
import { characterState, loadState } from '../assets/js/character-sheet/state.js';
import { STORAGE_KEYS } from '../assets/js/character-sheet/storageKeys.js';
import { safeGetJSON, safeSetJSON } from '../assets/js/utils/storage.js';
import { dungeonRooms, allItems } from '../assets/js/character-sheet/data.js';
import * as ui from '../assets/js/character-sheet/ui.js';
import { toast } from '../assets/js/ui/toast.js';

// Mock toast module
jest.mock('../assets/js/ui/toast.js', () => ({
    toast: {
        success: jest.fn(),
        error: jest.fn(),
        info: jest.fn(),
        warning: jest.fn()
    }
}));

describe('Quest Edit Drawer', () => {
    beforeEach(async () => {
        // Clear localStorage and reset the in-memory state
        localStorage.clear();
        characterState.inventoryItems = [];
        characterState.equippedItems = [];
        characterState.activeAssignments = [];
        characterState.completedQuests = [];
        characterState.discardedQuests = [];
        characterState.temporaryBuffs = [];
        characterState[STORAGE_KEYS.PASSIVE_ITEM_SLOTS] = [];
        characterState[STORAGE_KEYS.PASSIVE_FAMILIAR_SLOTS] = [];
        // Load the character sheet HTML
        loadHTML('character-sheet.md');

        // Initialize the character sheet
        await initializeCharacterSheet();

        // Library books for book selector in edit drawer (Phase 4) - set after init so stateAdapter sees them
        characterState[STORAGE_KEYS.BOOKS] = {
            'test-book-1': {
                id: 'test-book-1',
                title: 'Updated Book',
                author: 'Updated Author',
                cover: null,
                pageCount: null,
                status: 'reading',
                dateAdded: new Date().toISOString(),
                dateCompleted: null,
                links: { questIds: [], curriculumPromptIds: [] }
            },
            'test-book-2': {
                id: 'test-book-2',
                title: 'Updated Dungeon Book',
                author: '',
                cover: null,
                pageCount: null,
                status: 'reading',
                dateAdded: new Date().toISOString(),
                dateCompleted: null,
                links: { questIds: [], curriculumPromptIds: [] }
            },
            'test-book-3': {
                id: 'test-book-3',
                title: 'Updated Restoration Book',
                author: '',
                cover: null,
                pageCount: null,
                status: 'reading',
                dateAdded: new Date().toISOString(),
                dateCompleted: null,
                links: { questIds: [], curriculumPromptIds: [] }
            },
            'test-book-4': {
                id: 'test-book-4',
                title: 'Updated Completed Book',
                author: '',
                cover: null,
                pageCount: null,
                status: 'reading',
                dateAdded: new Date().toISOString(),
                dateCompleted: null,
                links: { questIds: [], curriculumPromptIds: [] }
            }
        };

        // Clear toast mocks
        toast.success.mockClear();
        toast.error.mockClear();
        toast.info.mockClear();
        toast.warning.mockClear();
    });

    describe('Drawer Opening', () => {
        it('should open drawer when clicking Edit button on active quest', () => {
            // Add a quest to edit
            characterState.activeAssignments = [{
                type: '♥ Organize the Stacks',
                prompt: 'Fantasy',
                book: 'Test Book',
                bookAuthor: 'Test Author',
                month: 'January',
                year: '2024',
                notes: 'Test notes',
                buffs: [],
                rewards: { xp: 15, inkDrops: 10, paperScraps: 0, items: [] }
            }];

            // Re-render to show the quest
            ui.renderActiveAssignments();

            // Find and click the Edit button
            const editBtn = document.querySelector('.edit-quest-btn[data-index="0"]');
            expect(editBtn).toBeTruthy();
            editBtn.click();

            // Check that drawer is visible
            const drawer = document.getElementById('quest-edit-drawer');
            const backdrop = document.getElementById('quest-edit-backdrop');
            expect(drawer.style.display).toBe('flex');
            expect(backdrop.classList.contains('active')).toBe(true);
            expect(document.body.style.overflow).toBe('hidden');
        });

        it('should populate drawer fields correctly when editing quest', () => {
            // Add a quest
            characterState.activeAssignments = [{
                type: '♥ Organize the Stacks',
                prompt: 'Fantasy',
                book: 'Test Book',
                bookAuthor: 'Test Author',
                month: 'January',
                year: '2024',
                notes: 'Test notes',
                buffs: ['[Buff] Test Buff'],
                rewards: { xp: 15, inkDrops: 10, paperScraps: 0, items: [] }
            }];

            ui.renderActiveAssignments();

            // Click Edit
            const editBtn = document.querySelector('.edit-quest-btn[data-index="0"]');
            editBtn.click();

            // Check drawer fields
            expect(document.getElementById('edit-quest-month').value).toBe('January');
            // Year dropdown should be populated with the quest's year
            expect(document.getElementById('edit-quest-year').value).toBe('2024');
            expect(document.getElementById('edit-quest-type').value).toBe('♥ Organize the Stacks');
            // Legacy quest (no bookId): legacy display shows book/author
            const legacyDisplay = document.getElementById('edit-quest-legacy-book-display');
            expect(legacyDisplay.style.display).not.toBe('none');
            expect(legacyDisplay.textContent).toContain('Test Book');
            expect(legacyDisplay.textContent).toContain('Test Author');
            expect(document.getElementById('edit-quest-notes').value).toBe('Test notes');
        });

        it('should display read-only fields correctly', () => {
            // Add a quest
            characterState.activeAssignments = [{
                type: '♠ Dungeon Crawl',
                prompt: dungeonRooms['1'].challenge,
                book: 'Dungeon Book',
                month: 'February',
                year: '2024',
                notes: '',
                buffs: [],
                rewards: { xp: 20, inkDrops: 15, paperScraps: 0, items: [] }
            }];

            ui.renderActiveAssignments();

            // Click Edit
            const editBtn = document.querySelector('.edit-quest-btn[data-index="0"]');
            editBtn.click();

            // Check read-only fields
            const typeSelect = document.getElementById('edit-quest-type');
            expect(typeSelect.disabled).toBe(true);
            expect(typeSelect.value).toBe('♠ Dungeon Crawl');

            const statusDisplay = document.getElementById('edit-quest-status-display');
            expect(statusDisplay.textContent).toBe('Active');

            const promptDisplay = document.getElementById('edit-quest-prompt-display');
            expect(promptDisplay.textContent).toBe(dungeonRooms['1'].challenge);
        });

        it('should show correct status for completed quest', () => {
            // Add a completed quest
            characterState.completedQuests = [{
                type: '♣ Side Quest',
                prompt: 'Read a book with a blue cover',
                book: 'Completed Book',
                month: 'March',
                year: '2024',
                notes: '',
                buffs: [],
                rewards: { xp: 10, inkDrops: 5, paperScraps: 0, items: [] }
            }];

            ui.renderCompletedQuests();

            // Click Edit on completed quest
            const editBtn = document.querySelector('#completed-quests-container .edit-quest-btn[data-index="0"]');
            editBtn.click();

            const statusDisplay = document.getElementById('edit-quest-status-display');
            expect(statusDisplay.textContent).toBe('Completed');

            const headerTitle = document.getElementById('quest-edit-header-title');
            expect(headerTitle.textContent).toContain('Completed');
        });

        it('should hide prompt section for Extra Credit quests', () => {
            // Add an Extra Credit quest
            characterState.activeAssignments = [{
                type: '⭐ Extra Credit',
                prompt: null,
                book: 'Extra Book',
                month: 'April',
                year: '2024',
                notes: '',
                buffs: [],
                rewards: { xp: 5, inkDrops: 0, paperScraps: 0, items: [] }
            }];

            ui.renderActiveAssignments();

            // Click Edit
            const editBtn = document.querySelector('.edit-quest-btn[data-index="0"]');
            editBtn.click();

            const promptSection = document.getElementById('edit-quest-prompt-section');
            expect(promptSection.style.display).toBe('none');
        });
    });

    describe('Buffs Dropdown Population', () => {
        it('should populate buffs dropdown with temporary buffs', () => {
            // Add temporary buffs
            characterState.temporaryBuffs = [{
                name: 'Test Buff',
                description: 'Test description',
                duration: 'two-months',
                monthsRemaining: 2,
                status: 'active'
            }];

            // Add a quest
            characterState.activeAssignments = [{
                type: '♥ Organize the Stacks',
                prompt: 'Fantasy',
                book: 'Test Book',
                month: 'January',
                year: '2024',
                notes: '',
                buffs: [],
                rewards: { xp: 15, inkDrops: 10, paperScraps: 0, items: [] }
            }];

            ui.renderActiveAssignments();

            // Click Edit
            const editBtn = document.querySelector('.edit-quest-btn[data-index="0"]');
            editBtn.click();

            // Check card-based buffs UI
            const container = document.getElementById('edit-quest-bonus-selection-container');
            const card = container?.querySelector('.quest-bonus-card[data-value="[Buff] Test Buff"]');
            expect(card).toBeTruthy();
            expect(card.textContent).toContain('Test Buff');
        });

        it('should populate buffs dropdown with equipped items', () => {
            // Use a real item from allItems that won't be filtered out
            // Pocket Dragon is a familiar that doesn't have excludeFromQuestBonuses flag
            const testItemName = 'Pocket Dragon';
            // Add equipped items
            characterState.equippedItems = [{
                name: testItemName,
                bonus: '+20 Ink Drops',
                type: 'Familiar'
            }];

            // Add a quest
            characterState.activeAssignments = [{
                type: '♥ Organize the Stacks',
                prompt: 'Fantasy',
                book: 'Test Book',
                month: 'January',
                year: '2024',
                notes: '',
                buffs: [],
                rewards: { xp: 15, inkDrops: 10, paperScraps: 0, items: [] }
            }];

            ui.renderActiveAssignments();

            // Click Edit
            const editBtn = document.querySelector('.edit-quest-btn[data-index="0"]');
            editBtn.click();

            // Check card-based buffs UI
            const container = document.getElementById('edit-quest-bonus-selection-container');
            const card = container?.querySelector(`.quest-bonus-card[data-value="[Item] ${testItemName}"]`);
            expect(card).toBeTruthy();
            expect(card.textContent).toContain(testItemName);
        });

        it('should pre-select buffs that are already on the quest', () => {
            // Use a real item from allItems that won't be filtered out
            const testItemName = 'Pocket Dragon';
            
            // Add temporary buff
            characterState.temporaryBuffs = [{
                name: 'Test Buff',
                description: 'Test description',
                duration: 'two-months',
                monthsRemaining: 2,
                status: 'active'
            }];

            // Add equipped item
            characterState.equippedItems = [{
                name: testItemName,
                bonus: '+20 Ink Drops',
                type: 'Familiar'
            }];

            // Add a quest with buffs
            characterState.activeAssignments = [{
                type: '♥ Organize the Stacks',
                prompt: 'Fantasy',
                book: 'Test Book',
                month: 'January',
                year: '2024',
                notes: '',
                buffs: ['[Buff] Test Buff', `[Item] ${testItemName}`],
                rewards: { xp: 15, inkDrops: 10, paperScraps: 0, items: [] }
            }];

            ui.renderActiveAssignments();

            // Click Edit
            const editBtn = document.querySelector('.edit-quest-btn[data-index="0"]');
            editBtn.click();

            // Check that buffs are selected (cards + hidden JSON input)
            const container = document.getElementById('edit-quest-bonus-selection-container');
            const buffCard = container?.querySelector('.quest-bonus-card[data-value="[Buff] Test Buff"]');
            const itemCard = container?.querySelector(`.quest-bonus-card[data-value="[Item] ${testItemName}"]`);
            expect(buffCard?.classList.contains('selected')).toBe(true);
            expect(itemCard?.classList.contains('selected')).toBe(true);

            const hidden = document.getElementById('edit-quest-buffs-select');
            const selected = hidden?.value ? JSON.parse(hidden.value) : [];
            expect(selected).toContain('[Buff] Test Buff');
            expect(selected).toContain(`[Item] ${testItemName}`);
        });

        it('should include background bonuses if keeper background is set', () => {
            // Set keeper background
            const backgroundSelect = document.getElementById('keeperBackground');
            backgroundSelect.value = 'archivist';
            backgroundSelect.dispatchEvent(new Event('change'));

            // Add a quest
            characterState.activeAssignments = [{
                type: '♥ Organize the Stacks',
                prompt: 'Fantasy',
                book: 'Test Book',
                month: 'January',
                year: '2024',
                notes: '',
                buffs: [],
                rewards: { xp: 15, inkDrops: 10, paperScraps: 0, items: [] }
            }];

            ui.renderActiveAssignments();

            // Click Edit
            const editBtn = document.querySelector('.edit-quest-btn[data-index="0"]');
            editBtn.click();

            // Check background bonus appears as a card
            const container = document.getElementById('edit-quest-bonus-selection-container');
            const card = container?.querySelector('.quest-bonus-card[data-value="[Background] Archivist Bonus"]');
            expect(card).toBeTruthy();
        });
    });

    describe('Saving Changes', () => {
        it('should update quest when saving changes from drawer', () => {
            // Add a quest
            characterState.activeAssignments = [{
                type: '♥ Organize the Stacks',
                prompt: 'Fantasy',
                book: 'Original Book',
                bookAuthor: 'Original Author',
                month: 'January',
                year: '2024',
                notes: 'Original notes',
                buffs: [],
                rewards: { xp: 15, inkDrops: 10, paperScraps: 0, items: [] }
            }];

            ui.renderActiveAssignments();

            // Click Edit
            const editBtn = document.querySelector('.edit-quest-btn[data-index="0"]');
            editBtn.click();

            // Modify fields: link a library book via hidden input (book selector writes here)
            document.getElementById('edit-quest-book-id').value = 'test-book-1';
            document.getElementById('edit-quest-notes').value = 'Updated notes';
            document.getElementById('edit-quest-month').value = 'February';

            // Save changes
            const saveBtn = document.getElementById('save-quest-changes-btn');
            saveBtn.click();

            // Check quest was updated (book title/author from library)
            const quest = characterState.activeAssignments[0];
            expect(quest.bookId).toBe('test-book-1');
            expect(quest.book).toBe('Updated Book');
            expect(quest.bookAuthor).toBe('Updated Author');
            expect(quest.notes).toBe('Updated notes');
            expect(quest.month).toBe('February');
            // Prompt and type should be preserved
            expect(quest.prompt).toBe('Fantasy');
            expect(quest.type).toBe('♥ Organize the Stacks');

            // Check drawer is closed
            const drawer = document.getElementById('quest-edit-drawer');
            expect(drawer.style.display).toBe('none');

            // Check success toast was shown
            expect(toast.success).toHaveBeenCalledWith('Quest updated successfully');
        });

        it('should preserve quest type and prompt when saving', () => {
            // Add a dungeon quest
            characterState.activeAssignments = [{
                type: '♠ Dungeon Crawl',
                prompt: dungeonRooms['1'].challenge,
                book: 'Dungeon Book',
                month: 'January',
                year: '2024',
                notes: '',
                buffs: [],
                rewards: { xp: 20, inkDrops: 15, paperScraps: 0, items: [] }
            }];

            ui.renderActiveAssignments();

            // Click Edit
            const editBtn = document.querySelector('.edit-quest-btn[data-index="0"]');
            editBtn.click();

            // Change only editable fields: link library book
            document.getElementById('edit-quest-book-id').value = 'test-book-2';
            document.getElementById('edit-quest-notes').value = 'New notes';

            // Save
            document.getElementById('save-quest-changes-btn').click();

            // Verify type and prompt are preserved; book from library
            const quest = characterState.activeAssignments[0];
            expect(quest.type).toBe('♠ Dungeon Crawl');
            expect(quest.prompt).toBe(dungeonRooms['1'].challenge);
            expect(quest.bookId).toBe('test-book-2');
            expect(quest.book).toBe('Updated Dungeon Book');
            expect(quest.notes).toBe('New notes');
        });

        it('should preserve restorationData for restoration project quests', () => {
            const restorationData = {
                wingId: 'wing1',
                wingName: 'Test Wing',
                projectId: 'project1',
                projectName: 'Test Project',
                cost: 10,
                rewardType: 'item',
                rewardSuggestedItems: []
            };

            // Add a restoration quest
            characterState.activeAssignments = [{
                type: '🔨 Restoration Project',
                prompt: 'Test Restoration',
                book: 'Restoration Book',
                month: 'January',
                year: '2024',
                notes: '',
                buffs: [],
                restorationData: restorationData,
                rewards: { xp: 25, inkDrops: 0, paperScraps: 0, blueprints: 5, items: [] }
            }];

            ui.renderActiveAssignments();

            // Click Edit
            const editBtn = document.querySelector('.edit-quest-btn[data-index="0"]');
            editBtn.click();

            // Link library book
            document.getElementById('edit-quest-book-id').value = 'test-book-3';

            // Save
            document.getElementById('save-quest-changes-btn').click();

            // Verify restorationData is preserved; book from library
            const quest = characterState.activeAssignments[0];
            expect(quest.restorationData).toEqual(restorationData);
            expect(quest.bookId).toBe('test-book-3');
            expect(quest.book).toBe('Updated Restoration Book');
        });

        it('should update buffs when saving changes', () => {
            // Add temporary buff
            characterState.temporaryBuffs = [{
                name: 'Test Buff',
                description: 'Test description',
                duration: 'two-months',
                monthsRemaining: 2,
                status: 'active'
            }];

            // Use a real item from allItems that won't be filtered out
            const testItemName = 'Pocket Dragon';
            
            // Add equipped item
            characterState.equippedItems = [{
                name: testItemName,
                bonus: '+20 Ink Drops',
                type: 'Familiar'
            }];

            // Add a quest without buffs
            characterState.activeAssignments = [{
                type: '♥ Organize the Stacks',
                prompt: 'Fantasy',
                book: 'Test Book',
                month: 'January',
                year: '2024',
                notes: '',
                buffs: [],
                rewards: { xp: 15, inkDrops: 10, paperScraps: 0, items: [] }
            }];

            ui.renderActiveAssignments();

            // Click Edit
            const editBtn = document.querySelector('.edit-quest-btn[data-index="0"]');
            editBtn.click();

            // Select buffs (card-based)
            const container = document.getElementById('edit-quest-bonus-selection-container');
            const buffCard = container?.querySelector('.quest-bonus-card[data-value="[Buff] Test Buff"]');
            const itemCard = container?.querySelector(`.quest-bonus-card[data-value="[Item] ${testItemName}"]`);
            expect(buffCard).toBeTruthy();
            expect(itemCard).toBeTruthy();
            buffCard.click();
            itemCard.click();

            // Save
            document.getElementById('save-quest-changes-btn').click();

            // Verify buffs were updated
            const quest = characterState.activeAssignments[0];
            expect(quest.buffs).toContain('[Buff] Test Buff');
            expect(quest.buffs).toContain(`[Item] ${testItemName}`);
        });
    });

    describe('Closing Drawer', () => {
        beforeEach(() => {
            // Add a quest to edit
            characterState.activeAssignments = [{
                type: '♥ Organize the Stacks',
                prompt: 'Fantasy',
                book: 'Test Book',
                month: 'January',
                year: '2024',
                notes: '',
                buffs: [],
                rewards: { xp: 15, inkDrops: 10, paperScraps: 0, items: [] }
            }];

            ui.renderActiveAssignments();

            // Open drawer
            const editBtn = document.querySelector('.edit-quest-btn[data-index="0"]');
            editBtn.click();
        });

        it('should close drawer when clicking Cancel button', () => {
            const cancelBtn = document.getElementById('cancel-quest-edit-btn');
            cancelBtn.click();

            const drawer = document.getElementById('quest-edit-drawer');
            const backdrop = document.getElementById('quest-edit-backdrop');
            expect(drawer.style.display).toBe('none');
            expect(backdrop.classList.contains('active')).toBe(false);
            expect(document.body.style.overflow).toBe('');
        });

        it('should close drawer when clicking backdrop', () => {
            const backdrop = document.getElementById('quest-edit-backdrop');
            backdrop.click();

            const drawer = document.getElementById('quest-edit-drawer');
            expect(drawer.style.display).toBe('none');
            expect(backdrop.classList.contains('active')).toBe(false);
        });

        it('should close drawer when clicking close button', () => {
            const closeBtn = document.getElementById('close-quest-edit');
            closeBtn.click();

            const drawer = document.getElementById('quest-edit-drawer');
            const backdrop = document.getElementById('quest-edit-backdrop');
            expect(drawer.style.display).toBe('none');
            expect(backdrop.classList.contains('active')).toBe(false);
        });

        it('should close drawer when pressing Escape key', () => {
            const escapeEvent = new KeyboardEvent('keydown', { key: 'Escape' });
            document.dispatchEvent(escapeEvent);

            const drawer = document.getElementById('quest-edit-drawer');
            const backdrop = document.getElementById('quest-edit-backdrop');
            expect(drawer.style.display).toBe('none');
            expect(backdrop.classList.contains('active')).toBe(false);
        });

        it('should not close drawer when pressing other keys', () => {
            const otherKeyEvent = new KeyboardEvent('keydown', { key: 'Enter' });
            document.dispatchEvent(otherKeyEvent);

            const drawer = document.getElementById('quest-edit-drawer');
            expect(drawer.style.display).toBe('flex');
        });
    });

    describe('Edge Cases', () => {
        it('should not show edit button when there are no quests', () => {
            // Ensure no quests exist
            characterState.activeAssignments = [];

            // Render quest lists
            ui.renderActiveAssignments();

            // Try to find edit button (shouldn't exist)
            const editBtn = document.querySelector('.edit-quest-btn[data-index="0"]');
            expect(editBtn).toBeFalsy();
        });

        it('should handle empty fields when saving', () => {
            // Add a quest with all fields filled
            characterState.activeAssignments = [{
                type: '♥ Organize the Stacks',
                prompt: 'Fantasy',
                book: 'Test Book',
                bookAuthor: 'Test Author',
                month: 'January',
                year: '2024',
                notes: 'Test notes',
                buffs: ['[Buff] Test'],
                rewards: { xp: 15, inkDrops: 10, paperScraps: 0, items: [] }
            }];

            ui.renderActiveAssignments();

            // Click Edit
            const editBtn = document.querySelector('.edit-quest-btn[data-index="0"]');
            editBtn.click();

            // Clear all fields (book selector = unlink; no library book selected)
            document.getElementById('edit-quest-book-id').value = '';
            document.getElementById('edit-quest-notes').value = '';
            document.getElementById('edit-quest-month').value = '';
            document.getElementById('edit-quest-year').value = '';

            // Unselect all buffs (card-based hidden input)
            const buffsSelect = document.getElementById('edit-quest-buffs-select');
            buffsSelect.value = JSON.stringify([]);

            // Save
            document.getElementById('save-quest-changes-btn').click();

            // Verify empty values were saved
            const quest = characterState.activeAssignments[0];
            expect(quest.book).toBe('');
            expect(quest.bookAuthor).toBe('');
            expect(quest.notes).toBe('');
            expect(quest.month).toBe('');
            expect(quest.year).toBe('');
            expect(quest.buffs).toEqual([]);
        });

        it('should handle different quest list types (completed, discarded)', () => {
            // Add to completed quests
            characterState.completedQuests = [{
                type: '♣ Side Quest',
                prompt: 'Read a blue book',
                book: 'Completed Book',
                month: 'March',
                year: '2024',
                notes: '',
                buffs: [],
                rewards: { xp: 10, inkDrops: 5, paperScraps: 0, items: [] }
            }];

            ui.renderCompletedQuests();

            // Click Edit on completed quest
            const editBtn = document.querySelector('#completed-quests-container .edit-quest-btn[data-index="0"]');
            editBtn.click();

            // Verify drawer opened with correct status
            const drawer = document.getElementById('quest-edit-drawer');
            expect(drawer.style.display).toBe('flex');
            expect(document.getElementById('edit-quest-status-display').textContent).toBe('Completed');

            // Link library book and save
            document.getElementById('edit-quest-book-id').value = 'test-book-4';
            document.getElementById('save-quest-changes-btn').click();

            // Verify update was applied to completed quests (title from library)
            expect(characterState.completedQuests[0].bookId).toBe('test-book-4');
            expect(characterState.completedQuests[0].book).toBe('Updated Completed Book');
            expect(characterState.activeAssignments.length).toBe(0);
        });
    });
});
