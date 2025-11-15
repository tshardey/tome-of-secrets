# Manual Testing Guide

Quick manual tests to verify the character sheet and JSON data extraction are working correctly.

## Prerequisites

1. Start the local Jekyll server:
   ```bash
   bundle exec jekyll serve
   ```
2. Open the character sheet: `http://localhost:4000/tome-of-secrets/character-sheet.html`

---

## Test 1: XP Levels Display (JSON Data Migration)

**Purpose:** Verify that `xpLevels` from JSON displays correctly

**Steps:**
1. Navigate to the Character Sheet page
2. Find the "Level" input field
3. Change the level from `1` to `5`
4. Check the "XP Needed" field next to it

**Expected Result:**
- When level = 1: XP Needed = 100
- When level = 5: XP Needed = 1750
- When level = 10: XP Needed = 9750
- When level = 20: XP Needed = "Max"

**What this tests:**
- ✅ JSON data for `xpLevels` is loaded correctly
- ✅ Generated JS exports work properly
- ✅ Character sheet can access migrated data

---

## Test 2: Permanent Bonuses (JSON Data Migration)

**Purpose:** Verify that `permanentBonuses` from JSON displays correctly

**Steps:**
1. On the Character Sheet page, find the "Level" input
2. Set level to `3`
3. Scroll down to find the "Permanent Bonuses" section

**Expected Result:**
- At level 3: You should see "Atmospheric Forecaster" bonus
- At level 6: You should see "Novice's Focus" bonus added
- At level 7: You should see "Focused Atmosphere" bonus added
- At level 9: You should see "Insightful Draw" bonus added

**What this tests:**
- ✅ JSON data for `permanentBonuses` is loaded correctly
- ✅ HTML content in JSON is rendered properly
- ✅ Level-based bonus display works

---

## Test 3: Atmospheric Buffs Display (JSON Data Migration)

**Purpose:** Verify that `atmosphericBuffs` from JSON displays correctly in the Environment tab

**Steps:**
1. On the Character Sheet, navigate to the "Environment" tab (🌿)
2. Scroll down to find the "♦️ Atmospheric Buffs" section
3. Check that all atmospheric buffs are displayed in the table

**Expected Result:**
The table should display all 8 atmospheric buffs with their descriptions:
- The Candlight Study - "Light a [scented] candle while you read."
- The Herbalist's Nook - "Brew a special cup of tea or a hot beverage to enjoy with your book."
- The Soundscape Spire - "Create a vibe with ambient music or a 'bookish vibe' video on YouTube."
- The Excavation - "Clean and organize your reading space before you read."
- The Cozy Hearth - "Sit by a fire, real or from a television."
- The Soaking in Nature - "Read outside in the grass or in your garden."
- The Wanderer's Path - "Read in a new place, either in your home or somewhere new entirely."
- Head in the Clouds - "Read in a cozy, overstuffed chair, bed, or another favorite comfortable spot."

**What this tests:**
- ✅ JSON data for `atmosphericBuffs` is loaded correctly
- ✅ Object structure (description field) is preserved
- ✅ Table rendering works with migrated data

---

## Quick Verification Checklist

After running all 3 tests, verify:
- [ ] No console errors in browser DevTools (F12)
- [ ] All data displays correctly
- [ ] Character sheet saves/loads state properly
- [ ] Refreshing the page preserves your character data

---

## If Something Goes Wrong

**Check:**
1. Browser console (F12) for JavaScript errors
2. That `data.json-exports.js` exists (if missing, run `node scripts/generate-data.js`)
3. Network tab to ensure JSON files are loading (if applicable)

**Common Issues:**
- **"Cannot find module"**: Run `node scripts/generate-data.js` to generate the exports file
- **Wrong data displayed**: Check that JSON files in `assets/data/` match what's expected
- **Console errors**: Check that all imports are working correctly

