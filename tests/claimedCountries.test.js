/**
 * The Exchange's register: countries claimed once, ever.
 *
 * @jest-environment jsdom
 */
import { STORAGE_KEYS, createEmptyCharacterState } from '../assets/js/character-sheet/storageKeys.js';
import { validateCharacterState, SCHEMA_VERSION } from '../assets/js/character-sheet/dataValidator.js';
import { migrateState } from '../assets/js/character-sheet/dataMigrator.js';
import { StateAdapter, STATE_EVENTS } from '../assets/js/character-sheet/stateAdapter.js';

describe('claimed countries register', () => {
    beforeEach(() => {
        localStorage.clear();
    });

    test('the storage key exists and defaults to an empty array', () => {
        expect(STORAGE_KEYS.CLAIMED_COUNTRIES).toBe('claimedCountries');
        expect(createEmptyCharacterState()[STORAGE_KEYS.CLAIMED_COUNTRIES]).toEqual([]);
    });

    test('the schema version is 17', () => {
        expect(SCHEMA_VERSION).toBe(17);
    });

    test('validation coerces a non-array register to an empty array', () => {
        const validated = validateCharacterState({
            ...createEmptyCharacterState(),
            [STORAGE_KEYS.CLAIMED_COUNTRIES]: 'Japan'
        });
        expect(validated[STORAGE_KEYS.CLAIMED_COUNTRIES]).toEqual([]);
    });

    test('validation keeps a well-formed register', () => {
        const validated = validateCharacterState({
            ...createEmptyCharacterState(),
            [STORAGE_KEYS.CLAIMED_COUNTRIES]: ['Japan', 'Nigeria']
        });
        expect(validated[STORAGE_KEYS.CLAIMED_COUNTRIES]).toEqual(['Japan', 'Nigeria']);
    });

    // migrateState() reads the stored version from localStorage rather than taking it as
    // an argument, so the fixture sets it directly. The key is 'tomeOfSecrets_schemaVersion'
    // (dataValidator.js:37).
    test('migration to v17 adds the register to a v16 state without one', () => {
        localStorage.setItem('tomeOfSecrets_schemaVersion', '16');
        const v16State = { ...createEmptyCharacterState() };
        delete v16State[STORAGE_KEYS.CLAIMED_COUNTRIES];

        const migrated = migrateState(v16State);

        expect(migrated[STORAGE_KEYS.CLAIMED_COUNTRIES]).toEqual([]);
    });

    test('migration leaves an existing register alone', () => {
        localStorage.setItem('tomeOfSecrets_schemaVersion', '16');
        const v16State = {
            ...createEmptyCharacterState(),
            [STORAGE_KEYS.CLAIMED_COUNTRIES]: ['Iceland']
        };

        const migrated = migrateState(v16State);

        expect(migrated[STORAGE_KEYS.CLAIMED_COUNTRIES]).toEqual(['Iceland']);
    });
});

describe('stateAdapter claimed country accessors', () => {
    let adapter;
    let state;

    beforeEach(() => {
        localStorage.clear();
        state = createEmptyCharacterState();
        adapter = new StateAdapter(state);
    });

    test('starts empty', () => {
        expect(adapter.getClaimedCountries()).toEqual([]);
    });

    test('adds a country and reports it claimed, case-insensitively', () => {
        expect(adapter.addClaimedCountry('Japan')).toBe(true);
        expect(adapter.getClaimedCountries()).toEqual(['Japan']);
        expect(state[STORAGE_KEYS.CLAIMED_COUNTRIES]).toEqual(['Japan']);
        expect(adapter.hasClaimedCountry('japan')).toBe(true);
        expect(adapter.hasClaimedCountry('  JAPAN ')).toBe(true);
        expect(adapter.hasClaimedCountry('Nigeria')).toBe(false);
    });

    test('a repeat claim does not duplicate the entry', () => {
        adapter.addClaimedCountry('Japan');
        expect(adapter.addClaimedCountry('japan')).toBe(true);
        expect(adapter.getClaimedCountries()).toEqual(['Japan']);
    });

    test('rejects empty or non-string countries', () => {
        expect(adapter.addClaimedCountry('')).toBe(false);
        expect(adapter.addClaimedCountry('   ')).toBe(false);
        expect(adapter.addClaimedCountry(null)).toBe(false);
        expect(adapter.addClaimedCountry(42)).toBe(false);
        expect(adapter.getClaimedCountries()).toEqual([]);
    });

    test('emits CLAIMED_COUNTRIES_CHANGED when a country is struck off', () => {
        const handler = jest.fn();
        adapter.on(STATE_EVENTS.CLAIMED_COUNTRIES_CHANGED, handler);
        adapter.addClaimedCountry('Iceland');
        expect(handler).toHaveBeenCalledWith(['Iceland']);
    });
});

