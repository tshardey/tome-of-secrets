import { characterState } from './state.js';
import { STORAGE_KEYS } from './storageKeys.js';
import { parseIntOr } from '../utils/helpers.js';

/**
 * Factory that returns the updateCurrency(rewards) function with dependencies bound via closure.
 */
export function createUpdateCurrency(stateAdapter, ui, dataModule) {
    return function updateCurrency(rewards) {
        if (!rewards) return;
        const xpCurrent = document.getElementById('xp-current');
        const inkDrops = document.getElementById('inkDrops');
        const paperScraps = document.getElementById('paperScraps');
        const dustyBlueprints = document.getElementById('dustyBlueprints');

        if (xpCurrent && rewards.xp > 0) {
            const currentXP = parseIntOr(xpCurrent.value, 0);
            xpCurrent.value = currentXP + rewards.xp;
        }

        if (inkDrops && rewards.inkDrops > 0) {
            const currentInk = parseIntOr(inkDrops.value, 0);
            inkDrops.value = currentInk + rewards.inkDrops;
        }

        // Note: blueprints are awarded via stateAdapter, so we sync from characterState
        if (dustyBlueprints) {
            dustyBlueprints.value = characterState[STORAGE_KEYS.DUSTY_BLUEPRINTS] || 0;
        }

        if (paperScraps && rewards.paperScraps > 0) {
            const currentPaper = parseIntOr(paperScraps.value, 0);
            paperScraps.value = currentPaper + rewards.paperScraps;
        }

        // Handle items and temp buffs from rewards
        if (rewards.items && rewards.items.length > 0) {
            rewards.items.forEach(itemName => {
                // Check temporaryBuffs first (new source), then temporaryBuffsFromRewards (legacy)
                let buffData = dataModule.temporaryBuffs?.[itemName] || dataModule.temporaryBuffsFromRewards?.[itemName];
                if (buffData) {
                    let monthsRemaining = 0;
                    if (buffData.duration === 'two-months') {
                        monthsRemaining = 2;
                    } else if (buffData.duration === 'until-end-month') {
                        monthsRemaining = 1;
                    }

                    stateAdapter.addTemporaryBuff({
                        name: itemName,
                        description: buffData.description,
                        duration: buffData.duration,
                        monthsRemaining,
                        status: 'active'
                    });

                    ui.renderTemporaryBuffs();
                    const wearableSlotsInput = document.getElementById('wearable-slots');
                    const nonWearableSlotsInput = document.getElementById('non-wearable-slots');
                    const familiarSlotsInput = document.getElementById('familiar-slots');
                    ui.updateQuestBuffsDropdown(wearableSlotsInput, nonWearableSlotsInput, familiarSlotsInput);
                } else if (dataModule.allItems[itemName]) {
                    stateAdapter.addInventoryItem({ name: itemName, ...dataModule.allItems[itemName] });
                }
            });
        }

        // Auto-detect temporary buffs from reward text
        // Check if any reward text contains temporary buff names
        const checkRewardTextForBuffs = (rewardText) => {
            if (!rewardText || !dataModule.temporaryBuffs) return;

            for (const [buffName, buffData] of Object.entries(dataModule.temporaryBuffs)) {
                // Check if reward text contains the buff name (case-insensitive)
                if (rewardText.toLowerCase().includes(buffName.toLowerCase())) {
                    // Check if buff is already added
                    const existingBuffs = stateAdapter.getTemporaryBuffs();
                    const alreadyAdded = existingBuffs.some(buff => buff.name === buffName && buff.status === 'active');
                    if (!alreadyAdded) {
                        let monthsRemaining = 0;
                        if (buffData.duration === 'two-months') {
                            monthsRemaining = 2;
                        } else if (buffData.duration === 'until-end-month') {
                            monthsRemaining = 1;
                        }

                        stateAdapter.addTemporaryBuff({
                            name: buffName,
                            description: buffData.description,
                            duration: buffData.duration,
                            monthsRemaining,
                            status: 'active'
                        });

                        ui.renderTemporaryBuffs();
                        const wearableSlotsInput = document.getElementById('wearable-slots');
                        const nonWearableSlotsInput = document.getElementById('non-wearable-slots');
                        const familiarSlotsInput = document.getElementById('familiar-slots');
                        ui.updateQuestBuffsDropdown(wearableSlotsInput, nonWearableSlotsInput, familiarSlotsInput);
                    }
                }
            }
        };

        // Check items array for buff names
        if (rewards.items && rewards.items.length > 0) {
            const rewardText = rewards.items.join(' ');
            checkRewardTextForBuffs(rewardText);
        }
    };
}
