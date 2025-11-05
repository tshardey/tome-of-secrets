/**
 * @jest-environment jsdom
 */

import { BaseQuestHandler } from '../assets/js/quest-handlers/BaseQuestHandler.js';
import { DungeonQuestHandler } from '../assets/js/quest-handlers/DungeonQuestHandler.js';
import { GenreQuestHandler } from '../assets/js/quest-handlers/GenreQuestHandler.js';
import { SideQuestHandler } from '../assets/js/quest-handlers/SideQuestHandler.js';
import { ExtraCreditHandler } from '../assets/js/quest-handlers/ExtraCreditHandler.js';
import { QuestHandlerFactory } from '../assets/js/quest-handlers/QuestHandlerFactory.js';
import * as data from '../assets/js/character-sheet/data.js';

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
            sideQuestSelect: { value: 'Visit a new-to-you bookstore or library' }
        };
    });

    describe('BaseQuestHandler', () => {
        describe('completeActiveQuest', () => {
            it('should apply modifiers and background bonuses to quest rewards', () => {
                const quest = {
                    type: '♠ Dungeon Crawl',
                    prompt: 'Test Dungeon',
                    rewards: { xp: 10, inkDrops: 5, paperScraps: 5, items: [], modifiedBy: [] },
                    buffs: ['Bloodline Affinity'], // +15 Ink Drops
                    month: 'January',
                    year: '2024',
                    book: 'Test Book',
                    notes: ''
                };

                const completedQuest = BaseQuestHandler.completeActiveQuest(quest, 'biblioslinker');

                // Should have buff modifier applied
                expect(completedQuest.rewards.modifiedBy).toContain('Bloodline Affinity');
                // Should have Biblioslinker bonus (+3 Paper Scraps for dungeons)
                expect(completedQuest.rewards.modifiedBy).toContain('Biblioslinker');
                expect(completedQuest.rewards.inkDrops).toBe(20); // 5 base + 15 from Bloodline Affinity
                expect(completedQuest.rewards.paperScraps).toBe(8); // 5 base + 3 from Biblioslinker
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
                expect(completedQuest.rewards.paperScraps).toBe(8); // 5 base + 3 from Biblioslinker
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
            expect(validation.error).toContain('Please fill in Month, Year, Book, and select a Room');
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
            expect(validation.error).toContain('Please fill in the Month, Year, Prompt, and Book Title');
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
            expect(validation.error).toContain('Please fill in the Month, Year, Prompt, and Book Title');
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

        it('should throw error for unknown quest type', () => {
            expect(() => {
                QuestHandlerFactory.getHandler('Unknown Type', formElements, data);
            }).toThrow('Unknown quest type: Unknown Type');
        });
    });

    describe('Quest Creation with Buffs', () => {
        it('should apply buffs to dungeon quest rewards', () => {
            formElements.dungeonRoomSelect.value = '1';
            formElements.buffsSelect.selectedOptions = [{ value: 'Bloodline Affinity' }];
            
            const handler = new DungeonQuestHandler(formElements, data);
            const quests = handler.createQuests();

            expect(quests[0].buffs).toContain('Bloodline Affinity');
        });

        it('should apply buffs to genre quest rewards', () => {
            formElements.genreQuestSelect.value = 'Fantasy';
            formElements.buffsSelect.selectedOptions = [{ value: 'Bloodline Affinity' }];
            
            const handler = new GenreQuestHandler(formElements, data);
            const quests = handler.createQuests();

            expect(quests[0].buffs).toContain('Bloodline Affinity');
        });
    });
});

