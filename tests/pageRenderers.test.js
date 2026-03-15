/**
 * @jest-environment jsdom
 */

import { initializeSanctumPage } from '../assets/js/page-renderers/sanctumRenderer.js';
import { initializeKeeperPage } from '../assets/js/page-renderers/keeperRenderer.js';
import { initializeShoppingPage } from '../assets/js/page-renderers/shoppingRenderer.js';
import { initializeRewardsPage } from '../assets/js/page-renderers/rewardsRenderer.js';
import { STORAGE_KEYS } from '../assets/js/character-sheet/storageKeys.js';
import { resetStateLoadedForTests } from '../assets/js/character-sheet/state.js';
import { safeGetJSON, safeSetJSON } from '../assets/js/utils/storage.js';

jest.mock('../assets/js/services/BookMetadataService.js', () => ({
  searchBooks: jest.fn(() => Promise.resolve([]))
}));

const flushPromises = () => new Promise(resolve => setTimeout(resolve, 0));

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

    test('displays currency information on page load', async () => {
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

      await initializeShoppingPage();
      
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

    test('currency display updates when form values exist', async () => {
      const inkDropsEl = document.getElementById('inkDrops');
      const paperScrapsEl = document.getElementById('paperScraps');
      inkDropsEl.value = '200';
      paperScrapsEl.value = '75';
      
      // Also set localStorage to match
      safeSetJSON(STORAGE_KEYS.CHARACTER_SHEET_FORM, {
        inkDrops: '200',
        paperScraps: '75'
      });

      await initializeShoppingPage();
      
      const currencyDisplay = document.getElementById('shopping-currency-display');
      expect(currencyDisplay.textContent).toContain('200');
      expect(currencyDisplay.textContent).toContain('75');
    });

    test('currency display updates after redemption and logs purchase', async () => {
      const inkDropsEl = document.getElementById('inkDrops');
      const paperScrapsEl = document.getElementById('paperScraps');
      inkDropsEl.value = '200';
      paperScrapsEl.value = '50';
      
      safeSetJSON(STORAGE_KEYS.CHARACTER_SHEET_FORM, {
        inkDrops: '200',
        paperScraps: '50'
      });

      await initializeShoppingPage();
      const container = document.getElementById('shopping-options-container');
      const options = Array.from(container.querySelectorAll('.shopping-option'));
      
      const bookishItemOption = options.find(opt => 
        opt.querySelector('h3')?.textContent === 'Bookish Item'
      );
      
      const redeemButton = bookishItemOption.querySelector('.redeem-button');
      redeemButton.click();
      await flushPromises();
      
      // Check currency display was updated
      const currencyDisplay = document.getElementById('shopping-currency-display');
      expect(currencyDisplay.textContent).toContain('175'); // 200 - 25
      expect(currencyDisplay.textContent).toContain('50'); // Unchanged

      // Check shopping log entry was persisted
      const log = safeGetJSON(STORAGE_KEYS.SHOPPING_LOG, []);
      expect(Array.isArray(log)).toBe(true);
      expect(log.length).toBe(1);
      const entry = log[0];
      expect(typeof entry.optionId).toBe('string');
      expect(entry.inkDrops).toBe(25);
      expect(entry.paperScraps).toBe(0);
      expect(typeof entry.logDate).toBe('string');
    });

    test('renders all shopping options from JSON', async () => {
      await initializeShoppingPage();
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

    test('displays cost information for each option', async () => {
      await initializeShoppingPage();
      const container = document.getElementById('shopping-options-container');
      const firstOption = container.querySelector('.shopping-option');
      
      expect(firstOption).toBeTruthy();
      const costEl = firstOption.querySelector('.shopping-cost');
      expect(costEl).toBeTruthy();
      expect(costEl.textContent).toContain('Cost:');
    });

    test('shows subscription-month UI for book box option (subscription select and log button)', async () => {
      resetStateLoadedForTests();
      const originalIdb = global.indexedDB;
      global.indexedDB = undefined;
      try {
        safeSetJSON(STORAGE_KEYS.BOOK_BOX_SUBSCRIPTIONS, {
          sub1: { id: 'sub1', company: 'Test Co', tier: 'Adult', defaultMonthlyCost: 30, skipsAllowedPerYear: 2 }
        });
        await initializeShoppingPage();
      const container = document.getElementById('shopping-options-container');
      const options = Array.from(container.querySelectorAll('.shopping-option'));
      
      const bookBoxOption = options.find(opt => 
        opt.querySelector('h3')?.textContent === 'One Month of a Book Box Subscription'
      );
      
      expect(bookBoxOption).toBeTruthy();
      expect(bookBoxOption.classList.contains('shopping-option-subscription-month')).toBe(true);
      const subSelect = bookBoxOption.querySelector('.shopping-subscription-select');
      expect(subSelect).toBeTruthy();
      expect(subSelect.options.length).toBeGreaterThan(0);
      const logButton = bookBoxOption.querySelector('.shopping-sub-log-btn');
      expect(logButton).toBeTruthy();
      } finally {
        global.indexedDB = originalIdb;
      }
    });

    test('does not show quantity input for options that do not allow it', async () => {
      await initializeShoppingPage();
      const container = document.getElementById('shopping-options-container');
      const options = Array.from(container.querySelectorAll('.shopping-option'));
      
      const bookishItemOption = options.find(opt => 
        opt.querySelector('h3')?.textContent === 'Bookish Item'
      );
      
      expect(bookishItemOption).toBeTruthy();
      const quantityInput = bookishItemOption.querySelector('.shopping-quantity-input');
      expect(quantityInput).toBeNull();
    });

    test('successfully redeems option with sufficient resources', async () => {
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

      await initializeShoppingPage();
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
      await flushPromises();
      
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

    test('shows error when insufficient ink drops', async () => {
      // Set up insufficient resources
      const inkDropsEl = document.getElementById('inkDrops');
      const paperScrapsEl = document.getElementById('paperScraps');
      inkDropsEl.value = '10'; // Not enough for Bookish Item (25)
      paperScrapsEl.value = '0';
      
      safeSetJSON(STORAGE_KEYS.CHARACTER_SHEET_FORM, {
        inkDrops: '10',
        paperScraps: '0'
      });

      await initializeShoppingPage();
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

    test('shows error when insufficient paper scraps', async () => {
      // Set up insufficient resources
      const inkDropsEl = document.getElementById('inkDrops');
      const paperScrapsEl = document.getElementById('paperScraps');
      inkDropsEl.value = '150';
      paperScrapsEl.value = '20'; // Not enough for Local Indie Bookstore (25)
      
      safeSetJSON(STORAGE_KEYS.CHARACTER_SHEET_FORM, {
        inkDrops: '150',
        paperScraps: '20'
      });

      await initializeShoppingPage();
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

    test('logging subscription purchase deducts ink and paper', async () => {
      resetStateLoadedForTests();
      const originalIdb = global.indexedDB;
      global.indexedDB = undefined;
      try {
        safeSetJSON(STORAGE_KEYS.BOOK_BOX_SUBSCRIPTIONS, {
          sub1: { id: 'sub1', company: 'Test Co', tier: 'Adult', defaultMonthlyCost: 30, skipsAllowedPerYear: 2 }
        });
      const inkDropsEl = document.getElementById('inkDrops');
      const paperScrapsEl = document.getElementById('paperScraps');
      inkDropsEl.value = '100';
      paperScrapsEl.value = '100';
      safeSetJSON(STORAGE_KEYS.CHARACTER_SHEET_FORM, { inkDrops: '100', paperScraps: '100' });

      await initializeShoppingPage();
      const container = document.getElementById('shopping-options-container');
      const options = Array.from(container.querySelectorAll('.shopping-option'));
      const bookBoxOption = options.find(opt =>
        opt.querySelector('h3')?.textContent === 'One Month of a Book Box Subscription'
      );
      const logButton = bookBoxOption.querySelector('.shopping-sub-log-btn');
      expect(logButton).toBeTruthy();
      // Purchase is selected by default; cost is 25 ink + 25 paper
      logButton.click();
      await flushPromises();

      expect(parseInt(inkDropsEl.value)).toBe(75); // 100 - 25
      expect(parseInt(paperScrapsEl.value)).toBe(75); // 100 - 25
      expect(logButton.textContent).toContain('Logged');
      } finally {
        global.indexedDB = originalIdb;
      }
    });

    test('shows error when insufficient resources for subscription purchase', async () => {
      resetStateLoadedForTests();
      const originalIdb = global.indexedDB;
      global.indexedDB = undefined;
      try {
        safeSetJSON(STORAGE_KEYS.BOOK_BOX_SUBSCRIPTIONS, {
          sub1: { id: 'sub1', company: 'Test Co', tier: 'Adult', defaultMonthlyCost: 30, skipsAllowedPerYear: 2 }
        });
      const inkDropsEl = document.getElementById('inkDrops');
      const paperScrapsEl = document.getElementById('paperScraps');
      inkDropsEl.value = '10'; // Not enough for 25 ink + 25 paper
      paperScrapsEl.value = '10';
      safeSetJSON(STORAGE_KEYS.CHARACTER_SHEET_FORM, { inkDrops: '10', paperScraps: '10' });

      await initializeShoppingPage();
      const container = document.getElementById('shopping-options-container');
      const options = Array.from(container.querySelectorAll('.shopping-option'));
      const bookBoxOption = options.find(opt =>
        opt.querySelector('h3')?.textContent === 'One Month of a Book Box Subscription'
      );
      const logButton = bookBoxOption.querySelector('.shopping-sub-log-btn');
      const errorContainer = bookBoxOption.querySelector('.error-message');
      logButton.click();

      expect(errorContainer.style.display).toBe('block');
      expect(errorContainer.textContent).toContain('Insufficient');
      expect(parseInt(inkDropsEl.value)).toBe(10);
      expect(parseInt(paperScrapsEl.value)).toBe(10);
      } finally {
        global.indexedDB = originalIdb;
      }
    });

    test('works when form elements do not exist (fallback to localStorage)', async () => {
      // Remove form elements
      document.getElementById('inkDrops')?.remove();
      document.getElementById('paperScraps')?.remove();
      
      // Set up localStorage only
      safeSetJSON(STORAGE_KEYS.CHARACTER_SHEET_FORM, {
        inkDrops: '200',
        paperScraps: '50'
      });

      await initializeShoppingPage();
      const container = document.getElementById('shopping-options-container');
      const options = Array.from(container.querySelectorAll('.shopping-option'));
      
      const bookishItemOption = options.find(opt => 
        opt.querySelector('h3')?.textContent === 'Bookish Item'
      );
      
      const redeemButton = bookishItemOption.querySelector('.redeem-button');
      
      // Click redeem
      redeemButton.click();
      await flushPromises();
      
      // Check localStorage was updated
      const formData = safeGetJSON(STORAGE_KEYS.CHARACTER_SHEET_FORM, {});
      expect(parseInt(formData.inkDrops)).toBe(175); // 200 - 25
      expect(parseInt(formData.paperScraps)).toBe(50);
    });

    test('logging subscription skip does not deduct resources', async () => {
      resetStateLoadedForTests();
      const originalIdb = global.indexedDB;
      global.indexedDB = undefined;
      try {
        safeSetJSON(STORAGE_KEYS.BOOK_BOX_SUBSCRIPTIONS, {
          sub1: { id: 'sub1', company: 'Test Co', tier: 'Adult', defaultMonthlyCost: 30, skipsAllowedPerYear: 2 }
        });
      const inkDropsEl = document.getElementById('inkDrops');
      const paperScrapsEl = document.getElementById('paperScraps');
      inkDropsEl.value = '100';
      paperScrapsEl.value = '100';
      safeSetJSON(STORAGE_KEYS.CHARACTER_SHEET_FORM, { inkDrops: '100', paperScraps: '100' });

      await initializeShoppingPage();
      const container = document.getElementById('shopping-options-container');
      const options = Array.from(container.querySelectorAll('.shopping-option'));
      const bookBoxOption = options.find(opt =>
        opt.querySelector('h3')?.textContent === 'One Month of a Book Box Subscription'
      );
      const skipRadio = bookBoxOption.querySelector('#sub-type-skip-one-month-book-box');
      expect(skipRadio).toBeTruthy();
      skipRadio.checked = true;
      skipRadio.dispatchEvent(new Event('change', { bubbles: true }));
      const logButton = bookBoxOption.querySelector('.shopping-sub-log-btn');
      logButton.click();
      await flushPromises();

      // Resources unchanged when skipping
      expect(parseInt(inkDropsEl.value)).toBe(100);
      expect(parseInt(paperScrapsEl.value)).toBe(100);
      } finally {
        global.indexedDB = originalIdb;
      }
    });

    test('renders shopping log entries as text even with HTML-like store names', async () => {
      const inkDropsEl = document.getElementById('inkDrops');
      const paperScrapsEl = document.getElementById('paperScraps');
      inkDropsEl.value = '200';
      paperScrapsEl.value = '50';

      safeSetJSON(STORAGE_KEYS.CHARACTER_SHEET_FORM, {
        inkDrops: '200',
        paperScraps: '50'
      });

      await initializeShoppingPage();
      const container = document.getElementById('shopping-options-container');
      const options = Array.from(container.querySelectorAll('.shopping-option'));
      const bookishItemOption = options.find(opt =>
        opt.querySelector('h3')?.textContent === 'Bookish Item'
      );

      const storeInput = bookishItemOption.querySelector('.shopping-store-input');
      storeInput.value = '<img src=x onerror="window.__shoppingXss = true">';

      const redeemButton = bookishItemOption.querySelector('.redeem-button');
      redeemButton.click();
      await flushPromises();

      const summary = document.getElementById('shopping-log-summary');
      expect(summary.querySelector('img')).toBeNull();
      expect(summary.querySelector('script')).toBeNull();
      expect(summary.textContent).toContain('@ <img src=x onerror="window.__shoppingXss = true">');
      expect(window.__shoppingXss).toBeUndefined();
    });

    test('renders book search results without injecting HTML from result metadata', async () => {
      const { searchBooks } = require('../assets/js/services/BookMetadataService.js');
      searchBooks.mockResolvedValueOnce([
        {
          id: 'malicious-book',
          title: '<img src=x onerror="window.__searchTitleXss = true">',
          authors: ['<script>window.__searchAuthorXss = true</script>'],
          coverUrl: 'x" onerror="window.__searchCoverXss = true',
          pageCount: 321
        }
      ]);

      await initializeShoppingPage();
      const container = document.getElementById('shopping-options-container');
      const options = Array.from(container.querySelectorAll('.shopping-option'));
      const indieBookstoreOption = options.find(opt =>
        opt.querySelector('h3')?.textContent === 'Local Indie Bookstore'
      );

      const quickAddSearch = indieBookstoreOption.querySelector('.shopping-quick-add-search');
      const quickAddButton = indieBookstoreOption.querySelector('.shopping-quick-add-btn');
      quickAddSearch.value = 'malicious';

      quickAddButton.click();
      await flushPromises();

      const results = indieBookstoreOption.querySelector('.shopping-book-search-results');
      expect(results.querySelector('img')).toBeNull();
      expect(results.querySelector('script')).toBeNull();
      expect(results.textContent).toContain('<img src=x onerror="window.__searchTitleXss = true">');
      expect(results.textContent).toContain('<script>window.__searchAuthorXss = true</script>');
      expect(window.__searchTitleXss).toBeUndefined();
      expect(window.__searchAuthorXss).toBeUndefined();
      expect(window.__searchCoverXss).toBeUndefined();
    });
  });

  describe('Rewards Page Renderer', () => {
    beforeEach(() => {
      localStorage.clear();
      window.__BASEURL = '';
      document.body.innerHTML = `
        <div id="rewards-wearable"></div>
        <div id="rewards-non-wearable"></div>
        <div id="rewards-familiars"></div>
        <div id="rewards-quest-items"></div>
        <div id="rewards-temp-buffs"></div>
      `;
    });

    test('marks an obtained (inventory) item as acquired and uses border-7', async () => {
      safeSetJSON(STORAGE_KEYS.INVENTORY_ITEMS, [{ name: "Librarian's Compass" }]);
      safeSetJSON(STORAGE_KEYS.EQUIPPED_ITEMS, []);

      await initializeRewardsPage();

      const heading = document.getElementById('librarians-compass');
      expect(heading).toBeTruthy();

      const card = heading.closest('.reward-card');
      expect(card).toBeTruthy();
      expect(card.classList.contains('acquired')).toBe(true);
      expect(card.classList.contains('equipped')).toBe(false);

      const inner = card.querySelector('.reward-card-inner');
      expect(inner).toBeTruthy();

      const corners = Array.from(card.querySelectorAll('.reward-corner-border img'));
      expect(corners.length).toBe(2);
      corners.forEach(img => {
        expect(img.getAttribute('src')).toContain('/assets/images/borders/border-7.PNG');
      });
    });

    test('marks an equipped item as acquired+equipped and uses border-9', async () => {
      safeSetJSON(STORAGE_KEYS.INVENTORY_ITEMS, []);
      safeSetJSON(STORAGE_KEYS.EQUIPPED_ITEMS, [{ name: "Librarian's Compass" }]);

      await initializeRewardsPage();

      const heading = document.getElementById('librarians-compass');
      expect(heading).toBeTruthy();

      const card = heading.closest('.reward-card');
      expect(card).toBeTruthy();
      expect(card.classList.contains('acquired')).toBe(true);
      expect(card.classList.contains('equipped')).toBe(true);

      const corners = Array.from(card.querySelectorAll('.reward-corner-border img'));
      expect(corners.length).toBe(2);
      corners.forEach(img => {
        expect(img.getAttribute('src')).toContain('/assets/images/borders/border-9.PNG');
      });
    });

    test('marks an acquired temporary buff (TEMPORARY_BUFFS) as acquired and uses border-7', async () => {
      safeSetJSON(STORAGE_KEYS.INVENTORY_ITEMS, []);
      safeSetJSON(STORAGE_KEYS.EQUIPPED_ITEMS, []);
      safeSetJSON(STORAGE_KEYS.TEMPORARY_BUFFS, [
        { name: 'Long Read Focus', description: 'x', duration: 'two-months', monthsRemaining: 2, status: 'active' }
      ]);

      await initializeRewardsPage();

      const heading = document.getElementById('long-read-focus');
      expect(heading).toBeTruthy();

      const card = heading.closest('.reward-card');
      expect(card).toBeTruthy();
      expect(card.classList.contains('acquired')).toBe(true);
      expect(card.classList.contains('equipped')).toBe(false);

      const corners = Array.from(card.querySelectorAll('.reward-corner-border img'));
      expect(corners.length).toBe(2);
      corners.forEach(img => {
        expect(img.getAttribute('src')).toContain('/assets/images/borders/border-7.PNG');
      });
    });

    test('renders Quest items (e.g., The Grand Key) in the quest items section', async () => {
      await initializeRewardsPage();

      const heading = document.getElementById('the-grand-key');
      expect(heading).toBeTruthy();

      const questContainer = document.getElementById('rewards-quest-items');
      expect(questContainer).toBeTruthy();

      const questCard = heading.closest('.reward-card');
      expect(questCard).toBeTruthy();
      expect(questContainer.contains(questCard)).toBe(true);
    });
  });
});


