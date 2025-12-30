# Manual Testing Guide: Library Restoration Features

This document outlines manual testing procedures for the Library Restoration expansion features.

## Prerequisites

1. Start the local Jekyll server:
   ```bash
   bundle exec jekyll serve --host 0.0.0.0 --port 4000
   ```
2. Navigate to `http://localhost:4000/tome-of-secrets/`

---

## Test Cases

### 1. Navigation & Page Load

#### 1.1 Navigation Tab Renamed
- [ ] Verify the sidebar shows "Restoration" instead of "The Library"
- [ ] Click "Restoration" link and confirm it navigates to `/library.html`

#### 1.2 Library Restoration Page Load
- [ ] Page loads without JavaScript errors (check browser console)
- [ ] Library map banner image displays at top of page
- [ ] Blueprint counter shows "0 Dusty Blueprints" (or current value)
- [ ] Progress bar displays "0/20 Projects Complete • 0/6 Wings Restored"
- [ ] All 6 wing cards are visible

---

### 2. Wing Cards Display

#### 2.1 Wing Card Content
For each wing (1-6), verify:
- [ ] Wing number badge displays correctly
- [ ] Wing name is correct:
  - Wing 1: The Scholarly Archives
  - Wing 2: Heart's Gallery
  - Wing 3: The Innovation Spire
  - Wing 4: The Enchanted Realm
  - Wing 5: The Shadow Quarter
  - Wing 6: Heart of the Library
- [ ] Genre tags display (first 3 genres)
- [ ] Room progress shows (e.g., "0/4 rooms")
- [ ] Project count shows (e.g., "0/3 projects")

#### 2.2 Wing Card Colors
- [ ] Each wing has a distinct color scheme:
  - Wing 1: Brown/sepia (scholarly)
  - Wing 2: Teal/rose (romance)
  - Wing 3: Blue/silver (sci-fi)
  - Wing 4: Purple/gold (fantasy)
  - Wing 5: Red/dark (horror)
  - Wing 6: Gold/cream (literary)

#### 2.3 Wing 6 Locked State
- [ ] Wing 6 shows 🔒 icon instead of 📖
- [ ] Shows "🔒 Complete other wings first" message
- [ ] Clicking Wing 6 does NOT open detail panel

---

### 3. Wing Detail Panel

#### 3.1 Opening Panel
- [ ] Clicking any unlocked wing card opens detail panel
- [ ] Panel slides in with animation
- [ ] Close button (×) is visible

#### 3.2 Panel Content
For each wing, verify:
- [ ] Wing name and theme description display
- [ ] All genre tags are shown
- [ ] Dungeon Rooms section shows correct rooms:
  - Wing 1: Rooms 5, 8, 10, 13
  - Wing 2: Rooms 3, 14, 15, 16
  - Wing 3: Rooms 6, 17, 18, 19
  - Wing 4: Rooms 2, 9, 20, 21
  - Wing 5: Rooms 1, 4, 7, 11, 12
  - Wing 6: No rooms (special wing)
- [ ] Each room shows name and completion status (○ or ●)
- [ ] Restoration Projects section shows projects (locked until rooms complete)

#### 3.3 Closing Panel
- [ ] Clicking × closes the panel
- [ ] Clicking outside panel closes it
- [ ] Panel closes with animation

---

### 4. Passive Equipment Section

#### 4.1 Initial State
- [ ] "Passive Equipment" heading displays with 🌟 icon
- [ ] Description text explains passive slot mechanics
- [ ] Two columns: "Passive Item Slots" and "Passive Familiar Slots"
- [ ] Both show "Complete restoration projects to unlock passive slots."

#### 4.2 Slot Unlocking (requires completing restoration projects)
- [ ] Completing a project that grants a passive slot updates the UI
- [ ] Unlocked slots show empty slot placeholder
- [ ] Slots can be assigned items/familiars (if implemented)

---

### 5. Dungeons Page Integration

#### 5.1 Wing Labels in Table
- [ ] Navigate to Dungeons page
- [ ] Verify each room shows its wing name in the table
- [ ] Wing names match assignments:
  - Rooms 1, 4, 7, 11, 12: Shadow Quarter
  - Rooms 2, 9, 20, 21: Enchanted Realm
  - Rooms 3, 14, 15, 16: Heart's Gallery
  - Rooms 5, 8, 10, 13: Scholarly Archives
  - Rooms 6, 17, 18, 19: Innovation Spire

#### 5.2 New Rooms Display
- [ ] Rooms 13-21 are visible in the table
- [ ] Each new room shows:
  - Roll number
  - Wing name
  - Room name and description
  - Challenge
  - Room Reward
  - Encounter table (where applicable)

#### 5.3 Item Links in Dungeon Table
- [ ] Room rewards with items show clickable links
- [ ] Familiar encounters show clickable links to rewards page
- [ ] Links navigate to correct anchor on rewards page

#### 5.4 Dungeon Completion Rewards
- [ ] Table header shows "Roll a d20"
- [ ] 20 rewards are listed
- [ ] Item rewards have clickable links

---

### 6. Rewards Page Integration

#### 6.1 New Items Display
Verify the following items appear in the Rewards page:

