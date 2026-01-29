/**
 * Content Registry
 * 
 * Provides runtime access to expansion manifest and feature gating.
 * Used to conditionally enable/disable features based on installed expansions.
 */

import { expansions } from '../character-sheet/data.js';

/**
 * Get the expansion manifest
 * @returns {Object} Expansion manifest object
 */
export function getExpansionManifest() {
    return expansions || { core: { enabled: true }, expansions: {} };
}

/**
 * Check if an expansion is enabled
 * @param {string} expansionId - Expansion ID (e.g., 'library-restoration')
 * @returns {boolean}
 */
export function isExpansionEnabled(expansionId) {
    const manifest = getExpansionManifest();
    
    // Always return true for core
    if (expansionId === 'core') {
        return manifest.core?.enabled !== false;
    }
    
    // Check if expansion exists and is enabled
    const expansion = manifest.expansions?.[expansionId];
    if (!expansion) {
        return false;
    }
    
    // Check if expansion is explicitly disabled
    if (expansion.enabled === false) {
        return false;
    }
    
    // Check if all required expansions are enabled
    if (expansion.requires && Array.isArray(expansion.requires)) {
        return expansion.requires.every(reqId => isExpansionEnabled(reqId));
    }
    
    return true;
}

/**
 * Get expansion version
 * @param {string} expansionId - Expansion ID
 * @returns {string|null} Version string or null if not found
 */
export function getExpansionVersion(expansionId) {
    const manifest = getExpansionManifest();
    
    if (expansionId === 'core') {
        return manifest.core?.version || null;
    }
    
    return manifest.expansions?.[expansionId]?.version || null;
}

/**
 * Get all enabled features across all expansions
 * @returns {Array<string>} Array of feature names
 */
export function getEnabledFeatures() {
    const manifest = getExpansionManifest();
    const features = new Set();
    
    // Add core features
    if (manifest.core?.features) {
        manifest.core.features.forEach(f => features.add(f));
    }
    
    // Add expansion features
    Object.keys(manifest.expansions || {}).forEach(expansionId => {
        if (isExpansionEnabled(expansionId)) {
            const expansion = manifest.expansions[expansionId];
            if (expansion.features) {
                expansion.features.forEach(f => features.add(f));
            }
        }
    });
    
    return Array.from(features);
}

/**
 * Check if a feature is enabled
 * @param {string} featureName - Feature name (e.g., 'passiveSlots')
 * @returns {boolean}
 */
export function isFeatureEnabled(featureName) {
    return getEnabledFeatures().includes(featureName);
}

/**
 * Get data files for an expansion
 * @param {string} expansionId - Expansion ID
 * @returns {Array<string>} Array of data file names
 */
export function getExpansionDataFiles(expansionId) {
    const manifest = getExpansionManifest();
    
    if (expansionId === 'core') {
        return manifest.core?.dataFiles || [];
    }
    
    return manifest.expansions?.[expansionId]?.dataFiles || [];
}

/**
 * Get all enabled expansion IDs
 * @returns {Array<string>} Array of expansion IDs
 */
export function getEnabledExpansions() {
    const manifest = getExpansionManifest();
    const enabled = [];
    
    Object.keys(manifest.expansions || {}).forEach(expansionId => {
        if (isExpansionEnabled(expansionId)) {
            enabled.push(expansionId);
        }
    });
    
    return enabled;
}

/**
 * Content Registry singleton with convenient methods
 */
export const contentRegistry = {
    isExpansionEnabled,
    getExpansionVersion,
    getEnabledFeatures,
    isFeatureEnabled,
    getExpansionDataFiles,
    getEnabledExpansions,
    getManifest: getExpansionManifest
};

