const { test, expect } = require('@playwright/test');

const ORIGIN = 'http://127.0.0.1:4000/';

/**
 * Smoke coverage for the real browser path: the Jekyll site builds, serves, and
 * boots its client-side scripts without errors. The Jest suite runs against jsdom
 * and cannot catch a broken asset path, a Liquid rendering failure, or a script
 * that throws only in a real engine — this can.
 */
test.describe('site smoke', () => {
  test('home page renders and navigates to the character sheet', async ({ page }) => {
    await page.goto('./');

    await expect(page).toHaveTitle(/Tome of Secrets/);
    await expect(page.locator('.hero-title')).toHaveText('Tome of Secrets');
    await expect(page.getByRole('link', { name: 'Character Sheet' })).toBeVisible();

    await page.getByRole('link', { name: 'Character Sheet' }).click();
    await expect(page).toHaveURL(/character-sheet\.html$/);
    await expect(page.locator('.hero-title')).toBeVisible();
  });

  test('home page loads without console errors or failed requests', async ({ page }) => {
    const consoleErrors = [];
    const failedRequests = [];

    page.on('console', (msg) => {
      if (msg.type() === 'error') consoleErrors.push(msg.text());
    });
    page.on('pageerror', (err) => consoleErrors.push(`uncaught: ${err.message}`));
    // Only the site's own assets. Third-party CDNs (fonts, the decorative
    // texture in style.scss, the favicon) fail for reasons outside this repo
    // and would make the smoke test a flake detector for other people's hosts.
    page.on('requestfailed', (req) => {
      if (!req.url().startsWith(ORIGIN)) return;
      failedRequests.push(`${req.url()} — ${req.failure()?.errorText}`);
    });

    await page.goto('./');
    await page.waitForLoadState('networkidle');

    expect(consoleErrors, `console errors:\n${consoleErrors.join('\n')}`).toEqual([]);
    expect(failedRequests, `failed requests:\n${failedRequests.join('\n')}`).toEqual([]);
  });
});
