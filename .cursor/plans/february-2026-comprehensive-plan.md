---
name: February 2026 Comprehensive Development Plan
overview: Consolidated plan integrating all February 2026 feature plans, organized into 7 phases with dependencies tracked in Beads
created: 2026-02-02
beads_initialized: true
---

# February 2026 Comprehensive Development Plan

This plan consolidates four separate planning documents into a unified roadmap for February 2026 development. All tasks are tracked in Beads with proper dependencies.

## Plan Sources

This comprehensive plan integrates:
1. **feb-2026-feature-plan_3e0c52d9.plan.md** - Modular component-grouped implementation
2. **february_2026_feature_development_plan_43c3d2fe.plan.md** - Detailed phased development plan
3. **february_2026_expansion_plan_the_grimoire_&_refinements_20d94d6a.plan.md** - Grimoire expansion focus
4. **website_features_development_plan_33e74179.plan.md** - Website features organization

## Architecture Principles

All development follows the established patterns from [EXTENDING-THE-CODEBASE.md](project-docs/EXTENDING-THE-CODEBASE.md):

- **Services**: Pure functions, no side effects, testable
- **View Models**: Transform state + services → UI data
- **UI Renderers**: Pure rendering, accept view models
- **Controllers**: Handle user interactions, use StateAdapter
- **State Management**: Always use StateAdapter, never direct mutation
- **Storage Keys**: Add to `storageKeys.js`, include in `CHARACTER_STATE_KEYS`
- **Validation**: Add validators in `dataValidator.js` for all new state
- **Testing**: Add tests for all new functionality (90%+ coverage target)

**Backend Decision**: No new backend required. All features use:
- LocalStorage/IndexedDB for persistence
- Supabase JSON sync (existing infrastructure)
- OpenLibrary public API for book covers (no API key needed)

## Phase Overview

```
Phase 1: Bug Fixes & Quick Wins (Foundation)
  ├─ Fix bookshelf initialization bug (#69)
  ├─ Filter atmospheric buff items from monthly quest dropdown (#71)
  └─ Add restore discarded quests functionality

Phase 2: Quest System Enhancements (Foundation for Grimoire)
  ├─ Add quest completion dates (schema v3)
  ├─ Implement variable tracking periods
  └─ Add quest restore functionality

Phase 3: Dungeon & Card Mechanics
  ├─ Make dungeon room rewards claimable
  ├─ Add dungeon completion reminder prompt
  └─ Implement multiple card draw with selection

Phase 4: Atmospheric Buffs Overhaul
  ├─ Visual overhaul of atmospheric buffs UI
  ├─ Add atmospheric rewards to buff table
  └─ Filter atmospheric buff sources from quest tracker

Phase 5: Genre System Enhancements
  ├─ Add new genres (Literary Fiction, Genre Fiction, Cozy)
  └─ Remove dice limits for genre selection

Phase 6: The Grimoire Features (Major Expansion)
  ├─ The Gallery - Book covers via OpenLibrary API
  ├─ The Hourglass - Reading sprint timer with Focus Points
  ├─ The Archive - Series tracker with completion rewards
  └─ The Exchange Program - External challenges integration

Phase 7: Documentation Updates
  └─ Update core rules for card draw mechanics
```

## Phase 1: Bug Fixes & Quick Wins

**Goal**: Low-risk, high-impact fixes that improve existing functionality

**Beads Phase Task**: `tome-of-secrets-ch6`

### 1.1 Fix Bookshelf Initialization Bug (#69)
**Beads Task**: `tome-of-secrets-a89`

**Problem**: Bookshelves don't color in books unless the user manually adjusts the books completed input.

**Root Cause**: The bookshelf reads from the form input value which may be 0 on load, but `completedBooksSet` is correctly populated from `monthlyCompletedBooks`.

**Solution**:
- In `character-sheet.js` initialization (~line 516-520), sync the input value from `completedBooksSet.size`
- Use `Math.max(inputValue, completedBooksSet.size)` to handle edge cases

**Files**:
- `assets/js/character-sheet.js` - Sync input value from completedBooksSet on init

