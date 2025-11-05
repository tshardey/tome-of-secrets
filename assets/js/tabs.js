/**
 * Tab Navigation System
 * Handles switching between tabs and remembers the last active tab
 */

export function initializeTabs() {
    const tabButtons = document.querySelectorAll('[data-tab-target]');
    const tabPanels = document.querySelectorAll('[data-tab-panel]');
    
    if (tabButtons.length === 0 || tabPanels.length === 0) {
        // No tabs on this page
        return;
    }
    
    // Load the last active tab from localStorage, or default to first tab
    const lastActiveTab = localStorage.getItem('activeCharacterTab') || tabPanels[0]?.dataset.tabPanel;
    
    // Set up click handlers for all tab buttons
    tabButtons.forEach(button => {
        button.addEventListener('click', () => {
            const targetTabId = button.dataset.tabTarget;
            switchToTab(targetTabId);
        });
    });
    
    // Activate the initial tab
    if (lastActiveTab) {
        switchToTab(lastActiveTab);
    }
}

/**
 * Switch to a specific tab by ID
 * @param {string} tabId - The ID of the tab to switch to
 */
export function switchToTab(tabId) {
    const tabButtons = document.querySelectorAll('[data-tab-target]');
    const tabPanels = document.querySelectorAll('[data-tab-panel]');
    
    // Remove active class from all buttons and panels
    tabButtons.forEach(btn => btn.classList.remove('active'));
    tabPanels.forEach(panel => panel.classList.remove('active'));
    
    // Add active class to the target button and panel
    const targetButton = document.querySelector(`[data-tab-target="${tabId}"]`);
    const targetPanel = document.querySelector(`[data-tab-panel="${tabId}"]`);
    
    if (targetButton && targetPanel) {
        targetButton.classList.add('active');
        targetPanel.classList.add('active');
        
        // Save the active tab to localStorage
        localStorage.setItem('activeCharacterTab', tabId);
        
        // Scroll to top of the panel
        targetPanel.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
}

/**
 * Get the currently active tab ID
 * @returns {string|null} - The ID of the active tab, or null if none
 */
export function getActiveTab() {
    const activePanel = document.querySelector('[data-tab-panel].active');
    return activePanel ? activePanel.dataset.tabPanel : null;
}

