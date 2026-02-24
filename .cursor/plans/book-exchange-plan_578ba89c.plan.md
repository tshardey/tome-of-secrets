---
name: book-exchange-plan
overview: Implement the Book-First Paradigm to decouple books from quests and build the Exchange Program to track external reading challenges.
todos:
  - id: schema-migration
    content: "Schema v5 Migration: Add books/exchangeProgram to state, migrate existing quests to use bookId"
    status: pending
  - id: book-service
    content: "Global Book Service: Implement CRUD logic in stateAdapter and BookController"
    status: pending
  - id: book-selector-modal
    content: "Unified Book Selector Modal: Create the generic book linking UI and refactor QuestController to use it"
    status: pending
  - id: library-view
    content: "Library View: Build UI to display all books globally"
    status: pending
  - id: exchange-service
    content: "Exchange Program Controller: Implement CRUD logic for Curriculums, Categories, and Prompts"
    status: pending
  - id: exchange-ui
    content: "Exchange Builder UI: Build the UI for creating external challenges and linking books to prompts"
    status: pending
  - id: synergy-rewards
    content: "Synergy Rewards Logic: Add +5 Scraps for prompts, +10 Ink Drops for cross-pollinated books"
    status: pending
isProject: false
---

# Book-First Paradigm & Exchange Program Implementation Plan

This plan outlines the steps required to transition the Tome of Secrets app from a quest-centric book storage model to a "Book-First" paradigm, introducing a Global Library and an external curriculum tracker called the "Exchange Program."

### 1. Schema Updates & Data Migration (Schema v5)

- **State Updates**: Open `[assets/js/character-sheet/storageKeys.js](assets/js/character-sheet/storageKeys.js)` and add `BOOKS` and `EXCHANGE_PROGRAM` to `STORAGE_KEYS` and `CHARACTER_STATE_KEYS`. Initialize them as empty objects in `createEmptyCharacterState()`.
- **Migration Logic**: In `[assets/js/character-sheet/dataMigrator.js](assets/js/character-sheet/dataMigrator.js)`, implement `migrateToVersion5()`. 
  - Iterate through all quests in `activeAssignments` and `completedQuests`.
  - Extract `book`, `bookAuthor`, `coverUrl`, `pageCountRaw`, and `pageCountEffective` from each quest to create a new standalone Book entity in `characterState.books` (with a generated UUID).
  - Update the quest objects to store a `bookId` reference instead of the raw string/data fields.
  - Update the `links` object on the generated book to include `tomeQuestId`.
- **Validation**: Update `validateCharacterState()` in `[assets/js/character-sheet/dataValidator.js](assets/js/character-sheet/dataValidator.js)` to bump the schema version to 5 and validate the new fields.

### 2. Global Book Service & State Adapters

- **BookController/Service**: Create a new `[assets/js/controllers/BookController.js](assets/js/controllers/BookController.js)` (or equivalent service) to handle CRUD operations on `characterState.books`.
- **State Methods**: In `[assets/js/character-sheet/stateAdapter.js](assets/js/character-sheet/stateAdapter.js)`, add mutation methods like `addBook(bookData)`, `updateBook(bookId, updates)`, and `deleteBook(bookId)`.

### 3. Unified Book Selector Modal

- **UI Creation**: Create a new modal in `[character-sheet.html](character-sheet.html)` (or dynamically generate it) named "Assign a Book".
- **Functionality**:
  - Implement a tab for searching existing books in `characterState.books`.
  - Implement a tab for adding a new book manually.
- **Integration**: Update `[assets/js/controllers/QuestController.js](assets/js/controllers/QuestController.js)`. In `populateQuestEditDrawer()` and `handleAddQuest()`, replace the raw text inputs for Title/Author/Cover with a "Link Book" button that triggers the new Book Selector modal.

### 4. The Library View UI Refactor

- **Dashboard**: Create a "Library" view within the Grimoire (or as a separate major tab).
- **Rendering**: Update `[assets/js/character-sheet/ui.js](assets/js/character-sheet/ui.js)` to render all books from `characterState.books` grouped by status (Reading, Completed, DNF).

### 5. Exchange Program State & Service

- **Service**: Create `[assets/js/controllers/ExchangeController.js](assets/js/controllers/ExchangeController.js)`.
- **State Methods**: Add methods to `stateAdapter.js` to manage `characterState.exchangeProgram` (creating Curriculums, Categories, and Prompts). Ensure these adhere to the JSON schema outlined in the design document.

### 6. Exchange Builder UI & Dashboard

- **UI Creation**: Add an "Exchange" tab or section to the UI.
- **Form Builder**: Build DOM generators for the challenge builder, allowing users to define Curriculums, nested Categories, and Prompts.
- **Integration**: Next to each defined Prompt, place a "Link Book" button that reuses the Unified Book Selector created in Step 3.

### 7. Synergy Rewards Logic

- **Reward Handling**: In `[assets/js/controllers/QuestController.js](assets/js/controllers/QuestController.js)` (or wherever rewards are calculated upon quest completion/book linking).
- **Base Reward**: When a book is linked to an Exchange Prompt, calculate and award +5 Paper Scraps.
- **Synergy Bonus**: Implement logic to check if a single `bookId` has BOTH a populated `tomeQuestId` and at least one entry in `exchangePromptIds`. If so, award a Synergy Bonus of +10 Ink Drops.

