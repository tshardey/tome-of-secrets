/**
 * @jest-environment jsdom
 */

import { initializeSanctumPage } from '../assets/js/page-renderers/sanctumRenderer.js';
import { initializeKeeperPage } from '../assets/js/page-renderers/keeperRenderer.js';
import { initializeRewardsPage } from '../assets/js/page-renderers/rewardsRenderer.js';
import { STORAGE_KEYS } from '../assets/js/character-sheet/storageKeys.js';
import { safeSetJSON } from '../assets/js/utils/storage.js';

jest.mock('../assets/js/services/BookMetadataService.js', () => ({
  searchBooks: jest.fn(() => Promise.resolve([]))
}));

describe('Page Renderers Hydration', () => {
  test('sanctum list hydrates from JSON and uses meta baseurl for hero images', () => {
    document.head.innerHTML = '<meta name="baseurl" content="/tome-of-secrets">';
    delete window.__BASEURL;
    document.body.innerHTML = '<div id="sanctum-list"></div>';
    initializeSanctumPage();
    const container = document.getElementById('sanctum-list');
    expect(container).toBeTruthy();
    const headings = Array.from(container.querySelectorAll('h3')).map(h => h.textContent.trim());
    expect(headings).toContain('The Spire of Whispers');
    expect(headings).toContain('The Verdant Athenaeum');
    expect(headings).toContain('The Sunken Archives');
    const hero = container.querySelector('.sanctum-hero');
    expect(hero).toBeTruthy();
    const bg = hero.style.backgroundImage;
    expect(bg).toContain('/tome-of-secrets/');
    expect(bg).toContain('spire-of-whispers-hero.png');
  });

  test('keeper sections hydrate from JSON', () => {
    document.body.innerHTML = `
      <div id="keeper-backgrounds"></div>
      <div id="wizard-schools"></div>
    `;
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


