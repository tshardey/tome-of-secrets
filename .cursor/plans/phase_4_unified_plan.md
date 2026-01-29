---
name: Phase 4 UI/UX Overhaul (Unified)
overview: "Transform the character sheet from a form-based experience to a game-like dashboard with a floating status widget, embedded rolling tables, inline quest editing, toast notifications, and RPG-styled panels. No new mechanics—only presentation and UX improvements."
todos:
  - id: toast-system
    content: Create toast notification system to replace all alert() calls
    status: completed
  - id: global-status-widget
    content: Build floating status widget (collapsible) visible on all pages showing character info, level, XP, and currencies
    status: completed
    dependencies:
      - toast-system
  - id: remove-currency-dupes
    content: Remove redundant currency displays from Shopping and Library pages
    status: completed
    dependencies:
      - global-status-widget
  - id: embed-roll-tables
    content: Implement rolling tables as side overlays (Genre Quests, Side Quests, Dungeon Rooms, Atmospheric Buffs) accessible from Character Sheet
    status: completed
    notes: "Changed from embedded collapsible tables to side overlay panels (similar to restoration project overlay). Genre Quests overlay includes full genre selection UI. Moved genre selection from quests.md to Character Sheet overlay."
  - id: quest-edit-drawer
    content: Implement dedicated quest edit drawer/panel (separate from Add Quest form)
    status: pending
    dependencies:
      - toast-system
  - id: rpg-panel-styling
    content: Apply RPG-styled panel CSS to Character Sheet sections (progress bars, badges, cards)
    status: pending
  - id: visual-feedback
    content: Add subtle animations and visual feedback for currency updates, quest completion, level ups
    status: pending
    dependencies:
      - toast-system
      - rpg-panel-styling
  - id: mobile-optimization
    content: Optimize all new components and existing UI for mobile devices
    status: in_progress
    notes: "Status widget and table overlays are responsive. Full mobile optimization pending."
    dependencies:
      - global-status-widget
      - quest-edit-drawer
      - embed-roll-tables
  - id: consolidate-quest-pages
    content: Remove quests.md and dungeons.md as separate pages, consolidate all content into Character Sheet overlays
    status: pending
    notes: "Move all quest/dungeon table content and journaling prompts into overlays. Remove assets/js/quests.js initialization. Update navigation to remove separate quest/dungeon pages."
    dependencies:
      - embed-roll-tables
---

# Phase 4: UI/UX Overhaul (Unified Plan)

## Vision

Transform "Tome of Secrets" from a form/spreadsheet experience into an engaging game dashboard inspired by Habitica and Spirit City lo-fi aesthetics. This phase focuses **exclusively on presentation and UX**—no new game mechanics or state changes.

## Core Principles

1. **Information Accessibility**: Character info and resources visible from anywhere
2. **Contextual Actions**: Actions happen where they're needed
3. **Visual Hierarchy**: Card-based UI with clear visual feedback
4. **Reduced Friction**: Eliminate unnecessary navigation and form switching
5. **Game-like Feel**: Progress indicators, visual feedback, immersive design

## Implementation Plan

### 1. Toast Notification System (Foundation) ✅ COMPLETED

**Why**: Replace intrusive `alert()` calls that break game flow

**Implementation (Completed)**:
- Created `assets/js/ui/toast.js` - Toast notification manager
- Created `assets/css/toast.css` - Toast styling (Dark Academia theme)
- Features implemented:
  - Auto-dismiss after 3 seconds (configurable)
  - Types: Success (green), Error (red), Info (gold), Warning (orange)
  - Stacking support for multiple toasts
  - Position: Top-right
  - HTML escaping for security
  - ARIA attributes for accessibility

**Replaced alerts in**:
- ✅ `assets/js/controllers/QuestController.js` (quest completion, rewards)
- ✅ `assets/js/controllers/EndOfMonthController.js` (end of month processing)
- ✅ `assets/js/quests.js` (genre selection feedback)
- ✅ `assets/js/character-sheet.js` (genre limit warnings in overlay)

