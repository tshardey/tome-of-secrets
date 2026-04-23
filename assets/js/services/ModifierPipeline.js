import { Reward } from './RewardCalculator.js';
import { MODIFIER_TYPES, RESOLUTION_ORDER, TRIGGERS, validateEffect } from './effectSchema.js';

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

        if (condition.tagMatch != null) {
            const tags = Array.isArray(payload.tags) ? payload.tags : [];
            const groups = Array.isArray(condition.tagMatch) ? condition.tagMatch : [];
            const matched = groups.some(group => {
                if (!Array.isArray(group)) return false;
                return group.every(requiredTag => tags.includes(requiredTag));
            });
            if (!matched) {
                return false;
            }
        }

        for (const [key, expectedValue] of Object.entries(condition)) {
            if (key === 'pageCount' || key === 'hasTag' || key === 'tagMatch') {
                continue;
            }
            if (key === 'encounterType' && expectedValue === 'any') {
                // "any encounter type" still requires that we are in an encounter context.
                if (!payload.encounterType) {
                    return false;
                }
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
        const unlockSlotEntries = matching.filter(match => match.effect.modifier.type === MODIFIER_TYPES.UNLOCK_SLOT);

        for (const entry of byType[MODIFIER_TYPES.ADD_FLAT] || []) {
            this._applyAddFlat(resolved, entry, payload);
        }
        for (const entry of byType[MODIFIER_TYPES.GRANT_RESOURCE] || []) {
            this._applyGrantResource(resolved, entry, payload);
        }
        for (const entry of byType[MODIFIER_TYPES.MULTIPLY] || []) {
            this._applyMultiply(resolved, entry);
        }
        for (const entry of byType[MODIFIER_TYPES.PREVENT] || []) {
            this._applyPrevent(resolved, entry);
        }
        for (const entry of unlockSlotEntries) {
            this._markDeferredNonNumeric(resolved, entry, 'unlock_slot', 'Handled by SlotService on state load');
        }
        const activateEntries = matching.filter(match => match.effect.modifier.type === MODIFIER_TYPES.ACTIVATE);
        for (const entry of activateEntries) {
            this._applyActivate(resolved, entry, payload);
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

    static _journalEntryMultiplier(entry, payload) {
        if (entry?.effect?.trigger !== TRIGGERS.ON_JOURNAL_ENTRY) {
            return 1;
        }
        const n = Number(payload?.entryCount);
        return n > 0 ? n : 1;
    }

    static _applyAddFlat(reward, entry, payload = {}) {
        const { resource, value } = entry.effect.modifier;
        if (!resource || typeof value !== 'number') {
            return;
        }
        if (typeof reward[resource] !== 'number') {
            return;
        }
        const mult = this._journalEntryMultiplier(entry, payload);
        const total = value * mult;
        reward[resource] += total;
        reward.modifiedBy.push(this._sourceName(entry));
        reward.receipt.modifiers.push({
            source: this._sourceName(entry),
            type: 'effect:add_flat',
            value: total,
            description:
                mult > 1
                    ? `+${total} ${resource} (${mult} × ${value})`
                    : `+${total} ${resource}`,
            currency: resource
        });
    }

    /** Immediate resource grant (e.g. ON_QUEST_DRAFTED); same applied math as ADD_FLAT on Reward fields. */
    static _applyGrantResource(reward, entry, payload = {}) {
        const { resource, value } = entry.effect.modifier;
        if (!resource || typeof value !== 'number') {
            return;
        }
        if (typeof reward[resource] !== 'number') {
            return;
        }
        const mult = this._journalEntryMultiplier(entry, payload);
        const total = value * mult;
        reward[resource] += total;
        reward.modifiedBy.push(this._sourceName(entry));
        reward.receipt.modifiers.push({
            source: this._sourceName(entry),
            type: 'effect:grant_resource',
            value: total,
            description:
                mult > 1
                    ? `Granted +${total} ${resource} (${mult} × ${value})`
                    : `Granted +${total} ${resource}`,
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

    static _markDeferredNonNumeric(reward, entry, effectType, detail) {
        reward.receipt.modifiers.push({
            source: this._sourceName(entry),
            type: `effect:${effectType}:deferred`,
            value: 0,
            description: detail,
            currency: null
        });
    }

    static _cooldownKey(source) {
        if (!source || typeof source !== 'object') {
            return '';
        }
        const sourceType = source.sourceType != null ? String(source.sourceType) : '';
        const sourceId = source.id != null ? String(source.id) : '';
        if (!sourceType || !sourceId) {
            return '';
        }
        return `${sourceType}:${sourceId}`;
    }

    static _isCooldownAvailable(cooldownKey, cadence, payload = {}) {
        const stateAdapter = payload?.stateAdapter;
        if (typeof stateAdapter?.isEffectCooldownAvailable === 'function') {
            const period = { month: payload?.month, year: payload?.year };
            return stateAdapter.isEffectCooldownAvailable(cooldownKey, cadence, period);
        }

        const cooldowns =
            payload && typeof payload.effectCooldowns === 'object' && !Array.isArray(payload.effectCooldowns)
                ? payload.effectCooldowns
                : {};
        const entry =
            cooldowns && typeof cooldowns[cooldownKey] === 'object' && !Array.isArray(cooldowns[cooldownKey])
                ? cooldowns[cooldownKey]
                : null;

        if (!entry) {
            return true;
        }

        if (cadence === 'per-use' || cadence === 'per_use') {
            return entry.used !== true;
        }

        const month = typeof payload?.month === 'string' ? payload.month.trim() : '';
        const year = typeof payload?.year === 'string' ? payload.year.trim() : '';
        if (!month || !year) {
            return false;
        }
        return entry.month !== month || entry.year !== year;
    }

    static _applyActivate(reward, entry, payload = {}) {
        const action = entry?.effect?.modifier?.action || '';
        const cadenceRaw = entry?.effect?.cooldown || null;
        const cadence = cadenceRaw === 'per_use' ? 'per-use' : cadenceRaw;
        const cooldownKey = this._cooldownKey(entry?.source);
        let eligible = true;
        let reason = 'Activation available';

        if (cadence === 'monthly') {
            const month = typeof payload?.month === 'string' ? payload.month.trim() : '';
            const year = typeof payload?.year === 'string' ? payload.year.trim() : '';
            if (!month || !year) {
                eligible = false;
                reason = 'Set month/year to evaluate monthly cooldown';
            } else if (!cooldownKey) {
                eligible = false;
                reason = 'Missing cooldown key';
            } else {
                eligible = this._isCooldownAvailable(cooldownKey, cadence, payload);
                reason = eligible ? 'Activation available' : `Already used for ${month} ${year}`;
            }
        } else if (cadence === 'per-use' || cadence === 'per_use') {
            if (!cooldownKey) {
                eligible = false;
                reason = 'Missing cooldown key';
            } else {
                eligible = this._isCooldownAvailable(cooldownKey, cadence, payload);
                reason = eligible ? 'Activation available' : 'Already consumed';
            }
        }

        reward.receipt.modifiers.push({
            source: this._sourceName(entry),
            type: 'effect:activate',
            value: 0,
            description: `${action || 'activate'}: ${reason}`,
            currency: null,
            action,
            eligible,
            reason,
            cooldown: cadence,
            cooldownKey,
            sourceType: entry?.source?.sourceType || null,
            sourceId: entry?.source?.id || null
        });
    }
}
