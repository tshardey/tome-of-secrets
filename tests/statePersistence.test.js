/**
 * @jest-environment jsdom
 */
import { saveState, loadState, characterState } from '../assets/js/character-sheet/state.js';
import { STORAGE_KEYS, CHARACTER_STATE_KEYS, createEmptyCharacterState } from '../assets/js/character-sheet/storageKeys.js';
import { LARGE_STATE_KEYS } from '../assets/js/character-sheet/persistence.js';

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
            [STORAGE_KEYS.ACTIVE_CURSES]: [{ name: 'Echo of Forgetfulness' }],
            [STORAGE_KEYS.COMPLETED_CURSES]: [],
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
            [STORAGE_KEYS.DUNGEON_COMPLETION_DRAWS_REDEEMED]: 0
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
        localStorage.setItem(STORAGE_KEYS.ACTIVE_CURSES, JSON.stringify([]));
        localStorage.setItem(STORAGE_KEYS.COMPLETED_CURSES, JSON.stringify([{ name: 'Dusty Silence' }]));
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
});