describe("enrolling with the Exchange's register", () => {
    const scholarQuest = {
        key: '13',
        id: 'side-quest-the-visiting-scholar',
        name: 'The Visiting Scholar',
        description: 'A scholar from the visiting academy.',
        prompt: 'Read a book set at a school.',
        branchType: 'choice',
        rollInstruction: null,
        branches: [
            { key: 'A', roll: null, name: 'Curriculum swap', prompt: 'Read a book set at a school.' },
            {
                key: 'B',
                roll: null,
                name: 'Enrollment record',
                prompt: 'Read a book by an author from a country you have never read from.',
                requiresCountry: true
            }
        ]
    };

    let controller;
    let adapter;
    let characterState;
    let toast;

    async function setUpController() {
        jest.resetModules();
        localStorage.clear();
        document.body.innerHTML = `
            <div id="side-quest-deck-container"></div>
            <div id="side-quest-drawn-card-display"></div>
        `;

        const stateModule = await import('../assets/js/character-sheet/state.js');
        characterState = stateModule.characterState;
        Object.keys(characterState).forEach((key) => delete characterState[key]);
        Object.assign(characterState, createEmptyCharacterState());

        const { StateAdapter: Adapter } = await import('../assets/js/character-sheet/stateAdapter.js');
        adapter = new Adapter(characterState);

        ({ toast } = await import('../assets/js/ui/toast.js'));
        jest.spyOn(toast, 'warning').mockImplementation(() => {});
        jest.spyOn(toast, 'info').mockImplementation(() => {});

        const { SideQuestDeckController } = await import('../assets/js/controllers/SideQuestDeckController.js');
        const { renderSideQuestCard } = await import('../assets/js/character-sheet/cardRenderer.js');

        controller = new SideQuestDeckController(adapter, null, { ui: null });
        controller.deckContainer = document.getElementById('side-quest-deck-container');
        controller.drawnCardDisplay = document.getElementById('side-quest-drawn-card-display');
        controller.drawnQuests = [scholarQuest];
        controller.selectedIndices = new Set([0]);

        const card = renderSideQuestCard({ ...scholarQuest, cardImage: null, questData: scholarQuest });
        controller.drawnCardDisplay.appendChild(card);
        return card;
    }

    afterEach(() => {
        jest.restoreAllMocks();
    });

    function chooseEnrollment(card, country) {
        const select = card.querySelector('select.card-branch-select');
        select.value = 'B';
        select.dispatchEvent(new Event('change', { bubbles: true }));
        const input = card.querySelector('input.card-branch-country');
        input.value = country;
        return input;
    }

    test('refuses to enroll without a country', async () => {
        const card = await setUpController();
        chooseEnrollment(card, '   ');

        controller.handleAddQuestFromCard();

        expect(characterState[STORAGE_KEYS.ACTIVE_ASSIGNMENTS]).toEqual([]);
        expect(toast.warning).toHaveBeenCalled();
    });

    test('refuses a country already struck off the register', async () => {
        const card = await setUpController();
        adapter.addClaimedCountry('Japan');
        chooseEnrollment(card, 'japan');

        controller.handleAddQuestFromCard();

        expect(characterState[STORAGE_KEYS.ACTIVE_ASSIGNMENTS]).toEqual([]);
        expect(toast.warning).toHaveBeenCalledWith(
            expect.stringContaining("already struck off the Exchange's register")
        );
    });

    test('stamps branchCountry on the quest without claiming it yet', async () => {
        const card = await setUpController();
        chooseEnrollment(card, '  Iceland ');

        controller.handleAddQuestFromCard();

        const active = characterState[STORAGE_KEYS.ACTIVE_ASSIGNMENTS];
        expect(active).toHaveLength(1);
        expect(active[0].branchKey).toBe('B');
        expect(active[0].branchCountry).toBe('Iceland');
        // Claimed only when the quest is completed.
        expect(adapter.getClaimedCountries()).toEqual([]);
    });

    test('a branch that needs no country adds the quest with branchCountry null', async () => {
        const card = await setUpController();
        const select = card.querySelector('select.card-branch-select');
        select.value = 'A';
        select.dispatchEvent(new Event('change', { bubbles: true }));

        controller.handleAddQuestFromCard();

        const active = characterState[STORAGE_KEYS.ACTIVE_ASSIGNMENTS];
        expect(active).toHaveLength(1);
        expect(active[0].branchCountry).toBeNull();
    });

    test('a typed country survives a re-render of the drawn cards', async () => {
        const card = await setUpController();
        chooseEnrollment(card, 'Iceland');

        controller.renderDrawnCard();

        const input = controller.drawnCardDisplay.querySelector('input.card-branch-country');
        expect(input.value).toBe('Iceland');
    });

    test('validation preserves branchCountry on a stored quest', () => {
        const validated = validateCharacterState({
            ...createEmptyCharacterState(),
            [STORAGE_KEYS.ACTIVE_ASSIGNMENTS]: [{
                type: '♣ Side Quest',
                prompt: 'The Visiting Scholar: Read a book by an author from a country you have never read from.',
                branchKey: 'B',
                branchName: 'Enrollment record',
                branchCountry: 'Iceland',
                month: 'January',
                year: '2026'
            }]
        });
        expect(validated[STORAGE_KEYS.ACTIVE_ASSIGNMENTS][0].branchCountry).toBe('Iceland');
        expect(validated[STORAGE_KEYS.ACTIVE_ASSIGNMENTS][0].branchKey).toBe('B');
    });
});
