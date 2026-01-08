/**
 * Quest Reward Service
 * 
 * Handles quest-specific reward calculations and operations.
 * Extracted from controllers to separate business logic from presentation.
 */

import * as data from '../character-sheet/data.js';
import { GAME_CONFIG } from '../config/gameConfig.js';

/**
 * Calculate blueprint reward for a completed quest
 * @param {Object} quest - Quest object with type and prompt
 * @returns {number} Blueprint reward amount
 */
export function calculateBlueprintReward(quest) {
    let blueprintReward = 0;

    if (quest.type === '♥ Organize the Stacks') {
        // Genre quest - check genreQuests for blueprint reward
        if (data.genreQuests) {
            const normalize = (value) => String(value ?? '').trim().toLowerCase();
            // Some historical prompts may include extra text like "Fantasy: Read ..."
            const extractGenreFromPrompt = (prompt) => String(prompt ?? '').split(':')[0].trim();

            const promptRaw = String(quest.prompt ?? '');
            const promptGenre = normalize(extractGenreFromPrompt(promptRaw));

            // Prefer exact genre equality (prevents substring collisions like "Fiction" vs "Speculative Fiction")
            for (const genreQuest of Object.values(data.genreQuests)) {
                if (!genreQuest) continue;
                if (promptGenre && normalize(genreQuest.genre) === promptGenre) {
                    blueprintReward = genreQuest.blueprintReward || 3;
                    break;
                }
            }

            // Fallback: if we didn't find an exact match, allow a contained match but choose the longest genre match.
            // This keeps compatibility with any prompts that include the genre inside longer text without being
            // vulnerable to "shorter genre" matches hijacking longer ones.
            if (blueprintReward === 0 && promptRaw) {
                let best = null; // { len: number, reward: number }
                const promptNorm = normalize(promptRaw);
                for (const genreQuest of Object.values(data.genreQuests)) {
                    if (!genreQuest?.genre) continue;
                    const genreNorm = normalize(genreQuest.genre);
                    if (!genreNorm) continue;
                    if (promptNorm.includes(genreNorm)) {
                        const reward = genreQuest.blueprintReward || 3;
                        if (!best || genreNorm.length > best.len) {
                            best = { len: genreNorm.length, reward };
                        }
                    }
                }
                if (best) blueprintReward = best.reward;
            }
        }
        // Default if no specific match
        if (blueprintReward === 0) {
            blueprintReward = 3;
        }
    } else if (quest.type === '⭐ Extra Credit') {
        blueprintReward = GAME_CONFIG.restoration.extraCreditBlueprintReward;
    }
    // Note: Dungeon Crawl quests do NOT award blueprints

    return blueprintReward;
}

/**
 * Apply blueprint reward to a quest's reward object and receipt
 * @param {Object} quest - Quest object (will be mutated to add blueprints)
 * @returns {number} Blueprint reward amount that was applied
 */
export function applyBlueprintRewardToQuest(quest) {
    const blueprintReward = calculateBlueprintReward(quest);
    
    if (blueprintReward > 0) {
        if (quest.rewards) {
            quest.rewards.blueprints = blueprintReward;
        }
        
        // Update receipt if it exists
        if (quest.receipt) {
            quest.receipt.base.blueprints = blueprintReward;
            quest.receipt.final.blueprints = blueprintReward;
        }
    }
    
    return blueprintReward;
}

