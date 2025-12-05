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

        test('should not migrate if already at current version', () => {
            saveSchemaVersion();
            const state = {
                [STORAGE_KEYS.ACTIVE_ASSIGNMENTS]: [
                    {
                        type: '♥ Organize the Stacks',
                        prompt: 'Fantasy',
                        book: 'Test',
                        month: 'Jan',
                        year: '2024',
                        rewards: { xp: 15, inkDrops: 10, paperScraps: 0, items: [] }
                    }
                ]
            };

            const migrated = migrateState(state);
            expect(migrated).toBe(state); // Should return same object if no migration needed
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
});

