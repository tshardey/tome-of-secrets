---
name: Animated Card Draw System (Consolidated)
overview: Replace dungeon rolling tables with a two-step animated card draw system (Room deck → Encounter deck). Add card-based archived view for dungeon quests that opens the existing quest drawer. Improve other quest cards with scrollable notes/reviews.
todos:
  - id: dungeon-deck-service
    content: Create DungeonDeckService with business logic for filtering available rooms and encounters based on completion status
    status: pending
  - id: dungeon-deck-view-model
    content: Create dungeonDeckViewModel to transform deck state for UI rendering
    status: pending
    dependencies:
      - dungeon-deck-service
  - id: card-renderer
    content: Create CardRenderer with pure rendering functions for room cards, encounter cards, and cardbacks
    status: pending
  - id: card-draw-css
    content: Create card-draw.css with card styling, flip animations, and responsive layouts (with prefers-reduced-motion fallback)
    status: pending
  - id: dungeon-deck-controller
    content: Create DungeonDeckController to handle deck clicks, card draws, and quest creation via existing handlers
    status: pending
    dependencies:
      - dungeon-deck-service
      - dungeon-deck-view-model
      - card-renderer
  - id: overlay-replacement
    content: Replace dungeons overlay content in character-sheet.md with card draw interface
    status: pending
    dependencies:
      - card-renderer
  - id: integrate-controller
    content: Initialize DungeonDeckController in character-sheet.js and wire up overlay rendering
    status: pending
    dependencies:
      - dungeon-deck-controller
      - overlay-replacement
  - id: archived-dungeon-view-model
    content: Create dungeonArchiveCardsViewModel to transform completed dungeon quests into card gallery format
    status: pending
  - id: archived-dungeon-cards
    content: Add renderDungeonArchiveCards() to ui.js for dungeon quests, showing card fronts that open quest drawer on click
    status: pending
    dependencies:
      - archived-dungeon-view-model
      - card-renderer
  - id: archived-quest-improvements
    content: Update renderCompletedQuests() to split dungeon and other quests, add scrollable notes/review section for other quest cards
    status: pending
    dependencies:
      - archived-dungeon-cards
  - id: quest-card-scroll-styles
    content: Add CSS for scrollable notes/review sections in quest cards with max-height constraint
    status: pending
  - id: tests
    content: Write tests for DungeonDeckService and DungeonDeckController
    status: pending
    dependencies:
      - dungeon-deck-service
      - dungeon-deck-controller
  - id: backwards-compat
    content: Add link to rolling table view for backwards compatibility
    status: pending
    dependencies:
      - overlay-replacement
---

# Animated Card Draw System (Consolidated Plan)

## Overview

Transform the dungeon room and encounter selection from rolling tables to an animated card draw experience. Players click the Room deck to draw a room card, then click the Encounter deck to draw an encounter for that room. The system filters out completed content and allows rooms to return to the deck if only partially completed.

