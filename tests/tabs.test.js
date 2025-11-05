/**
 * Tests for the tab navigation system
 */

import { initializeTabs, switchToTab, getActiveTab } from '../assets/js/tabs.js';

describe('Tab Navigation System', () => {
    let mockLocalStorage;

    beforeEach(() => {
        // Clear the DOM
        document.body.innerHTML = '';
        
        // Mock localStorage
        mockLocalStorage = {};
        Storage.prototype.getItem = jest.fn(key => mockLocalStorage[key] || null);
        Storage.prototype.setItem = jest.fn((key, value) => {
            mockLocalStorage[key] = value;
        });
        Storage.prototype.clear = jest.fn(() => {
            mockLocalStorage = {};
        });
    });

    afterEach(() => {
        jest.clearAllMocks();
    });

    describe('initializeTabs', () => {
        test('should do nothing if no tabs exist on page', () => {
            document.body.innerHTML = '<div>No tabs here</div>';
            
            expect(() => initializeTabs()).not.toThrow();
        });

        test('should activate the first tab by default if no localStorage', () => {
            document.body.innerHTML = `
                <nav class="tab-nav">
                    <button data-tab-target="tab1">Tab 1</button>
                    <button data-tab-target="tab2">Tab 2</button>
                </nav>
                <div data-tab-panel="tab1">Content 1</div>
                <div data-tab-panel="tab2">Content 2</div>
            `;

            initializeTabs();

            const tab1Button = document.querySelector('[data-tab-target="tab1"]');
            const tab1Panel = document.querySelector('[data-tab-panel="tab1"]');
            
            expect(tab1Button.classList.contains('active')).toBe(true);
            expect(tab1Panel.classList.contains('active')).toBe(true);
        });

        test('should activate the last active tab from localStorage', () => {
            mockLocalStorage['activeCharacterTab'] = 'tab2';
            
            document.body.innerHTML = `
                <nav class="tab-nav">
                    <button data-tab-target="tab1">Tab 1</button>
                    <button data-tab-target="tab2">Tab 2</button>
                </nav>
                <div data-tab-panel="tab1">Content 1</div>
                <div data-tab-panel="tab2">Content 2</div>
            `;

            initializeTabs();

            const tab2Button = document.querySelector('[data-tab-target="tab2"]');
            const tab2Panel = document.querySelector('[data-tab-panel="tab2"]');
            
            expect(tab2Button.classList.contains('active')).toBe(true);
            expect(tab2Panel.classList.contains('active')).toBe(true);
        });

        test('should set up click handlers for tab buttons', () => {
            document.body.innerHTML = `
                <nav class="tab-nav">
                    <button data-tab-target="tab1">Tab 1</button>
                    <button data-tab-target="tab2">Tab 2</button>
                </nav>
                <div data-tab-panel="tab1">Content 1</div>
                <div data-tab-panel="tab2">Content 2</div>
            `;

            initializeTabs();

            const tab2Button = document.querySelector('[data-tab-target="tab2"]');
            const tab2Panel = document.querySelector('[data-tab-panel="tab2"]');
            
            // Click tab 2
            tab2Button.click();

            expect(tab2Button.classList.contains('active')).toBe(true);
            expect(tab2Panel.classList.contains('active')).toBe(true);
        });
    });

    describe('switchToTab', () => {
        beforeEach(() => {
            document.body.innerHTML = `
                <nav class="tab-nav">
                    <button data-tab-target="character" class="active">Character</button>
                    <button data-tab-target="abilities">Abilities</button>
                    <button data-tab-target="inventory">Inventory</button>
                </nav>
                <div data-tab-panel="character" class="active">Character Content</div>
                <div data-tab-panel="abilities">Abilities Content</div>
                <div data-tab-panel="inventory">Inventory Content</div>
            `;
        });

        test('should switch active tab correctly', () => {
            switchToTab('abilities');

            const characterBtn = document.querySelector('[data-tab-target="character"]');
            const abilitiesBtn = document.querySelector('[data-tab-target="abilities"]');
            const characterPanel = document.querySelector('[data-tab-panel="character"]');
            const abilitiesPanel = document.querySelector('[data-tab-panel="abilities"]');

            expect(characterBtn.classList.contains('active')).toBe(false);
            expect(abilitiesBtn.classList.contains('active')).toBe(true);
            expect(characterPanel.classList.contains('active')).toBe(false);
            expect(abilitiesPanel.classList.contains('active')).toBe(true);
        });

        test('should save active tab to localStorage', () => {
            switchToTab('inventory');

            expect(localStorage.setItem).toHaveBeenCalledWith('activeCharacterTab', 'inventory');
        });

        test('should deactivate all other tabs when switching', () => {
            switchToTab('abilities');

            const allButtons = document.querySelectorAll('[data-tab-target]');
            const allPanels = document.querySelectorAll('[data-tab-panel]');

            let activeButtonCount = 0;
            let activePanelCount = 0;

            allButtons.forEach(btn => {
                if (btn.classList.contains('active')) activeButtonCount++;
            });

            allPanels.forEach(panel => {
                if (panel.classList.contains('active')) activePanelCount++;
            });

            expect(activeButtonCount).toBe(1);
            expect(activePanelCount).toBe(1);
        });

        test('should handle switching to non-existent tab gracefully', () => {
            expect(() => switchToTab('nonexistent')).not.toThrow();
            
            // All tabs should be deactivated if target doesn't exist
            const allButtons = document.querySelectorAll('[data-tab-target]');
            const allPanels = document.querySelectorAll('[data-tab-panel]');
            
            allButtons.forEach(btn => {
                expect(btn.classList.contains('active')).toBe(false);
            });
            
            allPanels.forEach(panel => {
                expect(panel.classList.contains('active')).toBe(false);
            });
        });
    });

    describe('getActiveTab', () => {
        test('should return the ID of the active tab', () => {
            document.body.innerHTML = `
                <div data-tab-panel="character">Character Content</div>
                <div data-tab-panel="abilities" class="active">Abilities Content</div>
                <div data-tab-panel="inventory">Inventory Content</div>
            `;

            expect(getActiveTab()).toBe('abilities');
        });

        test('should return null if no tab is active', () => {
            document.body.innerHTML = `
                <div data-tab-panel="character">Character Content</div>
                <div data-tab-panel="abilities">Abilities Content</div>
            `;

            expect(getActiveTab()).toBe(null);
        });
    });

    describe('Tab Integration with Character Sheet', () => {
        test('should work with all 6 character sheet tabs', () => {
            document.body.innerHTML = `
                <nav class="tab-nav">
                    <button data-tab-target="character">📊 Character</button>
                    <button data-tab-target="abilities">⚡ Abilities</button>
                    <button data-tab-target="inventory">🎒 Inventory</button>
                    <button data-tab-target="quests">📅 Quests</button>
                    <button data-tab-target="archived">📦 Archived</button>
                    <button data-tab-target="curses">💀 Curses</button>
                </nav>
                <div data-tab-panel="character">Character Tab</div>
                <div data-tab-panel="abilities">Abilities Tab</div>
                <div data-tab-panel="inventory">Inventory Tab</div>
                <div data-tab-panel="quests">Quests Tab</div>
                <div data-tab-panel="archived">Archived Tab</div>
                <div data-tab-panel="curses">Curses Tab</div>
            `;

            initializeTabs();

            // Test switching through all tabs
            const tabs = ['character', 'abilities', 'inventory', 'quests', 'archived', 'curses'];
            
            tabs.forEach(tabId => {
                switchToTab(tabId);
                expect(getActiveTab()).toBe(tabId);
                expect(localStorage.setItem).toHaveBeenCalledWith('activeCharacterTab', tabId);
            });
        });

        test('should preserve form input values when switching tabs', () => {
            document.body.innerHTML = `
                <nav class="tab-nav">
                    <button data-tab-target="character">Character</button>
                    <button data-tab-target="abilities">Abilities</button>
                </nav>
                <div data-tab-panel="character" class="active">
                    <input type="text" id="keeperName" value="Test Keeper" />
                </div>
                <div data-tab-panel="abilities">
                    <select id="wizardSchool">
                        <option value="Abjuration" selected>Abjuration</option>
                    </select>
                </div>
            `;

            initializeTabs();

            const keeperNameInput = document.getElementById('keeperName');
            const wizardSchoolSelect = document.getElementById('wizardSchool');

            // Switch tabs
            switchToTab('abilities');
            switchToTab('character');

            // Values should be preserved
            expect(keeperNameInput.value).toBe('Test Keeper');
            expect(wizardSchoolSelect.value).toBe('Abjuration');
        });
    });

    describe('Accessibility', () => {
        test('tab buttons should have appropriate ARIA attributes', () => {
            document.body.innerHTML = `
                <nav class="tab-nav" role="tablist">
                    <button data-tab-target="tab1" role="tab" aria-selected="true">Tab 1</button>
                    <button data-tab-target="tab2" role="tab" aria-selected="false">Tab 2</button>
                </nav>
                <div data-tab-panel="tab1" role="tabpanel">Content 1</div>
                <div data-tab-panel="tab2" role="tabpanel">Content 2</div>
            `;

            const tab1Button = document.querySelector('[data-tab-target="tab1"]');
            const tab2Button = document.querySelector('[data-tab-target="tab2"]');

            expect(tab1Button.getAttribute('role')).toBe('tab');
            expect(tab2Button.getAttribute('role')).toBe('tab');
            expect(tab1Button.getAttribute('aria-selected')).toBe('true');
            expect(tab2Button.getAttribute('aria-selected')).toBe('false');
        });
    });
});

