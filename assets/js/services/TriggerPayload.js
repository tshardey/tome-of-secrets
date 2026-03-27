/** Maps UI quest type labels (Character Sheet) to canonical payload keys for conditions in JSON effects. */
export const QUEST_TYPE_CANONICAL = Object.freeze({
    '♠ Dungeon Crawl': 'dungeon_crawl',
    '♥ Organize the Stacks': 'genre_quest',
    '♣ Side Quest': 'side_quest',
    '⭐ Extra Credit': 'extra_credit'
});

export class TriggerPayload {
    static canonicalQuestType(uiQuestType) {
        return QUEST_TYPE_CANONICAL[uiQuestType] || '';
    }

    /**
     * Payload for ON_QUEST_COMPLETED. questType uses canonical keys (dungeon_crawl, genre_quest, side_quest, extra_credit).
     */
    static questCompleted({
        questType = '',
        prompt = '',
        isEncounter = false,
        encounterName = '',
        encounterType = null,
        isBefriend = false,
        roomNumber = null,
        genre = null,
        pageCount = null,
        bookId = null,
        tags = [],
        hasFamiliarEquipped = false
    } = {}) {
        return {
            questType,
            prompt,
            isEncounter,
            encounterName,
            encounterType,
            isBefriend,
            roomNumber,
            genre,
            pageCount,
            bookId,
            tags: Array.isArray(tags) ? tags : [],
            hasFamiliarEquipped: Boolean(hasFamiliarEquipped)
        };
    }

    static questDrafted({ questType = '', roomNumber = null } = {}) {
        return { questType, roomNumber };
    }

    static monthEnd({ journalEntries = 0, booksCompleted = 0, atmosphericBuffs = {} } = {}) {
        return { journalEntries, booksCompleted, atmosphericBuffs };
    }

    static monthStart({ questPoolSize = 0 } = {}) {
        return { questPoolSize };
    }

    static journalEntry({ entryCount = 0 } = {}) {
        return { entryCount };
    }
}
