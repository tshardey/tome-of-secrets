/**
 * @jest-environment jsdom
 */

import { initializeSanctumPage } from '../assets/js/page-renderers/sanctumRenderer.js';
import { initializeKeeperPage } from '../assets/js/page-renderers/keeperRenderer.js';
import { initializeShoppingPage } from '../assets/js/page-renderers/shoppingRenderer.js';
import { STORAGE_KEYS } from '../assets/js/character-sheet/storageKeys.js';
import { safeGetJSON, safeSetJSON } from '../assets/js/utils/storage.js';

describe('Page Renderers Hydration', () => {
  test('sanctum.md renders sanctums from JSON', () => {
    loadHTML('sanctum.md');
    initializeSanctumPage();
    const container = document.getElementById('sanctum-list');
    expect(container).toBeTruthy();
    // Expect three sections rendered
    const headings = Array.from(container.querySelectorAll('h3')).map(h => h.textContent.trim());
    expect(headings).toContain('The Spire of Whispers');
    expect(headings).toContain('The Verdant Athenaeum');
    expect(headings).toContain('The Sunken Archives');
  });

  test('keeper.md renders backgrounds and schools from JSON', () => {
    loadHTML('keeper.md');
    initializeKeeperPage();
    const backgrounds = document.getElementById('keeper-backgrounds');
    const schools = document.getElementById('wizard-schools');
    expect(backgrounds).toBeTruthy();
    expect(schools).toBeTruthy();
    // Spot-check one background and one school heading presence
    const bgHeadings = Array.from(backgrounds.querySelectorAll('h3')).map(h => h.textContent.trim());
    expect(bgHeadings.some(t => t.includes("The Scribe's Acolyte"))).toBe(true);
    const schoolHeadings = Array.from(schools.querySelectorAll('h3')).map(h => h.textContent.trim());
    expect(schoolHeadings).toContain('School of Abjuration');
  });

  describe('Shopping Page Renderer', () => {
    beforeEach(() => {
      localStorage.clear();
      document.body.innerHTML = `
        <div id="shopping-currency-display"></div>
        <div id="shopping-options-container"></div>
        <input type="number" id="inkDrops" value="0" />
        <input type="number" id="paperScraps" value="0" />
      `;
      window.__BASEURL = '';
    });

    test('displays currency information on page load', () => {
      // Set up form elements with currency values (form takes priority)
      const inkDropsEl = document.getElementById('inkDrops');
      const paperScrapsEl = document.getElementById('paperScraps');
      inkDropsEl.value = '150';
      paperScrapsEl.value = '50';
      
      // Also set localStorage
      safeSetJSON(STORAGE_KEYS.CHARACTER_SHEET_FORM, {
        inkDrops: '150',
        paperScraps: '50'
      });

      initializeShoppingPage();
      
      const currencyDisplay = document.getElementById('shopping-currency-display');
      expect(currencyDisplay).toBeTruthy();
      
      // Check that currency values are displayed
      expect(currencyDisplay.textContent).toContain('Ink Drops');
      expect(currencyDisplay.textContent).toContain('Paper Scraps');
      expect(currencyDisplay.textContent).toContain('150');
      expect(currencyDisplay.textContent).toContain('50');
      expect(currencyDisplay.textContent).toContain('read-only');
      expect(currencyDisplay.textContent).toContain('Character Sheet');
    });

    test('currency display updates when form values exist', () => {
      const inkDropsEl = document.getElementById('inkDrops');
      const paperScrapsEl = document.getElementById('paperScraps');
      inkDropsEl.value = '200';
      paperScrapsEl.value = '75';
      
      // Also set localStorage to match
      safeSetJSON(STORAGE_KEYS.CHARACTER_SHEET_FORM, {
        inkDrops: '200',
        paperScraps: '75'
      });

      initializeShoppingPage();
      
      const currencyDisplay = document.getElementById('shopping-currency-display');
      expect(currencyDisplay.textContent).toContain('200');
      expect(currencyDisplay.textContent).toContain('75');
    });

    test('currency display updates after redemption', () => {
      const inkDropsEl = document.getElementById('inkDrops');
      const paperScrapsEl = document.getElementById('paperScraps');
      inkDropsEl.value = '200';
      paperScrapsEl.value = '50';
      
      safeSetJSON(STORAGE_KEYS.CHARACTER_SHEET_FORM, {
        inkDrops: '200',
        paperScraps: '50'
      });

      initializeShoppingPage();
      const container = document.getElementById('shopping-options-container');
      const options = Array.from(container.querySelectorAll('.shopping-option'));
      
      const bookishItemOption = options.find(opt => 
        opt.querySelector('h3')?.textContent === 'Bookish Item'
      );
      
      const redeemButton = bookishItemOption.querySelector('.redeem-button');
      redeemButton.click();
      
      // Check currency display was updated
      const currencyDisplay = document.getElementById('shopping-currency-display');
      expect(currencyDisplay.textContent).toContain('175'); // 200 - 25
      expect(currencyDisplay.textContent).toContain('50'); // Unchanged
    });

    test('renders all shopping options from JSON', () => {
      initializeShoppingPage();
      const container = document.getElementById('shopping-options-container');
      expect(container).toBeTruthy();
      
      const options = container.querySelectorAll('.shopping-option');
      expect(options.length).toBeGreaterThan(0);
      
      // Check for specific options
      const optionTexts = Array.from(options).map(opt => opt.querySelector('h3')?.textContent).filter(Boolean);
      expect(optionTexts).toContain('Local Indie Bookstore');
      expect(optionTexts).toContain('Large Chain Bookstore');
      expect(optionTexts).toContain('Bookish Item');
      expect(optionTexts).toContain('One Month of a Book Box Subscription');
      expect(optionTexts).toContain('Deluxe or Special Edition');
    });

    test('displays cost information for each option', () => {
      initializeShoppingPage();
      const container = document.getElementById('shopping-options-container');
      const firstOption = container.querySelector('.shopping-option');
      
      expect(firstOption).toBeTruthy();
      const costEl = firstOption.querySelector('.shopping-cost');
      expect(costEl).toBeTruthy();
      expect(costEl.textContent).toContain('Cost:');
    });

    test('shows quantity input for book box subscription', () => {
      initializeShoppingPage();
      const container = document.getElementById('shopping-options-container');
      const options = Array.from(container.querySelectorAll('.shopping-option'));
      
      const bookBoxOption = options.find(opt => 
        opt.querySelector('h3')?.textContent === 'One Month of a Book Box Subscription'
      );
      
      expect(bookBoxOption).toBeTruthy();
      const quantityInput = bookBoxOption.querySelector('input[type="number"]');
      expect(quantityInput).toBeTruthy();
      expect(quantityInput.value).toBe('1');
      expect(parseInt(quantityInput.min)).toBe(1);
    });

    test('does not show quantity input for options that do not allow it', () => {
      initializeShoppingPage();
      const container = document.getElementById('shopping-options-container');
      const options = Array.from(container.querySelectorAll('.shopping-option'));
      
      const bookishItemOption = options.find(opt => 
        opt.querySelector('h3')?.textContent === 'Bookish Item'
      );
      
      expect(bookishItemOption).toBeTruthy();
      const quantityInput = bookishItemOption.querySelector('input[type="number"]');
      expect(quantityInput).toBeNull();
    });

    test('successfully redeems option with sufficient resources', () => {
      // Set up resources
      const inkDropsEl = document.getElementById('inkDrops');
      const paperScrapsEl = document.getElementById('paperScraps');
      inkDropsEl.value = '200';
      paperScrapsEl.value = '50';
      
      // Set up localStorage
      safeSetJSON(STORAGE_KEYS.CHARACTER_SHEET_FORM, {
        inkDrops: '200',
        paperScraps: '50'
      });

      initializeShoppingPage();
      const container = document.getElementById('shopping-options-container');
      const options = Array.from(container.querySelectorAll('.shopping-option'));
      
      // Find Bookish Item (25 ink drops, 0 paper scraps)
      const bookishItemOption = options.find(opt => 
        opt.querySelector('h3')?.textContent === 'Bookish Item'
      );
      
      const redeemButton = bookishItemOption.querySelector('.redeem-button');
      expect(redeemButton).toBeTruthy();
      
      // Click redeem
      redeemButton.click();
      
      // Check resources were deducted
      expect(parseInt(inkDropsEl.value)).toBe(175); // 200 - 25
      expect(parseInt(paperScrapsEl.value)).toBe(50); // Unchanged
      
      // Check localStorage was updated
      const formData = safeGetJSON(STORAGE_KEYS.CHARACTER_SHEET_FORM, {});
      expect(parseInt(formData.inkDrops)).toBe(175);
      expect(parseInt(formData.paperScraps)).toBe(50);
      
      // Check success message appeared
      const successMsg = bookishItemOption.querySelector('.success-message');
      expect(successMsg).toBeTruthy();
      expect(successMsg.textContent).toContain('Redeemed successfully');
    });

    test('shows error when insufficient ink drops', () => {
      // Set up insufficient resources
      const inkDropsEl = document.getElementById('inkDrops');
      const paperScrapsEl = document.getElementById('paperScraps');
      inkDropsEl.value = '10'; // Not enough for Bookish Item (25)
      paperScrapsEl.value = '0';
      
      safeSetJSON(STORAGE_KEYS.CHARACTER_SHEET_FORM, {
        inkDrops: '10',
        paperScraps: '0'
      });

      initializeShoppingPage();
      const container = document.getElementById('shopping-options-container');
      const options = Array.from(container.querySelectorAll('.shopping-option'));
      
      const bookishItemOption = options.find(opt => 
        opt.querySelector('h3')?.textContent === 'Bookish Item'
      );
      
      const redeemButton = bookishItemOption.querySelector('.redeem-button');
      const errorContainer = bookishItemOption.querySelector('.error-message');
      
      // Initially hidden
      expect(errorContainer.style.display).toBe('none');
      
      // Click redeem
      redeemButton.click();
      
      // Error should be shown
      expect(errorContainer.style.display).toBe('block');
      expect(errorContainer.textContent).toContain('Insufficient Ink Drops');
      expect(errorContainer.textContent).toContain('10');
      expect(errorContainer.textContent).toContain('25');
      
      // Resources should not be deducted
      expect(parseInt(inkDropsEl.value)).toBe(10);
    });

    test('shows error when insufficient paper scraps', () => {
      // Set up insufficient resources
      const inkDropsEl = document.getElementById('inkDrops');
      const paperScrapsEl = document.getElementById('paperScraps');
      inkDropsEl.value = '150';
      paperScrapsEl.value = '20'; // Not enough for Local Indie Bookstore (25)
      
      safeSetJSON(STORAGE_KEYS.CHARACTER_SHEET_FORM, {
        inkDrops: '150',
        paperScraps: '20'
      });

      initializeShoppingPage();
      const container = document.getElementById('shopping-options-container');
      const options = Array.from(container.querySelectorAll('.shopping-option'));
      
      const indieBookstoreOption = options.find(opt => 
        opt.querySelector('h3')?.textContent === 'Local Indie Bookstore'
      );
      
      const redeemButton = indieBookstoreOption.querySelector('.redeem-button');
      const errorContainer = indieBookstoreOption.querySelector('.error-message');
      
      // Click redeem
      redeemButton.click();
      
      // Error should be shown
      expect(errorContainer.style.display).toBe('block');
      expect(errorContainer.textContent).toContain('Insufficient Paper Scraps');
      expect(errorContainer.textContent).toContain('20');
      expect(errorContainer.textContent).toContain('25');
      
      // Resources should not be deducted
      expect(parseInt(inkDropsEl.value)).toBe(150);
      expect(parseInt(paperScrapsEl.value)).toBe(20);
    });

    test('handles quantity multiplier for book box subscription', () => {
      // Set up resources for 3 months
      const inkDropsEl = document.getElementById('inkDrops');
      const paperScrapsEl = document.getElementById('paperScraps');
      inkDropsEl.value = '100'; // 25 * 3 = 75 needed
      paperScrapsEl.value = '100'; // 25 * 3 = 75 needed
      
      safeSetJSON(STORAGE_KEYS.CHARACTER_SHEET_FORM, {
        inkDrops: '100',
        paperScraps: '100'
      });

      initializeShoppingPage();
      const container = document.getElementById('shopping-options-container');
      const options = Array.from(container.querySelectorAll('.shopping-option'));
      
      const bookBoxOption = options.find(opt => 
        opt.querySelector('h3')?.textContent === 'One Month of a Book Box Subscription'
      );
      
      const quantityInput = bookBoxOption.querySelector('input[type="number"]');
      const redeemButton = bookBoxOption.querySelector('.redeem-button');
      
      // Set quantity to 3
      quantityInput.value = '3';
      
      // Click redeem
      redeemButton.click();
      
      // Check resources were deducted (25 * 3 = 75 for each)
      expect(parseInt(inkDropsEl.value)).toBe(25); // 100 - 75
      expect(parseInt(paperScrapsEl.value)).toBe(25); // 100 - 75
      
      // Check success message shows quantity
      const successMsg = bookBoxOption.querySelector('.success-message');
      expect(successMsg).toBeTruthy();
      expect(successMsg.textContent).toContain('(3x)');
    });

    test('shows error when insufficient resources for quantity > 1', () => {
      // Set up resources for only 1 month
      const inkDropsEl = document.getElementById('inkDrops');
      const paperScrapsEl = document.getElementById('paperScraps');
      inkDropsEl.value = '30'; // Enough for 1 (25), not for 2 (50)
      paperScrapsEl.value = '30';
      
      safeSetJSON(STORAGE_KEYS.CHARACTER_SHEET_FORM, {
        inkDrops: '30',
        paperScraps: '30'
      });

      initializeShoppingPage();
      const container = document.getElementById('shopping-options-container');
      const options = Array.from(container.querySelectorAll('.shopping-option'));
      
      const bookBoxOption = options.find(opt => 
        opt.querySelector('h3')?.textContent === 'One Month of a Book Box Subscription'
      );
      
      const quantityInput = bookBoxOption.querySelector('input[type="number"]');
      const redeemButton = bookBoxOption.querySelector('.redeem-button');
      const errorContainer = bookBoxOption.querySelector('.error-message');
      
      // Set quantity to 2
      quantityInput.value = '2';
      
      // Click redeem
      redeemButton.click();
      
      // Error should be shown (need 50, have 30)
      expect(errorContainer.style.display).toBe('block');
      expect(errorContainer.textContent).toContain('Insufficient');
      
      // Resources should not be deducted
      expect(parseInt(inkDropsEl.value)).toBe(30);
      expect(parseInt(paperScrapsEl.value)).toBe(30);
    });

    test('works when form elements do not exist (fallback to localStorage)', () => {
      // Remove form elements
      document.getElementById('inkDrops')?.remove();
      document.getElementById('paperScraps')?.remove();
      
      // Set up localStorage only
      safeSetJSON(STORAGE_KEYS.CHARACTER_SHEET_FORM, {
        inkDrops: '200',
        paperScraps: '50'
      });

      initializeShoppingPage();
      const container = document.getElementById('shopping-options-container');
      const options = Array.from(container.querySelectorAll('.shopping-option'));
      
      const bookishItemOption = options.find(opt => 
        opt.querySelector('h3')?.textContent === 'Bookish Item'
      );
      
      const redeemButton = bookishItemOption.querySelector('.redeem-button');
      
      // Click redeem
      redeemButton.click();
      
      // Check localStorage was updated
      const formData = safeGetJSON(STORAGE_KEYS.CHARACTER_SHEET_FORM, {});
      expect(parseInt(formData.inkDrops)).toBe(175); // 200 - 25
      expect(parseInt(formData.paperScraps)).toBe(50);
    });

    test('handles minimum quantity of 1 for quantity input', () => {
      // Set up resources in both form and localStorage
      const inkDropsEl = document.getElementById('inkDrops');
      const paperScrapsEl = document.getElementById('paperScraps');
      inkDropsEl.value = '100';
      paperScrapsEl.value = '100';
      
      safeSetJSON(STORAGE_KEYS.CHARACTER_SHEET_FORM, {
        inkDrops: '100',
        paperScraps: '100'
      });
      
      initializeShoppingPage();
      const container = document.getElementById('shopping-options-container');
      const options = Array.from(container.querySelectorAll('.shopping-option'));
      
      const bookBoxOption = options.find(opt => 
        opt.querySelector('h3')?.textContent === 'One Month of a Book Box Subscription'
      );
      
      const quantityInput = bookBoxOption.querySelector('input[type="number"]');
      const redeemButton = bookBoxOption.querySelector('.redeem-button');
      
      // Set invalid quantity (0 or negative)
      quantityInput.value = '0';
      
      // Click redeem - should use minimum of 1 due to Math.max(1, ...)
      redeemButton.click();
      
      // Should deduct for quantity 1 (25 each) because Math.max(1, 0) = 1
      expect(parseInt(inkDropsEl.value)).toBe(75); // 100 - 25
      expect(parseInt(paperScrapsEl.value)).toBe(75); // 100 - 25
      
      const formData = safeGetJSON(STORAGE_KEYS.CHARACTER_SHEET_FORM, {});
      expect(parseInt(formData.inkDrops)).toBe(75); // 100 - 25
      expect(parseInt(formData.paperScraps)).toBe(75); // 100 - 25
    });
  });
});