**Non-Wearable Section:**
- [ ] Dancing Shoes
- [ ] Dragon Fang
- [ ] Romance Reader's Ribbon
- [ ] Star Navigator's Chart
- [ ] Fae-Touched Crystal
- [ ] Warding Candle
- [ ] Literary Medallion
- [ ] Golden Pen
- [ ] Detective's Magnifying Glass

**Familiars Section:**
- [ ] Baby Hollyphant
- [ ] Coffee Elemental
- [ ] Lab Assistant Automaton
- [ ] Temporal Sprite
- [ ] Ingredient Sprite
- [ ] Herb Dragon
- [ ] Raven Familiar

#### 6.2 Item Content
For each new item, verify:
- [ ] Item name displays correctly
- [ ] Image placeholder/image displays
- [ ] Bonus description is accurate
- [ ] Anchor link works (e.g., `#baby-hollyphant`)

---

### 7. State Persistence

#### 7.1 Schema Migration
- [ ] Clear localStorage and reload character sheet
- [ ] Check console for migration messages (v1 → v2)
- [ ] Verify no errors about missing fields

#### 7.2 Blueprint Storage
- [ ] Blueprint count persists across page refreshes
- [ ] Blueprint count displays correctly on Restoration page

#### 7.3 Room Completion State
- [ ] Completing a dungeon room updates wing progress
- [ ] Progress persists across page refreshes

---

### 8. Reward Calculators

#### 8.1 Base Reward Calculation
Navigate to Character Sheet and use the reward calculator:
- [ ] Completing a book shows base Ink Drops calculation
- [ ] XP rewards display correctly based on book/quest type
- [ ] Paper Scraps rewards calculate correctly

#### 8.2 Active Item Bonus Application
Equip an active item and verify bonuses apply:
- [ ] Equip "Librarian's Compass" → +20 Ink Drops for new author books
- [ ] Equip "Pocket Dragon" → +20 Ink Drops for fantasy series
- [ ] Equip "Reading Glasses" → +20 XP for dense/challenging texts
- [ ] Multiplier items (e.g., "Scatter Brain Scarab" x3) apply correctly
- [ ] Multiple bonuses from same item stack correctly (e.g., XP + Ink Drops)

#### 8.3 Active Familiar Bonus Application
Equip an active familiar and verify bonuses apply:
- [ ] Equip "Tome-Bound Cat" → x2 Ink Drops on Atmospheric Buffs
- [ ] Equip "Page Sprite" → x2 Ink Drops for books under 300 pages
- [ ] Equip "Baby Hollyphant" → +15 XP and +5 Paper Scraps for philosophical books
- [ ] Equip "Coffee Elemental" → +10 Ink Drops for cozy reads

#### 8.4 Calculator Display Verification
- [ ] Calculator shows itemized breakdown of all bonuses
- [ ] Base rewards shown separately from item bonuses
- [ ] Multipliers displayed with correct calculation
- [ ] Final totals are mathematically correct

---

### 9. Passive Bonus Auto-Application

#### 9.1 Passive Slot Setup
First, set up test data with passive slots unlocked:
```javascript
// In browser console - setup passive slots
const state = JSON.parse(localStorage.getItem('tos_character_sheet_state') || '{}');
state.passiveItemSlots = 2;
state.passiveFamiliarSlots = 2;
state.equippedPassiveItems = ['Librarian\'s Compass', 'Pocket Dragon'];
state.equippedPassiveFamiliars = ['Coffee Elemental', 'Baby Hollyphant'];
localStorage.setItem('tos_character_sheet_state', JSON.stringify(state));
location.reload();
```

#### 9.2 Passive Item Bonus Verification
With passive items equipped, verify HALF bonuses auto-apply:
- [ ] "Librarian's Compass" passive: +10 Ink Drops (half of +20) for new authors
- [ ] "Pocket Dragon" passive: +10 Ink Drops (half of +20) for fantasy series
- [ ] "Reading Glasses" passive: +10 XP (half of +20) for complex books
- [ ] "Cloak of the Story-Weaver" passive: +5 Ink Drops (half of +10) for series

#### 9.3 Passive Familiar Bonus Verification
With passive familiars equipped, verify HALF bonuses auto-apply:
- [ ] "Coffee Elemental" passive: +5 Ink Drops (half of +10) for cozy books
- [ ] "Baby Hollyphant" passive: +7 XP (half of +15, rounded) for philosophical
- [ ] "Page Sprite" passive: x1.5 Ink Drops (half of x2) for short books
- [ ] "Temporal Sprite" passive: +10 Ink Drops (half of +20) for non-linear

#### 9.4 Passive + Active Stacking
Verify passive and active bonuses stack correctly:
- [ ] Same item type in active AND passive slot: bonuses combine
- [ ] Different items in active + passive: both bonuses apply
- [ ] Calculator shows separate line items for active vs passive bonuses
- [ ] Final total includes all applicable bonuses

#### 9.5 Passive Bonus Display in Calculator
- [ ] Passive bonuses labeled distinctly (e.g., "(passive)" suffix)
- [ ] Passive bonuses show reduced values (half of active)
- [ ] Passive section appears in calculator breakdown
- [ ] Passive bonuses do NOT appear if no passive slots unlocked

