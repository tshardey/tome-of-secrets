/**
 * @jest-environment jsdom
 */
import { initializeFormPersistence, showSaveIndicator } from '../assets/js/character-sheet/formPersistence.js';
import { STORAGE_KEYS } from '../assets/js/character-sheet/storageKeys.js';
import { safeGetJSON } from '../assets/js/utils/storage.js';

function setupForm() {
    document.body.innerHTML = `
        <form id="character-sheet">
            <input type="text" id="keeperName" value="" />
            <input type="number" id="level" value="1" />
            <input type="text" id="keeperBackground" value="" />
            <select id="wizardSchool">
                <option value="">-- Select a School --</option>
                <option value="Divination">Divination</option>
            </select>
            <select id="librarySanctum">
                <option value="">-- Select a Sanctum --</option>
                <option value="The Spire of Whispers">The Spire of Whispers</option>
            </select>
            <input type="number" id="inkDrops" value="0" />
            <input type="number" id="paperScraps" value="0" />
            <input type="number" id="wearable-slots" value="0" />
            <input type="number" id="non-wearable-slots" value="0" />
            <input type="number" id="familiar-slots" value="0" />
            <!-- Transient fields that should NOT be persisted -->
            <input type="text" id="new-quest-prompt" value="" />
            <input type="hidden" id="new-quest-book-id" value="" />
            <select id="item-select">
                <option value="">-- Select an item --</option>
            </select>
            <select id="ability-select">
                <option value="">-- Select an ability --</option>
            </select>
            <input type="text" id="xp-needed" value="100" readonly />
            <button type="button" id="test-button">Test Button</button>
        </form>
        <span id="save-indicator" class="save-indicator hidden">Saved</span>
    `;
    return document.getElementById('character-sheet');
}