**Files created**:
- ✅ `assets/js/ui/toast.js`
- ✅ `assets/css/toast.css`
- ✅ `tests/toast.test.js` - Comprehensive test suite

**Files updated**:
- ✅ `assets/js/controllers/QuestController.js`
- ✅ `assets/js/controllers/EndOfMonthController.js`
- ✅ `assets/js/quests.js`
- ✅ `_layouts/default.html` (imported toast.css)

### 2. Global Status Widget (Floating HUD) ✅ COMPLETED

**Why**: Character info should be accessible from any page without navigation

**Design (Completed)**:
- **Position**: Bottom-right corner, fixed/floating
- **Collapsed state**: Shows level badge + currency icons (compact button)
- **Expanded state**: Full character info panel with close button
- **Persisted**: Collapse/expand state saved in localStorage
- **Responsive**: Larger on big screens, full-width on mobile

**Content (Expanded)**:
- Character name
- Level badge with XP progress bar (shows current/total XP needed)
- Currency row: Ink Drops, Paper Scraps, Blueprints, SMP
- Quick link to Character Sheet (correctly handles baseurl)

**Implementation (Completed)**:
- Created `assets/js/components/StatusWidget.js`
- Created `assets/css/status-widget.css`
- Initialized in `assets/js/main.js` (runs on all pages)
- Listens to `tos:localStateChanged` event for live updates
- Reads state via `StateAdapter` and `characterState`
- Event delegation for close button (works after re-renders)
- Dynamic baseurl detection for Character Sheet link

**Files created**:
- ✅ `assets/js/components/StatusWidget.js`
- ✅ `assets/css/status-widget.css`
- ✅ `tests/statusWidget.test.js` - Test suite

**Files updated**:
- ✅ `_layouts/default.html` - Added status widget mount point and baseurl meta tag
- ✅ `assets/js/main.js` - Initialize StatusWidget
- ✅ `assets/css/style.scss` - Import status-widget.css (or added to default.html)

### 3. Remove Redundant Currency Displays ✅ COMPLETED

**Why**: Once Status Widget is global, duplicate displays on Shopping/Library pages are redundant

**Implementation (Completed)**:
- ✅ Removed currency display HTML from `shopping.md`
- ✅ Removed `updateCurrencyDisplay()` function and interval from `assets/js/page-renderers/shoppingRenderer.js`
- ✅ Removed blueprint counter HTML from `library.md` header
- ✅ Removed `renderBlueprintCounter()` function from `assets/js/page-renderers/libraryRenderer.js`

**Files updated**:
- ✅ `shopping.md`
- ✅ `assets/js/page-renderers/shoppingRenderer.js`
- ✅ `library.md`
- ✅ `assets/js/page-renderers/libraryRenderer.js`

### 4. Embed Rolling Tables in Character Sheet (✅ COMPLETED)

**Why**: Rolling tables are currently on separate pages, requiring navigation away and back

**Implementation (Completed)**:
- **Changed approach**: Instead of embedded collapsible tables, implemented side overlay panels (similar to restoration project overlay)
- Tables accessible via buttons:
  - **Quests Tab**: Genre Quests, Side Quests, Dungeon Rooms buttons
  - **Environment Tab**: Atmospheric Buffs button
- **Genre Quests Overlay** includes full genre selection UI:
  - Dice type selector (d4, d6, d8, d10, d12, d20)
  - Selected genres display with remove buttons
  - Add genre dropdown
  - Real-time table updates as genres change
  - Toast notifications for limit warnings
- Genre selection moved from `quests.md` to Character Sheet overlay
- Overlays slide in from right, have backdrop, close on Escape/backdrop click
- All overlays are mobile-responsive (full width on mobile)

**Files created**:
- `tests/tableOverlay.test.js` - Comprehensive test suite (22 tests, all passing)

**Files updated**:
- `character-sheet.md` - Added overlay buttons and overlay panel markup
- `assets/js/character-sheet.js` - Implemented overlay system with genre selection
- `assets/css/character-sheet.css` - Overlay panel styling
- `quests.md` - Removed genre selection section, added note directing to Character Sheet
- `assets/js/quests.js` - Removed genre selection initialization

