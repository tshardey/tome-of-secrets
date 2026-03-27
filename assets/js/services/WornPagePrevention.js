import { EffectRegistry } from './EffectRegistry.js';
import { MODIFIER_TYPES, TRIGGERS } from './effectSchema.js';

function effectCooldownKey(source) {
    if (!source || typeof source !== 'object') {
        return '';
    }
    const id = source.id != null ? String(source.id) : '';
    const st = source.sourceType != null ? String(source.sourceType) : '';
    if (!st || !id) {
        return '';
    }
    return `${st}:${id}`;
}

/**
 * Try to prevent the next Worn Page penalty using an ON_MONTH_END PREVENT effect with an available cooldown.
 *
 * @param {object} options
 * @param {object} options.stateAdapter - StateAdapter (or compatible) with effect cooldown helpers
 * @param {object} options.dataModule - Game data (schoolBenefits, masteryAbilities, allItems, …)
 * @param {string} options.month - Calendar month label (e.g. from quest-month)
 * @param {string} options.year - Calendar year (e.g. from quest-year)
 * @returns {{ prevented: boolean, sourceLabel?: string, cooldownKey?: string }}
 */
export function tryPreventWornPage({ stateAdapter, dataModule, month, year } = {}) {
    if (!stateAdapter || !dataModule) {
        return { prevented: false };
    }
    const m = typeof month === 'string' ? month.trim() : '';
    const y = typeof year === 'string' ? year.trim() : '';
    if (!m || !y) {
        return { prevented: false };
    }

    const active = EffectRegistry.getActiveEffects(TRIGGERS.ON_MONTH_END, stateAdapter, dataModule);
    for (const { effect, source } of active) {
        if (effect?.modifier?.type !== MODIFIER_TYPES.PREVENT) {
            continue;
        }
        if (effect.modifier.target !== 'worn_page') {
            continue;
        }
        const cooldownKey = effectCooldownKey(source);
        if (!cooldownKey) {
            continue;
        }
        const cadence = effect?.cooldown === 'every-2-months' ? 'every-2-months' : 'monthly';
        if (!stateAdapter.isEffectCooldownAvailable(cooldownKey, cadence, { month: m, year: y })) {
            continue;
        }
        stateAdapter.consumeEffectCooldown(cooldownKey, cadence, { month: m, year: y });
        const sourceLabel = source?.name || cooldownKey;
        return { prevented: true, sourceLabel, cooldownKey };
    }

    return { prevented: false };
}
