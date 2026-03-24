/**
 * Tests for Data Validation and Migration System
 */

import { 
    validateCharacterState, 
    validateFormDataSafe,
    SCHEMA_VERSION,
    getStoredSchemaVersion,
    saveSchemaVersion
} from '../assets/js/character-sheet/dataValidator.js';
import { 
    migrateState, 
    loadAndMigrateState 
} from '../assets/js/character-sheet/dataMigrator.js';
import { STORAGE_KEYS } from '../assets/js/character-sheet/storageKeys.js';
import { safeGetJSON, safeSetJSON } from '../assets/js/utils/storage.js';

describe('Data Validation', () => {
    beforeEach(() => {
        localStorage.clear();
    });

    describe('validateCharacterState', () => {
        test('should return empty state for null input', () => {
            const validated = validateCharacterState(null);
            expect(validated).toBeDefined();
            expect(Array.isArray(validated[STORAGE_KEYS.ACTIVE_ASSIGNMENTS])).toBe(true);
            expect(validated[STORAGE_KEYS.ACTIVE_ASSIGNMENTS].length).toBe(0);
        });

        test('should validate and fix quests with missing rewards', () => {
            const state = {
                [STORAGE_KEYS.ACTIVE_ASSIGNMENTS]: [
                    {
                        type: '♥ Organize the Stacks',
                        prompt: 'Fantasy',
                        book: 'Test Book',
                        month: 'January',
                        year: '2024'
                        // Missing rewards
                    }
                ]
            };

            const validated = validateCharacterState(state);
            expect(validated[STORAGE_KEYS.ACTIVE_ASSIGNMENTS].length).toBe(1);
            expect(validated[STORAGE_KEYS.ACTIVE_ASSIGNMENTS][0].rewards).toBeDefined();
            expect(typeof validated[STORAGE_KEYS.ACTIVE_ASSIGNMENTS][0].rewards.xp).toBe('number');
        });

        test('should preserve restorationData in restoration quests', () => {
            const state = {
                [STORAGE_KEYS.ACTIVE_ASSIGNMENTS]: [
                    {
                        type: '🔨 Restoration Project',
                        prompt: 'Restore Card Catalog: Read a translated book',
                        book: 'Test Book',
                        month: 'January',
                        year: '2024',
                        rewards: { xp: 0, inkDrops: 0, paperScraps: 0, items: [] },
                        restorationData: {
                            wingId: '1',
                            wingName: 'The Scholarly Archives',
                            projectId: 'restore-card-catalog',
                            projectName: 'Restore Card Catalog',
                            cost: 30,
                            rewardType: 'passiveItemSlot'
                        }
                    }
                ]
            };

            const validated = validateCharacterState(state);
            expect(validated[STORAGE_KEYS.ACTIVE_ASSIGNMENTS].length).toBe(1);
            expect(validated[STORAGE_KEYS.ACTIVE_ASSIGNMENTS][0].restorationData).toBeDefined();
            expect(validated[STORAGE_KEYS.ACTIVE_ASSIGNMENTS][0].restorationData.wingId).toBe('1');
            expect(validated[STORAGE_KEYS.ACTIVE_ASSIGNMENTS][0].restorationData.wingName).toBe('The Scholarly Archives');
            expect(validated[STORAGE_KEYS.ACTIVE_ASSIGNMENTS][0].restorationData.projectId).toBe('restore-card-catalog');
        });

        test('should validate and default shopping/subscription state (v10)', () => {
            const state = {
                [STORAGE_KEYS.SHOPPING_LOG]: [{ optionId: 'opt1', logDate: '2024-01-15', inkDrops: 5 }],
                [STORAGE_KEYS.BOOK_BOX_SUBSCRIPTIONS]: { sub1: { id: 'sub1', company: 'Acme', tier: 'Standard', skipsAllowedPerYear: 2 } },
                [STORAGE_KEYS.BOOK_BOX_HISTORY]: [{ subscriptionId: 'sub1', month: 'January', year: '2024', type: 'purchased' }]
            };
            const validated = validateCharacterState(state);
            expect(Array.isArray(validated[STORAGE_KEYS.SHOPPING_LOG])).toBe(true);
            expect(validated[STORAGE_KEYS.SHOPPING_LOG].length).toBe(1);
            expect(validated[STORAGE_KEYS.SHOPPING_LOG][0].optionId).toBe('opt1');
            expect(validated[STORAGE_KEYS.SHOPPING_LOG][0].inkDrops).toBe(5);
            expect(typeof validated[STORAGE_KEYS.BOOK_BOX_SUBSCRIPTIONS]).toBe('object');
            expect(validated[STORAGE_KEYS.BOOK_BOX_SUBSCRIPTIONS].sub1.company).toBe('Acme');
            expect(Array.isArray(validated[STORAGE_KEYS.BOOK_BOX_HISTORY])).toBe(true);
            expect(validated[STORAGE_KEYS.BOOK_BOX_HISTORY].length).toBe(1);
            expect(validated[STORAGE_KEYS.BOOK_BOX_HISTORY][0].type).toBe('purchased');
        });

        test('should add shelfCategory to validated books (v10)', () => {
            const state = {
                [STORAGE_KEYS.BOOKS]: {
                    b1: {
                        id: 'b1',
                        title: 'T',
                        author: 'A',
                        status: 'reading',
                        dateAdded: '2024-01-01T00:00:00.000Z',
                        dateCompleted: null,
                        links: { questIds: [], curriculumPromptIds: [] }
                    }
                }
            };
            const validated = validateCharacterState(state);
            expect(validated[STORAGE_KEYS.BOOKS].b1.shelfCategory).toBe('general');
        });

        test('should set restorationData to null for non-restoration quests', () => {
            const state = {
                [STORAGE_KEYS.ACTIVE_ASSIGNMENTS]: [
                    {
                        type: '♥ Organize the Stacks',
                        prompt: 'Fantasy',
                        book: 'Test Book',
                        month: 'January',
                        year: '2024',
                        rewards: { xp: 0, inkDrops: 0, paperScraps: 0, items: [] }
                        // No restorationData
                    }
                ]
            };

            const validated = validateCharacterState(state);
            expect(validated[STORAGE_KEYS.ACTIVE_ASSIGNMENTS][0].restorationData).toBeNull();
        });

        test('should filter out invalid quests', () => {
            const state = {
                [STORAGE_KEYS.ACTIVE_ASSIGNMENTS]: [
                    { type: '♥ Organize the Stacks', prompt: 'Fantasy', book: 'Test', month: 'Jan', year: '2024', rewards: { xp: 15, inkDrops: 10, paperScraps: 0, items: [] } },
                    null, // Invalid
                    'not an object', // Invalid
                    { type: '♥ Organize the Stacks', prompt: 'Fantasy', book: 'Test', month: 'Jan', year: '2024', rewards: { xp: 15, inkDrops: 10, paperScraps: 0, items: [] } }
                ]
            };

            const validated = validateCharacterState(state);
            expect(validated[STORAGE_KEYS.ACTIVE_ASSIGNMENTS].length).toBe(2);
        });

        test('should dedupe completed quests when id and signature both match', () => {
            const duplicateId = 'quest-dup-1';
            const state = {
                [STORAGE_KEYS.COMPLETED_QUESTS]: [
                    { id: duplicateId, type: '🔨 Restoration Project', prompt: 'Front Desk: Restore it', book: 'Book A', month: 'March', year: '2026', rewards: { xp: 10, inkDrops: 5, paperScraps: 0, items: [] } },
                    { id: duplicateId, type: '🔨 Restoration Project', prompt: 'Front Desk: Restore it', book: 'Book A', month: 'March', year: '2026', rewards: { xp: 10, inkDrops: 5, paperScraps: 0, items: [] } }
                ]
            };

            const validated = validateCharacterState(state);
            expect(validated[STORAGE_KEYS.COMPLETED_QUESTS]).toHaveLength(1);
            expect(validated[STORAGE_KEYS.COMPLETED_QUESTS][0].id).toBe(duplicateId);
        });

        test('should keep distinct completed quests when only id collides', () => {
            const duplicateId = 'quest-dup-1';
            const state = {
                [STORAGE_KEYS.COMPLETED_QUESTS]: [
                    {
                        id: duplicateId,
                        type: '🔨 Restoration Project',
                        prompt: 'Repair Front Desk: Complete this project',
                        book: 'Book A',
                        month: 'March',
                        year: '2026',
                        restorationData: { projectId: 'repair-front-desk' },
                        rewards: { xp: 10, inkDrops: 5, paperScraps: 0, items: [] }
                    },
                    {
                        id: duplicateId,
                        type: '🔨 Restoration Project',
                        prompt: 'Restore Grand Entrance: Complete this project',
                        book: 'Book A',
                        month: 'March',
                        year: '2026',
                        restorationData: { projectId: 'restore-grand-entrance' },
                        rewards: { xp: 10, inkDrops: 5, paperScraps: 0, items: [] }
                    }
                ]
            };

            const validated = validateCharacterState(state);
            expect(validated[STORAGE_KEYS.COMPLETED_QUESTS]).toHaveLength(2);
        });

        test('should dedupe id-less completed quests with identical signature', () => {
            const quest = {
                type: '🔨 Restoration Project',
                prompt: 'Front Desk: Restore it',
                book: 'Book A',
                month: 'March',
                year: '2026',
                dateCompleted: '2026-03-10T10:00:00.000Z',
                rewards: { xp: 10, inkDrops: 5, paperScraps: 0, items: [] }
            };
            const state = {
                [STORAGE_KEYS.COMPLETED_QUESTS]: [quest, { ...quest }]
            };

            const validated = validateCharacterState(state);
            expect(validated[STORAGE_KEYS.COMPLETED_QUESTS]).toHaveLength(1);
        });

        test('should fix invalid reward values', () => {
            const state = {
                [STORAGE_KEYS.ACTIVE_ASSIGNMENTS]: [
                    {
                        type: '♥ Organize the Stacks',
                        prompt: 'Fantasy',
                        book: 'Test',
                        month: 'Jan',
                        year: '2024',
                        rewards: {
                            xp: 'not a number', // Invalid
                            inkDrops: -5, // Invalid (negative)
                            paperScraps: NaN, // Invalid
                            items: 'not an array', // Invalid
                            modifiedBy: null // Invalid
                        }
                    }
                ]
            };

            const validated = validateCharacterState(state);
            const rewards = validated[STORAGE_KEYS.ACTIVE_ASSIGNMENTS][0].rewards;
            expect(rewards.xp).toBe(0);
            expect(rewards.inkDrops).toBe(0); // Negative values become 0
            expect(rewards.paperScraps).toBe(0);
            expect(Array.isArray(rewards.items)).toBe(true);
            expect(Array.isArray(rewards.modifiedBy)).toBe(true);
        });

        test('should validate items array', () => {
            const state = {
                [STORAGE_KEYS.INVENTORY_ITEMS]: [
                    { name: 'Valid Item', type: 'Wearable', img: 'test.png', bonus: 'Test' },
                    null, // Invalid
                    { name: 'Another Item', type: 'Non-Wearable', img: 'test2.png', bonus: 'Test2' },
                    { name: '' }, // Invalid (empty name)
                    'not an object' // Invalid
                ]
            };

            const validated = validateCharacterState(state);
            expect(validated[STORAGE_KEYS.INVENTORY_ITEMS].length).toBe(2);
            expect(validated[STORAGE_KEYS.INVENTORY_ITEMS][0].name).toBe('Valid Item');
        });

        test('should validate temporary buffs', () => {
            const state = {
                [STORAGE_KEYS.TEMPORARY_BUFFS]: [
                    { name: 'Valid Buff', description: 'Test', duration: 'two-months', monthsRemaining: 2, status: 'active' },
                    null, // Invalid
                    { name: '' }, // Invalid
                    { name: 'Another Buff', description: 'Test2', duration: 'until-end-month', monthsRemaining: -1, status: 'active' }
                ]
            };

            const validated = validateCharacterState(state);
            expect(validated[STORAGE_KEYS.TEMPORARY_BUFFS].length).toBe(2);
            expect(validated[STORAGE_KEYS.TEMPORARY_BUFFS][1].monthsRemaining).toBe(0); // Negative becomes 0
        });

        test('should validate atmospheric buffs', () => {
            const state = {
                [STORAGE_KEYS.ATMOSPHERIC_BUFFS]: {
                    'Valid Buff': { daysUsed: 5, isActive: true },
                    'Invalid Buff': { daysUsed: 'not a number', isActive: 'not boolean' },
                    'Another Buff': { daysUsed: -3, isActive: true }
                }
            };

            const validated = validateCharacterState(state);
            expect(validated[STORAGE_KEYS.ATMOSPHERIC_BUFFS]['Valid Buff'].daysUsed).toBe(5);
            expect(validated[STORAGE_KEYS.ATMOSPHERIC_BUFFS]['Invalid Buff'].daysUsed).toBe(0);
            expect(validated[STORAGE_KEYS.ATMOSPHERIC_BUFFS]['Another Buff'].daysUsed).toBe(0); // Negative becomes 0
        });

        test('should validate string arrays', () => {
            const state = {
                [STORAGE_KEYS.LEARNED_ABILITIES]: [
                    'Valid Ability',
                    '',
                    'Another Ability',
                    null,
                    123,
                    '   ', // Only whitespace
                    'Valid Again'
                ]
            };

            const validated = validateCharacterState(state);
            expect(validated[STORAGE_KEYS.LEARNED_ABILITIES].length).toBe(3);
            expect(validated[STORAGE_KEYS.LEARNED_ABILITIES]).toContain('Valid Ability');
            expect(validated[STORAGE_KEYS.LEARNED_ABILITIES]).toContain('Another Ability');
            expect(validated[STORAGE_KEYS.LEARNED_ABILITIES]).toContain('Valid Again');
        });

        test('should validate numbers', () => {
            const state = {
                [STORAGE_KEYS.BUFF_MONTH_COUNTER]: 'not a number'
            };

            const validated = validateCharacterState(state);
            expect(validated[STORAGE_KEYS.BUFF_MONTH_COUNTER]).toBe(0);
        });

        test('should validate genre dice selection', () => {
            const state = {
                [STORAGE_KEYS.GENRE_DICE_SELECTION]: 'd8'
            };

            const validated = validateCharacterState(state);
            expect(validated[STORAGE_KEYS.GENRE_DICE_SELECTION]).toBe('d8');
        });

        test('should default to d6 for invalid genre dice selection', () => {
            const state = {
                [STORAGE_KEYS.GENRE_DICE_SELECTION]: 'invalid'
            };

            const validated = validateCharacterState(state);
            expect(validated[STORAGE_KEYS.GENRE_DICE_SELECTION]).toBe('d6');
        });

        test('should validate all valid dice types', () => {
            const validDice = ['d4', 'd6', 'd8', 'd10', 'd12', 'd20'];
            
            validDice.forEach(dice => {
                const state = {
                    [STORAGE_KEYS.GENRE_DICE_SELECTION]: dice
                };
                const validated = validateCharacterState(state);
                expect(validated[STORAGE_KEYS.GENRE_DICE_SELECTION]).toBe(dice);
            });
        });

        test('should handle completely corrupted state', () => {
            const state = {
                [STORAGE_KEYS.ACTIVE_ASSIGNMENTS]: 'not an array',
                [STORAGE_KEYS.COMPLETED_QUESTS]: null,
                [STORAGE_KEYS.ATMOSPHERIC_BUFFS]: 'not an object',
                [STORAGE_KEYS.BUFF_MONTH_COUNTER]: 'invalid'
            };

            const validated = validateCharacterState(state);
            expect(Array.isArray(validated[STORAGE_KEYS.ACTIVE_ASSIGNMENTS])).toBe(true);
            expect(Array.isArray(validated[STORAGE_KEYS.COMPLETED_QUESTS])).toBe(true);
            expect(typeof validated[STORAGE_KEYS.ATMOSPHERIC_BUFFS]).toBe('object');
            expect(typeof validated[STORAGE_KEYS.BUFF_MONTH_COUNTER]).toBe('number');
        });

        test('should migrate legacy quests with book data into books state (schema v4 to v5)', () => {
            // Start from schema version 4 so migrateState will apply the v5 migration.
            localStorage.setItem('tomeOfSecrets_schemaVersion', '4');

            const sharedTitle = 'Shared Legacy Book';
            const sharedAuthor = 'Legacy Author';

            // Legacy quests: no id/bookId fields, but with book metadata.
            const legacyActiveQuests = [
                {
                    type: '♣ Side Quest',
                    prompt: 'Legacy Active',
                    book: sharedTitle,
                    bookAuthor: sharedAuthor,
                    month: 'January',
                    year: '2024',
                    coverUrl: 'https://example.com/cover.jpg',
                    pageCountRaw: 350,
                    rewards: { xp: 10, inkDrops: 5, paperScraps: 0, items: [], modifiedBy: [] }
                }
            ];
            const legacyCompletedQuests = [
                {
                    type: '♥ Organize the Stacks',
                    prompt: 'Legacy Completed',
                    book: sharedTitle,
                    bookAuthor: sharedAuthor,
                    month: 'February',
                    year: '2024',
                    coverUrl: 'https://example.com/cover.jpg',
                    pageCountEffective: 350,
                    rewards: { xp: 15, inkDrops: 10, paperScraps: 0, items: [], modifiedBy: [] }
                }
            ];

            // Store legacy data without BOOKS / EXTERNAL_CURRICULUM keys.
            safeSetJSON(STORAGE_KEYS.ACTIVE_ASSIGNMENTS, legacyActiveQuests);
            safeSetJSON(STORAGE_KEYS.COMPLETED_QUESTS, legacyCompletedQuests);
            safeSetJSON(STORAGE_KEYS.DISCARDED_QUESTS, []);

            const loaded = loadAndMigrateState();
            const validated = validateCharacterState(loaded);

            // Books state should be created and deduplicated by title+author.
            const books = validated[STORAGE_KEYS.BOOKS];
            expect(books).toBeDefined();
            const bookIds = Object.keys(books);
            expect(bookIds.length).toBe(1);

            const book = books[bookIds[0]];
            expect(book.title).toBe(sharedTitle);
            expect(book.author).toBe(sharedAuthor);
            expect(book.status).toBe('reading'); // Still reading because there is an active quest for this book.
            expect(Array.isArray(book.links.questIds)).toBe(true);
            expect(book.links.questIds.length).toBe(2);

            // Quests should now have ids and bookIds pointing at the migrated Book.
            const activeQuest = validated[STORAGE_KEYS.ACTIVE_ASSIGNMENTS][0];
            const completedQuest = validated[STORAGE_KEYS.COMPLETED_QUESTS][0];
            expect(typeof activeQuest.id).toBe('string');
            expect(typeof completedQuest.id).toBe('string');
            expect(activeQuest.bookId).toBe(book.id);
            expect(completedQuest.bookId).toBe(book.id);

            // External curriculum state should be initialized to the expected shape.
            expect(validated[STORAGE_KEYS.EXTERNAL_CURRICULUM]).toBeDefined();
            expect(validated[STORAGE_KEYS.EXTERNAL_CURRICULUM].curriculums).toBeDefined();
            expect(typeof validated[STORAGE_KEYS.EXTERNAL_CURRICULUM].curriculums).toBe('object');
        });
    });

    describe('validateFormDataSafe', () => {
        test('should return empty object for null input', () => {
            const validated = validateFormDataSafe(null);
            expect(typeof validated).toBe('object');
            expect(Object.keys(validated).length).toBe(0);
        });

        test('should filter out non-string/non-number values', () => {
            const formData = {
                validString: 'test',
                validNumber: 123,
                invalidObject: {},
                invalidArray: [],
                invalidNull: null
            };

            const validated = validateFormDataSafe(formData);
            expect(validated.validString).toBe('test');
            expect(validated.validNumber).toBe(123);
            expect(validated.invalidObject).toBeUndefined();
            expect(validated.invalidArray).toBeUndefined();
            expect(validated.invalidNull).toBeUndefined();
        });
    });

    describe('Schema Version', () => {
        test('should save and retrieve schema version', () => {
            saveSchemaVersion();
            const version = getStoredSchemaVersion();
            expect(version).toBe(SCHEMA_VERSION);
        });

        test('should return null if no version stored', () => {
            localStorage.clear();
            const version = getStoredSchemaVersion();
            expect(version).toBeNull();
        });

        test('schema version should be 12', () => {
            expect(SCHEMA_VERSION).toBe(12);
        });
    });
});

