export class TriggerPayload {
    static questCompleted({
        questType = '',
        prompt = '',
        isEncounter = false,
        encounterName = '',
        encounterType = '',
        isBefriend = false,
        roomNumber = null,
        genre = '',
        pageCount = null,
        bookId = null,
        tags = []
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
            tags: Array.isArray(tags) ? tags : []
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
