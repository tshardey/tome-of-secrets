/**
 * QuestService - Handles quest-related calculations and transformations
 */

import { RewardCalculator } from './RewardCalculator.js';
import { decodeHtmlEntities } from '../utils/sanitize.js';
import { calculateBlueprintReward } from './QuestRewardService.js';

/**
 * Calculate receipt preview for an active quest
 * @param {Object} quest - Quest object
 * @param {string} background - Background key (optional, will read from DOM if not provided)
 * @param {string} wizardSchool - Wizard school key (optional, will read from DOM if not provided)
 * @returns {Object|null} Receipt object or null if calculation fails
 */
export function calculateActiveQuestReceipt(quest, background = '', wizardSchool = '') {
    try {
        // Get background from DOM if not provided
        if (!background) {
            const bgSelect = document.getElementById('keeperBackground');
            background = bgSelect ? bgSelect.value : '';
        }
        
        // Get wizard school from DOM if not provided
        if (!wizardSchool) {
            const schoolSelect = document.getElementById('wizardSchool');
            wizardSchool = schoolSelect ? schoolSelect.value : '';
        }
        
        // Calculate final rewards with receipt
        const reward = RewardCalculator.calculateFinalRewards(
            quest.type,
            quest.prompt || '',
            {
                appliedBuffs: quest.buffs || [],
                background: background,
                wizardSchool: wizardSchool,
                quest: quest,
                isEncounter: quest.isEncounter || false,
                roomNumber: quest.roomNumber || null,
                encounterName: quest.encounterName || null,
                isBefriend: quest.isBefriend !== undefined ? quest.isBefriend : true
            }
        );
        
        // Add blueprint rewards for quest types that award them (Organize the Stacks, Extra Credit)
        const blueprintReward = calculateBlueprintReward(quest);
        if (blueprintReward > 0) {
            reward.blueprints = blueprintReward;
            reward.receipt.base.blueprints = blueprintReward;
            reward.receipt.final.blueprints = blueprintReward;
        }
        
        return reward.getReceipt();
    } catch (error) {
        console.warn('Failed to calculate receipt preview:', error);
        return null;
    }
}

/**
 * Format buffs array for display (removes prefixes)
 * @param {Array<string>} buffs - Array of buff strings with prefixes
 * @returns {string} Formatted buff string for display
 */
export function formatBuffsForDisplay(buffs) {
    if (!buffs || buffs.length === 0) {
        return '-';
    }
    
    return buffs.map(b => {
        const decoded = decodeHtmlEntities(b.replace(/^\[(Buff|Item|Background)\] /, ''));
        return decoded;
    }).join(', ');
}

/**
 * Format quest prompt for display
 * @param {Object} quest - Quest object
 * @returns {string} Formatted prompt string
 */
export function formatQuestPrompt(quest) {
    // For Extra Credit, don't show prompt
    if (quest.type === '⭐ Extra Credit') {
        return '-';
    }
    return quest.prompt || '';
}

/**
 * Determine reward indicator and tooltip for a quest
 * @param {Object} quest - Quest object
 * @param {string} listType - 'active', 'completed', or 'discarded'
 * @param {Object} receipt - Receipt object (optional, will be calculated if needed)
 * @returns {Object} { indicator: string, tooltip: string }
 */
export function getQuestRewardIndicator(quest, listType, receipt = null) {
    const rewards = quest.rewards || {};
    
    // Calculate receipt if needed
    if (!receipt && listType === 'active' && quest.buffs && quest.buffs.length > 0) {
        receipt = calculateActiveQuestReceipt(quest);
    } else if (!receipt && listType === 'completed' && quest.receipt) {
        receipt = quest.receipt;
        // Ensure receipt has blueprints if quest rewards do (for quests completed before blueprint fix)
        if (rewards.blueprints && rewards.blueprints > 0) {
            if (!receipt.base) receipt.base = {};
            if (!receipt.final) receipt.final = {};
            if (!receipt.base.blueprints || receipt.base.blueprints === 0) {
                receipt.base.blueprints = rewards.blueprints;
            }
            if (!receipt.final.blueprints || receipt.final.blueprints === 0) {
                receipt.final.blueprints = rewards.blueprints;
            }
        }
    }
    
    // Format receipt as tooltip text
    const tooltipText = receipt ? formatReceiptTooltip(receipt, listType) : null;
    
    // Determine indicator
    let indicator = '';
    let tooltip = '';
    
    if (listType === 'active' && quest.buffs && quest.buffs.length > 0) {
        tooltip = tooltipText || 'Will receive buffs';
        indicator = '*';
    } else if (listType === 'completed' && (rewards.modifiedBy && rewards.modifiedBy.length > 0 || receipt)) {
        if (tooltipText) {
            tooltip = tooltipText;
        } else if (rewards.modifiedBy) {
            tooltip = `Modified by: ${rewards.modifiedBy.map(m => decodeHtmlEntities(m)).join(', ')}`;
        } else {
            tooltip = 'Modified';
        }
        indicator = '✓';
    }
    
    return { indicator, tooltip };
}

/**
 * Format receipt as text for tooltip display
 * @param {Object} receipt - Receipt object from Reward.getReceipt()
 * @param {string} listType - 'active' or 'completed'
 * @returns {string} Text string for tooltip
 */
export function formatReceiptTooltip(receipt, listType = 'active') {
    if (!receipt || !receipt.base) {
        return listType === 'active' ? 'Will receive buffs' : 'Modified';
    }

    const lines = [];
    
    // Base rewards
    const baseParts = [];
    if (receipt.base.xp > 0) baseParts.push(`${receipt.base.xp} XP`);
    if (receipt.base.inkDrops > 0) baseParts.push(`${receipt.base.inkDrops} Ink Drops`);
    if (receipt.base.paperScraps > 0) baseParts.push(`${receipt.base.paperScraps} Paper Scraps`);
    if (receipt.base.blueprints > 0) baseParts.push(`${receipt.base.blueprints} Blueprints`);
    
    if (baseParts.length > 0) {
        lines.push(`Base: ${baseParts.join(', ')}`);
    }
    
    // Modifiers
    if (receipt.modifiers && receipt.modifiers.length > 0) {
        lines.push('Modifiers:');
        receipt.modifiers.forEach(mod => {
            lines.push(`  • ${mod.source}: ${mod.description}`);
        });
    }
    
    // Final rewards
    const finalParts = [];
    if (receipt.final.xp > 0) finalParts.push(`${receipt.final.xp} XP`);
    if (receipt.final.inkDrops > 0) finalParts.push(`${receipt.final.inkDrops} Ink Drops`);
    if (receipt.final.paperScraps > 0) finalParts.push(`${receipt.final.paperScraps} Paper Scraps`);
    if (receipt.final.blueprints > 0) finalParts.push(`${receipt.final.blueprints} Blueprints`);
    
    if (finalParts.length > 0) {
        lines.push(`Final: ${finalParts.join(', ')}`);
    }
    
    return lines.join('\n');
}

