/**
 * DataExportController - Handles character data export/import
 * 
 * Allows users to download their character data as a JSON file
 * and upload it to restore their character in a different browser.
 */

import { BaseController } from './BaseController.js';
import { STORAGE_KEYS, CHARACTER_STATE_KEYS } from '../character-sheet/storageKeys.js';
import { safeGetJSON, safeSetJSON } from '../utils/storage.js';
import { validateCharacterState, validateFormDataSafe, saveSchemaVersion, SCHEMA_VERSION, getStoredSchemaVersion } from '../character-sheet/dataValidator.js';
import { migrateState } from '../character-sheet/dataMigrator.js';
import { characterState } from '../character-sheet/state.js';

export class DataExportController extends BaseController {
    initialize() {
        const { stateAdapter } = this;
        const { ui: uiModule } = this.dependencies;
        
        if (!uiModule) return;

        // Download button
        const downloadButton = document.getElementById('download-data-button');
        if (downloadButton) {
            this.addEventListener(downloadButton, 'click', () => {
                this.downloadCharacterData();
            });
        }

        // Upload button
        const uploadButton = document.getElementById('upload-data-button');
        const fileInput = document.getElementById('upload-data-file');
        
        if (uploadButton && fileInput) {
            this.addEventListener(uploadButton, 'click', () => {
                fileInput.click();
            });

            this.addEventListener(fileInput, 'change', (e) => {
                const file = e.target.files[0];
                if (file) {
                    this.uploadCharacterData(file);
                    // Reset file input so the same file can be selected again
                    e.target.value = '';
                }
            });
        }
    }

    /**
     * Export all character data to a JSON file
     */
    downloadCharacterData() {
        try {
            // Collect form data
            // Only include persistent character data, exclude all transient UI controls
            // Transient controls are used to add/select items but don't represent saved state
            const transientIds = new Set([
                // Transient selectors for adding items/abilities/buffs/curses
                'item-select',
                'ability-select',
                'temp-buff-select',
                'curse-penalty-select',
                // Transient quest form elements
                'quest-month',
                'quest-year',
                'genre-quest-select',
                'side-quest-select',
                'dungeon-room-select',
                'dungeon-encounter-select',
                'dungeon-action-toggle',
                'quest-buffs-select',
                // Transient curse form elements
                'curse-book-title',
                // Calculated/read-only fields
                'xp-needed'
            ]);
            
            const formData = {};
            for (const element of this.form.elements) {
                if (element.id && 
                    element.type !== 'button' && 
                    !element.id.startsWith('new-quest-') && // Exclude all new-quest-* fields
                    !transientIds.has(element.id)) {
                    formData[element.id] = element.value;
                }
            }
            // Explicitly include keeperBackground
            const keeperBackgroundElement = document.getElementById('keeperBackground');
            if (keeperBackgroundElement) {
                formData.keeperBackground = keeperBackgroundElement.value;
            }

            // Collect character state
            const stateData = {};
            CHARACTER_STATE_KEYS.forEach(key => {
                stateData[key] = safeGetJSON(key, null);
            });

            // Also include monthly completed books (not in CHARACTER_STATE_KEYS but should be exported)
            const monthlyCompletedBooks = safeGetJSON(STORAGE_KEYS.MONTHLY_COMPLETED_BOOKS, []);
            if (monthlyCompletedBooks.length > 0) {
                stateData[STORAGE_KEYS.MONTHLY_COMPLETED_BOOKS] = monthlyCompletedBooks;
            }

            // Create export object with metadata
            const exportData = {
                version: SCHEMA_VERSION,
                exportDate: new Date().toISOString(),
                formData: formData,
                characterState: stateData
            };

            // Convert to JSON string with pretty formatting
            const jsonString = JSON.stringify(exportData, null, 2);
            
            // Create blob and download
            const blob = new Blob([jsonString], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `tome-of-secrets-character-${new Date().toISOString().split('T')[0]}.json`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);

            // Show success message
            alert('Character data downloaded successfully!');
        } catch (error) {
            console.error('Error downloading character data:', error);
            alert('Error downloading character data. Please try again.');
        }
    }

