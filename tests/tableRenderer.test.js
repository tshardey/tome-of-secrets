/**
 * @jest-environment jsdom
 */
import { 
    renderDungeonRewardsTable,
    renderDungeonRoomsTable,
    renderDungeonCompletionRewardsTable,
    renderGenreQuestsTable,
    renderAtmosphericBuffsTable,
    renderSideQuestsTable,
    renderCurseTable,
    renderLevelingRewardsTable,
    initializeTables
} from '../assets/js/table-renderer.js';
import { STORAGE_KEYS } from '../assets/js/character-sheet/storageKeys.js';
import { safeSetJSON } from '../assets/js/utils/storage.js';

describe('Table Renderer', () => {
    
    describe('Link Processing', () => {
        beforeEach(() => {
            // Set up the DOM with a meta tag for baseurl
            document.head.innerHTML = '<meta name="baseurl" content="/tome-of-secrets">';
        });

        test('dungeon rooms should contain links with {{ site.baseurl }} template', () => {
            const html = renderDungeonRoomsTable();
            
            // Check that template syntax is present before processing
            expect(html).toContain('{{ site.baseurl }}');
            expect(html).toContain('rewards.html');
        });

        test('dungeon completion rewards should contain links with {{ site.baseurl }} template', () => {
            const html = renderDungeonCompletionRewardsTable();
            
            // Check that template syntax is present
            expect(html).toContain('{{ site.baseurl }}');
            expect(html).toContain('rewards.html');
        });

        test('side quests should contain links with {{ site.baseurl }} template', () => {
            const html = renderSideQuestsTable();
            
            // Check that template syntax is present
            expect(html).toContain('{{ site.baseurl }}');
            expect(html).toContain('rewards.html');
        });

        test('initializeTables should process links when rendering to DOM', async () => {
            // Set up DOM elements
            document.body.innerHTML = `
                <div id="dungeon-rooms-table"></div>
                <div id="side-quests-table"></div>
            `;

            // Initialize tables
            initializeTables();
            // initializeTables now loads state asynchronously (IndexedDB-backed in browsers)
            await new Promise(resolve => setTimeout(resolve, 0));

            // Check that the template syntax was replaced
            const dungeonRoomsEl = document.getElementById('dungeon-rooms-table');
            const sideQuestsEl = document.getElementById('side-quests-table');

            expect(dungeonRoomsEl.innerHTML).not.toContain('{{ site.baseurl }}');
            expect(dungeonRoomsEl.innerHTML).toContain('/tome-of-secrets/rewards.html');
            
            expect(sideQuestsEl.innerHTML).not.toContain('{{ site.baseurl }}');
            expect(sideQuestsEl.innerHTML).toContain('/tome-of-secrets/rewards.html');
        });

        test('initializeTables should handle missing meta tag by inferring from URL', async () => {
            // Remove meta tag
            document.head.innerHTML = '';
            
            // Mock window.location
            delete window.location;
            window.location = { pathname: '/tome-of-secrets/dungeons.html' };

            // Set up DOM element
            document.body.innerHTML = '<div id="dungeon-rooms-table"></div>';

            // Initialize tables
            initializeTables();
            await new Promise(resolve => setTimeout(resolve, 0));

            const dungeonRoomsEl = document.getElementById('dungeon-rooms-table');
            
            // Should have inferred baseurl from path
            expect(dungeonRoomsEl.innerHTML).not.toContain('{{ site.baseurl }}');
            expect(dungeonRoomsEl.innerHTML).toContain('/tome-of-secrets/rewards.html');
        });

        test('initializeTables should use empty baseurl for root-level sites', async () => {
            // Remove meta tag
            document.head.innerHTML = '';
            
            // Mock window.location for root-level site
            delete window.location;
            window.location = { pathname: '/dungeons.html' };

            // Set up DOM element
            document.body.innerHTML = '<div id="dungeon-rooms-table"></div>';

            // Initialize tables
            initializeTables();
            await new Promise(resolve => setTimeout(resolve, 0));

            const dungeonRoomsEl = document.getElementById('dungeon-rooms-table');
            
            // Should use empty baseurl
            expect(dungeonRoomsEl.innerHTML).not.toContain('{{ site.baseurl }}');
            expect(dungeonRoomsEl.innerHTML).toContain('href="/rewards.html');
        });
    });

    describe('Table Content Rendering', () => {
        test('renderDungeonRewardsTable should render all reward types', () => {
            const html = renderDungeonRewardsTable();
            
            expect(html).toContain('Book Completion');
            expect(html).toContain('Monster');
            expect(html).toContain('Friendly Creature');
            expect(html).toContain('Familiar');
            expect(html).toContain('+15 XP');
            expect(html).toContain('+30 XP');
            expect(html).toContain('+10 Ink Drops');
            expect(html).toContain('+5 Paper Scraps');
        });

        test('renderDungeonRoomsTable should render all 12 rooms', () => {
            const html = renderDungeonRoomsTable();
            
            // Check for all room names
            expect(html).toContain('The Hall of Whispers');
            expect(html).toContain('The Glimmering Pools');
            expect(html).toContain('The Lost Garden');
            expect(html).toContain('The Cursed Tome');
            expect(html).toContain('The Archivist\'s Riddle');
            expect(html).toContain('The Starlit Observatory');
            expect(html).toContain('The Neglected Archives');
            expect(html).toContain('The Author\'s Study');
            expect(html).toContain('The Endless Corridor');
            expect(html).toContain('The Grand Gallery');
            expect(html).toContain('The Shroud\'s Heart');
            expect(html).toContain('The Mimic\'s Lair');
        });

        test('renderDungeonRoomsTable should include nested encounter tables', () => {
            const html = renderDungeonRoomsTable();
            
            expect(html).toContain('class="nested-table"');
            expect(html).toContain('Librarian\'s Spirit');
            expect(html).toContain('Will-o-wisps');
            expect(html).toContain('Friendly Creature');
            expect(html).toContain('Monster');
        });

        test('renderDungeonRoomsTable should include encounter links to familiars', () => {
            const html = renderDungeonRoomsTable();
            
            // Check for familiar links
            expect(html).toContain('Tome-Bound Cat');
            expect(html).toContain('Pocket Dragon');
            expect(html).toContain('Mystical Moth');
            expect(html).toContain('Page Sprite');
            expect(html).toContain('rewards.html#tome-bound-cat');
            expect(html).toContain('rewards.html#pocket-dragon');
        });

        test('renderDungeonCompletionRewardsTable should render all 10 rewards', () => {
            const html = renderDungeonCompletionRewardsTable();
            
            expect(html).toContain('The Librarian\'s Hoard');
            expect(html).toContain('Chalice of Restoration');
            expect(html).toContain('Librarian\'s Blessing');
            expect(html).toContain('Librarian\'s Quill');
            expect(html).toContain('Enchanted Focus');
            expect(html).toContain('Lantern of Foresight');
            expect(html).toContain('Unwavering Resolve');
            expect(html).toContain('Cloak of the Story-Weaver');
            expect(html).toContain('The Archivist\'s Favor');
            expect(html).toContain('The Grand Key');
        });

        test('renderGenreQuestsTable should render all available genres', () => {
            const html = renderGenreQuestsTable();
            
            // Check for some key genres (updated names)
            expect(html).toContain('Historical Fiction');
            expect(html).toContain('Fantasy');
            expect(html).toContain('Romantasy');
            expect(html).toContain('Sci-Fi');
            expect(html).toContain('Thriller/Mystery'); // Updated name
            expect(html).toContain('Classic');
            
            // Check for renamed genres
            expect(html).toContain('Fiction'); // Was "Literary Fiction"
            expect(html).toContain('Comedy'); // Was "LitRPG"
            
            // Check for new genres
            expect(html).toContain('Comics/Manga/Graphic Novels');
            expect(html).toContain('History');
            expect(html).toContain('Philosophy');
            
            // Check for other existing genres
            expect(html).toContain('Speculative Fiction');
            expect(html).toContain('Romance');
            expect(html).toContain('Memoir/Biography');
            expect(html).toContain('Non-Fiction');
            expect(html).toContain('Crime');
        });

        test('renderAtmosphericBuffsTable should render all 8 buffs', () => {
            const html = renderAtmosphericBuffsTable();
            
            expect(html).toContain('The Candlight Study');
            expect(html).toContain('The Herbalist\'s Nook');
            expect(html).toContain('The Soundscape Spire');
            expect(html).toContain('The Excavation');
            expect(html).toContain('The Cozy Hearth');
            expect(html).toContain('The Soaking in Nature');
            expect(html).toContain('The Wanderer\'s Path');
            expect(html).toContain('Head in the Clouds');
        });

        test('renderSideQuestsTable should render all 8 quests with rewards', () => {
            const html = renderSideQuestsTable();
            
            expect(html).toContain('The Arcane Grimoire');
            expect(html).toContain('The Blood Fury Tattoo');
            expect(html).toContain('The Bag of Holding');
            expect(html).toContain('The Wandering Merchant\'s Request');
            expect(html).toContain('The Glimmering Pools\' Gift');
            expect(html).toContain('The Chime of Opening');
            expect(html).toContain('The Scarecrow\'s Cornfield');
            expect(html).toContain('The Empty Shelf');
            
            // Check for reward links
            expect(html).toContain('Scatter Brain Scarab');
            expect(html).toContain('Librarian\'s Compass');
            expect(html).toContain('rewards.html#scatter-brain-scarab');
        });

        test('renderCurseTable should render all 4 curses as ordered list', () => {
            const html = renderCurseTable();
            
            expect(html).toContain('<ol>');
            expect(html).toContain('</ol>');
            expect(html).toContain('The Unread Tome');
        });

        test('renderLevelingRewardsTable should render all 20 levels with correct data', () => {
            const html = renderLevelingRewardsTable();
            
            // Check table structure
            expect(html).toContain('<table>');
            expect(html).toContain('<thead>');
            expect(html).toContain('<tbody>');
            expect(html).toContain('Level');
            expect(html).toContain('XP Needed');
            expect(html).toContain('Ink Drops Reward');
            expect(html).toContain('Paper Scraps Reward');
            expect(html).toContain('New Item/Familiar Slot');
            expect(html).toContain('School Mastery Point');
            
            // Check specific level data
            expect(html).toContain('<td>1</td>'); // Level 1
            expect(html).toContain('<td>2</td>'); // Level 2
            expect(html).toContain('<td>20</td>'); // Level 20
            
            // Check level 1 has 3 slots
            const level1Index = html.indexOf('<td>1</td>');
            const level1Row = html.substring(level1Index, level1Index + 200);
            expect(level1Row).toContain('3');
            
            // Check level 4 has +1 slot (4 total)
            expect(html).toContain('+1 (4 total)');
            
            // Check level 5 has SMP
            expect(html).toContain('<td>5</td>');
            const level5Index = html.indexOf('<td>5</td>');
            const level5Row = html.substring(level5Index, level5Index + 300);
            expect(level5Row).toContain('<td>1</td>'); // SMP value
            
            // Check level 20 has correct XP (47,000)
            expect(html).toContain('47,000');
            
            // Verify all 20 levels are present
            for (let i = 1; i <= 20; i++) {
                expect(html).toContain(`<td>${i}</td>`);
            }
        });
    });

    describe('initializeTables Integration', () => {
        test('should only render tables that have corresponding DOM elements', async () => {
            // Only create some of the table containers
            document.body.innerHTML = `
                <div id="genre-quests-table"></div>
                <div id="curse-table"></div>
            `;

            // Should not throw error for missing containers
            expect(() => initializeTables()).not.toThrow();
            // initializeTables renders asynchronously (it may load state first)
            await new Promise(resolve => setTimeout(resolve, 0));

            // Should populate the tables that exist
            expect(document.getElementById('genre-quests-table').innerHTML).not.toBe('');
            expect(document.getElementById('curse-table').innerHTML).not.toBe('');
        });

        test('should handle empty body gracefully', () => {
            document.body.innerHTML = '';
            
            // Should not throw error
            expect(() => initializeTables()).not.toThrow();
        });
    });

    describe('HTML Structure', () => {
        test('rendered tables should have proper HTML table structure', () => {
            const tables = [
                renderDungeonRewardsTable(),
                renderDungeonRoomsTable(),
                renderGenreQuestsTable(),
                renderAtmosphericBuffsTable(),
                renderSideQuestsTable()
            ];

            tables.forEach(html => {
                expect(html).toContain('<table>');
                expect(html).toContain('</table>');
                expect(html).toContain('<thead>');
                expect(html).toContain('</thead>');
                expect(html).toContain('<tbody>');
                expect(html).toContain('</tbody>');
                expect(html).toContain('<tr>');
                expect(html).toContain('<th>');
                expect(html).toContain('<td>');
            });
        });

        test('dungeon rooms should have nested tables with proper class', () => {
            const html = renderDungeonRoomsTable();
            
            expect(html).toMatch(/<table[^>]*class="nested-table"[^>]*>/);
        });

        test('curse table should render as ordered list, not table', () => {
            const html = renderCurseTable();
            
            expect(html).toContain('<ol>');
            expect(html).toContain('<li>');
            expect(html).not.toContain('<table>');
        });
    });

    describe('Completion Tracking', () => {
        beforeEach(() => {
            // Clear localStorage before each test
            localStorage.clear();
        });

        describe('Dungeon Room Completion', () => {
            test('should not gray out rooms when no quests are completed', () => {
                const html = renderDungeonRoomsTable();
                
                // Should not contain completed-room class or grayed out styles
                expect(html).not.toContain('completed-room');
                expect(html).not.toContain('opacity: 0.6');
            });

            test('should gray out room when challenge and encounter are completed', () => {
                // Set up completed quests for room 1
                const completedQuests = [
                    {
                        type: '♠ Dungeon Crawl',
                        roomNumber: '1',
                        isEncounter: false,
                        prompt: 'The Hall of Whispers: Read in a quiet space without music.'
                    },
                    {
                        type: '♠ Dungeon Crawl',
                        roomNumber: '1',
                        isEncounter: true,
                        encounterName: 'Librarian\'s Spirit',
                        prompt: 'Librarian\'s Spirit: Read a book with a ghost-like being or a mystery.'
                    }
                ];
                safeSetJSON(STORAGE_KEYS.COMPLETED_QUESTS, completedQuests);

                const html = renderDungeonRoomsTable();
                
                // Should contain completed-room class and grayed out styles
                expect(html).toContain('completed-room');
                expect(html).toContain('opacity: 0.6');
                
                // Should show checkmark on challenge
                expect(html).toContain('The Hall of Whispers: Read in a quiet space without music. ✓');
                
                // Should show checkmark on completed encounter (after </strong> tag, before description)
                expect(html).toContain('Librarian\'s Spirit (Friendly Creature):</strong> ✓');
            });

            test('should not gray out room when only challenge is completed', () => {
                // Only challenge completed, no encounters
                const completedQuests = [
                    {
                        type: '♠ Dungeon Crawl',
                        roomNumber: '1',
                        isEncounter: false,
                        prompt: 'The Hall of Whispers: Read in a quiet space without music.'
                    }
                ];
                safeSetJSON(STORAGE_KEYS.COMPLETED_QUESTS, completedQuests);

                const html = renderDungeonRoomsTable();
                
                // Should not be grayed out (room not fully completed)
                expect(html).not.toContain('completed-room');
                
                // But should show checkmark on challenge
                expect(html).toContain('The Hall of Whispers: Read in a quiet space without music. ✓');
            });

            test('should show checkmark on multiple completed encounters', () => {
                // Complete room 1 with both encounters
                const completedQuests = [
                    {
                        type: '♠ Dungeon Crawl',
                        roomNumber: '1',
                        isEncounter: false,
                        prompt: 'The Hall of Whispers: Read in a quiet space without music.'
                    },
                    {
                        type: '♠ Dungeon Crawl',
                        roomNumber: '1',
                        isEncounter: true,
                        encounterName: 'Librarian\'s Spirit',
                        prompt: 'Librarian\'s Spirit: Read a book with a ghost-like being or a mystery.'
                    },
                    {
                        type: '♠ Dungeon Crawl',
                        roomNumber: '1',
                        isEncounter: true,
                        encounterName: 'Will-o-wisps',
                        prompt: 'Will-o-wisps: Read a book that involves fated destiny or a newly revealed path.'
                    }
                ];
                safeSetJSON(STORAGE_KEYS.COMPLETED_QUESTS, completedQuests);

                const html = renderDungeonRoomsTable();
                
                // Should show checkmarks on both encounters (after </strong> tag, before description)
                expect(html).toContain('Librarian\'s Spirit (Friendly Creature):</strong> ✓');
                expect(html).toContain('Will-o-wisps (Monster):</strong> ✓');
            });

            test('should only gray out the specific completed room, not all rooms', () => {
                // Complete only room 1
                const completedQuests = [
                    {
                        type: '♠ Dungeon Crawl',
                        roomNumber: '1',
                        isEncounter: false,
                        prompt: 'The Hall of Whispers: Read in a quiet space without music.'
                    },
                    {
                        type: '♠ Dungeon Crawl',
                        roomNumber: '1',
                        isEncounter: true,
                        encounterName: 'Librarian\'s Spirit',
                        prompt: 'Librarian\'s Spirit: Read a book with a ghost-like being or a mystery.'
                    }
                ];
                safeSetJSON(STORAGE_KEYS.COMPLETED_QUESTS, completedQuests);

                const html = renderDungeonRoomsTable();
                
                // Room 1 should be grayed out (check the <tr> tag before the room name)
                expect(html).toContain('class="completed-room"');
                
                // Room 2 should not be grayed out
                const room2Index = html.indexOf('The Glimmering Pools');
                const room2Section = html.substring(room2Index, room2Index + 500);
                expect(room2Section).not.toContain('completed-room');
            });

            test('should not mark encounters as completed in wrong room when same encounter exists in multiple rooms', () => {
                // Complete Banshee encounter in Room 7 (Banshee also exists in Room 4 with same prompt)
                const completedQuests = [
                    {
                        type: '♠ Dungeon Crawl',
                        roomNumber: '7',
                        isEncounter: false,
                        prompt: 'The Neglected Archives: Read a book with a ghost-like being or a death theme.'
                    },
                    {
                        type: '♠ Dungeon Crawl',
                        roomNumber: '7',
                        isEncounter: true,
                        encounterName: 'Banshee',
                        prompt: 'Banshee: Read a book with a ghost-like being or a death theme.'
                    }
                ];
                safeSetJSON(STORAGE_KEYS.COMPLETED_QUESTS, completedQuests);

                const html = renderDungeonRoomsTable();
                
                // Room 7 should be grayed out - find the <tr> tag for room 7
                // Look for the room name, then find the preceding <tr> tag
                const room7NameIndex = html.indexOf('The Neglected Archives');
                // Search backwards from the room name to find the <tr> tag
                const room7TrStart = html.lastIndexOf('<tr', room7NameIndex);
                const room7Section = html.substring(room7TrStart, room7NameIndex + 1000);
                expect(room7Section).toContain('class="completed-room"');
                expect(room7Section).toContain('Banshee (Monster):</strong> ✓');
                
                // Room 4 should NOT be grayed out (even though it also has Banshee with same prompt)
                const room4NameIndex = html.indexOf('The Cursed Tome');
                const room4TrStart = html.lastIndexOf('<tr', room4NameIndex);
                const room4Section = html.substring(room4TrStart, room4NameIndex + 1000);
                expect(room4Section).not.toContain('class="completed-room"');
                // Room 4's Banshee should NOT have a checkmark
                const room4BansheeIndex = room4Section.indexOf('Banshee (Monster)');
                if (room4BansheeIndex !== -1) {
                    const room4BansheeSection = room4Section.substring(room4BansheeIndex, room4BansheeIndex + 100);
                    expect(room4BansheeSection).not.toContain('✓');
                }
            });
        });

        describe('Side Quest Completion', () => {
            test('should not gray out side quests when none are completed', () => {
                const html = renderSideQuestsTable();
                
                // Should not contain completed-quest class or grayed out styles
                expect(html).not.toContain('completed-quest');
                expect(html).not.toContain('opacity: 0.6');
                expect(html).not.toContain('color: #999');
            });

            test('should gray out completed side quest and show checkmark', () => {
                // Complete side quest 1 (The Arcane Grimoire)
                const completedQuests = [
                    {
                        type: '♣ Side Quest',
                        prompt: 'The Arcane Grimoire: Read the book on your TBR the longest.'
                    }
                ];
                safeSetJSON(STORAGE_KEYS.COMPLETED_QUESTS, completedQuests);

                const html = renderSideQuestsTable();
                
                // Should contain completed-quest class and grayed out styles
                expect(html).toContain('completed-quest');
                expect(html).toContain('opacity: 0.6');
                expect(html).toContain('color: #999');
                
                // Should show checkmark on quest name (after </strong> tag, before description)
                expect(html).toContain('The Arcane Grimoire:</strong> ✓');
            });

            test('should only gray out the specific completed side quest', () => {
                // Complete only side quest 1
                const completedQuests = [
                    {
                        type: '♣ Side Quest',
                        prompt: 'The Arcane Grimoire: Read the book on your TBR the longest.'
                    }
                ];
                safeSetJSON(STORAGE_KEYS.COMPLETED_QUESTS, completedQuests);

                const html = renderSideQuestsTable();
                
                // Side quest 1 should be grayed out (check the <tr> tag)
                expect(html).toContain('class="completed-quest"');
                expect(html).toContain('The Arcane Grimoire:</strong> ✓');
                
                // Side quest 2 should not be grayed out
                const sq2Index = html.indexOf('The Blood Fury Tattoo');
                const sq2Section = html.substring(sq2Index, sq2Index + 200);
                expect(sq2Section).not.toContain('completed-quest');
                expect(sq2Section).not.toContain('✓');
            });

            test('should handle multiple completed side quests', () => {
                // Complete side quests 1 and 2
                const completedQuests = [
                    {
                        type: '♣ Side Quest',
                        prompt: 'The Arcane Grimoire: Read the book on your TBR the longest.'
                    },
                    {
                        type: '♣ Side Quest',
                        prompt: 'The Blood Fury Tattoo: Read a book featuring a counter culture rebellion.'
                    }
                ];
                safeSetJSON(STORAGE_KEYS.COMPLETED_QUESTS, completedQuests);

                const html = renderSideQuestsTable();
                
                // Both should be grayed out with checkmarks (after </strong> tag, before description)
                expect(html).toContain('The Arcane Grimoire:</strong> ✓');
                expect(html).toContain('The Blood Fury Tattoo:</strong> ✓');
                
                // Count completed-quest classes (should be 2)
                const completedCount = (html.match(/completed-quest/g) || []).length;
                expect(completedCount).toBe(2);
            });

            test('should not mark side quest as completed if prompt does not match exactly', () => {
                // Try with slightly different prompt format
                const completedQuests = [
                    {
                        type: '♣ Side Quest',
                        prompt: 'Read the book on your TBR the longest.' // Missing name prefix
                    }
                ];
                safeSetJSON(STORAGE_KEYS.COMPLETED_QUESTS, completedQuests);

                const html = renderSideQuestsTable();
                
                // Should not be marked as completed
                expect(html).not.toContain('The Arcane Grimoire:</strong> ✓');
            });
        });

        describe('Mixed Quest Types', () => {
            test('should handle both dungeon and side quest completions independently', () => {
                const completedQuests = [
                    // Dungeon room 1 completed
                    {
                        type: '♠ Dungeon Crawl',
                        roomNumber: '1',
                        isEncounter: false,
                        prompt: 'The Hall of Whispers: Read in a quiet space without music.'
                    },
                    {
                        type: '♠ Dungeon Crawl',
                        roomNumber: '1',
                        isEncounter: true,
                        encounterName: 'Librarian\'s Spirit',
                        prompt: 'Librarian\'s Spirit: Read a book with a ghost-like being or a mystery.'
                    },
                    // Side quest 1 completed
                    {
                        type: '♣ Side Quest',
                        prompt: 'The Arcane Grimoire: Read the book on your TBR the longest.'
                    }
                ];
                safeSetJSON(STORAGE_KEYS.COMPLETED_QUESTS, completedQuests);

                const dungeonHtml = renderDungeonRoomsTable();
                const sideQuestHtml = renderSideQuestsTable();
                
                // Dungeon room should be grayed out
                expect(dungeonHtml).toContain('completed-room');
                expect(dungeonHtml).toContain('Librarian\'s Spirit (Friendly Creature):</strong> ✓');
                
                // Side quest should be grayed out
                expect(sideQuestHtml).toContain('completed-quest');
                expect(sideQuestHtml).toContain('The Arcane Grimoire:</strong> ✓');
            });
        });
    });
});

