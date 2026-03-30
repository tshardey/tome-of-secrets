export const STORAGE_KEYS = Object.freeze({
    CHARACTER_SHEET_FORM: 'characterSheet',
    ACTIVE_ASSIGNMENTS: 'activeAssignments',
    COMPLETED_QUESTS: 'completedQuests',
    DISCARDED_QUESTS: 'discardedQuests',
    EQUIPPED_ITEMS: 'equippedItems',
    INVENTORY_ITEMS: 'inventoryItems',
    LEARNED_ABILITIES: 'learnedAbilities',
    ATMOSPHERIC_BUFFS: 'atmosphericBuffs',
    ACTIVE_CURSES: 'activeCurses',
    COMPLETED_CURSES: 'completedCurses',
    TEMPORARY_BUFFS: 'temporaryBuffs',
    BUFF_MONTH_COUNTER: 'buffMonthCounter',
    MONTHLY_COMPLETED_BOOKS: 'monthlyCompletedBooks',
    SELECTED_GENRES: 'selectedGenres',
    GENRE_DICE_SELECTION: 'genreDiceSelection',
    SHELF_BOOK_COLORS: 'shelfBookColors',
    // Library Restoration Expansion
    DUSTY_BLUEPRINTS: 'dustyBlueprints',
    COMPLETED_RESTORATION_PROJECTS: 'completedRestorationProjects',
    COMPLETED_WINGS: 'completedWings',
    PASSIVE_ITEM_SLOTS: 'passiveItemSlots',
    PASSIVE_FAMILIAR_SLOTS: 'passiveFamiliarSlots',
    // Dungeon room rewards (Phase 3.1)
    CLAIMED_ROOM_REWARDS: 'claimedRoomRewards',
    DUNGEON_COMPLETION_DRAWS_REDEEMED: 'dungeonCompletionDrawsRedeemed',
    // Archive UI preferences
    ARCHIVE_CARD_FACE_MODE: 'archiveCardFaceMode',
    ARCHIVE_GROUP_BY: 'archiveGroupBy', // 'month' | 'type'
    // Collapsible panel state (Add Book, Active Temporary Buffs, Draw Quest Cards)
    COLLAPSED_PANELS: 'characterSheetCollapsedPanels',
    // Book-First Paradigm (Schema v5)
    BOOKS: 'books',
    /** Persisted as 'exchangeProgram' for backward compatibility; UI name is External Curriculum. */
    EXTERNAL_CURRICULUM: 'exchangeProgram',
    // The Archive – series tracker (Phase 6)
    SERIES: 'series',
    /** Series IDs for which the keeper has claimed the completion (souvenir) reward. */
    CLAIMED_SERIES_REWARDS: 'claimedSeriesRewards',
    /** Expedition progress: [{ seriesId, stopId, claimedAt }] — which series have advanced the shared track. */
    SERIES_EXPEDITION_PROGRESS: 'seriesExpeditionProgress',
    // Shopping & book box tracking (rewards overhaul)
    SHOPPING_LOG: 'shoppingLog',
    BOOK_BOX_SUBSCRIPTIONS: 'bookBoxSubscriptions',
    BOOK_BOX_HISTORY: 'bookBoxHistory',
    // Curse tab – Worn Page mitigation helpers (usage and cooldown per source)
    CURSE_HELPER_STATE: 'curseHelperState',
    // Quest tab – monthly draw / dice helpers (usage and cooldown per source)
    QUEST_DRAW_HELPER_STATE: 'questDrawHelperState',
    /** UI preference: auto-consume first eligible helper on deck click (one helper per click). */
    QUEST_DRAW_HELPER_SETTINGS: 'questDrawHelperSettings',
    /** Last-used calendar period for TCG effect cooldowns (e.g. monthly PREVENT worn_page). */
    EFFECT_COOLDOWNS: 'effectCooldowns'
});

