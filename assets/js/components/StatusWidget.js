/**
 * StatusWidget - Floating status widget visible on all pages
 * 
 * Displays character info (name, level, XP, currencies) in a collapsible
 * floating widget positioned at the bottom-right corner.
 */

import { safeGetJSON, safeSetJSON } from '../utils/storage.js';
import { STORAGE_KEYS } from '../character-sheet/storageKeys.js';
import { loadState, characterState, isStateLoaded } from '../character-sheet/state.js';
import { parseIntOr } from '../utils/helpers.js';
import * as data from '../character-sheet/data.js';

// Storage key for widget state (collapsed/expanded)
const WIDGET_STATE_KEY = 'statusWidgetState';

// Default XP needed for level 1
const DEFAULT_XP_NEEDED = 100;

/**
 * Calculate XP needed for a given level
 * @param {number} level - Current level
 * @returns {number} XP needed for next level
 */
function calculateXPNeeded(level) {
    if (!data.xpLevels) {
        return DEFAULT_XP_NEEDED;
    }
    
    const levelStr = String(level);
    const xpNeeded = data.xpLevels[levelStr];
    
    // Handle "Max" for level 20 or undefined
    if (xpNeeded === 'Max' || xpNeeded === undefined) {
        // For max level or unknown, use the previous level's XP needed or default
        if (level > 1) {
            const prevLevelStr = String(level - 1);
            const prevXP = data.xpLevels[prevLevelStr];
            return (typeof prevXP === 'number') ? prevXP : DEFAULT_XP_NEEDED;
        }
        return DEFAULT_XP_NEEDED;
    }
    
    // xpLevels[level] stores the XP needed from this level to reach the next level
    return typeof xpNeeded === 'number' ? xpNeeded : DEFAULT_XP_NEEDED;
}

/**
 * Get character data from storage
 * @returns {Object} Character data (name, level, XP, currencies)
 */
function getCharacterData() {
    const formData = safeGetJSON(STORAGE_KEYS.CHARACTER_SHEET_FORM, {});
    
    return {
        name: formData.keeperName || '',
        level: parseIntOr(formData.level, 1),
        xpCurrent: parseIntOr(formData['xp-current'], 0),
        inkDrops: parseIntOr(formData.inkDrops, 0),
        paperScraps: parseIntOr(formData.paperScraps, 0),
        dustyBlueprints: characterState[STORAGE_KEYS.DUSTY_BLUEPRINTS] || 0,
        smp: parseIntOr(formData.smp, 0)
    };
}

/**
 * Create status widget HTML element
 * @returns {HTMLElement} Widget container element
 */
function createWidgetElement() {
    const widget = document.createElement('div');
    widget.id = 'status-widget';
    widget.className = 'status-widget';
    
    // Collapsed button (always visible)
    const collapsedButton = document.createElement('button');
    collapsedButton.className = 'status-widget__toggle';
    collapsedButton.setAttribute('aria-label', 'Toggle character status');
    collapsedButton.setAttribute('aria-expanded', 'false');
    
    // Expanded panel (hidden by default)
    const expandedPanel = document.createElement('div');
    expandedPanel.className = 'status-widget__panel';
    expandedPanel.setAttribute('role', 'region');
    expandedPanel.setAttribute('aria-label', 'Character status');
    
    widget.appendChild(collapsedButton);
    widget.appendChild(expandedPanel);
    
    return widget;
}

/**
 * Render collapsed state (level badge + currency icons)
 * @param {HTMLElement} button - The toggle button element
 * @param {Object} charData - Character data
 */
function renderCollapsedState(button, charData) {
    button.innerHTML = `
        <span class="status-widget__level-badge">Lv ${charData.level}</span>
        <span class="status-widget__currency-icons">
            <span class="status-widget__icon" title="Ink Drops">💧 ${charData.inkDrops}</span>
            <span class="status-widget__icon" title="Paper Scraps">📄 ${charData.paperScraps}</span>
            <span class="status-widget__icon" title="Dusty Blueprints">📜 ${charData.dustyBlueprints}</span>
            <span class="status-widget__icon" title="SMP">🎓 ${charData.smp}</span>
        </span>
    `;
}

/**
 * Render expanded state (full character info)
 * @param {HTMLElement} panel - The expanded panel element
 * @param {Object} charData - Character data
 */
