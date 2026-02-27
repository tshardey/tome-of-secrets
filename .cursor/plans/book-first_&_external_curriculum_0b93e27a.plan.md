---
name: Book-First & External Curriculum
overview: "Rewrite the Book-First Paradigm plan from scratch: make books first-class objects with a Library tab, refactor quests/restoration to pull from the library, add an External Curriculum tab with batch prompt entry, and implement book-completion cascading -- all with comprehensive tests."
todos:
  - id: phase-1-state
    content: "Phase 1: State layer -- rename constant, add book/curriculum CRUD methods to stateAdapter, review validator and migrator, write bookState.test.js and externalCurriculumState.test.js"
    status: completed
  - id: phase-2-library-tab
    content: "Phase 2: Library tab UI -- add tab HTML to character-sheet.md, create LibraryController.js with add/edit/search/render, wire into character-sheet.js, write libraryController.test.js"
    status: completed
  - id: phase-3-book-selector
    content: "Phase 3: Book selector component -- create bookSelector.js reusable dropdown, write bookSelector.test.js"
    status: completed
  - id: phase-4-quest-integration
    content: "Phase 4: Quest integration -- refactor QuestController to use book selector, move API search to Library, update quest tests"
    status: completed
  - id: phase-5-cascade
    content: "Phase 5: Book completion cascade -- implement markBookComplete cascade (quests, restoration, curriculum), synergy rewards, write bookCompletionCascade.test.js"
    status: completed
  - id: phase-6-curriculum-tab
    content: "Phase 6: External Curriculum tab -- add tab HTML, create ExternalCurriculumController.js with batch prompt entry, wire into character-sheet.js, write externalCurriculumController.test.js"
    status: pending
  - id: phase-7-legacy-migration
    content: "Phase 7: Legacy migration -- review/fix migrateToVersion5 for full book model, deduplication, status inference, update dataValidation.test.js"
    status: pending
isProject: false
---

# Book-First Paradigm & External Curriculum

## Current State (clean branch)

The following **already exists** from schema v5 groundwork:

- `STORAGE_KEYS.BOOKS` / `STORAGE_KEYS.EXCHANGE_PROGRAM` in `[assets/js/character-sheet/storageKeys.js](assets/js/character-sheet/storageKeys.js)` (lines 30-31)
- `migrateToVersion5()` in `[assets/js/character-sheet/dataMigrator.js](assets/js/character-sheet/dataMigrator.js)` -- extracts book data from legacy quests into `books` state
- `validateBook()` / `validateExchangeProgram()` in `[assets/js/character-sheet/dataValidator.js](assets/js/character-sheet/dataValidator.js)`
- `BookMetadataService.js` in `[assets/js/services/BookMetadataService.js](assets/js/services/BookMetadataService.js)` -- OpenLibrary + Google Books API search

**Missing** (what the previous agent failed to land): controllers, tabs, state adapter methods, book selector, UI, and all tests.

---

## Book Data Model

```javascript
{
  id: string,              // UUID
  title: string,           // Required
  author: string,          // Optional
  cover: string | null,    // URL or data-URL
  pageCount: number | null,
  status: 'reading' | 'completed' | 'other',
  dateAdded: string,       // ISO date
  dateCompleted: string | null,
  links: {
    questIds: string[],
    curriculumPromptIds: string[]
  }
}
```

## External Curriculum Data Model

Rename the UI constant from `EXCHANGE_PROGRAM` to `EXTERNAL_CURRICULUM` (keep the persisted string `'exchangeProgram'` for backward compatibility).

```javascript
{
  curriculums: {
    [curriculumId]: {
      id: string,
      name: string,
      categories: {
        [categoryId]: {
          id: string,
          name: string,
          prompts: {
            [promptId]: {
              id: string,
              text: string,
              bookId: string | null,
              completedAt: string | null
            }
          }
        }
      }
    }
  }
}
```

---

## Phase 1: State Layer -- Book & Curriculum CRUD

**Files to modify:**

