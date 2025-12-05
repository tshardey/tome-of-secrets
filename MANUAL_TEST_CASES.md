# Manual Test Cases for Genre Selection Feature

These test cases should be run locally in a browser to verify the genre selection functionality works correctly.

## Test Case 1: Dice Selection and Genre Limits

**Objective:** Verify that users can select different dice types (d4, d6, d8, d10, d12, d20) and the system enforces the correct genre limits for each.

**Prerequisites:**
- Local development server is running (`bundle exec jekyll serve`)
- Navigate to the Quests page (`/quests.html`)
- Browser DevTools open to monitor localStorage

**Steps:**
1. Navigate to the Quests page
2. Locate the "Number of Genres (Dice Type)" dropdown selector
3. Verify the dropdown shows options: d4 (4 genres), d6 (6 genres), d8 (8 genres), d10 (10 genres), d12 (12 genres), d20 (all genres)
4. Select "d4" from the dice selector
5. Verify the title updates to show "(0/4)"
6. Add 4 genres (e.g., Fantasy, Sci-Fi, Romance, Horror)
7. Verify:
   - The title shows "(4/4)"
   - The "Add Genre" button becomes disabled
   - You cannot add more than 4 genres
8. Change dice selector to "d8"
9. Verify:
   - The title updates to show "(4/8)"
   - You can now add 4 more genres (up to 8 total)
   - The "Add Genre" button is enabled again
10. Add 4 more genres to reach 8 total
11. Verify the "Add Genre" button becomes disabled at 8 genres
12. Change dice selector to "d6"
13. Verify:
   - The genre list is automatically trimmed to 6 genres (first 6 selected)
   - The title shows "(6/6)"
14. Check localStorage (DevTools → Application → Local Storage) and verify:
   - `genreDiceSelection` key is set to the selected dice value (e.g., "d6")
   - `selectedGenres` array contains the selected genres

**Expected Results:**
- Dice selector correctly updates the genre limit
- Genre limits are enforced (cannot exceed the dice maximum)
- Title dynamically shows current count vs. maximum
- Add button is disabled when limit is reached
- Switching to a lower dice automatically trims excess genres
- All changes persist in localStorage

---

## Test Case 2: d20 Auto-Selection of All Genres

**Objective:** Verify that selecting d20 automatically selects all available genres.

**Prerequisites:**
- Local development server is running
- Navigate to the Quests page
- Start with no genres selected (or clear localStorage first)

**Steps:**
1. Navigate to the Quests page
2. Verify no genres are currently selected (or clear them if needed)
3. Locate the dice selector dropdown
4. Select "d20 (all genres)" from the dropdown
5. Verify immediately:
   - All 20 genres are automatically added to the selected genres display
   - The title shows "(20/20)" (or shows the actual count of all available genres)
   - The "Add Genre" button is disabled
   - All genres are visible in the selected genres list
6. Scroll through the selected genres list and verify:
   - All new genres are present: "Comics/Manga/Graphic Novels", "History", "Philosophy"
   - Renamed genres appear correctly: "Thriller/Mystery" (not "Thriller"), "Fiction" (not "Literary Fiction"), "Comedy" (not "LitRPG")
   - Other existing genres are present
7. Verify the genre quests table shows all genres numbered 1-20
8. Check localStorage and verify:
   - `selectedGenres` array contains all 20 genre names
   - `genreDiceSelection` is set to "d20"
9. Try to remove a genre by clicking the × button on one genre
10. Verify the genre can be removed even with d20 selected
11. Change dice selector to "d6"
12. Verify:
   - Genres are trimmed to the first 6
   - Title shows "(6/6)"
   - Add button is enabled if you want to change selections

**Expected Results:**
- Selecting d20 immediately selects all 20 available genres
- All new and renamed genres are correctly included
- Genre quests table shows all genres with correct numbering
- Users can still manually remove genres even with d20 selected
- Changing dice selector trims genres appropriately

---

## Test Case 3: Genre Updates and Data Persistence

**Objective:** Verify that genre name changes are reflected correctly and data persists across page refreshes.

**Prerequisites:**
- Local development server is running
- Navigate to the Quests page
- Browser DevTools open

**Steps:**
1. Navigate to the Quests page
2. Select "d6" from the dice selector
3. Add the following genres: "Thriller/Mystery", "Fiction", "Comedy", "Comics/Manga/Graphic Novels", "History", "Philosophy"
4. Verify:
   - All genre names appear correctly (no old names like "Thriller", "Literary Fiction", or "LitRPG")
   - Each genre has its correct description when you hover or check the genre quests table
5. Verify the genre quests table shows:
   - Correct dice type in the title: "Your Custom Genre Quests (Roll a D6)"
   - All 6 selected genres with their descriptions
   - Correct numbering (1-6)
6. Refresh the page (F5 or Ctrl+R)
7. Verify after refresh:
   - All 6 genres are still selected
   - Dice selector still shows "d6"
   - Genre quests table is still populated correctly
   - Title shows "(6/6)"
8. Navigate to the Character Sheet page
9. Verify in the Character Sheet:
   - Selected genres are displayed in the "Selected Genres" section
   - Genres are numbered 1-6
   - All genre names are correct (new names, not old ones)
10. Return to the Quests page
11. Change dice selector to "d10"
12. Add 4 more genres to reach 10 total
13. Refresh the page
14. Verify all 10 genres persist after refresh
15. Check localStorage in DevTools and verify:
   - `selectedGenres` array contains exactly 10 genres
   - `genreDiceSelection` is set to "d10"
   - Data structure is valid JSON

**Expected Results:**
- All genre name updates are reflected correctly (Thriller→Thriller/Mystery, Literary Fiction→Fiction, LitRPG→Comedy)
- New genres (Comics/Manga/Graphic Novels, History, Philosophy) are available and work correctly
- All data persists across page refreshes
- Genre selections are synced between Quests page and Character Sheet
- localStorage contains valid, consistent data
- Genre quests table updates to show correct dice type in title

---

## Additional Verification Points

**Cross-Page Consistency:**
- Verify genre selections made on the Quests page appear on the Character Sheet
- Verify genre quest dropdown on Character Sheet uses selected genres
- Verify genre quest table shows correct dice type

**Edge Cases to Test:**
- Switch between all dice types multiple times
- Add genres, then switch to a lower dice (verify trimming works)
- Select d20, then switch to a lower dice (verify trimming works)
- Remove genres when at maximum limit
- Test with browser localStorage disabled/enabled
- Test with corrupted localStorage data (should default gracefully)

**Browser Compatibility:**
- Test in Chrome, Firefox, and Safari (if available)
- Verify localStorage persistence works across browser sessions
- Test with browser DevTools open to monitor localStorage changes
- Verify no console errors appear