function renderExpandedState(panel, charData) {
    const xpNeeded = calculateXPNeeded(charData.level);
    const xpProgress = Math.min((charData.xpCurrent / xpNeeded) * 100, 100);
    
    // Get baseurl from meta tag or use relative path
    const baseurlMeta = document.querySelector('meta[name="baseurl"]');
    const baseurl = baseurlMeta ? baseurlMeta.getAttribute('content') : '';
    const characterSheetUrl = baseurl ? `${baseurl}/character-sheet.html` : '/character-sheet.html';
    
    panel.innerHTML = `
        <div class="status-widget__header">
            <h3 class="status-widget__title">${charData.name || 'Character'}</h3>
            <button class="status-widget__close" aria-label="Close status panel" type="button">×</button>
        </div>
        <div class="status-widget__content">
            <div class="status-widget__level-section">
                <div class="status-widget__level-info">
                    <span class="status-widget__level-label">Level</span>
                    <span class="status-widget__level-value">${charData.level}</span>
                </div>
                <div class="status-widget__xp-section">
                    <div class="status-widget__xp-label">Experience Points</div>
                    <div class="status-widget__xp-bar-container">
                        <div class="status-widget__xp-bar" style="width: ${xpProgress}%"></div>
                    </div>
                    <div class="status-widget__xp-text">${charData.xpCurrent} / ${xpNeeded}</div>
                </div>
            </div>
            <div class="status-widget__currencies">
                <div class="status-widget__currency">
                    <span class="status-widget__currency-icon">💧</span>
                    <span class="status-widget__currency-label">Ink Drops</span>
                    <span class="status-widget__currency-value">${charData.inkDrops}</span>
                </div>
                <div class="status-widget__currency">
                    <span class="status-widget__currency-icon">📄</span>
                    <span class="status-widget__currency-label">Paper Scraps</span>
                    <span class="status-widget__currency-value">${charData.paperScraps}</span>
                </div>
                <div class="status-widget__currency">
                    <span class="status-widget__currency-icon">📜</span>
                    <span class="status-widget__currency-label">Dusty Blueprints</span>
                    <span class="status-widget__currency-value">${charData.dustyBlueprints}</span>
                </div>
                <div class="status-widget__currency">
                    <span class="status-widget__currency-icon">🎓</span>
                    <span class="status-widget__currency-label">SMP</span>
                    <span class="status-widget__currency-value">${charData.smp}</span>
                </div>
            </div>
            <div class="status-widget__actions">
                <a href="${characterSheetUrl}" class="status-widget__link">Open Character Sheet</a>
            </div>
        </div>
    `;
}

/**
 * Update widget display based on current state
 * @param {HTMLElement} widget - Widget element
 * @param {boolean} isExpanded - Whether widget is expanded
 */
function updateWidgetDisplay(widget, isExpanded) {
    const toggle = widget.querySelector('.status-widget__toggle');
    const panel = widget.querySelector('.status-widget__panel');
    
    const charData = getCharacterData();
    
    // Always update collapsed button
    renderCollapsedState(toggle, charData);
    
    // Update expanded panel if it exists
    if (panel) {
        renderExpandedState(panel, charData);
    }
    
    // Toggle classes
    if (isExpanded) {
        widget.classList.add('status-widget--expanded');
        toggle.setAttribute('aria-expanded', 'true');
        panel.style.display = 'block';
    } else {
        widget.classList.remove('status-widget--expanded');
        toggle.setAttribute('aria-expanded', 'false');
        panel.style.display = 'none';
    }
}

/**
 * Get widget state from localStorage
 * @returns {boolean} Whether widget is expanded
 */
function getWidgetState() {
    const state = safeGetJSON(WIDGET_STATE_KEY, { expanded: false });
    return Boolean(state.expanded);
}

/**
 * Save widget state to localStorage
 * @param {boolean} expanded - Whether widget is expanded
 */
function saveWidgetState(expanded) {
    safeSetJSON(WIDGET_STATE_KEY, { expanded });
}

/**
 * Initialize the status widget
 */
export async function initializeStatusWidget() {
    // Wait for state to load if it hasn't already
    if (!isStateLoaded) {
        await loadState();
    }
    
    // Check if widget already exists
    let widget = document.getElementById('status-widget');
    if (!widget) {
        widget = createWidgetElement();
        document.body.appendChild(widget);
    }
    
    // Get initial state
    const isExpanded = getWidgetState();
    
    // Initial render
    updateWidgetDisplay(widget, isExpanded);
    
    // Set up event listeners
    const toggle = widget.querySelector('.status-widget__toggle');
    const panel = widget.querySelector('.status-widget__panel');
    
    // Toggle button click
    toggle.addEventListener('click', () => {
        const currentExpanded = widget.classList.contains('status-widget--expanded');
        const newExpanded = !currentExpanded;
        saveWidgetState(newExpanded);
        updateWidgetDisplay(widget, newExpanded);
    });
    
    // Close button click (use event delegation since panel content is re-rendered)
    panel.addEventListener('click', (e) => {
        if (e.target.classList.contains('status-widget__close')) {
            e.preventDefault();
            e.stopPropagation();
            saveWidgetState(false);
            updateWidgetDisplay(widget, false);
        }
    });
    
    // Listen to state changes
    const handleStateChange = () => {
        updateWidgetDisplay(widget, widget.classList.contains('status-widget--expanded'));
    };
    
    window.addEventListener('tos:localStateChanged', handleStateChange);
    
    // Also listen to storage events for cross-tab updates
    window.addEventListener('storage', (e) => {
        if (e.key === STORAGE_KEYS.CHARACTER_SHEET_FORM || 
            e.key === STORAGE_KEYS.DUSTY_BLUEPRINTS) {
            handleStateChange();
        }
    });
    
    // Periodic update fallback (in case events are missed)
    setInterval(() => {
        updateWidgetDisplay(widget, widget.classList.contains('status-widget--expanded'));
    }, 5000); // Update every 5 seconds as fallback
}

