/**
 * Shared helpers for "helper discovery" modules (e.g. monthly quest-draw helpers):
 * stable source-ID generation, cadence detection from rules text, and validation
 * of the persisted per-source usage/cooldown state.
 */

/**
 * Infer cadence from text.
 * @param {string} text
 * @returns {'monthly'|'every-2-months'|'one-time'}
 */
export function getCadenceFromText(text) {
    if (!text || typeof text !== 'string') return 'one-time';
    const t = text.toLowerCase();
    if (t.includes('once every 2 months') || t.includes('every 2 months')) return 'every-2-months';
    if (t.includes('once per month')) return 'monthly';
    return 'one-time';
}

/**
 * Build a stable source ID for a helper (sourceType + slot mode + identifier).
 * @param {string} sourceType - 'item' | 'tempBuff' | 'ability' | 'school' | 'seriesExpedition'
 * @param {string} [slotMode] - 'equipped' | 'inventory' | 'passiveItem' | 'passiveFamiliar' (for items)
 * @param {string} identifier - Unique part (e.g. index:name, slotId:name, or just name)
 * @returns {string}
 */
export function buildSourceId(sourceType, slotMode, identifier) {
    const parts = [sourceType];
    if (slotMode) parts.push(slotMode);
    const safe = String(identifier ?? '').replace(/\|/g, '_').replace(/:/g, '_');
    parts.push(safe);
    return parts.join(':');
}

/**
 * Validate persisted helper usage state.
 * Shape: { [sourceId: string]: { used: boolean, cooldownCyclesRemaining?: number } }
 * @param {*} raw
 * @returns {Object}
 */
export function validateHelperState(raw) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
        return {};
    }
    const validated = {};
    for (const key of Object.keys(raw)) {
        const sourceId = typeof key === 'string' && key.trim() ? key.trim() : null;
        if (!sourceId) continue;
        const entry = raw[key];
        if (!entry || typeof entry !== 'object' || Array.isArray(entry)) continue;
        const used = typeof entry.used === 'boolean' ? entry.used : false;
        const cooldownCyclesRemaining = typeof entry.cooldownCyclesRemaining === 'number' && !isNaN(entry.cooldownCyclesRemaining) && entry.cooldownCyclesRemaining >= 0
            ? Math.floor(entry.cooldownCyclesRemaining)
            : undefined;
        validated[sourceId] = { used };
        if (cooldownCyclesRemaining !== undefined) {
            validated[sourceId].cooldownCyclesRemaining = cooldownCyclesRemaining;
        }
    }
    return validated;
}
