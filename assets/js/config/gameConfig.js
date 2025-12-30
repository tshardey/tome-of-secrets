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
        // Quest type base rewards
        extraCredit: {
            paperScraps: 10
        },
        organizeTheStacks: {
            xp: 15,
            inkDrops: 10
        },
        defaultQuestCompletion: {
            xp: 25,
            inkDrops: 10,
            paperScraps: 0
        },
        defaultFallback: {
            inkDrops: 10
        },
        
        // Dungeon encounter rewards
        encounter: {
            monster: {
                xp: 30
            },
            friendlyCreature: {
                inkDrops: 10
            },
            familiar: {
                paperScraps: 5
            }
        }
    },

    /**
     * End of month rewards
     */
    endOfMonth: {
        bookCompletionXP: 15, // XP per unique book completed
        journalEntry: {
            basePaperScraps: 5,
            scribeBonus: 3 // Additional paper scraps for Scribe's Acolyte background
        }
    },

    /**
     * Background bonuses
     */
    backgrounds: {
        biblioslinker: {
            dungeonCrawlPaperScraps: 10 // Bonus for completing dungeon crawls
        },
        backgroundBonus: {
            inkDrops: 15 // Bonus for Archivist, Prophet, Cartographer
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
     * Atmospheric buff configuration
     */
    atmospheric: {
        baseValue: 1,
        sanctumBonus: 2
    },

    /**
     * Library Restoration Expansion configuration
     */
    restoration: {
        // Rewards for completing all projects in a wing
        wingCompletionRewards: {
            inkDrops: 100,
            paperScraps: 40,
            xp: 75
        },
        // Permanent bonus from completing a wing (+X Ink Drops for matching genre books)
        wingPassiveBonus: 4,
        // Blueprint rewards by quest type
        extraCreditBlueprintReward: 10
    }
});

