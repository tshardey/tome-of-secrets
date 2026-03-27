export const TRIGGERS = Object.freeze({
    ON_QUEST_COMPLETED: 'ON_QUEST_COMPLETED',
    ON_QUEST_DRAFTED: 'ON_QUEST_DRAFTED',
    ON_MONTH_END: 'ON_MONTH_END',
    ON_MONTH_START: 'ON_MONTH_START',
    ON_JOURNAL_ENTRY: 'ON_JOURNAL_ENTRY',
    ON_BOOK_COMPLETED: 'ON_BOOK_COMPLETED',
    ON_STATE_LOAD: 'ON_STATE_LOAD',
    ON_ACTIVATE: 'ON_ACTIVATE'
});

export const MODIFIER_TYPES = Object.freeze({
    ADD_FLAT: 'ADD_FLAT',
    MULTIPLY: 'MULTIPLY',
    PREVENT: 'PREVENT',
    GRANT_RESOURCE: 'GRANT_RESOURCE',
    UNLOCK_SLOT: 'UNLOCK_SLOT',
    ACTIVATE: 'ACTIVATE'
});

export const RESOLUTION_ORDER = Object.freeze([
    MODIFIER_TYPES.ADD_FLAT,
    MODIFIER_TYPES.MULTIPLY,
    MODIFIER_TYPES.PREVENT
]);

const VALID_TRIGGER_SET = new Set(Object.values(TRIGGERS));
const VALID_MODIFIER_SET = new Set(Object.values(MODIFIER_TYPES));

export function validateEffect(effect) {
    if (!effect || typeof effect !== 'object' || Array.isArray(effect)) {
        return { valid: false, error: 'Effect must be an object' };
    }

    const { trigger, modifier } = effect;
    if (!VALID_TRIGGER_SET.has(trigger)) {
        return { valid: false, error: `Invalid trigger: ${trigger}` };
    }

    if (!modifier || typeof modifier !== 'object' || Array.isArray(modifier)) {
        return { valid: false, error: 'Effect modifier must be an object' };
    }

    if (!VALID_MODIFIER_SET.has(modifier.type)) {
        return { valid: false, error: `Invalid modifier type: ${modifier.type}` };
    }

    return { valid: true };
}
