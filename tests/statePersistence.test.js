/**
 * @jest-environment jsdom
 */
import { saveState, loadState, characterState } from '../assets/js/character-sheet/state.js';
import { STORAGE_KEYS, CHARACTER_STATE_KEYS, createEmptyCharacterState } from '../assets/js/character-sheet/storageKeys.js';
import { LARGE_STATE_KEYS } from '../assets/js/character-sheet/persistence.js';
import { validateCharacterState, SCHEMA_VERSION, resetSchemaWriteGateForTests } from '../assets/js/character-sheet/dataValidator.js';

function resetCharacterState() {
    const emptyState = createEmptyCharacterState();
    CHARACTER_STATE_KEYS.forEach(key => {
        characterState[key] = Array.isArray(emptyState[key])
            ? [...emptyState[key]]
            : typeof emptyState[key] === 'object' && emptyState[key] !== null
                ? { ...emptyState[key] }
                : emptyState[key];
    });
}

function setupForm() {
    document.body.innerHTML = `
        <form id="character-sheet">
            <input type="text" id="level" value="5" />
            <input type="text" id="keeperBackground" value="Grove Tender" />
            <input type="text" id="wizardSchool" value="Divination" />
            <input type="text" id="librarySanctum" value="The Spire of Whispers" />
        </form>
    `;
    return document.getElementById('character-sheet');
}

function getStoredKeys() {
    const keys = [];
    for (let i = 0; i < localStorage.length; i += 1) {
        keys.push(localStorage.key(i));
    }
    return keys;
}

