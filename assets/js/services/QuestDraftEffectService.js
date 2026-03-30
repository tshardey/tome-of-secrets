import { EffectRegistry } from './EffectRegistry.js';
import { ModifierPipeline } from './ModifierPipeline.js';
import { Reward } from './RewardCalculator.js';
import { TriggerPayload } from './TriggerPayload.js';
import { MODIFIER_TYPES, TRIGGERS } from './effectSchema.js';
import { buildEffectContext } from './effectContext.js';

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

function pipelineSourceLabel(source) {
    return source?.name || source?.id || '';
}

/**
 * Drop effects whose JSON declares a cooldown when the adapter says that period is already consumed.
 * Without month/year (or adapter support), effects stay eligible so drafting still works in tests / bare adapters.
 */
function filterDraftEffectsByCooldown(active, stateAdapter, month, year) {
    const m = typeof month === 'string' ? month.trim() : '';
    const y = typeof year === 'string' ? year.trim() : '';
    const hasPeriod = !!(m && y);
    const canCheck = typeof stateAdapter?.isEffectCooldownAvailable === 'function';

    return active.filter(({ effect, source }) => {
        const cd = effect?.cooldown;
        if (cd !== 'monthly' && cd !== 'every-2-months') {
            return true;
        }
        if (!hasPeriod || !canCheck) {
            return true;
        }
        const key = effectCooldownKey(source);
        if (!key) {
            return true;
        }
        const cadence = cd === 'every-2-months' ? 'every-2-months' : 'monthly';
        return stateAdapter.isEffectCooldownAvailable(key, cadence, { month: m, year: y });
    });
}

function consumeCooldownsForAppliedDraftEffects(filteredActive, reward, stateAdapter, month, year) {
    const m = typeof month === 'string' ? month.trim() : '';
    const y = typeof year === 'string' ? year.trim() : '';
    if (!m || !y || typeof stateAdapter?.consumeEffectCooldown !== 'function') {
        return;
    }
    const appliedNames = new Set(reward.modifiedBy || []);

    for (const { effect, source } of filteredActive) {
        const cd = effect?.cooldown;
        if (cd !== 'monthly' && cd !== 'every-2-months') {
            continue;
        }
        const modType = effect?.modifier?.type;
        if (modType !== MODIFIER_TYPES.GRANT_RESOURCE && modType !== MODIFIER_TYPES.ADD_FLAT) {
            continue;
        }
        const label = pipelineSourceLabel(source);
        if (!label || !appliedNames.has(label)) {
            continue;
        }
        const key = effectCooldownKey(source);
        if (!key) {
            continue;
        }
        const cadence = cd === 'every-2-months' ? 'every-2-months' : 'monthly';
        stateAdapter.consumeEffectCooldown(key, cadence, { month: m, year: y });
    }
}

function resourceToastLabel(resource) {
    const map = {
        inkDrops: 'Ink Drops',
        paperScraps: 'Paper Scraps',
        xp: 'XP',
        blueprints: 'Blueprints'
    };
    return map[resource] || resource;
}

/**
 * Apply ON_QUEST_DRAFTED effects (e.g. Cartographer's Guild ink) when quests enter the active pool.
 * @param {{ state: Object }} stateAdapter
 * @param {Object[]} quests
 * @param {{ updateCurrency?: Function, dataModule?: Object, toast?: { info: Function }, form?: HTMLFormElement|null, formData?: { keeperBackground?: string, wizardSchool?: string }, month?: string, year?: string }} options
 */
export function applyQuestDraftedEffects(stateAdapter, quests, options = {}) {
    const { updateCurrency, dataModule, toast, form, formData: formDataOverride, month, year } = options;
    if (!updateCurrency || !stateAdapter || !quests?.length || !dataModule) {
        return;
    }

    const ctx =
        formDataOverride != null
            ? { state: stateAdapter.state, formData: formDataOverride }
            : buildEffectContext(stateAdapter, form ?? null);

    for (const quest of quests) {
        if (!quest?.type) continue;
        const questType = TriggerPayload.canonicalQuestType(quest.type);
        const roomNumber = quest.roomNumber != null && quest.roomNumber !== '' ? String(quest.roomNumber) : null;
        const payload = TriggerPayload.questDrafted({ questType, roomNumber });
        const active = EffectRegistry.getActiveEffects(TRIGGERS.ON_QUEST_DRAFTED, ctx, dataModule);
        let monthVal = month;
        let yearVal = year;
        if ((monthVal == null || monthVal === '') || (yearVal == null || yearVal === '')) {
            const monthEl =
                form?.querySelector('#quest-month') ??
                (typeof document !== 'undefined' ? document.getElementById('quest-month') : null);
            const yearEl =
                form?.querySelector('#quest-year') ??
                (typeof document !== 'undefined' ? document.getElementById('quest-year') : null);
            monthVal = monthEl?.value?.trim?.() ?? '';
            yearVal = yearEl?.value?.trim?.() ?? '';
        }
        const filteredActive = filterDraftEffectsByCooldown(active, stateAdapter, monthVal, yearVal);
        const reward = ModifierPipeline.resolve(TRIGGERS.ON_QUEST_DRAFTED, payload, filteredActive, new Reward());

        const ink = Number(reward.inkDrops) || 0;
        const scraps = Number(reward.paperScraps) || 0;
        const xp = Number(reward.xp) || 0;
        const bp = Number(reward.blueprints) || 0;
        if (ink || scraps || xp || bp) {
            updateCurrency({
                xp,
                inkDrops: ink,
                paperScraps: scraps,
                blueprints: bp,
                items: []
            });
            consumeCooldownsForAppliedDraftEffects(filteredActive, reward, stateAdapter, monthVal, yearVal);
        }
        if (toast?.info) {
            for (const mod of reward.receipt?.modifiers || []) {
                if (mod.type === 'effect:grant_resource' && mod.currency && mod.value) {
                    toast.info(`${mod.source}: +${mod.value} ${resourceToastLabel(mod.currency)}`);
                }
            }
        }
    }
}
