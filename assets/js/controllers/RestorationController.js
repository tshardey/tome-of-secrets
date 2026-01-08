/**
 * RestorationController - Handles Library Restoration Expansion functionality
 * 
 * Manages:
 * - Restoration project completion
 * - Blueprint spending
 * - Passive slot unlocking
 * - Wing completion detection and rewards
 */

import { BaseController } from './BaseController.js';
import { restorationProjects, wings } from '../character-sheet/data.js';
import { GAME_CONFIG } from '../config/gameConfig.js';
import { 
    getWingProgress, 
    getAllWingsProgress, 
    getWingRestorationProjects,
    isWingReadyForRestoration,
    getOverallProgress,
    getAvailableProjects
} from '../restoration/wingProgress.js';

export class RestorationController extends BaseController {
    constructor(stateAdapter, form, dependencies) {
        super(stateAdapter, form, dependencies);
    }

    initialize() {
        // This controller doesn't need form element bindings like other controllers
        // It's primarily used for business logic and is called by other parts of the system
    }

    /**
     * Get current blueprint balance
     * @returns {number} Current dusty blueprints count
     */
    getBlueprints() {
        return this.stateAdapter.getDustyBlueprints();
    }

    /**
     * Award blueprints (e.g., from quest completion)
     * @param {number} amount - Amount of blueprints to award
     * @returns {number} New blueprint balance
     */
    awardBlueprints(amount) {
        return this.stateAdapter.addDustyBlueprints(amount);
    }

    /**
     * Check if player can afford a restoration project
     * @param {string} projectId - Project ID to check
     * @returns {boolean} True if player has enough blueprints
     */
    canAffordProject(projectId) {
        const project = restorationProjects[projectId];
        if (!project) return false;
        return this.getBlueprints() >= project.cost;
    }

    /**
     * Attempt to complete a restoration project
     * @param {string} projectId - Project ID to complete
     * @returns {Object} { success: boolean, error?: string, reward?: Object }
     */
    completeRestorationProject(projectId) {
        const project = restorationProjects[projectId];
        if (!project) {
            return { success: false, error: 'Project not found' };
        }

        // Check if already completed
        if (this.stateAdapter.isRestorationProjectCompleted(projectId)) {
            return { success: false, error: 'Project already completed' };
        }

        // Check if wing is ready for restoration
        if (!isWingReadyForRestoration(project.wingId)) {
            return { success: false, error: 'Wing rooms not yet completed' };
        }

        // Check if player can afford it
        if (!this.canAffordProject(projectId)) {
            return { success: false, error: 'Not enough blueprints' };
        }

        // Spend blueprints
        const spent = this.stateAdapter.spendDustyBlueprints(project.cost);
        if (!spent) {
            return { success: false, error: 'Failed to spend blueprints' };
        }

        // Mark project as completed
        this.stateAdapter.completeRestorationProject(projectId);

        // Process reward
        const reward = this.processProjectReward(projectId, project.reward);

        // Check if this completes the wing
        this.checkWingCompletion(project.wingId);

        // Save state
        this.saveState();

        return { success: true, reward };
    }

    /**
     * Process project reward (unlock passive slots, etc.)
     * @param {string} projectId - Project ID
     * @param {Object} reward - Reward configuration
     * @returns {Object} Processed reward details
     */
    processProjectReward(projectId, reward) {
        if (!reward) return null;

        const result = { type: reward.type };

        switch (reward.type) {
            case 'passiveItemSlot':
                const itemSlotId = `item-slot-${projectId}`;
                this.stateAdapter.addPassiveItemSlot(itemSlotId, projectId);
                result.slotId = itemSlotId;
                result.suggestedItems = reward.suggestedItems;
                break;

            case 'passiveFamiliarSlot':
                const familiarSlotId = `familiar-slot-${projectId}`;
                this.stateAdapter.addPassiveFamiliarSlot(familiarSlotId, projectId);
                result.slotId = familiarSlotId;
                result.suggestedItems = reward.suggestedItems;
                break;

            case 'special':
                result.description = reward.description;
                result.bonusMultiplier = reward.bonusMultiplier;
                if (reward.title) {
                    result.title = reward.title;
                }
                break;
        }

        return result;
    }

    /**
     * Check if completing this project completes the wing
     * @param {string} wingId - Wing ID to check
     */
    checkWingCompletion(wingId) {
        const completedProjects = this.stateAdapter.getCompletedRestorationProjects();
        const wingProjects = getWingRestorationProjects(wingId, completedProjects);
        
        // Check if all projects in this wing are completed
        const allCompleted = wingProjects.every(p => p.isCompleted);
        
        if (allCompleted && !this.stateAdapter.isWingCompleted(wingId)) {
            this.stateAdapter.completeWing(wingId);
            this.awardWingCompletionRewards(wingId);
        }
    }

    /**
     * Award rewards for completing a wing
     * @param {string} wingId - Completed wing ID
     */
    awardWingCompletionRewards(wingId) {
        const { ui: uiModule } = this.dependencies;
        const rewards = GAME_CONFIG.restoration.wingCompletionRewards;

        // Update currency in the UI if available
        if (uiModule && typeof uiModule.updateCurrency === 'function') {
            uiModule.updateCurrency({
                xp: rewards.xp,
                inkDrops: rewards.inkDrops,
                paperScraps: rewards.paperScraps
            });
        }

        // Note: Permanent wing bonuses are handled in the reward calculator
    }

