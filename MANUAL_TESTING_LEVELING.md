# Manual Testing Guide - Automatic Leveling Rewards

## Overview
This guide provides manual test scenarios to verify the automatic leveling rewards functionality.

## Manual Test Scenarios

### Test 1: Single Level Up with Currency Rewards
**Purpose:** Verify that currency (inkDrops, paperScraps) is automatically added when leveling up.

**Steps:**
1. Open the character sheet in your browser
2. Set your current level to **1**
3. Set your current inkDrops to **10** and paperScraps to **5**
4. Change your level to **2**
5. **Expected Result:**
   - inkDrops should increase to **15** (10 + 5 from level 2 reward)
   - paperScraps should increase to **7** (5 + 2 from level 2 reward)

**Verification Points:**
- Currency values update automatically without manual input
- No need to manually add rewards
- Values persist after page refresh

---

### Test 2: Multiple Level Ups (Level Jump)
**Purpose:** Verify that rewards are correctly calculated when jumping multiple levels at once.

**Steps:**
1. Set your current level to **1**
2. Set inkDrops to **0** and paperScraps to **0**
3. Change your level directly to **4**
4. **Expected Result:**
   - inkDrops should be **20** (5 from level 2 + 5 from level 3 + 10 from level 4)
   - paperScraps should be **10** (2 from level 2 + 3 from level 3 + 5 from level 4)
   - Unallocated inventory slots should be **1** (from level 4)

**Verification Points:**
- All intermediate level rewards are applied
- No rewards are skipped
- Inventory slot is tracked correctly

---

### Test 3: Level Up with SMP and Inventory Slot
**Purpose:** Verify SMP rewards and inventory slot allocation tracking.

**Steps:**
1. Set your current level to **4**
2. Set SMP to **0**
3. Note your current slot values (should be 1 wearable, 1 non-wearable, 1 familiar)
4. Change your level to **5**
5. **Expected Result:**
   - SMP should increase to **1** (from level 5 reward)
   - No inventory slot reward at level 5, so unallocated slots remain 0
6. Change your level to **8**
7. **Expected Result:**
   - Unallocated inventory slots should be **1** (from level 8 reward)
   - A warning note should appear in the Inventory tab: "⚠️ You have 1 unallocated inventory slot available..."
8. Go to the Inventory tab
9. Increase your "Wearable Slots" from 1 to 2
10. **Expected Result:**
    - The unallocated slots counter should decrease to **0**
    - The warning note should disappear
    - Your wearable slots should now be **2**

**Verification Points:**
- SMP is automatically added
- Inventory slot note appears when unallocated slots > 0
- Allocating a slot reduces unallocated slots
- Note disappears when all slots are allocated

---

## Additional Edge Cases to Test

### Edge Case 1: Level Decrease
- Set level to 5, then decrease to 3
- **Expected:** Currency should NOT decrease (rewards are not removed)

### Edge Case 2: Partial Slot Allocation
- Level up to get 2 unallocated slots (e.g., level 12 which gives 6 total slots expected)
- Set your current slots to 4 total (e.g., 2 wearable, 1 non-wearable, 1 familiar)
- **Expected:** Warning shows "2 unallocated slots"
- Increase wearable slots by 1 (total becomes 5)
- **Expected:** Warning updates to show "1 unallocated slot" (not disappear)
- Increase another slot by 1 (total becomes 6)
- **Expected:** Warning disappears (all slots allocated)

### Edge Case 3: Slot Decrease and Re-allocation
- Level up to level 8 (expected 5 total slots)
- Set your slots to 5 total (e.g., 3 wearable, 1 non-wearable, 1 familiar)
- **Expected:** No warning (all slots allocated)
- Decrease wearable slots by 1 (total becomes 4)
- **Expected:** Warning appears showing "1 unallocated slot"
- Increase any slot type by 1
- **Expected:** Warning disappears again

### Edge Case 4: Multiple Slot Types
- Level up to get unallocated slots
- Try increasing different slot types (wearable, non-wearable, familiar)
- **Expected:** Any slot type increase reduces unallocated count, warning updates dynamically

---

## Automated Tests

The following automated tests have been added to `tests/controllers.test.js`:

1. ✅ **CharacterController: should apply rewards when level increases**
   - Tests single level up with currency rewards

2. ✅ **CharacterController: should apply rewards for multiple level increases**
   - Tests level jump from 1 to 4

3. ✅ **CharacterController: should award SMP when leveling up to levels with SMP rewards**
   - Tests SMP reward at level 5

4. ✅ **CharacterController: should track unallocated inventory slots when leveling up**
   - Tests inventory slot tracking at level 4

5. ✅ **CharacterController: should not apply rewards when level decreases**
   - Tests that rewards are not removed on level decrease

6. ✅ **InventoryController: should reduce unallocated slots when a slot is increased**
   - Tests slot allocation reduces unallocated slots

7. ✅ **InventoryController: should not reduce unallocated slots below zero**
   - Tests edge case where slot increase exceeds unallocated slots

8. ✅ **InventoryController: should not reduce unallocated slots when slot decreases**
   - Tests that decreasing slots doesn't affect unallocated count

---

## Running Automated Tests

To run all tests:
```bash
cd tests
npm test
```

To run only the controller tests:
```bash
cd tests
npm test -- controllers.test.js
```

---

## Notes

- All level rewards are defined in `assets/data/levelRewards.json`
- Previous level is tracked in form data (`previousLevel` field)
- Unallocated slots are tracked in form data (`unallocatedSlots` field)
- The system handles edge cases like level decreases and multiple level jumps gracefully