#### 9.6 Multiplier Passive Bonuses
Test items with multiplier bonuses in passive slots:
- [ ] "Scatter Brain Scarab" passive: x1.5 (half of x3) for multiple books
- [ ] "Tome of Potential" passive: x1.5 (half of x3) for 400+ page books
- [ ] "Page Sprite" passive: x1.5 (half of x2) for under 300 pages
- [ ] Multipliers apply AFTER flat bonuses are calculated

#### 9.7 Utility Item Passive Effects
Test utility items with special abilities in passive slots:
- [ ] "Chalice of Restoration" passive: Once every 2 months (not monthly)
- [ ] "Lantern of Foresight" passive: Once every 2 months (not monthly)
- [ ] "Raven Familiar" passive: Once every 2 months remove Worn Page
- [ ] Usage tracking respects the 2-month passive cooldown

---

### 10. Edge Cases & Boundary Testing

#### 10.1 No Items Equipped
- [ ] Calculator works with zero active items
- [ ] Calculator works with zero passive items
- [ ] Base rewards calculate correctly without bonuses

#### 10.2 Maximum Slots Filled
- [ ] All passive item slots filled: all bonuses apply
- [ ] All passive familiar slots filled: all bonuses apply
- [ ] No performance issues with maximum equipment

#### 10.3 Bonus Condition Matching
- [ ] Bonuses only apply when conditions are met
- [ ] Genre-specific bonuses don't apply to wrong genres
- [ ] Page-count bonuses check actual page count
- [ ] Series bonuses only apply to series books

#### 10.4 Rounding Behavior
- [ ] Half-values round correctly (e.g., +15 → +7 or +8)
- [ ] Multiplier results round to whole numbers
- [ ] No floating-point display issues

---

### 11. Browser Console Checks

#### 8.1 No Critical Errors
On each page, verify no critical JavaScript errors:
- [ ] Restoration page
- [ ] Character Sheet
- [ ] Dungeons page
- [ ] Rewards page

#### 8.2 Expected Warnings
These warnings are acceptable:
- Migration logs (schema version updates)
- Validation warnings for optional fields

---

## Test Data Setup

### Basic State Setup
To test with pre-populated data, you can manually set localStorage:

```javascript
// In browser console - Basic restoration progress
localStorage.setItem('tos_character_sheet_state', JSON.stringify({
  schemaVersion: 2,
  dustyBlueprints: 100,
  completedDungeonRooms: [1, 2, 3, 4, 5],
  completedRestorationProjects: [],
  passiveItemSlots: 0,
  passiveFamiliarSlots: 0
}));
location.reload();
```

### Passive Slot Testing Setup
To test passive bonus calculations:

```javascript
// In browser console - Full passive slot setup
localStorage.setItem('tos_character_sheet_state', JSON.stringify({
  schemaVersion: 2,
  dustyBlueprints: 200,
  completedDungeonRooms: [1, 2, 3, 4, 5, 6, 7, 8],
  completedRestorationProjects: ['project-1', 'project-2'],
  passiveItemSlots: 2,
  passiveFamiliarSlots: 2,
  equippedPassiveItems: ["Librarian's Compass", "Cloak of the Story-Weaver"],
  equippedPassiveFamiliars: ["Coffee Elemental", "Pocket Dragon"]
}));
location.reload();
```

### Calculator Testing Setup
To test reward calculations with various bonuses:

```javascript
// In browser console - Calculator test with inventory
const formData = JSON.parse(localStorage.getItem('tos_character_sheet_form') || '{}');
formData.equippedItem = "Reading Glasses";
formData.equippedFamiliar = "Baby Hollyphant";
localStorage.setItem('tos_character_sheet_form', JSON.stringify(formData));

const state = JSON.parse(localStorage.getItem('tos_character_sheet_state') || '{}');
state.inventory = [
  "Librarian's Compass",
  "Pocket Dragon", 
  "Coffee Elemental",
  "Cloak of the Story-Weaver",
  "Romance Reader's Ribbon"
];
state.passiveItemSlots = 2;
state.passiveFamiliarSlots = 1;
state.equippedPassiveItems = ["Librarian's Compass", "Cloak of the Story-Weaver"];
state.equippedPassiveFamiliars = ["Coffee Elemental"];
localStorage.setItem('tos_character_sheet_state', JSON.stringify(state));
location.reload();
```

### Clear All Test Data
To reset to fresh state:

```javascript
// In browser console - Clear all game data
localStorage.removeItem('tos_character_sheet_state');
localStorage.removeItem('tos_character_sheet_form');
location.reload();
```

---

## Known Issues

- Wing 6 (Heart of the Library) is intentionally locked until other wings are complete
- Passive slot assignment UI may not be fully implemented yet
- Some item images may be placeholder/missing until generated

---

## Test Environment

- **Browser**: Chrome, Firefox, Safari (latest versions)
- **Screen sizes**: Desktop (1920x1080), Tablet (768px), Mobile (375px)
- **Jekyll version**: As specified in Gemfile

