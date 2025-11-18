# Manual Tests: Controller-Based Architecture Refactor

**Date:** 2025-01-27  
**Purpose:** Verify that the controller-based architecture refactor didn't break any existing functionality

## Test Environment Setup

1. Open the character sheet in your local development environment
2. If you have existing saved data, use that instance to verify backwards compatibility
3. If you don't have saved data, create a new character for testing

---

## Test 1: Complete Feature Workflow - Adding and Completing a Quest

**Goal:** Verify that quest-related functionality works end-to-end through the QuestController

**Steps:**
1. Navigate to the "Active Book Assignments" tab
2. Click "Add Quest" button
3. Select a quest type (try different types):
   - Standard quest type (e.g., "Book Review")
   - Dungeon Crawl (♠)
   - Organize the Stacks (♥)
   - Side Quest (♣)
   - Extra Credit (⭐)
4. Fill in quest details:
   - Month and Year
   - Book title
   - Notes (optional)
5. Select buffs from the dropdown (if applicable)
6. Click "Add Quest" or "Update Quest" if editing
7. **Expected Result:** Quest appears in the Active Assignments list
8. Click "Complete Quest" on a quest
9. **Expected Result:** 
   - Quest moves to Completed Quests
   - Rewards are added to currency (XP, Ink Drops, Paper Scraps, Items)
   - If it's a new book, the books completed counter increments
10. Try editing a quest:
    - Click "Edit Quest" on an active quest
    - Modify some fields
    - Click "Update Quest"
11. **Expected Result:** Quest updates correctly with new values
12. Try discarding a quest:
    - Click "Discard Quest" on an active quest
13. **Expected Result:** Quest moves to Discarded Quests

**Notes:**
- All quest operations should work seamlessly
- No JavaScript errors in the console
- Form validation should show inline errors for invalid inputs

---

## Test 2: Character Management and Equipment

**Goal:** Verify that CharacterController, AbilityController, and InventoryController work correctly

**Steps:**
1. **Character Info Changes:**
   - Change your character's level
   - **Expected Result:** XP needed updates, permanent bonuses recalculate
   - Change your Keeper Background
   - **Expected Result:** Benefits update, atmospheric buffs update, quest buffs dropdown updates
   - Change your Wizard School
   - **Expected Result:** Benefits update
   - Change your Library Sanctum
   - **Expected Result:** Benefits update, atmospheric buffs update

2. **Abilities:**
   - Navigate to the "Abilities" tab
   - Select an ability from the dropdown
   - Click "Learn Ability"
   - **Expected Result:** 
     - SMP is deducted by the ability's cost
     - Ability appears in learned abilities list
     - If you don't have enough SMP, an inline error appears
   - Click "Forget" on a learned ability
   - **Expected Result:** 
     - Confirmation dialog appears
     - SMP is refunded
     - Ability is removed from the list

3. **Inventory:**
   - Navigate to the "Inventory" tab
   - Add an item from the dropdown
   - **Expected Result:** Item appears in inventory
   - Click "Equip" on an inventory item
   - **Expected Result:** 
     - Item moves to equipped section
     - Quest buffs dropdown updates
   - Click "Unequip" on an equipped item
   - **Expected Result:** Item moves back to inventory
   - Try to equip when slots are full
   - **Expected Result:** Inline error appears
   - Click "Delete" on an item
   - **Expected Result:** Confirmation dialog appears, item is removed

**Notes:**
- All character management features should work correctly
- No JavaScript errors in the console
- State persists correctly (refresh page to verify)

---

## Test 3: Curses, Buffs, and End of Month

**Goal:** Verify that CurseController, BuffController, and EndOfMonthController work correctly

**Steps:**
1. **Curses:**
   - Navigate to the "Curses" tab
   - Select a curse from the dropdown
   - Enter a book title (optional)
   - Click "Add Curse"
   - **Expected Result:** Curse appears in Active Curses
   - Click "Complete Curse" on an active curse
   - **Expected Result:** Curse moves to Completed Curses
   - Click "Edit Curse" on an active curse
   - **Expected Result:** Form populates with curse data
   - Click "Update Curse"
   - **Expected Result:** Curse updates correctly
   - Click "Delete" on a curse
   - **Expected Result:** Confirmation dialog appears, curse is removed

2. **Temporary Buffs:**
   - Navigate to the "Environment" tab
   - Scroll to Temporary Buffs section
   - Enter a buff name and description
   - Select a duration
   - Click "Add Buff"
   - **Expected Result:** Buff appears in the temporary buffs list
   - Click "Mark as Used" on a buff
   - **Expected Result:** Buff status updates
   - Click "Remove" on a buff
   - **Expected Result:** Confirmation dialog appears, buff is removed

3. **Atmospheric Buffs:**
   - In the Environment tab, find Atmospheric Buffs
   - Toggle a buff's active checkbox
   - **Expected Result:** Buff active status updates
   - Change the days used for a buff
   - **Expected Result:** Days used value updates

4. **End of Month:**
   - Navigate to any tab with an "End of Month" button
   - Set up some test data:
     - Complete some books (increment books completed counter)
     - Add some journal entries (increment journal entries counter)
     - Activate some atmospheric buffs with days used
     - Have some temporary buffs active
   - Click "End of Month" button
   - **Expected Result:** 
     - Success alert appears: "End of Month processed! Rewards distributed and counters reset."
     - Atmospheric buff ink drops are added to currency
     - Book completion XP is added to currency
     - Journal entry paper scraps are added (with Scribe bonus if applicable)
     - Books completed counter resets to 0
     - Journal entries counter resets to 0
     - Atmospheric buffs reset (days used = 0, active = false, except Grove Tender's buff)
     - Temporary buffs decrement monthsRemaining or are removed if expired
     - Quest buffs dropdown updates

**Notes:**
- All buff and curse operations should work correctly
- End of month processing should handle all calculations correctly
- State persists correctly (refresh page to verify)

---

## Additional Verification

**After completing all tests:**

1. **State Persistence:**
   - Refresh the page
   - **Expected Result:** All your data (quests, items, abilities, buffs, curses) is still present
   - Check the browser console for any errors

2. **No Regression:**
   - All existing functionality should work exactly as before
   - Performance should be the same or better
   - No JavaScript errors should appear in the console

3. **Form Validation:**
   - Try submitting forms with invalid data
   - **Expected Result:** Inline error messages appear (not alert dialogs)
   - Error messages are clear and helpful

---

## Known Issues to Report

If you encounter any of the following, please report them:
- JavaScript errors in the browser console
- Features that don't work as expected
- Data loss after refresh
- Performance issues
- UI elements that don't update correctly
- Validation errors that aren't helpful

---

## Success Criteria

All tests pass if:
- ✅ All quest operations work correctly
- ✅ Character management (level, background, school, sanctum) updates correctly
- ✅ Abilities can be learned and forgotten
- ✅ Inventory items can be added, equipped, unequipped, and deleted
- ✅ Curses can be added, completed, edited, and deleted
- ✅ Temporary buffs can be added, marked as used, and removed
- ✅ Atmospheric buffs can be toggled and days updated
- ✅ End of month processing works correctly with all calculations
- ✅ All state persists correctly after page refresh
- ✅ No JavaScript errors in the console
- ✅ Form validation shows inline errors (not alerts)