### 5. Quest Edit Drawer (Separate from Add Quest Form)

**Why**: Currently editing a quest populates the "Add Quest" form, causing confusion and potential data loss

**Implementation**:
- Create dedicated edit drawer/panel in `character-sheet.md` Quests tab
- Separate inputs: `edit-quest-*` (not `new-quest-*`)
- Behavior:
  - Clicking "Edit" on a quest card opens edit drawer pre-filled
  - "Add Quest" form stays untouched (for adding new quests only)
  - "Save changes" updates quest, closes drawer
  - "Cancel" closes drawer without side effects
- Show clear header: "Editing: [Quest Type] - [Status]"

**Files to update**:
- `character-sheet.md` - Add edit drawer markup
- `assets/js/controllers/QuestController.js` - Replace form population with drawer logic
- `assets/css/character-sheet.css` - Drawer styling

### 6. RPG-Styled Panels (Visual Foundation)

**Why**: Apply successful visual patterns from Restoration section to Character Sheet

**Panel Components**:
- Section panels: Styled containers with headers, borders, subtle backgrounds
- Progress bars: XP bar, wing completion, slot usage
- Status badges: For active buffs, equipped items, abilities
- Card-based lists: Enhance existing card layouts

**Specific Changes**:
- **Character Tab**: 
  - Hero section with character name and level
  - Large, prominent XP progress bar
  - Quick stats grid (currencies, slot counts)
  - Selected genres as tags/badges
- **Abilities Tab**:
  - Ability cards with "Learned" badge styling
  - Cost indicator with SMP icon
- **Inventory Tab**:
  - Enhance card layout with equipped badges
  - Slot usage progress bars
- **Environment Tab**:
  - Buff cards with duration indicators
  - Atmospheric buffs as toggle switches with daily counters

**Files to create**:
- `assets/css/rpg-panels.css` (optional, or integrate into character-sheet.css)

**Files to update**:
- `assets/css/character-sheet.css` - Add RPG panel styles
- `character-sheet.md` - Update HTML structure if needed
- `assets/js/character-sheet/ui.js` - Update rendering for new styles

### 7. Visual Feedback and Animations

**Why**: Make interactions feel responsive and rewarding

**Animations**:
- Currency updates: Flash animation when currencies change
- Quest completion: Subtle celebration animation
- Level up: Special animation and toast notification
- Form saves: Enhanced visual indicator
- Tab switching: Smooth transitions
- Card interactions: Hover effects, click feedback

**Files to update**:
- `assets/css/character-sheet.css` - Add animation keyframes
- `assets/js/character-sheet/ui.js` - Add animation helpers
- `assets/js/controllers/QuestController.js` - Add completion animations
- `assets/js/controllers/CharacterController.js` - Add level-up animation
- `assets/js/components/StatusWidget.js` - Animate currency updates

### 8. Mobile Optimization

**Why**: Character sheet should be usable on mobile devices

**Optimizations**:
- Status widget: Collapses to icon on mobile
- Tab navigation: Horizontal scrollable tabs on mobile
- Card layout: Stack cards vertically on mobile, grid on desktop
- Edit drawer: Full-screen on mobile
- Touch targets: All buttons/links at least 44x44px
- Form inputs: Larger inputs on mobile, better keyboard handling

**Files to update**:
- `assets/css/status-widget.css` - Mobile responsive
- `assets/css/tabs.css` - Mobile-responsive tab styles
- `assets/css/character-sheet.css` - Mobile media queries
- `assets/css/toast.css` - Mobile positioning

### 9. Consolidate Quest/Dungeon Pages into Overlays (Future Enhancement)

**Why**: Eliminate separate pages (`quests.md`, `dungeons.md`) and consolidate all rolling table content into Character Sheet overlays for better workflow

**Implementation**:
- **Expand overlay content**:
  - Genre Quests overlay: Already includes genre selection UI
  - Side Quests overlay: Add journaling prompts and quest descriptions
  - Dungeon Rooms overlay: Add journaling prompts, room descriptions, and dungeon rewards table
  - Atmospheric Buffs overlay: Already complete
