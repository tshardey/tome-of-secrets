import { EffectRegistry } from '../services/EffectRegistry.js';
import { TRIGGERS } from '../services/effectSchema.js';

/**
 * Collect all tag IDs referenced in tagMatch/hasTag conditions
 * from all active effect sources for the ON_QUEST_COMPLETED trigger.
 *
 * @param {{ state: Object }} stateAdapter
 * @param {Object} dataModule - Data catalogs (allItems, keeperBackgrounds, etc.)
 * @returns {Set<string>}
 */
export function getApplicableTagIds(stateAdapter, dataModule) {
    const tagIds = new Set();

    const allEffects = EffectRegistry.getActiveEffects(
        TRIGGERS.ON_QUEST_COMPLETED,
        stateAdapter,
        dataModule
    );

    for (const { effect } of allEffects) {
        const condition = effect?.condition;
        if (!condition) continue;

        if (condition.tagMatch != null) {
            const groups = Array.isArray(condition.tagMatch) ? condition.tagMatch : [];
            for (const group of groups) {
                if (!Array.isArray(group)) continue;
                for (const tag of group) {
                    tagIds.add(tag);
                }
            }
        }

        if (condition.hasTag != null) {
            const tags = Array.isArray(condition.hasTag) ? condition.hasTag : [condition.hasTag];
            for (const tag of tags) {
                tagIds.add(tag);
            }
        }
    }

    return tagIds;
}