Additionally, improve the archived quest display by:
- Showing dungeon quests as visual cards (card fronts) that open the quest drawer on click
- Adding scrollable notes/review sections to other quest cards to prevent them from becoming too large

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│              Dungeon Deck System                          │
├─────────────────────────────────────────────────────────┤
│                                                           │
│  DungeonDeckService (Business Logic)                     │
│  ├─ getAvailableRooms(state)                            │
│  ├─ getAvailableEncounters(roomNumber, state)           │
│  ├─ drawRandomRoom(availableRooms)                      │
│  ├─ drawRandomEncounter(availableEncounters)            │
│  └─ isRoomFullyCompleted(roomNumber, state)             │
│                                                           │
│  dungeonDeckViewModel (Data Transformation)              │
│  ├─ createDungeonDeckViewModel(state, drawnRoom)        │
│  └─ createDrawnCardViewModel(roomData, encounterData)   │
│                                                           │
│  DungeonDeckController (User Interactions)               │
│  ├─ initialize()                                        │
│  ├─ handleRoomDeckClick()                               │
│  ├─ handleEncounterDeckClick()                          │
│  └─ handleAddQuestFromCards()                           │
│                                                           │
│  CardRenderer (Visual Rendering)                         │
│  ├─ renderRoomCard(roomData)                            │
│  ├─ renderEncounterCard(encounterData, roomData)        │
│  ├─ renderCardback(type)                                │
│  └─ renderDungeonArchiveCard(quest)                     │
│                                                           │
│  dungeonArchiveCardsViewModel (Archive Transformation)   │
│  ├─ createDungeonArchiveCardsViewModel(completedQuests) │
│  └─ getCardImageForQuest(quest)                         │
│                                                           │
└─────────────────────────────────────────────────────────┘
```

## Key Design Decisions

1. **Two-Step Draw Flow**: Room deck → Encounter deck (sequential, not simultaneous)
2. **Filtering Logic**: Rooms stay available until ALL encounters are completed; rooms with 0 encounters removed after challenge completion
3. **Card Images**: Use existing images from `assets/images/dungeons/` (2:3 ratio) and `assets/images/encounters/` (1:1 ratio)
4. **Cardbacks**: Use `tos-cardback-dungeon-rooms.png` and `tos-cardback-encounters.png`
5. **Archived Display**: Split completed quests into "Dungeon" and "Other Quests" sections
6. **Quest Drawer**: Reuse existing quest edit drawer for viewing/editing archived dungeon cards

## Implementation Details

### 1. DungeonDeckService (`assets/js/services/DungeonDeckService.js`)

**Purpose**: Pure business logic for determining card availability and random selection.

**Key Functions**:
- `getAvailableRooms(state)` - Returns array of room numbers that can be drawn (not fully completed)
- `getAvailableEncounters(roomNumber, state)` - Returns array of encounter names for a room that haven't been completed
- `drawRandomRoom(availableRooms)` - Randomly selects from available rooms
- `drawRandomEncounter(availableEncounters)` - Randomly selects from available encounters
- `isRoomFullyCompleted(roomNumber, state)` - Checks if room challenge + all encounters are done

**Dependencies**:
- Uses `checkDungeonRoomCompletion()` logic from `table-renderer.js` or reimplements similar logic
- Reads from `characterState[STORAGE_KEYS.COMPLETED_QUESTS]`

### 2. dungeonDeckViewModel (`assets/js/viewModels/dungeonDeckViewModel.js`)

**Purpose**: Transform state + services into UI-ready data structures.

**Key Functions**:
- `createDungeonDeckViewModel(state, drawnRoom)` - Creates view model for deck UI
- `createDrawnCardViewModel(roomData, encounterData)` - Creates view model for drawn cards

### 3. DungeonDeckController (`assets/js/controllers/DungeonDeckController.js`)

**Purpose**: Handle user interactions with card decks and drawing.

**Key Features**:
- Initializes deck displays (room deck and encounter deck)
- Handles room deck click (draws random room card)
- Handles encounter deck click (draws random encounter for current room)
- Manages card flip animation
- Integrates with existing `DungeonQuestHandler` to add quests from drawn cards
- Updates deck availability after quest completion

**Integration Points**:
- Uses `DungeonDeckService` for business logic
- Uses `CardRenderer` for visual updates
- Uses `DungeonQuestHandler` via `QuestHandlerFactory` to create quests
- Listens to `STATE_EVENTS.QUEST_COMPLETED` to update deck state

### 4. CardRenderer (`assets/js/character-sheet/cardRenderer.js`)

**Purpose**: Pure rendering functions for card visuals.

**Key Functions**:
- `renderRoomCard(roomData)` - Renders 2:3 aspect ratio room card
- `renderEncounterCard(encounterData, roomData)` - Renders 1:1 aspect ratio encounter card
- `renderCardback(type)` - Renders cardback image (room or encounter)
- `renderDungeonArchiveCard(quest, index)` - Renders archived dungeon quest card (card front only)

**Card Structure**:
- **Room Cards**: 2:3 aspect ratio, shows room name, description, challenge
- **Encounter Cards**: 1:1 aspect ratio, shows encounter name, type, description
- **Cardbacks**: Use provided cardback images
- **Archive Cards**: Show card front with title, click opens quest drawer

### 5. CSS Styling (`assets/css/card-draw.css`)

**Key Styles**:
- `.dungeon-deck-container` - Container for both decks
- `.card-deck` - Deck stack container with cardback image
- `.card-deck.available` / `.card-deck.empty` - Visual states
- `.drawn-card-area` - Container for drawn cards
- `.room-card` - 2:3 aspect ratio styling
- `.encounter-card` - 1:1 aspect ratio styling
- `.card-flip-animation` - Flip animation keyframes (with `prefers-reduced-motion` fallback)
- `.dungeon-archive-card` - Archived dungeon quest card styling
- `.quest-card-notes-scrollable` - Scrollable notes/review section

**Animation**:
- Card flip uses CSS `transform: rotateY()` with `@keyframes`
- Respects `prefers-reduced-motion` media query
- Smooth transitions for deck state changes

### 6. Overlay Replacement (`character-sheet.md`)

**Changes**:
- Replace `dungeons-info-drawer` content with card draw interface
- Add deck containers: `#room-deck-container` and `#encounter-deck-container`
- Add drawn card display area: `#drawn-card-display`
- Add "Add Quest" button on drawn cards
- Keep table accessible via separate button or link

**Structure**:
```html
<div id="dungeons-info-drawer" class="info-drawer">
  <div class="dungeon-deck-interface">
    <div class="deck-section">
      <div id="room-deck-container" class="card-deck available">
        <!-- Room deck stack -->
      </div>
      <div id="encounter-deck-container" class="card-deck available" style="display: none;">
        <!-- Encounter deck stack -->
      </div>
    </div>
    <div id="drawn-card-display" class="drawn-card-area">
      <!-- Drawn cards appear here -->
    </div>
    <div class="deck-actions">
      <button id="add-quest-from-cards-btn" class="rpg-btn rpg-btn-primary" style="display: none;">
        Add to Active Quests
      </button>
      <button id="clear-drawn-cards-btn" class="rpg-btn rpg-btn-secondary" style="display: none;">
        Clear Draw
      </button>
      <a href="#dungeon-rooms-table-container" class="rpg-btn rpg-btn-secondary">
        View Rolling Table
      </a>
    </div>
  </div>
</div>
```