### 1.2 Filter Atmospheric Buff Items from Monthly Quest (#71)
**Beads Task**: `tome-of-secrets-3h3`

**Problem**: Items like "Tome-Bound Cat" that provide atmospheric buff bonuses should not appear as available buffs in the monthly quest tracker dropdown.

**Solution**:
- Create `AtmosphericBuffService.shouldExcludeFromQuestBonuses(item)` to identify items that should be excluded
- Add `excludeFromQuestBonuses` flag to items in `allItems.json` for explicit exclusion
- Update `renderBonusCards()` in `ui.js` to filter out excluded items
- Support both tag-based exclusion and backward-compatible atmospheric mention detection

**Files**:
- `assets/js/services/AtmosphericBuffService.js` - Updated filtering logic with tag-based approach
- `assets/js/character-sheet/ui.js` - Update `renderBonusCards()` to filter
- `assets/data/allItems.json` - Add `excludeFromQuestBonuses: true` to: Gilded Painting, Tome-Bound Cat, Garden Gnome, Mystical Moth, The Grand Key, Raven Familiar
- `tests/services/AtmosphericBuffService.test.js` - Updated tests for new function
- `tests/uiBonusCardsFilter.test.js` - Updated tests

### 1.3 Add Restore Discarded Quests Functionality
**Beads Task**: `tome-of-secrets-q6p`

**Problem**: Once a quest is discarded, there's no way to restore it to active.

**Solution**:
- Add "Restore" button to discarded quests list
- Use existing `stateAdapter.moveQuest()` method to move from `DISCARDED_QUESTS` to `ACTIVE_ASSIGNMENTS`
- Add click handler in `QuestController.handleClick()`

**Files**:
- `assets/js/controllers/QuestController.js` - Add restore handler
- `assets/js/character-sheet/renderComponents.js` - Add restore button to discarded quest rendering

### 1.4 Prevent Completing Quests Without Book Titles
**Beads Task**: `tome-of-secrets-6bu`

**Problem**: Quests can be completed without a book title when added via card draw, causing them not to count towards monthly totals.

**Solution**:
- Add validation in `handleCompleteQuest()` to check if quest has a book title
- Show error toast if book title is missing
- Restore quest to active assignments if validation fails

**Files**:
- `assets/js/controllers/QuestController.js` - Add book title validation in `handleCompleteQuest()`

**Tests**:
- `tests/controllers.test.js` - Added tests for restore quest functionality
- `tests/services/AtmosphericBuffService.test.js` - Added tests for `isAtmosphericBuffSource()`
- `tests/uiBonusCardsFilter.test.js` - Added tests for filtering atmospheric buff sources in UI
- `tests/characterSheet.test.js` - Added tests for bookshelf initialization sync

---

## Phase 2: Quest System Enhancements

**Goal**: Foundation improvements for quest tracking that enable Grimoire features

**Beads Phase Task**: `tome-of-secrets-40o`  
**Dependencies**: Phase 1 must be complete

### 2.1 Add Quest Completion Dates (Schema v3)
**Beads Task**: `tome-of-secrets-tj0`

**Data Schema Change**: Add `dateAdded` and `dateCompleted` fields to quest objects

**Implementation**:
- Increment `SCHEMA_VERSION` to 3 in `dataValidator.js`
- Create migration in `dataMigrator.js` to add `dateAdded: null, dateCompleted: null` to existing quests
- Update `QuestController.handleCreateQuest()` to set `dateAdded: new Date().toISOString()`
- Update `QuestController.handleCompleteQuest()` to set `dateCompleted: new Date().toISOString()`
- Update `validateQuest()` to validate the new fields
- Update UI to display dates in quest tables

**Files**:
- `assets/js/character-sheet/dataValidator.js` - Increment version, add validation
- `assets/js/character-sheet/dataMigrator.js` - Add migration function
- `assets/js/controllers/QuestController.js` - Set dates on create/complete
- `assets/js/viewModels/questViewModel.js` - Format dates for display
- `assets/js/character-sheet/ui.js` - Display completion date
- `character-sheet.md` - Add date columns to quest tables

