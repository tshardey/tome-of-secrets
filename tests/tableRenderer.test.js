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
    initializeTables
} from '../assets/js/table-renderer.js';

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

        test('initializeTables should process links when rendering to DOM', () => {
            // Set up DOM elements
            document.body.innerHTML = `
                <div id="dungeon-rooms-table"></div>
                <div id="side-quests-table"></div>
            `;

            // Initialize tables
            initializeTables();

            // Check that the template syntax was replaced
            const dungeonRoomsEl = document.getElementById('dungeon-rooms-table');
            const sideQuestsEl = document.getElementById('side-quests-table');

            expect(dungeonRoomsEl.innerHTML).not.toContain('{{ site.baseurl }}');
            expect(dungeonRoomsEl.innerHTML).toContain('/tome-of-secrets/rewards.html');
            
            expect(sideQuestsEl.innerHTML).not.toContain('{{ site.baseurl }}');
            expect(sideQuestsEl.innerHTML).toContain('/tome-of-secrets/rewards.html');
        });

        test('initializeTables should handle missing meta tag by inferring from URL', () => {
            // Remove meta tag
            document.head.innerHTML = '';
            
            // Mock window.location
            delete window.location;
            window.location = { pathname: '/tome-of-secrets/dungeons.html' };

            // Set up DOM element
            document.body.innerHTML = '<div id="dungeon-rooms-table"></div>';

            // Initialize tables
            initializeTables();

            const dungeonRoomsEl = document.getElementById('dungeon-rooms-table');
            
            // Should have inferred baseurl from path
            expect(dungeonRoomsEl.innerHTML).not.toContain('{{ site.baseurl }}');
            expect(dungeonRoomsEl.innerHTML).toContain('/tome-of-secrets/rewards.html');
        });

        test('initializeTables should use empty baseurl for root-level sites', () => {
            // Remove meta tag
            document.head.innerHTML = '';
            
            // Mock window.location for root-level site
            delete window.location;
            window.location = { pathname: '/dungeons.html' };

            // Set up DOM element
            document.body.innerHTML = '<div id="dungeon-rooms-table"></div>';

            // Initialize tables
            initializeTables();

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

        test('renderGenreQuestsTable should render all 12 available genres', () => {
            const html = renderGenreQuestsTable();
            
            // Original 6 genres
            expect(html).toContain('Historical Fiction');
            expect(html).toContain('Fantasy');
            expect(html).toContain('Romantasy');
            expect(html).toContain('Sci-Fi');
            expect(html).toContain('Thriller');
            expect(html).toContain('Classic');
            
            // New 6 genres
            expect(html).toContain('Literary Fiction');
            expect(html).toContain('Speculative Fiction');
            expect(html).toContain('Romance');
            expect(html).toContain('Memoirs/Biographies');
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
            expect(html).toContain('The Lost Lore');
            expect(html).toContain('The Forgotten Pages');
            expect(html).toContain('The Ravenous Shadow');
        });
    });

    describe('initializeTables Integration', () => {
        test('should only render tables that have corresponding DOM elements', () => {
            // Only create some of the table containers
            document.body.innerHTML = `
                <div id="genre-quests-table"></div>
                <div id="curse-table"></div>
            `;

            // Should not throw error for missing containers
            expect(() => initializeTables()).not.toThrow();

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
});

