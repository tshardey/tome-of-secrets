/**
 * @jest-environment jsdom
 */

import { BaseQuestHandler } from '../assets/js/quest-handlers/BaseQuestHandler.js';
import { DungeonQuestHandler } from '../assets/js/quest-handlers/DungeonQuestHandler.js';
import { GenreQuestHandler } from '../assets/js/quest-handlers/GenreQuestHandler.js';
import { SideQuestHandler } from '../assets/js/quest-handlers/SideQuestHandler.js';
import { ExtraCreditHandler } from '../assets/js/quest-handlers/ExtraCreditHandler.js';
import { StandardQuestHandler } from '../assets/js/quest-handlers/StandardQuestHandler.js';
import { RestorationQuestHandler } from '../assets/js/quest-handlers/RestorationQuestHandler.js';
import { QuestHandlerFactory } from '../assets/js/quest-handlers/QuestHandlerFactory.js';
import * as data from '../assets/js/character-sheet/data.js';
import { safeGetJSON, safeSetJSON } from '../assets/js/utils/storage.js';
import { STORAGE_KEYS } from '../assets/js/character-sheet/storageKeys.js';

describe('Quest Handlers', () => {
    let formElements;

    beforeEach(() => {
        // Create mock form elements
        formElements = {
            monthInput: { value: 'January' },
            yearInput: { value: '2024' },
            bookInput: { value: 'Test Book' },
            notesInput: { value: 'Test notes' },
            statusSelect: { value: 'active' },
            buffsSelect: { selectedOptions: [], options: [] },
            backgroundSelect: { value: '' },
            dungeonRoomSelect: { value: '1' },
            dungeonEncounterSelect: { value: '' },
            dungeonActionToggle: { checked: false },
            genreQuestSelect: { value: 'Fantasy' },
            sideQuestSelect: { value: 'Visit a new-to-you bookstore or library' },
            restorationWingSelect: { value: '' },
            restorationProjectSelect: { value: '' }
        };

        // Mock localStorage for restoration quest tests
        const storage = {};
        global.localStorage = {
            getItem: jest.fn((key) => storage[key] || null),
            setItem: jest.fn((key, value) => { storage[key] = value; }),
            removeItem: jest.fn((key) => { delete storage[key]; })
        };
    });

    describe('BaseQuestHandler', () => {
        describe('completeActiveQuest', () => {
            it('should apply modifiers and background bonuses to quest rewards', () => {
                const quest = {
                    type: '♠ Dungeon Crawl',
                    prompt: 'Test Dungeon',
                    rewards: { xp: 10, inkDrops: 5, paperScraps: 5, items: [], modifiedBy: [] },
                    buffs: ['Long Read Focus'], // +10 Ink Drops
                    month: 'January',
                    year: '2024',
                    book: 'Test Book',
                    notes: ''
                };

                const completedQuest = BaseQuestHandler.completeActiveQuest(quest, 'biblioslinker');

                // Should have buff modifier applied
                expect(completedQuest.rewards.modifiedBy).toContain('Long Read Focus');
                // Should have Biblioslinker bonus (+10 Paper Scraps for dungeons)
                expect(completedQuest.rewards.modifiedBy).toContain('Biblioslinker');
                expect(completedQuest.rewards.inkDrops).toBe(15); // 5 base + 10 from Long Read Focus
                expect(completedQuest.rewards.paperScraps).toBe(15); // 5 base + 10 from Biblioslinker
            });

            it('should apply background bonuses even without buffs', () => {
                const quest = {
                    type: '♠ Dungeon Crawl',
                    prompt: 'Test Dungeon',
                    rewards: { xp: 10, inkDrops: 5, paperScraps: 5, items: [] },
                    buffs: [],
                    month: 'January',
                    year: '2024',
                    book: 'Test Book',
                    notes: ''
                };

                const completedQuest = BaseQuestHandler.completeActiveQuest(quest, 'biblioslinker');

                expect(completedQuest.rewards.modifiedBy).toContain('Biblioslinker');
                expect(completedQuest.rewards.paperScraps).toBe(15); // 5 base + 10 from Biblioslinker
            });
        });

        describe('determinePromptForEdit', () => {
            it('should return correct prompt for dungeon room quest', () => {
                const originalQuest = {
                    type: '♠ Dungeon Crawl',
                    prompt: data.dungeonRooms['1'].challenge,
                    isEncounter: false
                };

                const prompt = BaseQuestHandler.determinePromptForEdit(
                    '♠ Dungeon Crawl',
                    originalQuest,
                    formElements,
                    data
                );

                expect(prompt).toBe(data.dungeonRooms['1'].challenge);
            });

            it('should return correct prompt for dungeon encounter quest', () => {
                formElements.dungeonRoomSelect.value = '2';
                formElements.dungeonEncounterSelect.value = 'Mysterious Nymph';
                formElements.dungeonActionToggle.checked = true; // Befriend

                const originalQuest = {
                    type: '♠ Dungeon Crawl',
                    prompt: data.dungeonRooms['2'].encounters['Mysterious Nymph'].befriend,
                    isEncounter: true
                };

                const prompt = BaseQuestHandler.determinePromptForEdit(
                    '♠ Dungeon Crawl',
                    originalQuest,
                    formElements,
                    data
                );

                expect(prompt).toBe(data.dungeonRooms['2'].encounters['Mysterious Nymph'].befriend);
            });

            it('should return correct prompt for genre quest', () => {
                formElements.genreQuestSelect.value = 'Horror';
                
                const originalQuest = {
                    type: '♥ Organize the Stacks',
                    prompt: 'Fantasy'
                };

                const prompt = BaseQuestHandler.determinePromptForEdit(
                    '♥ Organize the Stacks',
                    originalQuest,
                    formElements,
                    data
                );

                expect(prompt).toBe('Horror');
            });

            it('should return correct prompt for side quest', () => {
                const sideQuestPrompt = 'Read a book with a blue cover';
                formElements.sideQuestSelect.value = sideQuestPrompt;
                
                const originalQuest = {
                    type: '♣ Side Quest',
                    prompt: 'Old Prompt'
                };

                const prompt = BaseQuestHandler.determinePromptForEdit(
                    '♣ Side Quest',
                    originalQuest,
                    formElements,
                    data
                );

                expect(prompt).toBe(sideQuestPrompt);
            });

            it('should return correct prompt for extra credit quest', () => {
                const originalQuest = {
                    type: '⭐ Extra Credit',
                    prompt: 'Book read outside of quest pool'
                };

                const prompt = BaseQuestHandler.determinePromptForEdit(
                    '⭐ Extra Credit',
                    originalQuest,
                    formElements,
                    data
                );

                expect(prompt).toBe('Book read outside of quest pool');
            });
        });
    });

    describe('DungeonQuestHandler', () => {
        it('should validate dungeon room selection', () => {
            formElements.dungeonRoomSelect.value = '';
            const handler = new DungeonQuestHandler(formElements, data);

            const validation = handler.validate();

            expect(validation.valid).toBe(false);
            expect(validation.error).toBeDefined();
            expect(validation.errors).toBeDefined();
        });

        it('should create quest for dungeon room without encounter', () => {
            formElements.dungeonRoomSelect.value = '1';
            formElements.dungeonEncounterSelect.value = '';
            
            const handler = new DungeonQuestHandler(formElements, data);
            const quests = handler.createQuests();

            expect(quests).toHaveLength(1);
            expect(quests[0].type).toBe('♠ Dungeon Crawl');
            expect(quests[0].prompt).toBe(data.dungeonRooms['1'].challenge);
            expect(quests[0].isEncounter).toBe(false);
        });

        it('should create two quests for dungeon room with encounter', () => {
            formElements.dungeonRoomSelect.value = '2';
            formElements.dungeonEncounterSelect.value = 'Mysterious Nymph';
            formElements.dungeonActionToggle.checked = true; // Befriend
            
            const handler = new DungeonQuestHandler(formElements, data);
            const quests = handler.createQuests();

            expect(quests).toHaveLength(2);
            
            // Room quest
            expect(quests[0].type).toBe('♠ Dungeon Crawl');
            expect(quests[0].prompt).toBe(data.dungeonRooms['2'].challenge);
            expect(quests[0].isEncounter).toBe(false);
            
            // Encounter quest
            expect(quests[1].type).toBe('♠ Dungeon Crawl');
            expect(quests[1].prompt).toBe(data.dungeonRooms['2'].encounters['Mysterious Nymph'].befriend);
            expect(quests[1].isEncounter).toBe(true);
        });

        it('should only create one quest for room without encounters', () => {
            formElements.dungeonRoomSelect.value = '3'; // Author's study has no encounters
            formElements.dungeonEncounterSelect.value = '';
            
            const handler = new DungeonQuestHandler(formElements, data);
            const quests = handler.createQuests();

            expect(quests).toHaveLength(1);
            expect(quests[0].prompt).toBe(data.dungeonRooms['3'].challenge);
        });

        it('should include rewards in dungeon quest', () => {
            formElements.dungeonRoomSelect.value = '1';
            formElements.dungeonEncounterSelect.value = '';
            
            const handler = new DungeonQuestHandler(formElements, data);
            const quests = handler.createQuests();

            // Verify rewards object exists and has expected properties
            expect(quests[0].rewards).toBeDefined();
            expect(quests[0].rewards).toHaveProperty('xp');
            expect(quests[0].rewards).toHaveProperty('inkDrops');
            expect(quests[0].rewards).toHaveProperty('paperScraps');
            expect(quests[0].rewards).toHaveProperty('items');
        });
    });

    describe('GenreQuestHandler', () => {
        it('should validate genre selection', () => {
            formElements.genreQuestSelect.value = '';
            const handler = new GenreQuestHandler(formElements, data);

            const validation = handler.validate();

            expect(validation.valid).toBe(false);
            expect(validation.error).toBeDefined();
            expect(validation.errors).toBeDefined();
        });

        it('should create genre quest', () => {
            formElements.genreQuestSelect.value = 'Fantasy';
            
            const handler = new GenreQuestHandler(formElements, data);
            const quests = handler.createQuests();

            expect(quests).toHaveLength(1);
            expect(quests[0].type).toBe('♥ Organize the Stacks');
            expect(quests[0].prompt).toBe('Fantasy');
        });

        it('should calculate correct rewards for genre quest', () => {
            formElements.genreQuestSelect.value = 'Fantasy';
            
            const handler = new GenreQuestHandler(formElements, data);
            const quests = handler.createQuests();

            expect(quests[0].rewards.xp).toBeGreaterThan(0);
            expect(quests[0].rewards.inkDrops).toBeGreaterThan(0);
        });
    });

    describe('SideQuestHandler', () => {
        it('should validate side quest selection', () => {
            formElements.sideQuestSelect.value = '';
            const handler = new SideQuestHandler(formElements, data);

            const validation = handler.validate();

            expect(validation.valid).toBe(false);
            expect(validation.error).toBeDefined();
            expect(validation.errors).toBeDefined();
        });

        it('should create side quest', () => {
            const sideQuestPrompt = 'Visit a new-to-you bookstore or library';
            formElements.sideQuestSelect.value = sideQuestPrompt;
            
            const handler = new SideQuestHandler(formElements, data);
            const quests = handler.createQuests();

            expect(quests).toHaveLength(1);
            expect(quests[0].type).toBe('♣ Side Quest');
            expect(quests[0].prompt).toBe(sideQuestPrompt);
        });

        it('should include rewards in side quest', () => {
            formElements.sideQuestSelect.value = 'Visit a new-to-you bookstore or library';
            
            const handler = new SideQuestHandler(formElements, data);
            const quests = handler.createQuests();

            // Verify rewards object exists and has expected properties
            expect(quests[0].rewards).toBeDefined();
            expect(quests[0].rewards).toHaveProperty('xp');
            expect(quests[0].rewards).toHaveProperty('inkDrops');
            expect(quests[0].rewards).toHaveProperty('paperScraps');
        });
    });

    describe('ExtraCreditHandler', () => {
        it('should always validate successfully', () => {
            const handler = new ExtraCreditHandler(formElements, data);

            const validation = handler.validate();

            expect(validation.valid).toBe(true);
        });

        it('should create extra credit quest', () => {
            const handler = new ExtraCreditHandler(formElements, data);
            const quests = handler.createQuests();

            expect(quests).toHaveLength(1);
            expect(quests[0].type).toBe('⭐ Extra Credit');
            expect(quests[0].prompt).toBe('Book read outside of quest pool');
        });

        it('should calculate correct rewards for extra credit quest', () => {
            const handler = new ExtraCreditHandler(formElements, data);
            const quests = handler.createQuests();

            expect(quests[0].rewards.paperScraps).toBe(10);
            expect(quests[0].rewards.xp).toBe(0);
            expect(quests[0].rewards.inkDrops).toBe(0);
        });
    });

    describe('QuestHandlerFactory', () => {
        it('should return DungeonQuestHandler for dungeon crawl type', () => {
            const handler = QuestHandlerFactory.getHandler('♠ Dungeon Crawl', formElements, data);
            expect(handler).toBeInstanceOf(DungeonQuestHandler);
        });

        it('should return GenreQuestHandler for organize the stacks type', () => {
            const handler = QuestHandlerFactory.getHandler('♥ Organize the Stacks', formElements, data);
            expect(handler).toBeInstanceOf(GenreQuestHandler);
        });

        it('should return SideQuestHandler for side quest type', () => {
            const handler = QuestHandlerFactory.getHandler('♣ Side Quest', formElements, data);
            expect(handler).toBeInstanceOf(SideQuestHandler);
        });

        it('should return ExtraCreditHandler for extra credit type', () => {
            const handler = QuestHandlerFactory.getHandler('⭐ Extra Credit', formElements, data);
            expect(handler).toBeInstanceOf(ExtraCreditHandler);
        });

        it('should return StandardQuestHandler for unknown quest type', () => {
            const handler = QuestHandlerFactory.getHandler('Unknown Type', formElements, data);
            expect(handler).toBeInstanceOf(StandardQuestHandler);
            expect(handler.type).toBe('Unknown Type');
        });
    });

    describe('Quest Creation with Buffs', () => {
        it('should apply buffs to dungeon quest rewards', () => {
            formElements.dungeonRoomSelect.value = '1';
            formElements.buffsSelect.selectedOptions = [{ value: 'Long Read Focus' }];
            
            const handler = new DungeonQuestHandler(formElements, data);
            const quests = handler.createQuests();

            expect(quests[0].buffs).toContain('Long Read Focus');
        });

        it('should apply buffs to genre quest rewards', () => {
            formElements.genreQuestSelect.value = 'Fantasy';
            formElements.buffsSelect.selectedOptions = [{ value: 'Long Read Focus' }];
            
            const handler = new GenreQuestHandler(formElements, data);
            const quests = handler.createQuests();

            expect(quests[0].buffs).toContain('Long Read Focus');
        });
    });

    describe('RestorationQuestHandler', () => {
        beforeEach(() => {
            // Set up default blueprints
            safeSetJSON(STORAGE_KEYS.DUSTY_BLUEPRINTS, 50);
            safeSetJSON(STORAGE_KEYS.COMPLETED_RESTORATION_PROJECTS, []);
        });

        it('should validate wing selection', () => {
            formElements.restorationWingSelect.value = '';
            formElements.restorationProjectSelect.value = '';
            
            const handler = new RestorationQuestHandler(formElements, data);
            const validation = handler.validate();

            expect(validation.valid).toBe(false);
            expect(validation.error).toBe('Please select a wing.');
            expect(validation.errors['restoration-wing-select']).toBeDefined();
        });

        it('should validate project selection', () => {
            // Mock a wing that's always accessible (Heart of the Library)
            formElements.restorationWingSelect.value = '6';
            formElements.restorationProjectSelect.value = '';
            
            const handler = new RestorationQuestHandler(formElements, data);
            const validation = handler.validate();

            expect(validation.valid).toBe(false);
            expect(validation.error).toBe('Please select a restoration project.');
        });

        it('should validate player has enough blueprints', () => {
            // Set blueprints to 0
            safeSetJSON(STORAGE_KEYS.DUSTY_BLUEPRINTS, 0);
            
            // Mock a project that costs 35 blueprints
            formElements.restorationWingSelect.value = '6';
            formElements.restorationProjectSelect.value = Object.keys(data.restorationProjects || {})[0] || 'test-project';
            
            const handler = new RestorationQuestHandler(formElements, data);
            const validation = handler.validate();

            expect(validation.valid).toBe(false);
            expect(validation.error).toContain('Dusty Blueprints');
        });

        it('should validate project is not already completed', () => {
            // Mark a project as completed
            const projectId = Object.keys(data.restorationProjects || {})[0] || 'test-project';
            safeSetJSON(STORAGE_KEYS.COMPLETED_RESTORATION_PROJECTS, [projectId]);
            
            formElements.restorationWingSelect.value = '6';
            formElements.restorationProjectSelect.value = projectId;
            
            const handler = new RestorationQuestHandler(formElements, data);
            const validation = handler.validate();

            expect(validation.valid).toBe(false);
            expect(validation.error).toContain('already been completed');
        });

        it('should create restoration quest with restorationData', () => {
            // Find a valid restoration project
            const projects = data.restorationProjects || {};
            const projectId = Object.keys(projects).find(id => projects[id].wingId === '6');
            
            if (!projectId) {
                // Skip test if no projects available
                return;
            }

            formElements.restorationWingSelect.value = '6';
            formElements.restorationProjectSelect.value = projectId;
            
            const handler = new RestorationQuestHandler(formElements, data);
            const quests = handler.createQuests();

            expect(quests).toHaveLength(1);
            expect(quests[0].type).toBe('🔨 Restoration Project');
            expect(quests[0].restorationData).toBeDefined();
            expect(quests[0].restorationData.wingId).toBe('6');
            expect(quests[0].restorationData.projectId).toBe(projectId);
            expect(quests[0].restorationData.wingName).toBeDefined();
            expect(quests[0].restorationData.projectName).toBeDefined();
        });

        it('should allow alwaysAccessible wings without room completion', () => {
            // Heart of the Library (id: 6) is always accessible
            const projects = data.restorationProjects || {};
            const projectId = Object.keys(projects).find(id => projects[id].wingId === '6');
            
            if (!projectId) {
                return;
            }

            formElements.restorationWingSelect.value = '6';
            formElements.restorationProjectSelect.value = projectId;
            
            const handler = new RestorationQuestHandler(formElements, data);
            const validation = handler.validate();

            // Should validate successfully if blueprints are sufficient
            if (projects[projectId].cost <= 50) {
                expect(validation.valid).toBe(true);
            }
        });

        it('should return RestorationQuestHandler from factory', () => {
            const handler = QuestHandlerFactory.getHandler('🔨 Restoration Project', formElements, data);
            expect(handler).toBeInstanceOf(RestorationQuestHandler);
        });
    });
});

