/**
 * Game Configuration
 * Centralized configuration for reward values, bonuses, and game constants.
 * This makes it easy to adjust game balance without hunting through code.
 */

export const GAME_CONFIG = Object.freeze({
    /**
     * Base reward values for quest types
     */
    rewards: {
        // Every completed quest pays this flat dollar base, whatever its type.
        questBase: {
            dollars: 15
        },
        // A second quest cleared by the same book through an ability pays this base instead.
        secondaryQuestBase: {
            dollars: 10
        },

        // Quest type XP bases (dollars always come from questBase)
        organizeTheStacks: {
            xp: 15
        },
        defaultQuestCompletion: {
            xp: 25
        },

        // Dungeon encounter rewards
        encounter: {
            monster: {
                xp: 30
            }
        }
    },

    /**
     * End of month rewards
     */
    endOfMonth: {
        bookCompletionXP: 15 // XP per unique book completed
    },

    /**
     * UI and storage configuration
     */
    ui: {
        tabPersistenceKey: 'activeCharacterTab',
        notificationDuration: 5000
    },

    /**
     * Atmospheric buff configuration.
     * Each active buff pays `baseValue` dollars per active day; a buff associated with
     * the chosen sanctum pays `sanctumBonus` per day in total. `resource` keeps the
     * currency a single knob rather than a value hardcoded across calculator and view model.
     */
    atmospheric: {
        resource: 'dollars',
        baseValue: 1,
        sanctumBonus: 2
    },

    /**
     * Once-per-month activated exchanges (cooldowns gated through effectCooldowns).
     */
    activations: {
        // Transmutation school: 20 Blueprints -> $2, or $2 -> 20 Blueprints
        transmutation: {
            blueprints: 20,
            dollars: 2
        },
        // Philosopher's Stone: sacrifice 50 XP for $5
        philosophersStone: {
            xpCost: 50,
            dollars: 5
        }
    },

    /**
     * Library Restoration Expansion configuration
     */
    restoration: {
        // Rewards for completing all projects in a wing
        wingCompletionRewards: {
            dollars: 25,
            xp: 75
        },
        // Blueprint rewards by quest type
        extraCreditBlueprintReward: 10
    }
});


/**
 * Mastery abilities that let one library book clear a second quest.
 * A keeper who knows one of these may link a book to two quests; the second pays
 * GAME_CONFIG.rewards.secondaryQuestBase instead of questBase.
 */
export const MULTI_QUEST_ABILITIES = Object.freeze(['Quick Shot', 'Irresistible Charm', 'Concussive Blast']);
