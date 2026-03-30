import { EffectRegistry } from './EffectRegistry.js';
import { ModifierPipeline } from './ModifierPipeline.js';
import { Reward } from './RewardCalculator.js';
import { TriggerPayload } from './TriggerPayload.js';
import { TRIGGERS } from './effectSchema.js';
import { buildEffectContext } from './effectContext.js';

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
 * @param {{ updateCurrency?: Function, dataModule?: Object, toast?: { info: Function }, form?: HTMLFormElement|null, formData?: { keeperBackground?: string, wizardSchool?: string } }} options
 */
export function applyQuestDraftedEffects(stateAdapter, quests, options = {}) {
    const { updateCurrency, dataModule, toast, form, formData: formDataOverride } = options;
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
        const reward = ModifierPipeline.resolve(TRIGGERS.ON_QUEST_DRAFTED, payload, active, new Reward());

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