describe('state persistence compatibility', () => {
    beforeEach(() => {
        localStorage.clear();
        resetCharacterState();
        // Each test starts as a freshly opened tab (the schema write gate remembers per tab)
        resetSchemaWriteGateForTests();
        document.body.innerHTML = '';
    });

    it('persists form + state data (large keys may be stored outside localStorage)', async () => {
        const form = setupForm();

        const expectedState = {
            [STORAGE_KEYS.LEARNED_ABILITIES]: ['Sense the Stacks'],
            [STORAGE_KEYS.EQUIPPED_ITEMS]: [{ name: 'Archivist Gloves' }],
            [STORAGE_KEYS.INVENTORY_ITEMS]: [{ name: 'Chronicle Satchel' }],
            [STORAGE_KEYS.ACTIVE_ASSIGNMENTS]: [{ type: '♣ Side Quest', prompt: 'Catalog the fungi wing' }],
            [STORAGE_KEYS.COMPLETED_QUESTS]: [{ type: '⭐ Extra Credit', prompt: 'Shelve the forbidden tomes', rewards: { xp: 25, inkDrops: 10, paperScraps: 0, items: [] } }],
            [STORAGE_KEYS.DISCARDED_QUESTS]: [],
            [STORAGE_KEYS.ATMOSPHERIC_BUFFS]: { 'Candlelit Study': true },
            [STORAGE_KEYS.TEMPORARY_BUFFS]: [{ name: 'Moonlit Focus', duration: 'two-months', monthsRemaining: 2, status: 'active' }],
            [STORAGE_KEYS.BUFF_MONTH_COUNTER]: 3,
            [STORAGE_KEYS.SELECTED_GENRES]: ['Mystery', 'Fantasy'],
            [STORAGE_KEYS.GENRE_DICE_SELECTION]: 'd6',
            [STORAGE_KEYS.SHELF_BOOK_COLORS]: [],
            // Library Restoration Expansion state
            [STORAGE_KEYS.DUSTY_BLUEPRINTS]: 0,
            [STORAGE_KEYS.COMPLETED_RESTORATION_PROJECTS]: [],
            [STORAGE_KEYS.COMPLETED_WINGS]: [],
            [STORAGE_KEYS.PASSIVE_ITEM_SLOTS]: [],
            [STORAGE_KEYS.PASSIVE_FAMILIAR_SLOTS]: [],
            [STORAGE_KEYS.CLAIMED_ROOM_REWARDS]: [],
            [STORAGE_KEYS.DUNGEON_COMPLETION_DRAWS_REDEEMED]: 0,
            [STORAGE_KEYS.BOOKS]: {},
            [STORAGE_KEYS.EXTERNAL_CURRICULUM]: { curriculums: {} },
            [STORAGE_KEYS.SERIES]: {},
            [STORAGE_KEYS.CLAIMED_SERIES_REWARDS]: [],
            [STORAGE_KEYS.SERIES_EXPEDITION_PROGRESS]: [],
            [STORAGE_KEYS.CLAIMED_COUNTRIES]: [],
            [STORAGE_KEYS.FUND_BALANCE_CENTS]: 4250,
            [STORAGE_KEYS.FUND_LEDGER]: [{ id: 'f1', date: '2026-11-08', amountCents: 3200, note: 'Hardcover' }],
            [STORAGE_KEYS.QUEST_DRAW_HELPER_STATE]: {},
            [STORAGE_KEYS.QUEST_DRAW_HELPER_SETTINGS]: { autoApplyOnDraw: false },
            [STORAGE_KEYS.EFFECT_COOLDOWNS]: {}
        };

        Object.entries(expectedState).forEach(([key, value]) => {
            characterState[key] = value;
        });

        await saveState(form);

        const storedKeys = getStoredKeys();
        // Always expect form + schema version in localStorage
        expect(storedKeys).toContain(STORAGE_KEYS.CHARACTER_SHEET_FORM);
        expect(storedKeys).toContain('tomeOfSecrets_schemaVersion');

        const persistedForm = JSON.parse(localStorage.getItem(STORAGE_KEYS.CHARACTER_SHEET_FORM));
        expect(persistedForm).toMatchObject({
            level: '5',
            keeperBackground: 'Grove Tender',
            wizardSchool: 'Divination',
            librarySanctum: 'The Spire of Whispers'
        });

        CHARACTER_STATE_KEYS.forEach(key => {
            const raw = localStorage.getItem(key);
            // Large keys may have been migrated out of localStorage (IndexedDB-backed).
            if (raw === null && LARGE_STATE_KEYS.has(key)) {
                return;
            }
            const persistedValue = JSON.parse(raw);
            expect(persistedValue).toEqual(expectedState[key]);
        });
    });

    it('saveState excludes file inputs', async () => {
        document.body.innerHTML = `
            <form id="character-sheet">
                <input type="text" id="level" value="5" />
                <input type="text" id="keeperBackground" value="Grove Tender" />
                <input type="file" id="library-add-cover-upload" accept="image/*" />
                <input type="file" id="book-edit-cover-upload" accept="image/*" />
            </form>
        `;
        const form = document.getElementById('character-sheet');

        await saveState(form);

        const persistedForm = JSON.parse(localStorage.getItem(STORAGE_KEYS.CHARACTER_SHEET_FORM));
        expect(persistedForm.level).toBe('5');
        expect(persistedForm['library-add-cover-upload']).toBeUndefined();
        expect(persistedForm['book-edit-cover-upload']).toBeUndefined();
    });

    it('loadState skips file inputs even if their values exist in localStorage', async () => {
        document.body.innerHTML = `
            <form id="character-sheet">
                <input type="text" id="level" value="1" />
                <input type="text" id="keeperBackground" value="" />
                <input type="file" id="library-add-cover-upload" accept="image/*" />
            </form>
        `;
        const form = document.getElementById('character-sheet');

        // Simulate stale localStorage that includes a file input value
        localStorage.setItem(STORAGE_KEYS.CHARACTER_SHEET_FORM, JSON.stringify({
            level: '7',
            keeperBackground: 'Biblioslinger',
            'library-add-cover-upload': 'C:\\fakepath\\cover.png'
        }));

        // loadState should not throw and should restore other fields
        await loadState(form);

        expect(form.querySelector('#level').value).toBe('7');
        expect(form.querySelector('#keeperBackground').value).toBe('Biblioslinger');
        // File input should remain empty (not crash)
        expect(form.querySelector('#library-add-cover-upload').value).toBe('');
    });

    it('loads legacy localStorage data (and may migrate large keys out of localStorage)', async () => {
        const form = setupForm();
        const legacyActiveAssignments = [{ type: '♥ Organize the Stacks', prompt: 'Restore the reading room' }];

        localStorage.setItem(STORAGE_KEYS.CHARACTER_SHEET_FORM, JSON.stringify({
            level: '7',
            keeperBackground: 'Biblioslinger'
        }));
        localStorage.setItem(STORAGE_KEYS.ACTIVE_ASSIGNMENTS, JSON.stringify(legacyActiveAssignments));
        localStorage.setItem(STORAGE_KEYS.COMPLETED_QUESTS, JSON.stringify([{ type: '♠ Dungeon Crawl', prompt: 'Explore the cellar' }]));
        localStorage.setItem(STORAGE_KEYS.DISCARDED_QUESTS, JSON.stringify([]));
        localStorage.setItem(STORAGE_KEYS.EQUIPPED_ITEMS, JSON.stringify([{ name: 'Lantern of Insight' }]));
        localStorage.setItem(STORAGE_KEYS.INVENTORY_ITEMS, JSON.stringify([]));
        localStorage.setItem(STORAGE_KEYS.LEARNED_ABILITIES, JSON.stringify(['Scribe Sigils']));
        localStorage.setItem(STORAGE_KEYS.ATMOSPHERIC_BUFFS, JSON.stringify({ 'The Cozy Hearth': true }));
        localStorage.setItem(STORAGE_KEYS.TEMPORARY_BUFFS, JSON.stringify([{ name: 'Star Chart', duration: 'until-end-month', monthsRemaining: 1, status: 'active' }]));
        localStorage.setItem(STORAGE_KEYS.TEMPORARY_BUFFS, JSON.stringify([{ name: 'Star Chart', duration: 'until-end-month', monthsRemaining: 1, status: 'active' }]));
        localStorage.setItem(STORAGE_KEYS.BUFF_MONTH_COUNTER, JSON.stringify(4));
        localStorage.setItem(STORAGE_KEYS.SELECTED_GENRES, JSON.stringify(['Mystery', 'Fantasy']));

        await loadState(form);

        expect(form.querySelector('#level').value).toBe('7');
        expect(form.querySelector('#keeperBackground').value).toBe('Biblioslinger');

        expect(characterState[STORAGE_KEYS.ACTIVE_ASSIGNMENTS][0]).toMatchObject({
            type: '♥ Organize the Stacks',
            prompt: 'Restore the reading room',
            rewards: expect.any(Object)
        });

        expect(characterState[STORAGE_KEYS.COMPLETED_QUESTS][0]).toMatchObject({
            type: '♠ Dungeon Crawl',
            prompt: 'Explore the cellar',
            rewards: expect.any(Object)
        });

        expect(characterState[STORAGE_KEYS.BUFF_MONTH_COUNTER]).toBe(4);
        // After validation, quests will have all required fields added
        // The legacy format is migrated to include missing fields like rewards, buffs, etc.
        const rawLoadedQuests = localStorage.getItem(STORAGE_KEYS.ACTIVE_ASSIGNMENTS);
        // Large keys may be migrated out of localStorage in environments with IndexedDB support.
        if (rawLoadedQuests !== null) {
            const loadedQuests = JSON.parse(rawLoadedQuests);
            expect(loadedQuests.length).toBe(legacyActiveAssignments.length);
            expect(loadedQuests[0].type).toBe(legacyActiveAssignments[0].type);
            expect(loadedQuests[0].prompt).toBe(legacyActiveAssignments[0].prompt);
            // Validated quests will have rewards object added
            expect(loadedQuests[0].rewards).toBeDefined();
            expect(typeof loadedQuests[0].rewards.xp).toBe('number');
        }
    });

    test('v17 save migrates to the current schema', async () => {
        document.body.innerHTML = `
            <form id="character-sheet">
                <input type="text" id="xp-current" value="" />
                <input type="text" id="level" value="" />
                <input type="text" id="smp" value="" />
                <input type="text" id="inkDrops" value="" />
                <input type="text" id="paperScraps" value="" />
                <input type="text" id="journal-entries-completed" value="" />
            </form>
        `;
        const form = document.getElementById('character-sheet');

        const rawBooks = {
            b1: {
                id: 'b1', title: 'The Name of the Wind', author: 'Patrick Rothfuss', cover: null,
                pageCount: 662, status: 'completed', dateAdded: '2026-09-01T00:00:00.000Z',
                dateCompleted: '2026-09-20T00:00:00.000Z', links: { questIds: ['q1'], curriculumPromptIds: [] },
                shelfCategory: 'general', tags: []
            },
            b2: {
                id: 'b2', title: 'Piranesi', author: 'Susanna Clarke', cover: null,
                pageCount: 272, status: 'reading', dateAdded: '2026-10-01T00:00:00.000Z',
                dateCompleted: null, links: { questIds: [], curriculumPromptIds: [] },
                shelfCategory: 'general', tags: []
            }
        };
        const rawCompletedQuests = [{
            id: 'q1', type: '♥ Organize the Stacks', prompt: 'Fantasy', book: 'The Name of the Wind',
            bookAuthor: 'Patrick Rothfuss', bookId: 'b1', month: 'September', year: '2026',
            status: 'completed', dateCompleted: '2026-09-20T00:00:00.000Z',
            rewards: { xp: 15, inkDrops: 10, paperScraps: 0, blueprints: 0, items: [], modifiedBy: [] }
        }];
        // A v17 save holds already-validated shapes, so normalise the fixture the same way.
        // The migration must then leave books and quests exactly as they were.
        const normalised = validateCharacterState({
            ...createEmptyCharacterState(),
            [STORAGE_KEYS.BOOKS]: rawBooks,
            [STORAGE_KEYS.COMPLETED_QUESTS]: rawCompletedQuests
        });
        const books = normalised[STORAGE_KEYS.BOOKS];
        const completedQuests = normalised[STORAGE_KEYS.COMPLETED_QUESTS];
        expect(completedQuests[0].rewards.xp).toBe(15);
        expect(books.b1.title).toBe('The Name of the Wind');

        localStorage.setItem('tomeOfSecrets_schemaVersion', '17');
        localStorage.setItem('activeCurses', JSON.stringify([{ name: 'The Unread Tome', requirement: 'Read 1 book' }]));
        localStorage.setItem('shoppingLog', JSON.stringify([{ optionId: 'opt1', logDate: '2026-10-15' }]));
        localStorage.setItem(STORAGE_KEYS.DUSTY_BLUEPRINTS, JSON.stringify(42));
        localStorage.setItem(STORAGE_KEYS.BOOKS, JSON.stringify(books));
        localStorage.setItem(STORAGE_KEYS.COMPLETED_QUESTS, JSON.stringify(completedQuests));
        localStorage.setItem(STORAGE_KEYS.CHARACTER_SHEET_FORM, JSON.stringify({
            inkDrops: '300', paperScraps: '40', 'journal-entries-completed': '3',
            'xp-current': '1234', level: '6', smp: '2'
        }));

        await loadState(form);

        // Retired keys are gone from both the in-memory state and storage
        expect(characterState).not.toHaveProperty('activeCurses');
        expect(characterState).not.toHaveProperty('shoppingLog');
        expect(localStorage.getItem('activeCurses')).toBeNull();
        expect(localStorage.getItem('shoppingLog')).toBeNull();

        // Fund starts at $0; everything else is untouched
        expect(characterState[STORAGE_KEYS.FUND_BALANCE_CENTS]).toBe(0);
        expect(characterState[STORAGE_KEYS.FUND_LEDGER]).toEqual([]);
        expect(characterState[STORAGE_KEYS.DUSTY_BLUEPRINTS]).toBe(42);
        expect(characterState[STORAGE_KEYS.BOOKS]).toEqual(books);
        expect(characterState[STORAGE_KEYS.COMPLETED_QUESTS]).toEqual(completedQuests);

        // Form keeps XP, level and SMP and drops the retired fields
        expect(form.querySelector('#xp-current').value).toBe('1234');
        expect(form.querySelector('#level').value).toBe('6');
        expect(form.querySelector('#smp').value).toBe('2');
        expect(form.querySelector('#inkDrops').value).toBe('');
        expect(form.querySelector('#paperScraps').value).toBe('');
        expect(form.querySelector('#journal-entries-completed').value).toBe('');

        const storedForm = JSON.parse(localStorage.getItem(STORAGE_KEYS.CHARACTER_SHEET_FORM));
        expect(storedForm).toEqual({ 'xp-current': '1234', level: '6', smp: '2' });
        expect(localStorage.getItem('tomeOfSecrets_schemaVersion')).toBe(String(SCHEMA_VERSION));
    });
});

