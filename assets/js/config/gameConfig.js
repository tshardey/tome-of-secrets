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
        bookCompletionXP: 15, // XP per unique book completed
        // Level 6 permanent bonus (player-facing text: permanentBonuses.json key "6").
        // At or above `minLevel`, a book of `minPages` pages or more earns `bonusXP` on top of
        // bookCompletionXP, paid with it (same once-per-book rule and monthly book cap).
        novicesFocus: {
            name: "Novice's Focus",
            minLevel: 6,
            minPages: 300,
            bonusXP: 5
        }
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
        sanctumBonus: 2,
        // Level 7 permanent bonus (player-facing text: permanentBonuses.json key "7").
        // At or above `minLevel`, every paying atmospheric buff day earns `bonusPerDay` more,
        // on the same days as the Tome-Bound Cat bonus and stacking with it.
        focusedAtmosphere: {
            name: 'Focused Atmosphere',
            minLevel: 7,
            bonusPerDay: 1
        }
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
