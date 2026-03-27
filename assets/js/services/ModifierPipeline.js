import { Reward } from './RewardCalculator.js';
import { MODIFIER_TYPES, RESOLUTION_ORDER, validateEffect } from './effectSchema.js';

function matchesConditionValue(payloadValue, expectedValue) {
    if (Array.isArray(expectedValue)) {
        if (Array.isArray(payloadValue)) {
            return payloadValue.some(value => expectedValue.includes(value));
        }
        return expectedValue.includes(payloadValue);
    }
    return payloadValue === expectedValue;
}

function matchesPageCount(pageCount, conditionValue) {
    if (pageCount == null || Number.isNaN(Number(pageCount))) {
        return false;
    }
    if (conditionValue && typeof conditionValue === 'object' && !Array.isArray(conditionValue)) {
        if (conditionValue.min != null && pageCount < conditionValue.min) {
            return false;
        }
        if (conditionValue.max != null && pageCount > conditionValue.max) {
            return false;
        }
        return true;
    }
    return matchesConditionValue(pageCount, conditionValue);
}

export class ModifierPipeline {
    static evaluateCondition(condition = {}, payload = {}) {
        if (!condition || Object.keys(condition).length === 0) {
            return true;
        }

        if (condition.pageCount != null) {
            if (!matchesPageCount(payload.pageCount, condition.pageCount)) {
                return false;
            }
        }

        if (condition.hasTag != null) {
            const tags = Array.isArray(payload.tags) ? payload.tags : [];
            const expectedTags = Array.isArray(condition.hasTag) ? condition.hasTag : [condition.hasTag];
            if (!expectedTags.some(tag => tags.includes(tag))) {
                return false;
            }
        }

        for (const [key, expectedValue] of Object.entries(condition)) {
            if (key === 'pageCount' || key === 'hasTag') {
                continue;
            }
            if (key === 'encounterType' && expectedValue === 'any') {
                continue;
            }
            if (key === 'hasFamiliarEquipped' && expectedValue === true) {
                if (!payload.hasFamiliarEquipped) {
                    return false;
                }
                continue;
            }
            if (!matchesConditionValue(payload[key], expectedValue)) {
                return false;
            }
        }

        return true;
    }

    static resolve(trigger, payload = {}, activeEffects = [], baseReward = new Reward()) {
        const resolved = baseReward.clone();
        const matching = [];

        for (const entry of activeEffects) {
            const source = entry?.source || null;
            const effect = entry?.effect || entry;
            const validation = validateEffect(effect);
            if (!validation.valid || effect.trigger !== trigger) {
                continue;
            }
            if (!this.evaluateCondition(effect.condition, payload)) {
                continue;
            }
            matching.push({ effect, source });
        }

        const byType = RESOLUTION_ORDER.reduce((acc, type) => {
            acc[type] = matching.filter(match => match.effect.modifier.type === type);
            return acc;
        }, {});

        for (const entry of byType[MODIFIER_TYPES.ADD_FLAT] || []) {
            this._applyAddFlat(resolved, entry);
        }
        for (const entry of byType[MODIFIER_TYPES.GRANT_RESOURCE] || []) {
            this._applyGrantResource(resolved, entry);
        }
        for (const entry of byType[MODIFIER_TYPES.MULTIPLY] || []) {
            this._applyMultiply(resolved, entry);
        }
        for (const entry of byType[MODIFIER_TYPES.PREVENT] || []) {
            this._applyPrevent(resolved, entry);
        }

        resolved.receipt.final.xp = resolved.xp;
        resolved.receipt.final.inkDrops = resolved.inkDrops;
        resolved.receipt.final.paperScraps = resolved.paperScraps;
        resolved.receipt.final.blueprints = resolved.blueprints;

        return resolved;
    }

    static _sourceName(entry) {
        return entry?.source?.name || entry?.source?.id || 'Unknown Effect Source';
    }

    static _applyAddFlat(reward, entry) {
        const { resource, value } = entry.effect.modifier;
        if (!resource || typeof value !== 'number') {
            return;
        }
        if (typeof reward[resource] !== 'number') {
            return;
        }
        reward[resource] += value;
        reward.modifiedBy.push(this._sourceName(entry));
        reward.receipt.modifiers.push({
            source: this._sourceName(entry),
            type: 'effect:add_flat',
            value,
            description: `+${value} ${resource}`,
            currency: resource
        });
    }

    /** Immediate resource grant (e.g. ON_QUEST_DRAFTED); same applied math as ADD_FLAT on Reward fields. */
    static _applyGrantResource(reward, entry) {
        const { resource, value } = entry.effect.modifier;
        if (!resource || typeof value !== 'number') {
            return;
        }
        if (typeof reward[resource] !== 'number') {
            return;
        }
        reward[resource] += value;
        reward.modifiedBy.push(this._sourceName(entry));
        reward.receipt.modifiers.push({
            source: this._sourceName(entry),
            type: 'effect:grant_resource',
            value,
            description: `Granted +${value} ${resource}`,
            currency: resource
        });
    }

    static _applyMultiply(reward, entry) {
        const { resource, value } = entry.effect.modifier;
        if (!resource || typeof value !== 'number') {
            return;
        }
        if (typeof reward[resource] !== 'number') {
            return;
        }

        const previous = reward[resource];
        reward[resource] = Math.floor(previous * value);
        const delta = reward[resource] - previous;
        reward.modifiedBy.push(this._sourceName(entry));
        reward.receipt.modifiers.push({
            source: this._sourceName(entry),
            type: 'effect:multiply',
            value: delta,
            description: `x${value} ${resource} (${delta >= 0 ? '+' : ''}${delta})`,
            currency: resource
        });
    }

    static _applyPrevent(reward, entry) {
        const target = entry.effect.modifier.target || 'unknown';
        reward.modifiedBy.push(this._sourceName(entry));
        reward.receipt.modifiers.push({
            source: this._sourceName(entry),
            type: 'effect:prevent',
            value: 0,
            description: `Prevented ${target}`,
            currency: null
        });
    }
}
