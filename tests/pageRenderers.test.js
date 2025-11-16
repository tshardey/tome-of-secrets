/**
 * @jest-environment jsdom
 */

import { initializeSanctumPage } from '../assets/js/page-renderers/sanctumRenderer.js';
import { initializeKeeperPage } from '../assets/js/page-renderers/keeperRenderer.js';

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
});