    /**
     * Import character data from a JSON file
     */
    async uploadCharacterData(file) {
        try {
            // Read file content
            const fileContent = await this.readFileAsText(file);
            
            // Parse JSON
            let importData;
            try {
                importData = JSON.parse(fileContent);
            } catch (parseError) {
                alert('Invalid file format. Please select a valid character data JSON file.');
                return;
            }

            // Validate structure
            if (!importData.formData || !importData.characterState) {
                alert('Invalid file format. The file must contain formData and characterState.');
                return;
            }

            // Confirm with user (this will overwrite current data)
            const confirmed = confirm(
                'This will replace your current character data with the imported data. ' +
                'Are you sure you want to continue?'
            );
            
            if (!confirmed) {
                return;
            }

            // Validate and import form data
            const validatedFormData = validateFormDataSafe(importData.formData);
            for (const key in validatedFormData) {
                if (this.form.elements[key]) {
                    this.form.elements[key].value = validatedFormData[key];
                }
            }
            safeSetJSON(STORAGE_KEYS.CHARACTER_SHEET_FORM, validatedFormData);

            // Validate and import character state
            // First, migrate if needed (the import data might be from an older version)
            const migratedState = this.migrateImportedState(importData.characterState, importData.version);
            const validatedState = validateCharacterState(migratedState);

            // Copy validated state to characterState and localStorage
            Object.keys(validatedState).forEach(key => {
                characterState[key] = validatedState[key];
                safeSetJSON(key, validatedState[key]);
            });

            // Import monthly completed books if present
            if (importData.characterState[STORAGE_KEYS.MONTHLY_COMPLETED_BOOKS]) {
                const monthlyBooks = Array.isArray(importData.characterState[STORAGE_KEYS.MONTHLY_COMPLETED_BOOKS]) 
                    ? importData.characterState[STORAGE_KEYS.MONTHLY_COMPLETED_BOOKS] 
                    : [];
                safeSetJSON(STORAGE_KEYS.MONTHLY_COMPLETED_BOOKS, monthlyBooks);
            }

            // Save schema version
            saveSchemaVersion();

            // Trigger UI refresh by reloading the page
            // This ensures all controllers re-initialize with the new data
            const reloadConfirmed = confirm(
                'Character data imported successfully! The page will reload to apply all changes. ' +
                'Click OK to reload now, or Cancel to reload manually later.'
            );
            
            if (reloadConfirmed) {
                window.location.reload();
            } else {
                alert('Data imported. Please reload the page to see all changes.');
            }
        } catch (error) {
            console.error('Error uploading character data:', error);
            alert('Error importing character data. Please check the file and try again.');
        }
    }

    /**
     * Read file as text (helper for file upload)
     */
    readFileAsText(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = (e) => resolve(e.target.result);
            reader.onerror = (e) => reject(e);
            reader.readAsText(file);
        });
    }

    /**
     * Migrate imported state if it's from an older schema version
     */
    migrateImportedState(importedState, importedVersion) {
        // If imported version is newer, warn but still try to load
        if (importedVersion && importedVersion > SCHEMA_VERSION) {
            console.warn(
                `Imported data is from a newer version (${importedVersion}) than current (${SCHEMA_VERSION}). ` +
                'Some features may not be available.'
            );
        }

        // Ensure all CHARACTER_STATE_KEYS are present (even if null/empty)
        const stateToMigrate = { ...importedState };
        CHARACTER_STATE_KEYS.forEach(key => {
            if (!(key in stateToMigrate)) {
                // Set appropriate defaults based on key type
                if (key === STORAGE_KEYS.ATMOSPHERIC_BUFFS) {
                    stateToMigrate[key] = {};
                } else if (key === STORAGE_KEYS.BUFF_MONTH_COUNTER) {
                    stateToMigrate[key] = 0;
                } else if (key === STORAGE_KEYS.GENRE_DICE_SELECTION) {
                    stateToMigrate[key] = 'd6';
                } else {
                    stateToMigrate[key] = [];
                }
            }
        });

        // Temporarily set the schema version in localStorage so migrateState knows what version to migrate from
        // We'll restore it after migration
        const originalVersion = getStoredSchemaVersion();
        const SCHEMA_VERSION_KEY = 'tomeOfSecrets_schemaVersion';
        
        if (importedVersion !== null && importedVersion !== undefined) {
            localStorage.setItem(SCHEMA_VERSION_KEY, importedVersion.toString());
        } else {
            // If no version specified, assume version 0 (pre-versioning)
            localStorage.setItem(SCHEMA_VERSION_KEY, '0');
        }

        try {
            // Run through migration (this handles version differences)
            // Note: migrateState will save the schema version, but we'll restore the original after
            const migrated = migrateState(stateToMigrate);
            return migrated;
        } finally {
            // Restore original schema version (migrateState may have changed it)
            if (originalVersion !== null) {
                localStorage.setItem(SCHEMA_VERSION_KEY, originalVersion.toString());
            } else {
                localStorage.removeItem(SCHEMA_VERSION_KEY);
            }
        }
    }
}

