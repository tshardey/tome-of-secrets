/**
 * Schema reload banner (forward compatibility, see the write gate in dataValidator.js).
 *
 * Installed on every page from main.js. When another tab changes the save's schema version,
 * or this tab's write gate refuses a write (tos:schemaChangedElsewhere), it shows an
 * unclosable banner asking the player to reload: this tab's saves are paused until then.
 */
import { getStoredSchemaVersion, SCHEMA_VERSION } from '../character-sheet/dataValidator.js';

const SCHEMA_VERSION_STORAGE_KEY = 'tomeOfSecrets_schemaVersion';
export const SCHEMA_RELOAD_BANNER_ID = 'tos-schema-reload-banner';

const NEWER_BUILD_MESSAGE = 'Tome of Secrets was updated in another tab. Reload this tab to keep playing.';
const SAME_BUILD_MESSAGE = 'Your save changed in another tab. Reload this tab to keep playing.';

let initialized = false;

function bannerMessage() {
    const stored = getStoredSchemaVersion();
    return stored !== null && stored > SCHEMA_VERSION ? NEWER_BUILD_MESSAGE : SAME_BUILD_MESSAGE;
}

export function showSchemaReloadBanner() {
    let banner = document.getElementById(SCHEMA_RELOAD_BANNER_ID);
    if (!banner) {
        banner = document.createElement('div');
        banner.id = SCHEMA_RELOAD_BANNER_ID;
        banner.className = 'schema-reload-banner';
        banner.setAttribute('role', 'alert');
        // Deliberately no close button: saving stays paused until the tab reloads.
        const message = document.createElement('span');
        message.className = 'schema-reload-banner__message';
        const reload = document.createElement('button');
        reload.type = 'button';
        reload.className = 'schema-reload-banner__button';
        reload.textContent = 'Reload';
        reload.addEventListener('click', () => window.location.reload());
        banner.append(message, reload);
        document.body.prepend(banner);
    }
    // Refresh the wording: a same-build change can later turn into a newer-build one.
    banner.querySelector('.schema-reload-banner__message').textContent = bannerMessage();
}

/**
 * Listen for schema changes made elsewhere. Idempotent.
 */
export function initializeSchemaChangeBanner() {
    if (initialized) return;
    initialized = true;
    window.addEventListener('storage', (e) => {
        if (e.key === SCHEMA_VERSION_STORAGE_KEY) showSchemaReloadBanner();
    });
    window.addEventListener('tos:schemaChangedElsewhere', showSchemaReloadBanner);
}