### 2.2 Implement Variable Tracking Periods
**Beads Task**: `tome-of-secrets-crv`

**Problem**: Users want weekly, monthly, quarterly, or yearly tracking options.

**Data Schema Change**: Add `trackingPeriod` to character state (default: 'monthly')

**Implementation**:
- Add `trackingPeriod` state key
- Create `TrackingPeriodService.js` to determine current period boundaries
- Update `EndOfMonthController` to become `EndOfPeriodController` (or generalize)
- Add UI dropdown in settings to select tracking period
- Adjust XP calculations based on period length
- Update quest allocation to use selected period

**Files**:
- `assets/js/services/TrackingPeriodService.js` - New service
- `assets/js/character-sheet/storageKeys.js` - Add tracking period key
- `assets/js/controllers/EndOfMonthController.js` - Generalize to periods
- `assets/js/character-sheet/ui.js` - Add period selector
- `assets/js/config/gameConfig.js` - Add period-specific rewards

### 2.3 Add Quest Restore Functionality
**Beads Task**: `tome-of-secrets-aqh`

**Note**: This duplicates Phase 1.3 but is included here for completeness. Implementation details same as 1.3.

---

## Phase 3: Dungeon & Card Mechanics

**Goal**: Improve dungeon rewards and card draw systems

**Beads Phase Task**: `tome-of-secrets-1n7`

### 3.1 Make Dungeon Room Rewards Claimable
**Beads Task**: `tome-of-secrets-cll`

**Problem**: Items from `dungeonRoomRewards` can only be added manually.

**Implementation**:
- Add "Claim Reward" button to dungeon rooms table
- Create `DungeonRewardService.js` to handle claim logic
- Track claimed room rewards in state (new key: `claimedRoomRewards`)
- Add items to inventory when claimed
- Show reminder prompt when dungeon room quest is completed

**Files**:
- `assets/js/services/DungeonRewardService.js` - New service
- `assets/js/character-sheet/storageKeys.js` - Add CLAIMED_ROOM_REWARDS key
- `assets/js/character-sheet/dataValidator.js` - Add validation
- `assets/js/controllers/DungeonDeckController.js` - Add claim handlers
- `assets/js/table-renderer.js` - Add claim button to dungeon rooms table

### 3.2 Add Dungeon Completion Reminder Prompt
**Beads Task**: `tome-of-secrets-dgc`

**Implementation**:
- Show reminder when dungeon room is completed
- Prompt to roll/pull from completion rewards table
- Link to completion rewards table
- Track if reminder was shown to avoid spam

**Files**:
- `assets/js/controllers/QuestController.js` - Add reminder logic
- `assets/js/utils/toast.js` - Use existing toast system

### 3.3 Implement Multiple Card Draw with Selection
**Beads Task**: `tome-of-secrets-1su`

**Goal**: Support drawing multiple cards and selecting which to keep (for reroll abilities like Divination caster)

**Implementation**:
- Create `CardDrawService` for multi-card draw logic
- Update deck controllers to support multi-draw mode
- Add selection UI (checkboxes or card selection interface)
- Update quest/buff addition to handle selected cards

**Files**:
- `assets/js/services/CardDrawService.js` - New service
- `assets/js/controllers/GenreQuestDeckController.js` - Add multi-draw
- `assets/js/controllers/AtmosphericBuffDeckController.js` - Add multi-draw
- `assets/js/character-sheet/ui.js` - Add selection UI
- `assets/js/viewModels/questDeckViewModel.js` - Support multi-selection

---

## Phase 4: Atmospheric Buffs Overhaul

**Goal**: Visual and functional improvements to atmospheric buffs system

**Beads Phase Task**: `tome-of-secrets-hdz`

### 4.1 Visual Overhaul of Atmospheric Buffs UI
**Beads Task**: `tome-of-secrets-5aw`

**Goal**: Make the atmospheric buffs section more visual and engaging.

**Implementation**:
- Create card-based layout for atmospheric buffs (similar to quest cards)
- Add atmospheric buff images (store in Supabase like other cards)
- Show sanctum association visually (highlight associated buffs)
- Add Grove Tender badge for always-active buff

