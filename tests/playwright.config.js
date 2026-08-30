// @ts-check
const { defineConfig, devices } = require('@playwright/test');

// The site is served under Jekyll's `baseurl`, so every relative path in a spec
// resolves beneath it. Keep the trailing slash — Playwright joins baseURL and
// path with URL semantics, and dropping it would strip the last segment.
const BASE_URL = 'http://127.0.0.1:4000/tome-of-secrets/';

module.exports = defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? 'list' : [['list'], ['html', { open: 'never' }]],

  use: {
    baseURL: BASE_URL,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },

  projects: [
    {
      name: 'chrome',
      use: {
        ...devices['Desktop Chrome'],
        // Use the Chrome installed by .devcontainer/scripts/install-chrome.sh
        // rather than downloading a second Chromium.
        channel: 'chrome',
        launchOptions: {
          // Ubuntu noble blocks the unprivileged user namespaces Chrome's
          // sandbox needs; /dev/shm is small in containers.
          args: ['--no-sandbox', '--disable-dev-shm-usage'],
        },
      },
    },
  ],

  webServer: {
    command: 'bundle exec jekyll serve --port 4000',
    cwd: '..',
    url: BASE_URL,
    reuseExistingServer: !process.env.CI,
    timeout: 180 * 1000,
  },
});