- **Increase overlay size on large screens**: Make overlays 20% wider (from 50% to ~60% width) on very large monitors (1400px+)
- **Remove separate pages**:
  - Remove `quests.md` page (or convert to redirect/note)
  - Remove `dungeons.md` page (or convert to redirect/note)
  - Remove `assets/js/quests.js` initialization (genre selection now in overlay)
- **Update navigation**: Remove quest/dungeon links from sidebar, keep Character Sheet as main entry point
- **Preserve content**: All journaling prompts, descriptions, and tables should be accessible in overlays

**Benefits**:
- Single source of truth for all quest/dungeon content
- No navigation away from Character Sheet
- Better workflow: roll tables → add quest → continue working
- Cleaner site structure

**Files to update**:
- `assets/css/character-sheet.css` - Increase overlay width on large screens
- `character-sheet.md` - Ensure all overlay content is comprehensive
- `assets/js/character-sheet.js` - Expand overlay content rendering
- `_layouts/default.html` - Remove quest/dungeon navigation links
- `quests.md` - Convert to redirect or informational page
- `dungeons.md` - Convert to redirect or informational page
- `assets/js/quests.js` - Mark as deprecated/remove (genre selection moved to overlay)

**Files to potentially remove**:
- `assets/js/quests.js` (if no longer needed)

## Implementation Order

1. ✅ **Toast System** (foundation for feedback) - **COMPLETED**
2. ✅ **Global Status Widget** (high impact, visible everywhere) - **COMPLETED**
3. ✅ **Remove Currency Dupes** (cleanup after Status Widget) - **COMPLETED**
4. ✅ **Embed Roll Tables** (workflow improvement) - **COMPLETED** (as side overlays)
5. ✅ **Overlay Size Enhancement** (large screen optimization) - **COMPLETED** (overlays now 60% width on 1400px+ screens)
6. **RPG Panel Styling** (visual foundation) - **PENDING**
7. **Quest Edit Drawer** (UX improvement) - **PENDING**
8. **Visual Feedback** (polish) - **PENDING**
9. **Mobile Optimization** (final touches) - **IN PROGRESS** (partial: overlays and widget responsive)
10. **Consolidate Quest/Dungeon Pages** (future enhancement) - **PENDING**

## Testing Requirements

- ✅ All existing Jest tests continue to pass
- ✅ New test suites created:
  - `tests/toast.test.js` - Toast notification system tests
  - `tests/statusWidget.test.js` - Status widget tests
  - `tests/tableOverlay.test.js` - Table overlay system tests (22 tests, all passing)
- ✅ Manual smoke checks completed:
  - ✅ Status widget renders across all pages
  - ✅ Status widget updates reactively to state changes
  - ✅ Toast notifications appear for quest rewards and genre selection
  - ✅ Table overlays open/close correctly
  - ✅ Genre selection works in overlay with toast warnings
  - ✅ Mobile layout is responsive (overlays and widget)
- ⏳ Pending manual checks (for future work):
  - Editing a quest no longer changes "Add Quest" inputs (quest edit drawer)
  - RPG panel styling applied to Character Sheet sections
  - Visual feedback animations working

## Design Constraints

- **No new game mechanics**: Only presentation and UX improvements
- **No breaking changes**: Existing pages (quests.html, dungeons.html) remain intact
- **Follow existing patterns**: Use StateAdapter, view models, services (per EXTENDING-THE-CODEBASE.md)
- **Dark Academia theme**: Maintain existing color palette, add accent colors for status
- **Accessibility**: Keyboard navigation, ARIA labels, screen reader support

## Key Files Reference

- Layout hook: `_layouts/default.html`
- Site JS entry: `assets/js/main.js`
- Character sheet structure: `character-sheet.md`
- Quest logic: `assets/js/controllers/QuestController.js`
- Table renderer: `assets/js/table-renderer.js`
- State management: `assets/js/character-sheet/stateAdapter.js`
- UI rendering: `assets/js/character-sheet/ui.js`

