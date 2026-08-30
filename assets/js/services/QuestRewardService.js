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
 * Apply the blueprint reward to a quest's reward object and receipt.
 *
 * Additive by design: `calculateBlueprintReward()` returns the *catalog base* for quest
 * types that carry one outside their rewards object (genre quests, extra credit), while
 * `quest.rewards.blueprints` already holds whatever the ADR-003 pipeline resolved —
 * the side quest's authored base plus any item ADD_FLAT bonuses. Overwriting instead of
 * adding would discard the item bonus; adding a '♣ Side Quest' branch to
 * calculateBlueprintReward() would double-count the authored base, which
 * RewardCalculator._getSideQuestRewards() has already put into the Reward.
 *
 * @param {Object} quest - Quest object (mutated: rewards.blueprints and receipt totals)
 * @returns {number} Total blueprints the quest pays
 */
export function applyBlueprintRewardToQuest(quest) {
    const catalogBase = calculateBlueprintReward(quest);
    const resolved = Number(quest?.rewards?.blueprints) || 0;
    const total = resolved + catalogBase;

    if (quest.rewards) {
        quest.rewards.blueprints = total;
    }

    if (quest.receipt) {
        quest.receipt.base.blueprints = (Number(quest.receipt.base.blueprints) || 0) + catalogBase;
        quest.receipt.final.blueprints = total;
    }

    return total;
}