describe('Data Migration', () => {
    beforeEach(() => {
        localStorage.clear();
    });

    describe('migrateState', () => {
        test('should migrate quests without rewards', () => {
            const state = {
                [STORAGE_KEYS.ACTIVE_ASSIGNMENTS]: [
                    {
                        type: '♥ Organize the Stacks',
                        prompt: 'Fantasy',
                        book: 'Test',
                        month: 'Jan',
                        year: '2024'
                        // Missing rewards
                    }
                ]
            };

            const migrated = migrateState(state);
            expect(migrated[STORAGE_KEYS.ACTIVE_ASSIGNMENTS][0].rewards).toBeDefined();
            expect(migrated[STORAGE_KEYS.ACTIVE_ASSIGNMENTS][0].rewards.xp).toBe(15);
            expect(migrated[STORAGE_KEYS.ACTIVE_ASSIGNMENTS][0].rewards.inkDrops).toBe(10);
        });

        test('should not migrate if already at current version and no repair needed', () => {
            saveSchemaVersion();
            // State with no quests that have book data (or already have bookId) so repair is not run
            const state = {
                [STORAGE_KEYS.ACTIVE_ASSIGNMENTS]: [],
                [STORAGE_KEYS.COMPLETED_QUESTS]: [],
                [STORAGE_KEYS.DISCARDED_QUESTS]: []
            };

            const migrated = migrateState(state);
            expect(migrated).toBe(state); // Same object when at current version and no books repair needed
        });

        test('should initialize curseHelperState (v11) and questDrawHelperState (v12) when upgrading from v10', () => {
            localStorage.setItem('tomeOfSecrets_schemaVersion', '10');
            const state = {
                [STORAGE_KEYS.ACTIVE_ASSIGNMENTS]: []
            };
            const migrated = migrateState(state);
            expect(migrated[STORAGE_KEYS.CURSE_HELPER_STATE]).toEqual({});
            expect(migrated[STORAGE_KEYS.QUEST_DRAW_HELPER_STATE]).toEqual({});
            expect(getStoredSchemaVersion()).toBe(SCHEMA_VERSION);
        });

        test('should add missing state keys with defaults', () => {
            const state = {
                [STORAGE_KEYS.ACTIVE_ASSIGNMENTS]: []
                // Missing other keys
            };

            const migrated = migrateState(state);
            expect(Array.isArray(migrated[STORAGE_KEYS.COMPLETED_QUESTS])).toBe(true);
            expect(Array.isArray(migrated[STORAGE_KEYS.INVENTORY_ITEMS])).toBe(true);
            expect(typeof migrated[STORAGE_KEYS.ATMOSPHERIC_BUFFS]).toBe('object');
            expect(migrated[STORAGE_KEYS.BUFF_MONTH_COUNTER]).toBe(0);
        });

        test('should repair books from quests when already at current schema version', () => {
            // Schema was already bumped (e.g. from a previous deploy) but quests were never migrated to books
            saveSchemaVersion();
            const state = {
                [STORAGE_KEYS.ACTIVE_ASSIGNMENTS]: [
                    {
                        type: '♥ Organize the Stacks',
                        prompt: 'Fantasy',
                        book: 'Existing Quest Book',
                        bookAuthor: 'Author',
                        month: 'January',
                        year: '2024',
                        rewards: { xp: 15, inkDrops: 10, paperScraps: 0, items: [] }
                    }
                ],
                [STORAGE_KEYS.COMPLETED_QUESTS]: [],
                [STORAGE_KEYS.DISCARDED_QUESTS]: [],
                [STORAGE_KEYS.BOOKS]: {}
            };

            const migrated = migrateState(state);

            expect(migrated).not.toBe(state);
            const books = migrated[STORAGE_KEYS.BOOKS];
            expect(Object.keys(books).length).toBe(1);
            const book = Object.values(books)[0];
            expect(book.title).toBe('Existing Quest Book');
            expect(book.author).toBe('Author');
            expect(migrated[STORAGE_KEYS.ACTIVE_ASSIGNMENTS][0].bookId).toBe(book.id);
            expect(book.links.questIds).toContain(migrated[STORAGE_KEYS.ACTIVE_ASSIGNMENTS][0].id);
        });

        test('should rename legacy genre quest name "Memoirs/Biographies" to "Memoir/Biography" in saved state', () => {
            // Start from schema version 5 so only the v6 migration runs.
            localStorage.setItem('tomeOfSecrets_schemaVersion', '5');

            const legacyGenre = 'Memoirs/Biographies';
            const currentGenre = 'Memoir/Biography';

            const state = {
                [STORAGE_KEYS.SELECTED_GENRES]: [legacyGenre, 'Fantasy'],
                [STORAGE_KEYS.ACTIVE_ASSIGNMENTS]: [
                    {
                        type: '♥ Organize the Stacks',
                        prompt: `Read a book from ${legacyGenre}`,
                        book: 'Test Book',
                        month: 'January',
                        year: '2024',
                        rewards: { xp: 15, inkDrops: 10, paperScraps: 0, items: [] }
                    }
                ],
                [STORAGE_KEYS.COMPLETED_QUESTS]: [],
                [STORAGE_KEYS.DISCARDED_QUESTS]: []
            };

            const migrated = migrateState(state);

            // Selected genres array should have the updated name.
            expect(migrated[STORAGE_KEYS.SELECTED_GENRES]).toContain(currentGenre);
            expect(migrated[STORAGE_KEYS.SELECTED_GENRES]).not.toContain(legacyGenre);

            // Quest prompt text should also be updated.
            const activeQuest = migrated[STORAGE_KEYS.ACTIVE_ASSIGNMENTS][0];
            expect(activeQuest.prompt).toContain(currentGenre);
            expect(activeQuest.prompt).not.toContain(legacyGenre);
        });

        test('v10: should add shopping/subscription state and book shelfCategory', () => {
            localStorage.setItem('tomeOfSecrets_schemaVersion', '9');
            const state = {
                [STORAGE_KEYS.BOOKS]: {
                    bid1: {
                        id: 'bid1',
                        title: 'Old Book',
                        author: 'Author',
                        status: 'reading',
                        dateAdded: '2024-01-01T00:00:00.000Z',
                        dateCompleted: null,
                        links: { questIds: [], curriculumPromptIds: [] }
                    }
                },
                [STORAGE_KEYS.ACTIVE_ASSIGNMENTS]: [],
                [STORAGE_KEYS.COMPLETED_QUESTS]: [],
                [STORAGE_KEYS.DISCARDED_QUESTS]: []
            };

            const migrated = migrateState(state);

            expect(Array.isArray(migrated[STORAGE_KEYS.SHOPPING_LOG])).toBe(true);
            expect(migrated[STORAGE_KEYS.SHOPPING_LOG]).toHaveLength(0);
            expect(typeof migrated[STORAGE_KEYS.BOOK_BOX_SUBSCRIPTIONS]).toBe('object');
            expect(Object.keys(migrated[STORAGE_KEYS.BOOK_BOX_SUBSCRIPTIONS])).toHaveLength(0);
            expect(Array.isArray(migrated[STORAGE_KEYS.BOOK_BOX_HISTORY])).toBe(true);
            expect(migrated[STORAGE_KEYS.BOOK_BOX_HISTORY]).toHaveLength(0);
            const book = migrated[STORAGE_KEYS.BOOKS].bid1;
            expect(book.shelfCategory).toBe('general');
        });
    });

    describe('loadAndMigrateState', () => {
        test('should load and migrate state from localStorage', () => {
            // Set up old format data (no schema version)
            safeSetJSON(STORAGE_KEYS.ACTIVE_ASSIGNMENTS, [
                {
                    type: '♥ Organize the Stacks',
                    prompt: 'Fantasy',
                    book: 'Test',
                    month: 'Jan',
                    year: '2024'
                    // Missing rewards
                }
            ]);

            const loaded = loadAndMigrateState();
            expect(loaded[STORAGE_KEYS.ACTIVE_ASSIGNMENTS][0].rewards).toBeDefined();
            expect(loaded[STORAGE_KEYS.ACTIVE_ASSIGNMENTS][0].rewards.xp).toBe(15);
        });

        test('should handle missing localStorage keys', () => {
            localStorage.clear();
            const loaded = loadAndMigrateState();
            expect(Array.isArray(loaded[STORAGE_KEYS.ACTIVE_ASSIGNMENTS])).toBe(true);
            expect(Array.isArray(loaded[STORAGE_KEYS.COMPLETED_QUESTS])).toBe(true);
            expect(typeof loaded[STORAGE_KEYS.ATMOSPHERIC_BUFFS]).toBe('object');
        });
    });
});