### 7. Archived Quest Display (`assets/js/character-sheet/ui.js`)

**Changes**:
- Update `renderCompletedQuests()` to split into "Dungeon" and "Other Quests" sections
- Add `renderDungeonArchiveCards()` function for dungeon quests
- Update `renderQuestCard()` to add scrollable notes/review section for non-dungeon quests

**Structure**:
```html
<div id="completed-quests-container">
  <h3 id="completed-summary">Completed Quests</h3>
  
  <div class="completed-quests-sections">
    <!-- Dungeon Section -->
    <div class="dungeon-archive-section">
      <h4>Dungeon Quests</h4>
      <div id="dungeon-archive-cards-container" class="dungeon-archive-cards-grid">
        <!-- Dungeon cards rendered here -->
      </div>
    </div>
    
    <!-- Other Quests Section -->
    <div class="other-quests-section">
      <h4>Other Quests</h4>
      <div class="quest-cards-container">
        <!-- Other quest cards rendered here (with scrollable notes) -->
      </div>
    </div>
  </div>
</div>
```

### 8. State Management

**No New Persistent State Required**:
- Card availability is calculated from `completedQuests` state
- Deck state is derived/calculated, not stored
- Drawn cards are ephemeral (session-only, not persisted)

**State Updates**:
- Listen to `STATE_EVENTS.QUEST_COMPLETED` to refresh deck availability
- Update deck displays when quests are added/completed
- Recalculate available cards on state changes

### 9. Backwards Compatibility

**Rolling Table Access**:
- Keep `renderDungeonRoomsTable()` function in `table-renderer.js`
- Add link/button in overlay to "View Rolling Table" (scrolls to table in overlay)
- Existing quest data structure unchanged (no migration needed)

**Quest Data Structure**:
- No changes to quest objects
- Existing `roomNumber`, `isEncounter`, `encounterName` fields continue to work
- Completion tracking via `completedQuests` remains the same

## File Changes Summary

### New Files
- `assets/js/services/DungeonDeckService.js` - Card availability and random selection logic
- `assets/js/viewModels/dungeonDeckViewModel.js` - Deck view model transformation
- `assets/js/viewModels/dungeonArchiveCardsViewModel.js` - Archive view model transformation
- `assets/js/controllers/DungeonDeckController.js` - Card draw user interactions
- `assets/js/character-sheet/cardRenderer.js` - Card visual rendering
- `assets/css/card-draw.css` - Card styling and animations
- `tests/services/dungeonDeckService.test.js` - Service tests
- `tests/dungeonDeckController.test.js` - Controller tests

### Modified Files
- `character-sheet.md` - Replace dungeons overlay content with card draw interface, update completed quests structure
- `assets/js/character-sheet.js` - Initialize DungeonDeckController, replace overlay rendering
- `assets/js/character-sheet/ui.js` - Update `renderCompletedQuests()`, add `renderDungeonArchiveCards()`, update `renderQuestCard()`
- `assets/css/character-sheet.css` - Import card-draw.css, add quest card scrollable styles

### Unchanged (Backwards Compatible)
- `assets/js/table-renderer.js` - Keep rolling table functions for reference/fallback
- `assets/data/dungeonRooms.json` - No changes needed (images already exist)
- Quest data structure - No schema changes

## Testing Requirements

1. **DungeonDeckService Tests**:
   - Test `getAvailableRooms()` filters completed rooms correctly
   - Test `getAvailableEncounters()` filters completed encounters
   - Test random selection from available cards
   - Test edge cases: rooms with 0/1/2 encounters

2. **DungeonDeckController Tests**:
   - Test room deck click triggers card draw
   - Test encounter deck click triggers card draw
   - Test card flip animation triggers
   - Test "Add Quest" button creates quest correctly
   - Test deck updates after quest completion

3. **Integration Tests**:
   - Test card draw → quest creation → completion → deck update flow
   - Test archived dungeon card rendering and drawer opening
   - Test scrollable notes in other quest cards
   - Test mobile responsive card layouts

4. **Manual Testing**:
   - Verify card flip animations work smoothly
   - Verify deck shows correct available count
   - Verify cards match image aspect ratios (2:3 rooms, 1:1 encounters)
   - Verify backwards compatibility (rolling table still accessible)
   - Verify archived quest display split works correctly
   - Verify scrollable notes prevent card overflow

## Future Extensibility

**Side Quest Cards** (Future Enhancement):
- Same architecture can be extended to side quests
- Create `SideQuestDeckService` following same patterns
- Add side quest deck to overlay
- Use same card renderer with side quest card styling

**Card Collection View** (Future Enhancement):
- Show all completed cards in a gallery view
- Filter by room/encounter type
- Export card collection as image