**Files**:
- `assets/js/character-sheet/ui.js` - New `renderAtmosphericBuffCards()` function
- `assets/js/viewModels/atmosphericBuffViewModel.js` - Add image URLs
- `assets/js/character-sheet/renderComponents.js` - Add card renderer
- CSS in character-sheet layout

### 4.2 Add Atmospheric Rewards to Buff Table
**Beads Task**: `tome-of-secrets-71z`

**Goal**: Include relevant atmospheric rewards (Garden Gnome, Gilded Painting) in the standard buff table.

**Implementation**:
- Identify items that are "atmospheric rewards" (items earned from atmospheric buff activities)
- Add these to `atmosphericBuffs.json` as a new category or create `atmosphericRewards.json`
- Update table renderer to display both buffs and rewards

**Files**:
- `assets/data/atmosphericBuffs.json` - Add rewards section
- `assets/js/table-renderer.js` - Render rewards in buff table
- Potentially create new JSON for atmospheric reward items

### 4.3 Filter Atmospheric Buff Sources from Quest Tracker
**Beads Task**: `tome-of-secrets-cic`

**Note**: This duplicates Phase 1.2 but is included here for completeness. Implementation details same as 1.2.

---

## Phase 5: Genre System Enhancements

**Goal**: Expand genre options and improve selection flexibility

**Beads Phase Task**: `tome-of-secrets-m5v`

### 5.1 Add New Genres
**Beads Task**: `tome-of-secrets-05u`

**New genres to add**:
- Literary Fiction (emphasis on artistic merit and character study)
- Genre Fiction (broader category for genre-specific reads)
- Cozy (cozy mysteries, cozy fantasy, etc.)

**Implementation**:
- Add entries to `genreQuests.json` with stable IDs
- Run `node scripts/generate-data.js`
- Run `cd tests && npm run validate-data`

**Files**:
- `assets/data/genreQuests.json` - Add 3 new genre entries

### 5.2 Remove Dice Limits for Genre Selection
**Beads Task**: `tome-of-secrets-9yu`

**Current behavior**: Users select genres based on dice rolls (d4, d6, d8, etc.)  
**New behavior**: Users can select any number of genres or select all

**Implementation**:
- Add "Select All" button to genre selection UI
- Remove dice-based limits from genre selection logic
- Keep `genreDiceSelection` for legacy/optional use
- Add checkbox to toggle between "free selection" and "dice-based" modes

**Files**:
- `assets/js/character-sheet.js` - Update genre selection handlers
- `assets/js/services/GenreQuestDeckService.js` - Handle unlimited selection
- Genre selection UI in character sheet

---

## Phase 6: The Grimoire Features

**Goal**: Major new reading journal features from GDD Expansion

**Beads Phase Task**: `tome-of-secrets-2xj`  
**Dependencies**: Phase 2 must be complete (needs quest dates and tracking periods)

### 6.1 The Gallery - Book Covers via OpenLibrary API
**Beads Task**: `tome-of-secrets-0gr`  
**Dependencies**: Requires quest completion dates (`tome-of-secrets-tj0`) and tracking periods (`tome-of-secrets-crv`)

**Feature**: Visual representation of books read with covers from OpenLibrary.

**Data Schema Changes**:
- Add `isbn` and `coverUrl` fields to book log entries
- Update `monthlyCompletedBooks` structure (currently array of strings, needs to become array of objects)

**Implementation**:
- Create `BookCoverService.js` for OpenLibrary API integration
- Create `GalleryViewModel.js` for gallery view data
- Create `GalleryController.js` for gallery interactions
- Add gallery tab/view to Library page
- Fetch cover: `https://covers.openlibrary.org/b/isbn/{isbn}-M.jpg`
- Add ISBN input when logging books
- Display grid of book covers for current period
- Store cover URLs in monthlyCompletedBooks

