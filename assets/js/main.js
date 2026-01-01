import { initializeCharacterSheet } from './character-sheet.js';
import { initializeTabs } from './tabs.js';
import { initializeCloudAuth } from './auth/cloudAuth.js';

/**
 * This is the main entry point for all JavaScript on the site.
 */
initializeTabs();
initializeCloudAuth().catch((error) => {
  console.error('Failed to initialize cloud auth:', error);
});

// Character sheet boot may be async (IndexedDB-backed state load).
// We intentionally don't block the rest of the site on it.
initializeCharacterSheet().catch((error) => {
  console.error('Failed to initialize character sheet:', error);
});