- `[assets/js/character-sheet/storageKeys.js](assets/js/character-sheet/storageKeys.js)` -- rename `EXCHANGE_PROGRAM` constant to `EXTERNAL_CURRICULUM` (keep string value `'exchangeProgram'`)
- `[assets/js/character-sheet/stateAdapter.js](assets/js/character-sheet/stateAdapter.js)` -- add methods:
  - Book: `addBook(bookData)`, `updateBook(bookId, updates)`, `deleteBook(bookId)`, `getBook(bookId)`, `getBooks()`, `getBooksByStatus(status)`, `markBookComplete(bookId)` (cascade logic in Phase 5)
  - Curriculum: `addCurriculum(name)`, `updateCurriculum(id, updates)`, `deleteCurriculum(id)`, `addCategory(curriculumId, name)`, `addPrompts(curriculumId, categoryId, promptTexts[])` (batch!), `linkBookToPrompt(promptId, bookId)`, `markPromptComplete(promptId)`
  - Add `BOOKS_CHANGED` and `EXTERNAL_CURRICULUM_CHANGED` events

**Files to modify:**

- `[assets/js/character-sheet/dataValidator.js](assets/js/character-sheet/dataValidator.js)` -- review `validateBook()` to enforce the full data model (status enum, links object, etc.) and flesh out `validateExchangeProgram()` for the nested curriculum/category/prompt structure
- `[assets/js/character-sheet/dataMigrator.js](assets/js/character-sheet/dataMigrator.js)` -- review `migrateToVersion5()` to ensure legacy quest books get proper `status`, `links`, and `dateAdded`

**New test file:** `tests/bookState.test.js` -- test all book CRUD, validation, and migration
**New test file:** `tests/externalCurriculumState.test.js` -- test all curriculum CRUD, validation, batch prompt add

---

## Phase 2: Library Tab UI

**Tab order:** Character - Abilities - Inventory - Environment - **Library** - Quests - Restoration - **External Curriculum** - Archived - Curses

**Files to modify:**

- `[character-sheet.md](character-sheet.md)` -- add Library tab panel HTML:
  - "Add a Book" form: title input with live API search (reuse `BookMetadataService`), optional author, cover (URL + upload), page count, status radio (reading/completed/other)
  - Book cards grouped by status sections (Reading, Completed, Other)
  - Each card: cover thumbnail, title, author, page count, status badge, "Mark Complete" button, "Edit" button
  - Edit Book drawer (not a popup): title, author, cover (URL + upload), page count, status dropdown, linked quests/prompts read-only list, Save/Cancel

**New file:** `[assets/js/controllers/LibraryController.js](assets/js/controllers/LibraryController.js)`

- Extends `BaseController`
- `initialize()`: render book cards, bind add-book form, bind search
- `handleAddBook()`: validate, call `stateAdapter.addBook()`, re-render
- `handleEditBook(bookId)`: open edit drawer populated with book data
- `handleSaveBookEdit()`: call `stateAdapter.updateBook()`, close drawer
- `handleMarkComplete(bookId)`: call `stateAdapter.markBookComplete()`, re-render
- `renderBooks()`: group by status, render cards

**Modify:** `[assets/js/character-sheet.js](assets/js/character-sheet.js)` -- instantiate and initialize `LibraryController`

**New test file:** `tests/libraryController.test.js`

---

## Phase 3: Book Selector Component

A reusable inline component (not a modal/popup) for linking a book to a quest or curriculum prompt.

**New file:** `[assets/js/utils/bookSelector.js](assets/js/utils/bookSelector.js)`

- Renders a dropdown of books from the library, optionally filtered by status
- "Link Book" button or inline dropdown in quest/curriculum forms
- Shows selected book's cover thumbnail + title
- Option to unlink

**New test file:** `tests/bookSelector.test.js`

---

## Phase 4: Quest Integration

Refactor quests to pull books from the Library instead of storing title/author directly.

**Files to modify:**

- `[character-sheet.md](character-sheet.md)` -- replace quest add form's "Book Title" / "Book Author" fields with the book selector component; replace quest edit drawer book fields with book selector
- `[assets/js/controllers/QuestController.js](assets/js/controllers/QuestController.js)`:
  - Add-quest flow: select a book from library instead of typing title/author
  - Edit-quest drawer: show linked book (via book selector), remove raw title/author/cover/pageCount fields
  - Preserve read-only display of legacy `quest.book`/`quest.bookAuthor` for quests that predate migration
  - The API search moves out of quest drawer and into Library tab's "Add a Book" form
- Restoration quest creation: when adding a restoration quest, use book selector to link a book

**Modify existing tests:** `tests/questEditDrawer.test.js`, `tests/questHandlers.test.js` -- update for book selector integration

---

