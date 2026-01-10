// Renders shopping options and handles redemption on shopping.md
import { shoppingOptions } from '../character-sheet/data.js';
import { safeGetJSON, safeSetJSON } from '../utils/storage.js';
import { STORAGE_KEYS } from '../character-sheet/storageKeys.js';
import { parseIntOr } from '../utils/helpers.js';

/**
 * Get current ink drops and paper scraps from the form
 * @returns {{inkDrops: number, paperScraps: number}}
 */
function getCurrentResources() {
    const inkDropsEl = document.getElementById('inkDrops');
    const paperScrapsEl = document.getElementById('paperScraps');
    
    // Try to get from form first (if on character sheet)
    let inkDrops = 0;
    let paperScraps = 0;
    
    if (inkDropsEl) {
        inkDrops = parseIntOr(inkDropsEl.value, 0);
    } else {
        // Fallback to localStorage if not on character sheet
        const formData = safeGetJSON(STORAGE_KEYS.CHARACTER_SHEET_FORM, {});
        inkDrops = parseIntOr(formData.inkDrops, 0);
    }
    
    if (paperScrapsEl) {
        paperScraps = parseIntOr(paperScrapsEl.value, 0);
    } else {
        const formData = safeGetJSON(STORAGE_KEYS.CHARACTER_SHEET_FORM, {});
        paperScraps = parseIntOr(formData.paperScraps, 0);
    }
    
    return { inkDrops, paperScraps };
}

/**
 * Update ink drops and paper scraps in the form and localStorage
 * @param {number} newInkDrops 
 * @param {number} newPaperScraps 
 */
function updateResources(newInkDrops, newPaperScraps) {
    const inkDropsEl = document.getElementById('inkDrops');
    const paperScrapsEl = document.getElementById('paperScraps');
    
    // Update form if elements exist
    if (inkDropsEl) {
        inkDropsEl.value = Math.max(0, newInkDrops);
    }
    if (paperScrapsEl) {
        paperScrapsEl.value = Math.max(0, newPaperScraps);
    }
    
    // Always update localStorage
    const formData = safeGetJSON(STORAGE_KEYS.CHARACTER_SHEET_FORM, {});
    formData.inkDrops = Math.max(0, newInkDrops);
    formData.paperScraps = Math.max(0, newPaperScraps);
    safeSetJSON(STORAGE_KEYS.CHARACTER_SHEET_FORM, formData);
    
    // Trigger change event if elements exist (for character sheet reactivity)
    if (inkDropsEl) {
        inkDropsEl.dispatchEvent(new Event('change', { bubbles: true }));
    }
    if (paperScrapsEl) {
        paperScrapsEl.dispatchEvent(new Event('change', { bubbles: true }));
    }
    
    // Update currency display on shopping page if it exists
    updateCurrencyDisplay();
}

/**
 * Update the shopping page currency display (if present)
 */
function updateCurrencyDisplay() {
    const currencyDisplay = document.getElementById('shopping-currency-display');
    if (!currencyDisplay) return;

    const { inkDrops, paperScraps } = getCurrentResources();
    // Note: this display is informational; editing happens on the Character Sheet.
    currencyDisplay.textContent =
        `Ink Drops: ${inkDrops} | Paper Scraps: ${paperScraps} (read-only — update in Character Sheet)`;
}

/**
 * Show an error message
 * @param {HTMLElement} errorContainer - The error message container element
 * @param {string} message 
 */
function showError(errorContainer, message) {
    if (errorContainer) {
        errorContainer.textContent = message;
        errorContainer.style.display = 'block';
        setTimeout(() => {
            errorContainer.style.display = 'none';
        }, 5000);
    }
}

/**
 * Create a shopping option card
 * @param {string} name 
 * @param {Object} option 
 * @returns {HTMLElement}
 */