describe('formPersistence', () => {
    beforeEach(() => {
        localStorage.clear();
        document.body.innerHTML = '';
        jest.useFakeTimers();
    });

    afterEach(() => {
        jest.useRealTimers();
    });

    describe('initializeFormPersistence', () => {
        it('should persist form data when typing into keeperName', async () => {
            const form = setupForm();
            const keeperNameInput = document.getElementById('keeperName');
            
            initializeFormPersistence(form, 500);
            
            // Simulate typing
            keeperNameInput.value = 'Test Keeper';
            keeperNameInput.dispatchEvent(new Event('input', { bubbles: true, cancelable: true }));
            
            // Fast-forward past debounce delay
            jest.advanceTimersByTime(500);
            
            // Wait for next tick to allow async operations
            await Promise.resolve();
            
            const savedData = safeGetJSON(STORAGE_KEYS.CHARACTER_SHEET_FORM, {});
            expect(savedData.keeperName).toBe('Test Keeper');
        });

        it('should NOT persist new-quest-* fields', async () => {
            const form = setupForm();
            const newQuestPrompt = document.getElementById('new-quest-prompt');
            const keeperNameInput = document.getElementById('keeperName');
            
            initializeFormPersistence(form, 500);
            
            // Set keeperName to trigger a save
            keeperNameInput.value = 'Test';
            keeperNameInput.dispatchEvent(new Event('input', { bubbles: true, cancelable: true }));
            
            // Type in new-quest field (should not trigger save)
            newQuestPrompt.value = 'Quest Prompt';
            newQuestPrompt.dispatchEvent(new Event('input', { bubbles: true, cancelable: true }));
            
            // Fast-forward past debounce delay
            jest.advanceTimersByTime(500);
            
            await Promise.resolve();
            
            const savedData = safeGetJSON(STORAGE_KEYS.CHARACTER_SHEET_FORM, {});
            expect(savedData.keeperName).toBe('Test');
            expect(savedData['new-quest-prompt']).toBeUndefined();
        });

        it('should NOT persist transient select fields', async () => {
            const form = setupForm();
            const itemSelect = document.getElementById('item-select');
            const keeperNameInput = document.getElementById('keeperName');
            
            initializeFormPersistence(form, 500);
            
            // Set keeperName to trigger a save
            keeperNameInput.value = 'Test';
            keeperNameInput.dispatchEvent(new Event('input', { bubbles: true, cancelable: true }));
            
            // Change item-select (should not trigger save)
            itemSelect.value = 'Test Item';
            itemSelect.dispatchEvent(new Event('change', { bubbles: true, cancelable: true }));
            
            // Fast-forward past debounce delay
            jest.advanceTimersByTime(500);
            
            await Promise.resolve();
            
            const savedData = safeGetJSON(STORAGE_KEYS.CHARACTER_SHEET_FORM, {});
            expect(savedData.keeperName).toBe('Test');
            expect(savedData['item-select']).toBeUndefined();
        });

        it('should debounce rapid changes and only save once', async () => {
            const form = setupForm();
            const keeperNameInput = document.getElementById('keeperName');
            
            initializeFormPersistence(form, 500);
            
            // Simulate rapid typing
            keeperNameInput.value = 'T';
            keeperNameInput.dispatchEvent(new Event('input', { bubbles: true, cancelable: true }));
            jest.advanceTimersByTime(100);
            
            keeperNameInput.value = 'Te';
            keeperNameInput.dispatchEvent(new Event('input', { bubbles: true, cancelable: true }));
            jest.advanceTimersByTime(100);
            
            keeperNameInput.value = 'Tes';
            keeperNameInput.dispatchEvent(new Event('input', { bubbles: true, cancelable: true }));
            jest.advanceTimersByTime(100);
            
            keeperNameInput.value = 'Test';
            keeperNameInput.dispatchEvent(new Event('input', { bubbles: true, cancelable: true }));
            
            // Fast-forward past debounce delay (should only trigger one save)
            jest.advanceTimersByTime(500);
            
            await Promise.resolve();
            
            const savedData = safeGetJSON(STORAGE_KEYS.CHARACTER_SHEET_FORM, {});
            // Should only save the final value
            expect(savedData.keeperName).toBe('Test');
        });

        it('should emit tos:localStateChanged event after save', async () => {
            const form = setupForm();
            const keeperNameInput = document.getElementById('keeperName');
            
            const eventListener = jest.fn();
            window.addEventListener('tos:localStateChanged', eventListener);
            
            initializeFormPersistence(form, 500);
            
            keeperNameInput.value = 'Test Keeper';
            keeperNameInput.dispatchEvent(new Event('input', { bubbles: true, cancelable: true }));
            
            // Fast-forward past debounce delay
            jest.advanceTimersByTime(500);
            
            await Promise.resolve();
            
            expect(eventListener).toHaveBeenCalledTimes(1);
            expect(eventListener).toHaveBeenCalledWith(
                expect.objectContaining({
                    detail: { source: 'form' }
                })
            );
            
            window.removeEventListener('tos:localStateChanged', eventListener);
        });

        it('should persist multiple form fields', async () => {
            const form = setupForm();
            const keeperNameInput = document.getElementById('keeperName');
            const levelInput = document.getElementById('level');
            const inkDropsInput = document.getElementById('inkDrops');
            
            initializeFormPersistence(form, 500);
            
            keeperNameInput.value = 'Test Keeper';
            keeperNameInput.dispatchEvent(new Event('input', { bubbles: true, cancelable: true }));
            
            levelInput.value = '5';
            levelInput.dispatchEvent(new Event('change', { bubbles: true, cancelable: true }));
            
            inkDropsInput.value = '10';
            inkDropsInput.dispatchEvent(new Event('input', { bubbles: true, cancelable: true }));
            
            // Fast-forward past debounce delay
            jest.advanceTimersByTime(500);
            
            await Promise.resolve();
            
            const savedData = safeGetJSON(STORAGE_KEYS.CHARACTER_SHEET_FORM, {});
            expect(savedData.keeperName).toBe('Test Keeper');
            expect(savedData.level).toBe('5');
            expect(savedData.inkDrops).toBe('10');
        });
    });

    describe('showSaveIndicator', () => {
        it('should show and hide the save indicator', () => {
            setupForm();
            const indicator = document.getElementById('save-indicator');
            
            expect(indicator.classList.contains('hidden')).toBe(true);
            
            showSaveIndicator();
            expect(indicator.classList.contains('hidden')).toBe(false);
            
            // Fast-forward past the 2 second delay
            jest.advanceTimersByTime(2000);
            
            expect(indicator.classList.contains('hidden')).toBe(true);
        });

        it('should extend visibility when called multiple times', () => {
            setupForm();
            const indicator = document.getElementById('save-indicator');
            
            expect(indicator.classList.contains('hidden')).toBe(true);
            
            // First call - show indicator
            showSaveIndicator();
            expect(indicator.classList.contains('hidden')).toBe(false);
            
            // Advance 1 second
            jest.advanceTimersByTime(1000);
            expect(indicator.classList.contains('hidden')).toBe(false);
            
            // Second call - should clear previous timeout and extend visibility
            showSaveIndicator();
            expect(indicator.classList.contains('hidden')).toBe(false);
            
            // Advance 1 more second (2 seconds total, but timer was reset)
            jest.advanceTimersByTime(1000);
            expect(indicator.classList.contains('hidden')).toBe(false);
            
            // Advance 1 more second (now 3 seconds from start, 2 seconds from second call)
            jest.advanceTimersByTime(1000);
            expect(indicator.classList.contains('hidden')).toBe(true);
        });

        it('should handle missing indicator gracefully', () => {
            document.body.innerHTML = '<form id="character-sheet"></form>';
            // No indicator element
            expect(() => showSaveIndicator()).not.toThrow();
        });
    });
});