describe('Integration: Load State with Validation and Migration', () => {
    beforeEach(() => {
        localStorage.clear();
    });

    test('should handle corrupted quest data gracefully', () => {
        // Set up corrupted data
        safeSetJSON(STORAGE_KEYS.ACTIVE_ASSIGNMENTS, [
            { type: '♥ Organize the Stacks', prompt: 'Fantasy', book: 'Test', month: 'Jan', year: '2024', rewards: { xp: 15, inkDrops: 10, paperScraps: 0, items: [] } },
            null, // Corrupted
            { type: '♣ Side Quest', prompt: 'Test', book: 'Test2', month: 'Jan', year: '2024', rewards: { xp: 0, inkDrops: 5, paperScraps: 0, items: [] } }
        ]);

        const loaded = loadAndMigrateState();
        const validated = validateCharacterState(loaded);

        // Should have filtered out null entry
        expect(validated[STORAGE_KEYS.ACTIVE_ASSIGNMENTS].length).toBe(2);
        expect(validated[STORAGE_KEYS.ACTIVE_ASSIGNMENTS][0].type).toBe('♥ Organize the Stacks');
    });

        test('should preserve valid data during migration', () => {
            const originalQuests = [
                {
                    type: '♥ Organize the Stacks',
                    prompt: 'Fantasy',
                    book: 'Test Book',
                    month: 'January',
                    year: '2024',
                    status: 'active',
                    notes: 'Test notes',
                    rewards: { xp: 15, inkDrops: 10, paperScraps: 0, items: [], modifiedBy: [] }
                }
            ];

            safeSetJSON(STORAGE_KEYS.ACTIVE_ASSIGNMENTS, originalQuests);
            const loaded = loadAndMigrateState();
            const validated = validateCharacterState(loaded);

            expect(validated[STORAGE_KEYS.ACTIVE_ASSIGNMENTS][0].book).toBe('Test Book');
            expect(validated[STORAGE_KEYS.ACTIVE_ASSIGNMENTS][0].notes).toBe('Test notes');
            expect(validated[STORAGE_KEYS.ACTIVE_ASSIGNMENTS][0].rewards.xp).toBe(15);
        });

        test('should handle numeric month/year values during migration (legacy data)', () => {
            // Set schema version to 2
            localStorage.setItem('tomeOfSecrets_schemaVersion', '2');
            
            // Create quests with numeric month/year (legacy data format)
            const questsWithNumericValues = [
                {
                    type: '♥ Organize the Stacks',
                    prompt: 'Fantasy',
                    book: 'Test Book',
                    month: 12, // Numeric month (legacy)
                    year: 2024, // Numeric year (legacy)
                    rewards: { xp: 15, inkDrops: 10, paperScraps: 0, items: [], modifiedBy: [] }
                },
                {
                    type: '♣ Side Quest',
                    prompt: 'Test',
                    book: 'Test Book 2',
                    month: 3, // Numeric month
                    year: 2025, // Numeric year
                    rewards: { xp: 0, inkDrops: 5, paperScraps: 0, items: [], modifiedBy: [] }
                }
            ];
            
            safeSetJSON(STORAGE_KEYS.ACTIVE_ASSIGNMENTS, questsWithNumericValues);
            
            // Migration should not throw TypeError when calling .trim() on numeric values
            expect(() => {
                const loaded = loadAndMigrateState();
                const validated = validateCharacterState(loaded);
            }).not.toThrow();
            
            const loaded = loadAndMigrateState();
            const validated = validateCharacterState(loaded);
            
            // Should convert numeric months to month names during normalization
            // Note: normalizeQuestPeriod converts numeric values to strings and normalizes them
            const quest1 = validated[STORAGE_KEYS.ACTIVE_ASSIGNMENTS][0];
            const quest2 = validated[STORAGE_KEYS.ACTIVE_ASSIGNMENTS][1];
            
            // Numeric month 12 should be converted to "December"
            expect(quest1.month).toBe('December');
            expect(quest1.year).toBe('2024');
            
            // Numeric month 3 should be converted to "March"
            expect(quest2.month).toBe('March');
            expect(quest2.year).toBe('2025');
            
            // Should have date fields added
            expect(quest1.dateAdded).toBeNull();
            expect(quest1.dateCompleted).toBeNull();
        });

        test('should migrate from schema v2 to v3 (add date fields to quests)', () => {
            // Set schema version to 2
            localStorage.setItem('tomeOfSecrets_schemaVersion', '2');
            
            const state = {
                [STORAGE_KEYS.ACTIVE_ASSIGNMENTS]: [
                    {
                        type: '♣ Side Quest',
                        prompt: 'Test Prompt',
                        book: 'Test Book',
                        month: 'January',
                        year: '2024',
                        rewards: { xp: 10, inkDrops: 5, paperScraps: 0, items: [] }
                        // No dateAdded or dateCompleted (Schema v2)
                    }
                ],
                [STORAGE_KEYS.COMPLETED_QUESTS]: [
                    {
                        type: '♥ Organize the Stacks',
                        prompt: 'Fantasy',
                        book: 'Completed Book',
                        month: 'December',
                        year: '2023',
                        rewards: { xp: 15, inkDrops: 10, paperScraps: 0, items: [] }
                        // No dateAdded or dateCompleted (Schema v2)
                    }
                ],
                [STORAGE_KEYS.DISCARDED_QUESTS]: []
            };

            const migrated = migrateState(state);

            // All quests should have dateAdded and dateCompleted fields (set to null for existing quests)
            expect(migrated[STORAGE_KEYS.ACTIVE_ASSIGNMENTS][0].dateAdded).toBeNull();
            expect(migrated[STORAGE_KEYS.ACTIVE_ASSIGNMENTS][0].dateCompleted).toBeNull();
            
            expect(migrated[STORAGE_KEYS.COMPLETED_QUESTS][0].dateAdded).toBeNull();
            expect(migrated[STORAGE_KEYS.COMPLETED_QUESTS][0].dateCompleted).toBeNull();

            // Other quest fields should be preserved
            expect(migrated[STORAGE_KEYS.ACTIVE_ASSIGNMENTS][0].book).toBe('Test Book');
            expect(migrated[STORAGE_KEYS.COMPLETED_QUESTS][0].book).toBe('Completed Book');
        });
    });