**Files**:
- `assets/js/services/BookCoverService.js` - New service (OpenLibrary API)
- `assets/js/viewModels/galleryViewModel.js` - New view model
- `assets/js/controllers/GalleryController.js` - New controller
- `assets/js/character-sheet/storageKeys.js` - Update book log structure
- `assets/js/character-sheet/dataValidator.js` - Validate new book fields
- `assets/js/character-sheet/dataMigrator.js` - Migrate existing book arrays
- `library.md` - Add gallery view HTML

**Data Schema Update**:
```javascript
// In monthlyCompletedBooks entry
{
  id: "uuid-v4",
  title: "Book Title",
  author: "Author Name",
  isbn: "9780...", // NEW
  coverUrl: "https://...", // NEW
  dateRead: "2026-02-02",
  questId: "dungeon-room-12",
  seriesId: "series_123", // For Phase 6.3
  exchangeIds: [] // For Phase 6.4
}
```

### 6.2 The Hourglass - Reading Sprint Timer with Focus Points
**Beads Task**: `tome-of-secrets-9x0`

**Feature**: Gamified timer for focused reading sessions with Focus Points.

**Data Schema Changes**:
- Add `focusMagic` state key:

```javascript
focusMagic: {
  currentPoints: 0,
  lifetimeMinutes: 0,
  activeBuffs: [] // Buffs bought with focus points
}
```

**Implementation**:
- Create `FocusTimerService.js` for timer logic and point calculations
- Create `FocusBuffService.js` for buff management
- Create `FocusTimerController.js` for timer UI interactions
- Add timer UI component with start/pause/complete
- Add Focus Points currency display
- Add buff shop where Focus Points can buy temporary buffs
- Anti-cheese: Require manual "Complete" click (no auto-complete)
- Track focus points (10 minutes = 1 focus point)

**Files**:
- `assets/js/services/FocusTimerService.js` - New service
- `assets/js/services/FocusBuffService.js` - New service
- `assets/js/controllers/FocusTimerController.js` - New controller
- `assets/data/focusBuffs.json` - Buyable buffs data
- `assets/js/character-sheet/storageKeys.js` - Add focusMagic key
- `assets/js/character-sheet/dataValidator.js` - Add validation
- `assets/js/character-sheet/dataMigrator.js` - Add migration
- `assets/js/config/gameConfig.js` - Focus point rates
- `character-sheet.md` - Add Hourglass section

### 6.3 The Archive - Series Tracker with Completion Rewards
**Beads Task**: `tome-of-secrets-9zp`

**Feature**: Track progress through multi-volume series.

**Data Schema Changes**:
- Add `seriesTracking` state key (array of series objects)
- Add `seriesId` field to book log entries

**Data structure**:
```javascript
seriesTracking: [
  {
    id: "series-uuid",
    title: "Dune Saga",
    targetCount: 6,
    currentCount: 2,
    completedAt: null,
    bookIds: ["book-uuid-1", "book-uuid-2"]
  }
]
```

**Implementation**:
- Create `SeriesService.js` for series CRUD and completion logic
- Create `SeriesViewModel.js` for series display
- Create `SeriesController.js` for UI interactions
- Add series completion rewards (non-wearable "souvenir" items)
- Add series selection when logging books
- Award "Souvenir" items when series completed

**Files**:
- `assets/js/services/SeriesService.js` - New service
- `assets/js/viewModels/seriesViewModel.js` - New view model
- `assets/js/controllers/SeriesController.js` - New controller
- `assets/js/character-sheet/storageKeys.js` - Add series key
- `assets/js/character-sheet/dataValidator.js` - Add validation
- `assets/js/character-sheet/dataMigrator.js` - Add migration
- `assets/js/services/RewardCalculator.js` - Add souvenir generation
- `character-sheet.md` - Add Archive section

### 6.4 The Exchange Program - External Challenges Integration
**Beads Task**: `tome-of-secrets-3e9`  
**Dependencies**: Requires quest completion dates (`tome-of-secrets-tj0`)

**Feature**: Integration of external reading challenges (Book Clubs, Bingo, Syllabus-style).

**Data Schema Changes**:
- Add `exchangeProgram` state key with `activeChallenges` object
- Support three challenge types: checklist, grid (bingo), syllabus