function createShoppingOptionCard(name, option) {
    const card = document.createElement('div');
    card.className = 'shopping-option';
    
    const nameEl = document.createElement('h3');
    nameEl.textContent = name;
    card.appendChild(nameEl);
    
    const descEl = document.createElement('p');
    descEl.textContent = option.description;
    card.appendChild(descEl);
    
    const costEl = document.createElement('div');
    costEl.className = 'shopping-cost';
    const costs = [];
    if (option.inkDrops > 0) {
        costs.push(`${option.inkDrops} Ink Drops`);
    }
    if (option.paperScraps > 0) {
        costs.push(`${option.paperScraps} Paper Scraps`);
    }
    costEl.textContent = `Cost: ${costs.join(' + ')}`;
    card.appendChild(costEl);
    
    // Quantity input for items that allow it
    let quantityInput = null;
    if (option.allowQuantity) {
        const quantityContainer = document.createElement('div');
        quantityContainer.className = 'shopping-quantity';
        const quantityLabel = document.createElement('label');
        quantityLabel.textContent = 'Quantity: ';
        quantityLabel.setAttribute('for', `quantity-${name.replace(/\s+/g, '-')}`);
        quantityInput = document.createElement('input');
        quantityInput.type = 'number';
        quantityInput.id = `quantity-${name.replace(/\s+/g, '-')}`;
        quantityInput.min = '1';
        quantityInput.value = '1';
        quantityContainer.appendChild(quantityLabel);
        quantityContainer.appendChild(quantityInput);
        card.appendChild(quantityContainer);
    }
    
    // Error message container
    const errorContainer = document.createElement('div');
    errorContainer.className = 'error-message';
    errorContainer.style.display = 'none';
    errorContainer.style.color = '#d32f2f';
    errorContainer.style.marginTop = '0.5rem';
    card.appendChild(errorContainer);
    
    // Redeem button
    const buttonContainer = document.createElement('div');
    buttonContainer.className = 'shopping-button-container';
    const redeemButton = document.createElement('button');
    redeemButton.type = 'button';
    redeemButton.className = 'redeem-button';
    redeemButton.textContent = 'Redeem';
    
    redeemButton.addEventListener('click', () => {
        const quantity = option.allowQuantity && quantityInput 
            ? Math.max(1, parseIntOr(quantityInput.value, 1))
            : 1;
        
        const totalInkDrops = option.inkDrops * quantity;
        const totalPaperScraps = option.paperScraps * quantity;
        
        const current = getCurrentResources();
        
        if (current.inkDrops < totalInkDrops) {
            showError(errorContainer, `Insufficient Ink Drops. You have ${current.inkDrops}, but need ${totalInkDrops}.`);
            return;
        }
        
        if (current.paperScraps < totalPaperScraps) {
            showError(errorContainer, `Insufficient Paper Scraps. You have ${current.paperScraps}, but need ${totalPaperScraps}.`);
            return;
        }
        
        // Deduct resources
        const newInkDrops = current.inkDrops - totalInkDrops;
        const newPaperScraps = current.paperScraps - totalPaperScraps;
        updateResources(newInkDrops, newPaperScraps);
        
        // Show success message
        const successMsg = document.createElement('div');
        successMsg.className = 'success-message';
        successMsg.style.color = '#2e7d32';
        successMsg.style.marginTop = '0.5rem';
        successMsg.textContent = `✓ Redeemed successfully! ${quantity > 1 ? `(${quantity}x)` : ''}`;
        errorContainer.style.display = 'none';
        card.insertBefore(successMsg, errorContainer);
        setTimeout(() => {
            successMsg.remove();
        }, 3000);
    });
    
    buttonContainer.appendChild(redeemButton);
    card.appendChild(buttonContainer);
    
    return card;
}

/**
 * Initialize the shopping page
 */
export function initializeShoppingPage() {
    const container = document.getElementById('shopping-options-container');
    if (!container) return;
    
    if (!shoppingOptions || Object.keys(shoppingOptions).length === 0) {
        container.innerHTML = '<p>No shopping options available.</p>';
        return;
    }
    
    // Clear container
    container.innerHTML = '';
    
    // Create cards for each shopping option
    for (const [name, option] of Object.entries(shoppingOptions)) {
        const card = createShoppingOptionCard(name, option);
        container.appendChild(card);
    }

    // Render currency on load (shopping page)
    updateCurrencyDisplay();
}

