/**
 * Tests for Phase 3.1: Expansion Manifest System and Content Registry
 * 
 * @jest-environment jsdom
 */

import { contentRegistry } from '../assets/js/config/contentRegistry.js';
import { 
    getItem, 
    getGenreQuest, 
    getSideQuest,
    getCurse,
    getAbility,
    getAtmosphericBuff,
    getTemporaryBuff,
    getDungeonRoom,
    getWing,
    getRestorationProject,
    allItems,
    genreQuests,
    sideQuestsDetailed,
    curseTableDetailed,
    masteryAbilities,
    atmosphericBuffs,
    temporaryBuffs,
    dungeonRooms,
    wings,
    restorationProjects
} from '../assets/js/character-sheet/data.js';

describe('Phase 3.1: Content Registry and Stable IDs', () => {
    
    describe('ContentRegistry', () => {
        test('should detect core expansion as enabled', () => {
            expect(contentRegistry.isExpansionEnabled('core')).toBe(true);
        });

        test('should detect library-restoration expansion as enabled', () => {
            expect(contentRegistry.isExpansionEnabled('library-restoration')).toBe(true);
        });

        test('should return false for non-existent expansion', () => {
            expect(contentRegistry.isExpansionEnabled('nonexistent')).toBe(false);
        });

        test('should get expansion version', () => {
            expect(contentRegistry.getExpansionVersion('core')).toBe('1.0.0');
            expect(contentRegistry.getExpansionVersion('library-restoration')).toBe('1.0.0');
        });

        test('should get enabled features', () => {
            const features = contentRegistry.getEnabledFeatures();
            expect(features).toContain('quests');
            expect(features).toContain('items');
            expect(features).toContain('passiveSlots');
            expect(features).toContain('restorationProjects');
        });

        test('should check if feature is enabled', () => {
            expect(contentRegistry.isFeatureEnabled('quests')).toBe(true);
            expect(contentRegistry.isFeatureEnabled('passiveSlots')).toBe(true);
            expect(contentRegistry.isFeatureEnabled('nonexistent')).toBe(false);
        });

        test('should get enabled expansions', () => {
            const enabled = contentRegistry.getEnabledExpansions();
            expect(enabled).toContain('library-restoration');
        });

        test('should get expansion data files', () => {
            const coreFiles = contentRegistry.getExpansionDataFiles('core');
            expect(coreFiles).toContain('allItems.json');
            expect(coreFiles).toContain('genreQuests.json');
            
            const restorationFiles = contentRegistry.getExpansionDataFiles('library-restoration');
            expect(restorationFiles).toContain('wings.json');
            expect(restorationFiles).toContain('restorationProjects.json');
        });
    });

    describe('Item ID Lookups', () => {
        test('getItem should find item by ID', () => {
            const item = getItem('librarians-compass');
            expect(item).toBeDefined();
            expect(item.name).toBe("Librarian's Compass");
            expect(item.type).toBe('Wearable');
        });

        test('getItem should find item by name (backward compatibility)', () => {
            const item = getItem("Librarian's Compass");
            expect(item).toBeDefined();
            expect(item.id).toBe('librarians-compass');
        });

        test('getItem should find item by legacy key (backward compatibility)', () => {
            const item = getItem("Librarian's Compass");
            expect(item).toBeDefined();
        });

        test('getItem should return null for non-existent item', () => {
            expect(getItem('nonexistent-item')).toBeNull();
        });

        test('all items should have id and name fields', () => {
            for (const [key, item] of Object.entries(allItems)) {
                expect(item.id).toBeDefined();
                expect(item.name).toBeDefined();
                expect(typeof item.id).toBe('string');
                expect(typeof item.name).toBe('string');
            }
        });
    });

    describe('Genre Quest ID Lookups', () => {
        test('getGenreQuest should find quest by ID', () => {
            const quest = getGenreQuest('genre-quest-1');
            expect(quest).toBeDefined();
            expect(quest.genre).toBe('Historical Fiction');
        });

        test('getGenreQuest should find quest by legacy key (backward compatibility)', () => {
            const quest = getGenreQuest('1');
            expect(quest).toBeDefined();
            expect(quest.id).toBe('genre-quest-1');
        });

        test('all genre quests should have id fields', () => {
            for (const [key, quest] of Object.entries(genreQuests)) {
                expect(quest.id).toBeDefined();
                expect(typeof quest.id).toBe('string');
            }
        });
    });

    describe('Side Quest ID Lookups', () => {
        test('getSideQuest should find quest by ID', () => {
            const quest = getSideQuest('side-quest-the-arcane-grimoire');
            expect(quest).toBeDefined();
            expect(quest.name).toBe('The Arcane Grimoire');
        });

        test('getSideQuest should find quest by name (backward compatibility)', () => {
            const quest = getSideQuest('The Arcane Grimoire');
            expect(quest).toBeDefined();
            expect(quest.id).toBe('side-quest-the-arcane-grimoire');
        });

        test('getSideQuest should find quest by legacy key (backward compatibility)', () => {
            const quest = getSideQuest('1');
            expect(quest).toBeDefined();
        });

        test('all side quests should have id fields', () => {
            for (const [key, quest] of Object.entries(sideQuestsDetailed)) {
                expect(quest.id).toBeDefined();
                expect(quest.name).toBeDefined();
            }
        });
    });

    describe('Curse ID Lookups', () => {
        test('getCurse should find curse by ID', () => {
            const curse = getCurse('curse-the-unread-tome');
            expect(curse).toBeDefined();
            expect(curse.name).toBe('The Unread Tome');
        });

        test('getCurse should find curse by name (backward compatibility)', () => {
            const curse = getCurse('The Unread Tome');
            expect(curse).toBeDefined();
            expect(curse.id).toBe('curse-the-unread-tome');
        });

        test('getCurse should find curse by number (backward compatibility)', () => {
            const curse = getCurse('1');
            expect(curse).toBeDefined();
        });

        test('all curses should have id fields', () => {
            expect(Array.isArray(curseTableDetailed)).toBe(true);
            curseTableDetailed.forEach(curse => {
                expect(curse.id).toBeDefined();
                expect(curse.name).toBeDefined();
            });
        });
    });

    describe('Ability ID Lookups', () => {
        test('getAbility should find ability by ID', () => {
            const ability = getAbility('ward-against-the-shroud');
            expect(ability).toBeDefined();
            expect(ability.name).toBe('Ward Against the Shroud');
        });

        test('getAbility should find ability by name (backward compatibility)', () => {
            const ability = getAbility('Ward Against the Shroud');
            expect(ability).toBeDefined();
            expect(ability.id).toBe('ward-against-the-shroud');
        });

        test('all abilities should have id and name fields', () => {
            for (const [key, ability] of Object.entries(masteryAbilities)) {
                expect(ability.id).toBeDefined();
                expect(ability.name).toBeDefined();
            }
        });
    });

    describe('Atmospheric Buff ID Lookups', () => {
        test('getAtmosphericBuff should find buff by ID', () => {
            const buff = getAtmosphericBuff('the-candlight-study');
            expect(buff).toBeDefined();
            expect(buff.name).toBe('The Candlight Study');
        });

        test('getAtmosphericBuff should find buff by name (backward compatibility)', () => {
            const buff = getAtmosphericBuff('The Candlight Study');
            expect(buff).toBeDefined();
        });

        test('all atmospheric buffs should have id and name fields', () => {
            for (const [key, buff] of Object.entries(atmosphericBuffs)) {
                expect(buff.id).toBeDefined();
                expect(buff.name).toBeDefined();
            }
        });
    });

    describe('Temporary Buff ID Lookups', () => {
        test('getTemporaryBuff should find buff by ID', () => {
            const buff = getTemporaryBuff('the-librarians-hoard');
            expect(buff).toBeDefined();
            expect(buff.name).toBe("The Librarian's Hoard");
        });

        test('getTemporaryBuff should find buff by name (backward compatibility)', () => {
            const buff = getTemporaryBuff("The Librarian's Hoard");
            expect(buff).toBeDefined();
        });

        test('all temporary buffs should have id and name fields', () => {
            for (const [key, buff] of Object.entries(temporaryBuffs)) {
                expect(buff.id).toBeDefined();
                expect(buff.name).toBeDefined();
            }
        });
    });

    describe('Dungeon Room ID Lookups', () => {
        test('getDungeonRoom should find room by ID', () => {
            const room = getDungeonRoom('dungeon-room-the-hall-of-whispers');
            expect(room).toBeDefined();
            expect(room.name).toBe('The Hall of Whispers');
        });

        test('getDungeonRoom should find room by name (backward compatibility)', () => {
            const room = getDungeonRoom('The Hall of Whispers');
            expect(room).toBeDefined();
        });

        test('getDungeonRoom should find room by legacy key (backward compatibility)', () => {
            const room = getDungeonRoom('1');
            expect(room).toBeDefined();
        });

        test('all dungeon rooms should have id fields', () => {
            for (const [key, room] of Object.entries(dungeonRooms)) {
                expect(room.id).toBeDefined();
                expect(room.name).toBeDefined();
            }
        });
    });

    describe('Wing ID Lookups', () => {
        test('getWing should find wing by ID', () => {
            const wing = getWing('scholarly-archives');
            expect(wing).toBeDefined();
            expect(wing.name).toBe('The Scholarly Archives');
        });

        test('getWing should find wing by name (backward compatibility)', () => {
            const wing = getWing('The Scholarly Archives');
            expect(wing).toBeDefined();
        });

        test('getWing should find wing by legacy key (backward compatibility)', () => {
            const wing = getWing('1');
            expect(wing).toBeDefined();
        });

        test('all wings should have id fields', () => {
            for (const [key, wing] of Object.entries(wings)) {
                expect(wing.id).toBeDefined();
                expect(wing.name).toBeDefined();
            }
        });
    });

    describe('Restoration Project ID Lookups', () => {
        test('getRestorationProject should find project by ID', () => {
            const project = getRestorationProject('restore-card-catalog');
            expect(project).toBeDefined();
            expect(project.name).toBe('Restore the Card Catalog System');
        });

        test('getRestorationProject should return null for non-existent project', () => {
            expect(getRestorationProject('nonexistent')).toBeNull();
        });

        test('all restoration projects should have id fields', () => {
            for (const [key, project] of Object.entries(restorationProjects)) {
                expect(project.id).toBeDefined();
                expect(project.name).toBeDefined();
            }
        });
    });

    describe('ID Format Consistency', () => {
        test('item IDs should be kebab-case', () => {
            for (const [key, item] of Object.entries(allItems)) {
                expect(item.id).toMatch(/^[a-z0-9-]+$/);
                expect(item.id).not.toContain(' ');
                expect(item.id).not.toContain("'");
            }
        });

        test('genre quest IDs should follow pattern', () => {
            for (const [key, quest] of Object.entries(genreQuests)) {
                expect(quest.id).toMatch(/^genre-quest-\d+$/);
            }
        });

        test('side quest IDs should be kebab-case based on name', () => {
            for (const [key, quest] of Object.entries(sideQuestsDetailed)) {
                expect(quest.id).toMatch(/^side-quest-[a-z0-9-]+$/);
            }
        });

        test('curse IDs should be kebab-case based on name', () => {
            curseTableDetailed.forEach(curse => {
                expect(curse.id).toMatch(/^curse-[a-z0-9-]+$/);
            });
        });

        test('ability IDs should be kebab-case', () => {
            for (const [key, ability] of Object.entries(masteryAbilities)) {
                expect(ability.id).toMatch(/^[a-z0-9-]+$/);
            }
        });
    });
});