## Phase 5: Book Completion Cascade

When `markBookComplete(bookId)` is called:

1. Set `book.status = 'completed'`, `book.dateCompleted = now`
2. For each `questId` in `book.links.questIds`: move quest from active to completed (call existing `stateAdapter.moveQuest()`)
3. For each `promptId` in `book.links.curriculumPromptIds`: set `prompt.completedAt = now`
4. For restoration quests in the linked quests: trigger `handleRestorationProjectCompletion()` flow

**Synergy rewards:**

- +5 Paper Scraps when a book is linked to a curriculum prompt
- +10 Ink Drops when a book has both `questIds` and `curriculumPromptIds` populated

**Implement in:** `[assets/js/character-sheet/stateAdapter.js](assets/js/character-sheet/stateAdapter.js)` `markBookComplete()` method

**New test file:** `tests/bookCompletionCascade.test.js` -- test all cascade scenarios (quest only, curriculum only, both, restoration)

---

## Phase 6: External Curriculum Tab

**Files to modify:**

- `[character-sheet.md](character-sheet.md)` -- add External Curriculum tab panel HTML:
  - "Add Curriculum" form (inline card, not popup)
  - For each curriculum: name (editable), list of categories
  - For each category: name (editable), list of prompts, **"Add Prompts" textarea** (one per line for batch entry per requirement #8)
  - Each prompt: text, linked book (book selector dropdown), completed badge
  - Completed prompts: checkmark + muted styling (no strikethrough)
  - Delete curriculum / category / prompt buttons

**New file:** `[assets/js/controllers/ExternalCurriculumController.js](assets/js/controllers/ExternalCurriculumController.js)`

- Extends `BaseController`
- `initialize()`: render curriculums, bind form events
- `handleAddCurriculum()`: inline form submission
- `handleAddCategory(curriculumId)`: inline form
- `handleAddPrompts(curriculumId, categoryId)`: parse textarea, call `stateAdapter.addPrompts()` (batch)
- `handleLinkBook(promptId)`: open book selector dropdown
- `renderCurriculums()`: nested render of curriculum > category > prompt

**Modify:** `[assets/js/character-sheet.js](assets/js/character-sheet.js)` -- instantiate and initialize `ExternalCurriculumController`

**New test file:** `tests/externalCurriculumController.test.js`

---

## Phase 7: Legacy Data Migration

Ensure `migrateToVersion5()` in `[assets/js/character-sheet/dataMigrator.js](assets/js/character-sheet/dataMigrator.js)` handles:

- Quests with `book`/`bookAuthor`/`coverUrl`/`pageCountRaw`: create Book object, set `status: 'completed'` for completed quests and `status: 'reading'` for active quests, populate `links.questIds`
- Assign UUIDs to quests missing `id` field
- Restoration quests: link their books properly
- Deduplicate books by title+author (same book across multiple quests)

**Modify existing tests:** `tests/dataValidation.test.js` -- add migration test cases for legacy data

---

## UI Principles (Requirement #9)

- No `alert()`, `confirm()`, or `prompt()` dialogs anywhere in new code
- Add Book: inline form in Library tab
- Edit Book: right-side drawer (same pattern as quest edit drawer)
- Add Curriculum/Category/Prompts: inline expandable forms or editable cards
- Book Selector: inline dropdown, not a modal
- All new CSS goes in `[assets/css/character-sheet.css](assets/css/character-sheet.css)` following existing Dark Academia theme

---

## Files Summary


| Action | File                                                                                           |
| ------ | ---------------------------------------------------------------------------------------------- |
| Modify | `storageKeys.js`, `stateAdapter.js`, `dataValidator.js`, `dataMigrator.js`                     |
| Modify | `character-sheet.md`, `character-sheet.js`, `character-sheet.css`                              |
| Modify | `QuestController.js`                                                                           |
| Create | `LibraryController.js`, `ExternalCurriculumController.js`, `bookSelector.js`                   |
| Create | `tests/bookState.test.js`, `tests/libraryController.test.js`, `tests/bookSelector.test.js`     |
| Create | `tests/externalCurriculumState.test.js`, `tests/externalCurriculumController.test.js`          |
| Create | `tests/bookCompletionCascade.test.js`                                                          |
| Modify | `tests/dataValidation.test.js`, `tests/questEditDrawer.test.js`, `tests/questHandlers.test.js` |


