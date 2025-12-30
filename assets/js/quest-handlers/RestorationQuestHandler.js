/**
 * RestorationQuestHandler - Handles Restoration Project quests (🔨)
 * 
 * Restoration projects are library restoration tasks that reward passive slots
 */

import { BaseQuestHandler } from './BaseQuestHandler.js';
import { RewardCalculator, Reward } from '../services/RewardCalculator.js';
import { isWingReadyForRestoration } from '../restoration/wingProgress.js';
import { safeGetJSON } from '../utils/storage.js';
import { STORAGE_KEYS } from '../character-sheet/storageKeys.js';

export class RestorationQuestHandler extends BaseQuestHandler {
    constructor(formElements, data) {
        super(formElements, data);
        this.type = '🔨 Restoration Project';
    }

    validate() {
        const validator = this.getBaseValidator();
        const common = this.getCommonFormData();

        // Check that wing and project are selected
        const wingSelect = this.formElements.restorationWingSelect;
        const projectSelect = this.formElements.restorationProjectSelect;

        const wingId = wingSelect?.value;
        const projectId = projectSelect?.value;

        if (!wingId) {
            return {
                valid: false,
                error: 'Please select a wing.',
                errors: { 'restoration-wing-select': 'Please select a wing.' }
            };
        }

        // Validate wing is unlocked
        const wing = this.data.wings?.[wingId];
        if (!wing) {
            return {
                valid: false,
                error: 'Invalid wing selected.',
                errors: { 'restoration-wing-select': 'Invalid wing selected.' }
            };
        }

        // Check if wing is unlocked (alwaysAccessible OR all rooms completed)
        const isUnlocked = wing.alwaysAccessible || isWingReadyForRestoration(wingId);
        if (!isUnlocked) {
            return {
                valid: false,
                error: 'This wing is locked. Complete all dungeon rooms in this wing to unlock restoration projects.',
                errors: { 'restoration-wing-select': 'Wing is locked. Complete all dungeon rooms first.' }
            };
        }

        if (!projectId) {
            return {
                valid: false,
                error: 'Please select a restoration project.',
                errors: { 'restoration-project-select': 'Please select a restoration project.' }
            };
        }

        // Validate project exists and player can afford it
        const project = this.data.restorationProjects?.[projectId];
        if (!project) {
            return {
                valid: false,
                error: 'Invalid project selected.',
                errors: { 'restoration-project-select': 'Invalid project selected.' }
            };
        }

        // Check if player has enough blueprints
        const currentBlueprints = safeGetJSON(STORAGE_KEYS.DUSTY_BLUEPRINTS, 0);
        const cost = project.cost || 0;
        if (currentBlueprints < cost) {
            const needed = cost - currentBlueprints;
            return {
                valid: false,
                error: `You need ${needed} more Dusty Blueprints to start this project. (Cost: ${cost}, You have: ${currentBlueprints})`,
                errors: { 'restoration-project-select': `Need ${needed} more blueprints.` }
            };
        }

        // Check if project is already completed
        const completedProjects = safeGetJSON(STORAGE_KEYS.COMPLETED_RESTORATION_PROJECTS, []);
        if (completedProjects.includes(projectId)) {
            return {
                valid: false,
                error: 'This restoration project has already been completed.',
                errors: { 'restoration-project-select': 'Project already completed.' }
            };
        }

        const result = validator.validate(common);
        
        if (!result.valid) {
            const firstError = Object.values(result.errors)[0];
            return {
                ...result,
                error: firstError
            };
        }

        return { ...result, error: null };
    }

    createQuests() {
        const common = this.getCommonFormData();
        
        const wingSelect = this.formElements.restorationWingSelect;
        const projectSelect = this.formElements.restorationProjectSelect;
        
        const wingId = wingSelect?.value;
        const projectId = projectSelect?.value;
        
        if (!wingId || !projectId || !this.data.restorationProjects) {
            return [];
        }

        const project = this.data.restorationProjects[projectId];
        const wing = this.data.wings?.[wingId];
        
        if (!project) return [];

        // Build the prompt from the project's completion prompt
        const prompt = `${project.name}: ${project.completionPrompt}`;

        // Restoration projects don't have standard rewards (XP, Ink Drops, etc.)
        // Instead they unlock passive slots
        const rewards = new Reward({
            xp: 0,
            inkDrops: 0,
            paperScraps: 0,
            blueprints: 0,
            items: []
        });

        const quest = {
            month: common.month,
            year: common.year,
            type: this.type,
            prompt: prompt,
            book: common.book,
            bookAuthor: common.bookAuthor,
            notes: common.notes,
            rewards: rewards,
            buffs: common.selectedBuffs,
            // Store restoration-specific data for completion handling
            restorationData: {
                wingId: wingId,
                wingName: wing?.name || '',
                projectId: projectId,
                projectName: project.name,
                cost: project.cost || 0,
                rewardType: project.reward?.type || null,
                rewardSuggestedItems: project.reward?.suggestedItems || []
            }
        };

        // For active quests, just convert to JSON
        if (common.status === 'active') {
            return [this.questsToJSON([quest])[0]];
        }

        // For completed quests, apply modifiers and mark project complete
        if (common.status === 'completed') {
            return this.processCompletedQuests([quest], common.selectedBuffs, common.background, common.wizardSchool);
        }

        return [this.questsToJSON([quest])[0]];
    }

    getFieldMap() {
        return {
            ...super.getFieldMap(),
            'restoration-wing-select': this.formElements.restorationWingSelect,
            'restoration-project-select': this.formElements.restorationProjectSelect
        };
    }
}