    /**
     * Assign an item to a passive slot
     * @param {string} slotId - Slot ID
     * @param {string} itemName - Item name to assign (or null to clear)
     * @returns {Object|null} Updated slot or null if failed
     */
    assignItemToPassiveSlot(slotId, itemName) {
        // StateAdapter automatically enforces invariant: unequips item if equipped
        const result = this.stateAdapter.setPassiveSlotItem(slotId, itemName);
        if (result) {
            this.saveState();
        }
        return result;
    }

    /**
     * Assign a familiar to a passive slot
     * @param {string} slotId - Slot ID
     * @param {string} familiarName - Familiar name to assign (or null to clear)
     * @returns {Object|null} Updated slot or null if failed
     */
    assignFamiliarToPassiveSlot(slotId, familiarName) {
        // StateAdapter automatically enforces invariant: unequips familiar if equipped
        const result = this.stateAdapter.setPassiveFamiliarSlotItem(slotId, familiarName);
        if (result) {
            this.saveState();
        }
        return result;
    }

    /**
     * Get all data needed to render the library page
     * @returns {Object} Complete library state
     */
    getLibraryState() {
        const completedProjects = this.stateAdapter.getCompletedRestorationProjects();
        const completedWings = this.stateAdapter.getCompletedWings();
        const blueprints = this.getBlueprints();
        const wingsProgress = getAllWingsProgress();
        const overallProgress = getOverallProgress(completedProjects, completedWings);
        const availableProjects = getAvailableProjects(completedProjects);
        const passiveItemSlots = this.stateAdapter.getPassiveItemSlots();
        const passiveFamiliarSlots = this.stateAdapter.getPassiveFamiliarSlots();

        // Build detailed wing data
        const wingsData = {};
        for (const wingId in wings) {
            const wing = wings[wingId];
            const progress = wingsProgress[wingId];
            const projects = getWingRestorationProjects(wingId, completedProjects);
            
            wingsData[wingId] = {
                ...wing,
                progress,
                projects,
                isComplete: completedWings.includes(wingId),
                isReadyForRestoration: progress.isWingComplete
            };
        }

        return {
            blueprints,
            completedProjects,
            completedWings,
            wingsData,
            overallProgress,
            availableProjects,
            passiveItemSlots,
            passiveFamiliarSlots
        };
    }

    /**
     * Calculate total passive bonuses from equipped passive items/familiars
     * @returns {Object} Aggregated passive bonuses
     */
    calculatePassiveBonuses() {
        const { allItems } = this.dependencies.data || {};
        if (!allItems) return {};

        const bonuses = {
            inkDrops: 0,
            paperScraps: 0,
            xp: 0,
            blueprints: 0,
            multipliers: {
                inkDrops: 1,
                paperScraps: 1,
                xp: 1
            }
        };

        // Calculate from passive item slots
        const itemSlots = this.stateAdapter.getPassiveItemSlots();
        for (const slot of itemSlots) {
            if (slot.itemName && allItems[slot.itemName]) {
                const item = allItems[slot.itemName];
                if (item.passiveRewardModifier) {
                    this.applyPassiveModifier(bonuses, item.passiveRewardModifier);
                }
            }
        }

        // Calculate from passive familiar slots
        const familiarSlots = this.stateAdapter.getPassiveFamiliarSlots();
        for (const slot of familiarSlots) {
            if (slot.itemName && allItems[slot.itemName]) {
                const familiar = allItems[slot.itemName];
                if (familiar.passiveRewardModifier) {
                    this.applyPassiveModifier(bonuses, familiar.passiveRewardModifier);
                }
            }
        }

        // Apply wing completion bonuses
        const completedWings = this.stateAdapter.getCompletedWings();
        const wingBonus = GAME_CONFIG.restoration.wingPassiveBonus * completedWings.length;
        bonuses.inkDrops += wingBonus;

        // Special project bonuses are defined in restorationProjects.json
        // and applied via their reward.bonusMultiplier field when completed

        return bonuses;
    }

    /**
     * Apply a passive modifier to the bonuses object
     * @param {Object} bonuses - Bonuses accumulator
     * @param {Object} modifier - Passive reward modifier
     */
    applyPassiveModifier(bonuses, modifier) {
        if (modifier.inkDrops) {
            bonuses.inkDrops += modifier.inkDrops;
        }
        if (modifier.paperScraps) {
            bonuses.paperScraps += modifier.paperScraps;
        }
        if (modifier.xp) {
            bonuses.xp += modifier.xp;
        }
        if (modifier.blueprints) {
            bonuses.blueprints += modifier.blueprints;
        }
        if (modifier.inkDropsMultiplier) {
            bonuses.multipliers.inkDrops *= modifier.inkDropsMultiplier;
        }
        if (modifier.paperScrapsMultiplier) {
            bonuses.multipliers.paperScraps *= modifier.paperScrapsMultiplier;
        }
        if (modifier.xpMultiplier) {
            bonuses.multipliers.xp *= modifier.xpMultiplier;
        }
    }
}

