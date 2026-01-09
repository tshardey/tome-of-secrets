/**
 * @jest-environment jsdom
 */

import { initializeStatusWidget } from '../assets/js/components/StatusWidget.js';
import { characterState, loadState, isStateLoaded } from '../assets/js/character-sheet/state.js';
import { safeGetJSON, safeSetJSON } from '../assets/js/utils/storage.js';
import { STORAGE_KEYS } from '../assets/js/character-sheet/storageKeys.js';

// Mock the data module to avoid loading all game data
jest.mock('../assets/js/character-sheet/data.js', () => ({
    xpLevels: {
        '1': 100,
        '2': 250,
        '3': 500,
        '4': 1000,
        '5': 1750
    }
}));

describe('Status Widget', () => {
    beforeEach(async () => {
        // Clear DOM and localStorage
        document.body.innerHTML = '';
        localStorage.clear();
        
        // Reset character state
        Object.keys(characterState).forEach(key => {
            if (Array.isArray(characterState[key])) {
                characterState[key] = [];
            } else if (typeof characterState[key] === 'object' && characterState[key] !== null) {
                characterState[key] = {};
            } else {
                characterState[key] = 0;
            }
        });
        
        // Set up mock form data
        safeSetJSON(STORAGE_KEYS.CHARACTER_SHEET_FORM, {
            keeperName: 'Test Keeper',
            level: '5',
            'xp-current': '150',
            inkDrops: '25',
            paperScraps: '10',
            smp: '3'
        });
        
        characterState[STORAGE_KEYS.DUSTY_BLUEPRINTS] = 5;
        
        // Mark state as loaded to avoid async loadState call
        // Note: This is a workaround since isStateLoaded might not be exported
        // If tests fail, we may need to await loadState() or mock it
    });

    afterEach(() => {
        // Clean up widget
        const widget = document.getElementById('status-widget');
        if (widget) {
            widget.remove();
        }
    });

    describe('initialization', () => {
        it('should create widget element in the DOM', async () => {
            await initializeStatusWidget();
            
            const widget = document.getElementById('status-widget');
            expect(widget).toBeTruthy();
            expect(widget.classList.contains('status-widget')).toBe(true);
        });

        it('should create toggle button', async () => {
            await initializeStatusWidget();
            
            const widget = document.getElementById('status-widget');
            const toggle = widget.querySelector('.status-widget__toggle');
            
            expect(toggle).toBeTruthy();
            expect(toggle.getAttribute('aria-label')).toBe('Toggle character status');
        });

        it('should create expanded panel', async () => {
            await initializeStatusWidget();
            
            const widget = document.getElementById('status-widget');
            const panel = widget.querySelector('.status-widget__panel');
            
            expect(panel).toBeTruthy();
            expect(panel.getAttribute('role')).toBe('region');
        });

        it('should render character data in collapsed state', async () => {
            await initializeStatusWidget();
            
            const widget = document.getElementById('status-widget');
            const toggle = widget.querySelector('.status-widget__toggle');
            
            expect(toggle.textContent).toContain('Lv 5');
            expect(toggle.textContent).toContain('25'); // Ink Drops
            expect(toggle.textContent).toContain('10'); // Paper Scraps
            expect(toggle.textContent).toContain('5'); // Blueprints
            expect(toggle.textContent).toContain('3'); // SMP
        });
    });

    describe('collapsed/expanded state', () => {
        it('should start collapsed by default', async () => {
            await initializeStatusWidget();
            
            const widget = document.getElementById('status-widget');
            const panel = widget.querySelector('.status-widget__panel');
            
            expect(widget.classList.contains('status-widget--expanded')).toBe(false);
            expect(panel.style.display).toBe('none');
        });

        it('should expand when toggle is clicked', async () => {
            await initializeStatusWidget();
            
            const widget = document.getElementById('status-widget');
            const toggle = widget.querySelector('.status-widget__toggle');
            const panel = widget.querySelector('.status-widget__panel');
            
            toggle.click();
            
            expect(widget.classList.contains('status-widget--expanded')).toBe(true);
            expect(panel.style.display).toBe('block');
        });

        it('should collapse when toggle is clicked again', async () => {
            await initializeStatusWidget();
            
            const widget = document.getElementById('status-widget');
            const toggle = widget.querySelector('.status-widget__toggle');
            const panel = widget.querySelector('.status-widget__panel');
            
            // Expand
            toggle.click();
            expect(widget.classList.contains('status-widget--expanded')).toBe(true);
            
            // Collapse
            toggle.click();
            expect(widget.classList.contains('status-widget--expanded')).toBe(false);
            expect(panel.style.display).toBe('none');
        });

        it('should close when close button is clicked', async () => {
            await initializeStatusWidget();
            
            const widget = document.getElementById('status-widget');
            const toggle = widget.querySelector('.status-widget__toggle');
            const panel = widget.querySelector('.status-widget__panel');
            
            // Expand first
            toggle.click();
            expect(widget.classList.contains('status-widget--expanded')).toBe(true);
            
            // Click close button
            const closeButton = panel.querySelector('.status-widget__close');
            closeButton.click();
            
            expect(widget.classList.contains('status-widget--expanded')).toBe(false);
            expect(panel.style.display).toBe('none');
        });
    });

    describe('data rendering', () => {
        it('should display character name in expanded panel', async () => {
            await initializeStatusWidget();
            
            const widget = document.getElementById('status-widget');
            const toggle = widget.querySelector('.status-widget__toggle');
            toggle.click();
            
            const panel = widget.querySelector('.status-widget__panel');
            const title = panel.querySelector('.status-widget__title');
            
            expect(title.textContent).toBe('Test Keeper');
        });

        it('should display level in expanded panel', async () => {
            await initializeStatusWidget();
            
            const widget = document.getElementById('status-widget');
            const toggle = widget.querySelector('.status-widget__toggle');
            toggle.click();
            
            const panel = widget.querySelector('.status-widget__panel');
            const levelValue = panel.querySelector('.status-widget__level-value');
            
            expect(levelValue.textContent).toBe('5');
        });

        it('should display XP progress', async () => {
            await initializeStatusWidget();
            
            const widget = document.getElementById('status-widget');
            const toggle = widget.querySelector('.status-widget__toggle');
            toggle.click();
            
            const panel = widget.querySelector('.status-widget__panel');
            const xpText = panel.querySelector('.status-widget__xp-text');
            const xpBar = panel.querySelector('.status-widget__xp-bar');
            
            expect(xpText.textContent).toContain('150');
            expect(xpBar).toBeTruthy();
        });

        it('should display all currencies in expanded panel', async () => {
            await initializeStatusWidget();
            
            const widget = document.getElementById('status-widget');
            const toggle = widget.querySelector('.status-widget__toggle');
            toggle.click();
            
            const panel = widget.querySelector('.status-widget__panel');
            const currencies = panel.querySelectorAll('.status-widget__currency');
            
            expect(currencies.length).toBe(4); // Ink Drops, Paper Scraps, Blueprints, SMP
            
            const currencyText = panel.textContent;
            expect(currencyText).toContain('25'); // Ink Drops
            expect(currencyText).toContain('10'); // Paper Scraps
            expect(currencyText).toContain('5'); // Blueprints
            expect(currencyText).toContain('3'); // SMP
        });

        it('should include link to character sheet', async () => {
            // Set up meta tag for baseurl
            const meta = document.createElement('meta');
            meta.name = 'baseurl';
            meta.content = '/tome-of-secrets';
            document.head.appendChild(meta);
            
            await initializeStatusWidget();
            
            const widget = document.getElementById('status-widget');
            const toggle = widget.querySelector('.status-widget__toggle');
            toggle.click();
            
            const panel = widget.querySelector('.status-widget__panel');
            const link = panel.querySelector('.status-widget__link');
            
            expect(link).toBeTruthy();
            expect(link.getAttribute('href')).toBe('/tome-of-secrets/character-sheet.html');
        });
    });

    describe('state persistence', () => {
        it('should save expanded state to localStorage', async () => {
            await initializeStatusWidget();
            
            const widget = document.getElementById('status-widget');
            const toggle = widget.querySelector('.status-widget__toggle');
            
            toggle.click();
            
            const state = safeGetJSON('statusWidgetState', {});
            expect(state.expanded).toBe(true);
        });

        it('should restore expanded state from localStorage', async () => {
            // Set state to expanded
            safeSetJSON('statusWidgetState', { expanded: true });
            
            await initializeStatusWidget();
            
            const widget = document.getElementById('status-widget');
            const panel = widget.querySelector('.status-widget__panel');
            
            expect(widget.classList.contains('status-widget--expanded')).toBe(true);
            expect(panel.style.display).toBe('block');
        });
    });

    describe('state updates', () => {
        it('should update when tos:localStateChanged event fires', async () => {
            await initializeStatusWidget();
            
            const widget = document.getElementById('status-widget');
            const toggle = widget.querySelector('.status-widget__toggle');
            
            // Change form data
            safeSetJSON(STORAGE_KEYS.CHARACTER_SHEET_FORM, {
                keeperName: 'Updated Keeper',
                level: '6',
                'xp-current': '200',
                inkDrops: '50',
                paperScraps: '20',
                smp: '5'
            });
            
            // Fire event
            window.dispatchEvent(new CustomEvent('tos:localStateChanged'));
            
            // Widget should update (check collapsed state)
            expect(toggle.textContent).toContain('Lv 6');
            expect(toggle.textContent).toContain('50');
        });
    });
});