export const CHARACTER_STATE_KEYS = Object.freeze([
    STORAGE_KEYS.LEARNED_ABILITIES,
    STORAGE_KEYS.EQUIPPED_ITEMS,
    STORAGE_KEYS.INVENTORY_ITEMS,
    STORAGE_KEYS.ACTIVE_ASSIGNMENTS,
    STORAGE_KEYS.COMPLETED_QUESTS,
    STORAGE_KEYS.DISCARDED_QUESTS,
    STORAGE_KEYS.ATMOSPHERIC_BUFFS,
    STORAGE_KEYS.ACTIVE_CURSES,
    STORAGE_KEYS.COMPLETED_CURSES,
    STORAGE_KEYS.TEMPORARY_BUFFS,
    STORAGE_KEYS.BUFF_MONTH_COUNTER,
    STORAGE_KEYS.SELECTED_GENRES,
    STORAGE_KEYS.GENRE_DICE_SELECTION,
    STORAGE_KEYS.SHELF_BOOK_COLORS,
    // Library Restoration Expansion
    STORAGE_KEYS.DUSTY_BLUEPRINTS,
    STORAGE_KEYS.COMPLETED_RESTORATION_PROJECTS,
    STORAGE_KEYS.COMPLETED_WINGS,
    STORAGE_KEYS.PASSIVE_ITEM_SLOTS,
    STORAGE_KEYS.PASSIVE_FAMILIAR_SLOTS,
    STORAGE_KEYS.CLAIMED_ROOM_REWARDS,
    STORAGE_KEYS.DUNGEON_COMPLETION_DRAWS_REDEEMED,
    STORAGE_KEYS.BOOKS,
    STORAGE_KEYS.EXTERNAL_CURRICULUM,
    STORAGE_KEYS.SERIES,
    STORAGE_KEYS.CLAIMED_SERIES_REWARDS,
    STORAGE_KEYS.SERIES_EXPEDITION_PROGRESS,
    STORAGE_KEYS.SHOPPING_LOG,
    STORAGE_KEYS.BOOK_BOX_SUBSCRIPTIONS,
    STORAGE_KEYS.BOOK_BOX_HISTORY,
    STORAGE_KEYS.CURSE_HELPER_STATE,
    STORAGE_KEYS.QUEST_DRAW_HELPER_STATE,
    STORAGE_KEYS.QUEST_DRAW_HELPER_SETTINGS,
    STORAGE_KEYS.EFFECT_COOLDOWNS
]);

export function createEmptyCharacterState() {
    return {
        [STORAGE_KEYS.LEARNED_ABILITIES]: [],
        [STORAGE_KEYS.EQUIPPED_ITEMS]: [],
        [STORAGE_KEYS.INVENTORY_ITEMS]: [],
        [STORAGE_KEYS.ACTIVE_ASSIGNMENTS]: [],
        [STORAGE_KEYS.COMPLETED_QUESTS]: [],
        [STORAGE_KEYS.DISCARDED_QUESTS]: [],
        [STORAGE_KEYS.ATMOSPHERIC_BUFFS]: {},
        [STORAGE_KEYS.ACTIVE_CURSES]: [],
        [STORAGE_KEYS.COMPLETED_CURSES]: [],
        [STORAGE_KEYS.TEMPORARY_BUFFS]: [],
        [STORAGE_KEYS.BUFF_MONTH_COUNTER]: 0,
        [STORAGE_KEYS.SELECTED_GENRES]: [],
        [STORAGE_KEYS.GENRE_DICE_SELECTION]: 'd6',
        [STORAGE_KEYS.SHELF_BOOK_COLORS]: [],
        // Library Restoration Expansion
        [STORAGE_KEYS.DUSTY_BLUEPRINTS]: 0,
        [STORAGE_KEYS.COMPLETED_RESTORATION_PROJECTS]: [],
        [STORAGE_KEYS.COMPLETED_WINGS]: [],
        [STORAGE_KEYS.PASSIVE_ITEM_SLOTS]: [],
        [STORAGE_KEYS.PASSIVE_FAMILIAR_SLOTS]: [],
        [STORAGE_KEYS.CLAIMED_ROOM_REWARDS]: [],
        [STORAGE_KEYS.DUNGEON_COMPLETION_DRAWS_REDEEMED]: 0,
        [STORAGE_KEYS.BOOKS]: {},
        [STORAGE_KEYS.EXTERNAL_CURRICULUM]: { curriculums: {} },
        [STORAGE_KEYS.SERIES]: {},
        [STORAGE_KEYS.CLAIMED_SERIES_REWARDS]: [],
        [STORAGE_KEYS.SERIES_EXPEDITION_PROGRESS]: [],
        [STORAGE_KEYS.SHOPPING_LOG]: [],
        [STORAGE_KEYS.BOOK_BOX_SUBSCRIPTIONS]: {},
        [STORAGE_KEYS.BOOK_BOX_HISTORY]: [],
        [STORAGE_KEYS.CURSE_HELPER_STATE]: {},
        [STORAGE_KEYS.QUEST_DRAW_HELPER_STATE]: {},
        [STORAGE_KEYS.QUEST_DRAW_HELPER_SETTINGS]: { autoApplyOnDraw: false },
        [STORAGE_KEYS.EFFECT_COOLDOWNS]: {}
    };
}

/**
 * Default shape for curse helper state.
 * Keys: stable source IDs (assigned at runtime from character + data).
 * Values: { used: boolean, cooldownCyclesRemaining?: number }
 * - used: whether the helper has been marked used this period
 * - cooldownCyclesRemaining: for every-2-months cadence, cycles until next restore (0 = available)
 */
export const CURSE_HELPER_STATE_DEFAULT = Object.freeze({});

