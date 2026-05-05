
## Goal

Allow users to link an existing active quest (with no book) to a book, or create an Extra Credit quest linked to a book, from both the library book card and the book edit drawer.

## Architecture

Two new UI entry points trigger shared quest-linking logic. The library card gets a "Link Quest" button that opens a popover with two actions. The book edit drawer's existing read-only links section becomes interactive with the same two actions plus an unlink capability. No data model changes — the existing `quest.bookId` and `book.links.questIds` fields are used.

## Scope Boundaries

- Only Extra Credit quests can be created from this flow. Other quest types are out of scope.
- Only active quests with no `bookId` are eligible for linking.
- Unlinking is available only in the book edit drawer (not the card popover).

---

## 1. Library Card — "Link Quest" Button & Popover

A new button appears in `.library-card-actions` alongside the existing Mark Complete and Edit buttons. Uses a link/chain icon style consistent with the existing emoji-based buttons.

Clicking opens a **popover** positioned below the button, styled to match the existing `.book-selector-dropdown` pattern (`#2a231d` background, `#54483b` border, box-shadow).

### Popover contents

1. **"Link Active Quest"** section — Scrollable list of active quests where `bookId` is null/undefined. Each option shows:
   - Small quest poster/cover thumbnail (from `coverUrl`, if present)
   - Quest type emoji
   - Quest prompt text, truncated
   - Clicking an option immediately links the quest to this book and closes the popover.
   - If no unlinked quests exist, shows "No unlinked quests" in muted text, non-interactive.

2. **"Create Extra Credit Quest"** button — One-click. Creates an Extra Credit quest linked to this book with auto-populated month/year from current date, hardcoded prompt (`'Book read outside of quest pool'`), no user input required.

### Popover behavior

- Closes on outside click or Escape key.
- Positioned below the button; if near viewport edge, adjusts upward.

---

## 2. Book Edit Drawer — Interactive Links Section

The existing `#book-edit-links-section` changes from read-only to interactive. It is **always visible** (currently hidden when no links exist).

### Linked quests list

Each linked quest rendered as a compact row:
- Quest type emoji + prompt text (truncated)
- Small "unlink" button (x icon) on the right
- Clicking unlink removes the `bookId` from the quest, calls `unlinkQuestFromBook()`, and refreshes the list.
- If no quests are linked, shows "No linked quests" in muted text.

### Action buttons

Below the linked quests list, two buttons:

1. **"Link Active Quest"** — Opens a dropdown (same style as the popover quest list) of unlinked active quests with poster thumbnail + prompt. Selecting one links it and refreshes the list.
2. **"Create Extra Credit Quest"** — One-click, same behavior as the card popover version.

---

## 3. Shared Logic

Three shared functions handle the core operations, consumed by both the popover and the drawer:

### `getUnlinkedActiveQuests()`
- Reads `ACTIVE_ASSIGNMENTS` from state.
- Filters to quests where `bookId` is null or undefined.
- Returns array of `{ id, type, prompt, coverUrl }`.

### `linkExistingQuestToBook(questId, bookId, stateAdapter)`
- Looks up the quest in `ACTIVE_ASSIGNMENTS` by ID.
- Sets `quest.bookId = bookId`.
- Populates `quest.book` and `quest.bookAuthor` from the library book.
- Populates `quest.coverUrl` from the book's cover if available.
- Calls `stateAdapter.linkQuestToBook(bookId, questId)` for bidirectional link.
- Saves state.

### `createExtraCreditForBook(bookId, stateAdapter, dependencies)`
- Looks up book from library.
- Determines current month/year from `new Date()`.
- Creates Extra Credit quest using `ExtraCreditHandler` logic:
  - `type: '⭐ Extra Credit'`
  - `prompt: 'Book read outside of quest pool'`
  - `bookId`, `book` (title), `bookAuthor` (author)
  - `coverUrl` from book cover
  - `month`, `year` from current date
  - `buffs: []`, `notes: ''`
  - Computes rewards via `RewardCalculator.getBaseRewards()`
- Adds quest to `ACTIVE_ASSIGNMENTS`.
- Calls `stateAdapter.linkQuestToBook(bookId, questId)`.
- Saves state.

---

## 4. Post-Action Effects

After any link, unlink, or create action:

- **Toast notification** — Success message (e.g., "Quest linked to [Book Title]", "Extra Credit quest created") or error if something fails.
- **Card refresh** — If triggered from the library card popover, re-render the affected book card to reflect the new link count (if visually indicated).
- **Drawer refresh** — If triggered from the book edit drawer, refresh the links section to show updated list.
- **State persistence** — Immediate save via `stateAdapter`.

---

## 5. Testing

- **Unit tests for shared logic**: `getUnlinkedActiveQuests` filtering, `linkExistingQuestToBook` bidirectional link setup, `createExtraCreditForBook` quest structure.
- **Rendering tests for popover**: Shows unlinked quests, shows "no unlinked quests" when empty, handles click to link.
- **Rendering tests for drawer links section**: Shows linked quests, unlink button works, action buttons trigger correct flows.
- **Integration**: Linking from popover updates drawer if open; creating Extra Credit from drawer shows in active quests.
