/**
 * Encounter Image Map
 * 
 * Maps encounter names to their actual image filenames.
 * Handles special cases where names don't match filenames exactly.
 */

export const ENCOUNTER_IMAGE_MAP = {
    "Librarian's Spirit": "encounter-librarian-spirit.png",
    "Mischievous Pixie": "encounter-mischevious-pixie.png", // Note: filename has typo "mischevious"
    "Zombie": "encounter-zombie.png",
    "Zombies": "encounter-zombie.png" // Plural form maps to singular filename
};

/**
 * Get the image filename for an encounter name
 * @param {string} encounterName - Encounter name
 * @returns {string} Image filename
 */
export function getEncounterImageFilename(encounterName) {
    // Check special cases first
    if (ENCOUNTER_IMAGE_MAP[encounterName]) {
        return ENCOUNTER_IMAGE_MAP[encounterName];
    }
    
    // Default: derive from name
    const slug = encounterName
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '');
    return `encounter-${slug}.png`;
}