**Data structure per GDD**:
```javascript
exchangeProgram: {
  activeChallenges: {
    "challenge-id": {
      id: string,
      type: "checklist" | "grid" | "syllabus",
      name: string,
      // Type-specific fields...
    }
  }
}
```

**Implementation**:
- Create `ExchangeChallengeService.js` for challenge CRUD
- Create `ExchangeRewardService.js` for cross-pollination rewards
- Create validators for each challenge type
- Add challenge management UI
- Support three challenge types:
  - **Checklist**: Book club prompts with completion status
  - **Grid (Bingo)**: NxN grid with FREE SPACE handling
  - **Syllabus**: Track-based structure (Romanceopoly-style)
- Link book completions to exchange prompts
- Calculate synergy bonuses (Tome + Exchange = +10 Ink Drops)
- Cross-pollination system: when completing a Tome quest, allow linking to Exchange prompts

**Files**:
- `assets/js/services/ExchangeChallengeService.js` - New service
- `assets/js/services/ExchangeRewardService.js` - New service
- `assets/js/viewModels/exchangeViewModel.js` - New view model
- `assets/js/controllers/ExchangeController.js` - New controller
- `assets/js/character-sheet/storageKeys.js` - Add exchangeProgram key
- `assets/js/character-sheet/dataValidator.js` - Add validation
- `assets/js/character-sheet/dataMigrator.js` - Add migration
- `assets/js/services/RewardCalculator.js` - Add synergy bonus calculation
- `assets/js/controllers/QuestController.js` - Check exchange prompts on completion
- `character-sheet.md` - Add Exchange Program section

**Economy (from GDD)**:
- External prompt only: +5 Paper Scraps (no XP)
- Synergy (Tome + External): +10 Ink Drops bonus

---

## Phase 7: Documentation Updates

**Goal**: Update core rules and documentation

**Beads Phase Task**: `tome-of-secrets-je3`

### 7.1 Update Core Rules for Card Draw Mechanics
**Beads Task**: `tome-of-secrets-f33`

**Changes**:
- Update core rules to mention card draw mechanic
- Clarify that character sheet users should draw cards, not roll dice
- Update any rule references

**Files**:
- `core-mechanics.md` - Update text
- Any other rule documentation files

---

## Schema Version Roadmap

| Phase | Schema Version | Migration Summary |
|-------|---------------|-------------------|
| Current | 2 | Library Restoration |
| Phase 2 | 3 | Quest completion dates, claimed rewards, tracking period |
| Phase 6 | 4 | Book log structure, series tracking, focus magic |
| Phase 6 | 5 | Exchange program |

## Critical Dependencies

### Phase Dependencies
- **Phase 2** depends on **Phase 1** (foundation fixes)
- **Phase 6** depends on **Phase 2** (needs quest dates and tracking periods)

### Feature Dependencies
- **Gallery (6.1)** depends on:
  - Quest completion dates (2.1)
  - Tracking periods (2.2)
- **Exchange Program (6.4)** depends on:
  - Quest completion dates (2.1)
- **Archive (6.3)** can be done independently but benefits from Gallery (6.1)
- **Hourglass (6.2)** can be done independently

## Implementation Order Recommendation

1. **Phase 1** (Bug Fixes) - Independent, fixes bugs
2. **Phase 2** (Quest Enhancements) - Foundation for other features
3. **Phase 3** (Dungeon & Cards) - Independent feature
4. **Phase 4** (Atmospheric) - Independent, visual improvements
5. **Phase 5** (Genres) - Independent, content addition
6. **Phase 6** (Grimoire) - Major feature expansion, depends on Phase 2
   - 6.1 Gallery (depends on 2.1, 2.2)
   - 6.2 Hourglass (independent)
   - 6.3 Archive (can start independently)
   - 6.4 Exchange (depends on 2.1)
7. **Phase 7** (Documentation) - Can be done anytime

## Testing Strategy

Each phase should include:

1. **Unit tests** for new services in `/tests/services/`
2. **View model tests** in `/tests/viewModels/`
3. **Controller tests** in `/tests/controllers.test.js`
4. **UI integration tests** for rendering and filtering logic
5. **Data validation tests** - run `npm run validate-data`
6. **Integration tests** for state persistence
7. **Manual browser testing** per `MANUAL_TEST_CASES.md`

### Phase 1 Test Coverage

**Completed Tests**:
- ✅ `tests/services/AtmosphericBuffService.test.js` - Tests for `isAtmosphericBuffSource()` function
- ✅ `tests/uiBonusCardsFilter.test.js` - Tests for filtering atmospheric buff sources from bonus cards
- ✅ `tests/controllers.test.js` - Tests for restore quest functionality and book title validation
- ✅ `tests/characterSheet.test.js` - Tests for bookshelf initialization sync

**Test Tasks in Beads**:
- `tome-of-secrets-vep` - Test: Bookshelf initialization bug fix
- `tome-of-secrets-0en` - Test: Filter atmospheric buff items from dropdown
- `tome-of-secrets-ein` - Test: Restore discarded quests functionality

### Code Quality Standards

- All new services must have 90%+ coverage
- View models must be tested with various state inputs
- Controllers must be tested for event handling
- State persistence tests for new features
- Migrations tested with real save data
- Supabase sync tested with new state keys

## Migration Strategy

### Schema Versioning
- Increment `SCHEMA_VERSION` in `dataValidator.js` for each phase that changes state
- Create migration functions in `dataMigrator.js`
- Test migrations with production-like data

### Backward Compatibility
- All new fields should have safe defaults
- Old quests without dates should get `dateAdded: null, dateCompleted: null`
- Existing users should see new features opt-in (where applicable)

## Infrastructure Considerations

### Supabase Usage

**Current**: Supabase used for cloud sync (JSON storage in `tos_saves` table)

**For New Features**:
- **Gallery (6.1)**: Store cover URLs in JSON (no new tables needed)
- **Hourglass (6.2)**: Store focus points in JSON (no new tables needed)
- **Archive (6.3)**: Store series in JSON (no new tables needed)
- **Exchange (6.4)**: Store challenges in JSON (no new tables needed)

**Conclusion**: All features can use existing Supabase JSON storage. No backend changes needed.

### If Backend Becomes Necessary

**Triggers**:
- Need for real-time collaboration
- Complex querying requirements
- Performance issues with large JSON blobs
- Need for user-generated content sharing

**Proposed Backend Architecture** (if needed):
- **Supabase Tables**: 
  - `tos_book_covers` - Cache OpenLibrary covers
  - `tos_series_templates` - Shared series definitions
  - `tos_exchange_challenges` - Shared challenge templates
- **Edge Functions**: For OpenLibrary API proxying (rate limiting, caching)
- **Storage**: Continue using JSON for character state, add tables only for shared/public data

## Success Metrics

- All features implemented following existing patterns
- No code duplication (shared logic in services)
- 90%+ test coverage for new code
- All migrations tested and working
- Backward compatibility maintained
- Documentation updated
- All Beads tasks completed and dependencies satisfied

## Using Beads for Task Management

All tasks are tracked in Beads. To work on this plan:

1. **View ready tasks**: `bd ready` - Shows tasks with no blockers
2. **View all tasks**: `bd list` - Shows all tasks with status
3. **View task details**: `bd show <task-id>` - Shows full task information
4. **Mark task complete**: `bd close <task-id>` - Marks task as done
5. **View dependencies**: `bd deps <task-id>` - Shows what blocks this task

### Example Workflow

```bash
# See what's ready to work on
bd ready

# Start working on a task
bd show tome-of-secrets-a89

# When done, mark complete
bd close tome-of-secrets-a89

# Check what's now unblocked
bd ready
```

## Notes

- This plan assumes Supabase continues to work for all features
- If performance issues arise with large JSON blobs, consider splitting state
- User feedback should guide prioritization within phases
- Some features (like Exchange Program) may need UI/UX iteration based on user testing
- OpenLibrary may not have covers for all ISBNs (graceful fallback needed)
- Large state objects (Exchange Program) may need IndexedDB optimization
