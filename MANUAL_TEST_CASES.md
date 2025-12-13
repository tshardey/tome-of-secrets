# Manual Test Cases for Quest Card Layout

These test cases should be run locally in a browser to verify the new card-based quest layout works correctly.

## Prerequisites

- Local development server is running (`bundle exec jekyll serve`)
- Navigate to the Character Sheet page (`/character-sheet.html`)
- Browser DevTools open to monitor console and inspect elements

---

## Test Case 1: Card Layout and Responsive Design

**Objective:** Verify that quest cards display correctly and adapt to different screen sizes.

**Steps:**
1. Navigate to the Character Sheet page
2. Go to the "Quests" tab
3. Add a new quest with the following details:
   - Month: January
   - Year: 2024
   - Quest Type: ♥ Organize the Stacks
   - Select a genre quest
   - Book Title: "The Test Book"
   - Book Author: "Test Author"
   - Notes: "Test notes"
4. Verify the quest appears as a card (not a table row) with:
   - Quest type badge at the top
   - Date (Month Year) displayed
   - Book title prominently displayed
   - Book author displayed below the title in italic
   - Prompt text visible
   - Rewards section with grid layout
   - Action buttons at the bottom
5. Resize the browser window to different widths:
   - **Large screen (> 768px):** Cards should display in multiple columns (3+)
   - **Tablet (480px - 768px):** Cards should display in 2 columns
   - **Mobile (< 480px):** Cards should stack in a single column
6. Verify cards maintain proper spacing and don't overlap

**Expected Results:**
- Cards display in a responsive grid layout
- Cards adapt to screen size appropriately
- All information is clearly visible and readable
- No horizontal scrolling required

---

## Test Case 2: Book Author Display

**Objective:** Verify that book author is displayed correctly on quest cards.

**Steps:**
1. Add a new quest with:
   - Book Title: "The Great Gatsby"
   - Book Author: "F. Scott Fitzgerald"
2. Verify the author appears below the book title in italic, gold-colored text
3. Add another quest with:
   - Book Title: "1984"
   - Book Author: (leave blank)
4. Verify the author field still exists but is empty (for consistent layout)
5. Edit the first quest and change the author to "Francis Scott Fitzgerald"
6. Verify the author updates correctly
7. Check completed and discarded quest tabs - verify authors display there too

**Expected Results:**
- Author is always displayed (even if empty) for consistent layout
- Author text is styled in italic, gold color
- Author updates correctly when editing quests
- Author displays in all quest lists (active, completed, discarded)

---

## Test Case 3: Item Reward Images

**Objective:** Verify that item rewards display with their images.

**Steps:**
1. Complete a dungeon quest that rewards an item (or manually add an item reward)
2. Verify the item appears in the rewards section with:
   - A small thumbnail image (32x32px)
   - Item name displayed next to the image
3. Check multiple items:
   - Add a quest that rewards multiple items
   - Verify each item displays with its own image
   - Verify items are laid out in a grid
4. Test with items that have images and items without images:
   - Items with images should show the thumbnail
   - Items without images should still display the name
5. Hover over item images and verify tooltip shows item name

**Expected Results:**
- Item rewards display with small thumbnail images (32x32px)
- Images are properly sized and don't distort
- Item names are visible next to images
- Multiple items display in a grid layout
- Items without images still display correctly

---

## Test Case 4: Long Book Title Handling

**Objective:** Verify that long book titles wrap properly and don't overflow.

**Steps:**
1. Add a quest with a very long book title:
   - Book Title: "This Is A Very Long Book Title That Should Wrap Properly Within The Card Container Without Bleeding Out Or Causing Layout Issues"
2. Verify:
   - Title wraps to multiple lines within the card
   - Title doesn't overflow the card boundaries
   - Card height adjusts to accommodate wrapped text
   - No horizontal scrolling is required
3. Test with extremely long single-word titles (if applicable)
4. Test on different screen sizes to ensure wrapping works at all breakpoints

**Expected Results:**
- Long titles wrap to multiple lines
- Titles never overflow card boundaries
- Cards adjust height to fit content
- No layout breaking or horizontal scrolling

---

## Test Case 5: Encounter Action Badges (Befriend/Defeat)

**Objective:** Verify that dungeon encounter actions are displayed correctly.

**Steps:**
1. Add a new Dungeon Crawl quest:
   - Quest Type: ♠ Dungeon Crawl
   - Select a room with encounters
   - Select an encounter
   - Toggle to "Befriend" or "Defeat"
   - Complete the quest
2. Verify the completed quest card shows:
   - A badge indicating "🤝 Befriended" (green) or "⚔️ Defeated" (red)
   - Badge appears in the card header next to quest type and date
3. Test both actions:
   - Create a quest with "Befriend" - verify green badge
   - Create a quest with "Defeat" - verify red badge
4. Verify badges only appear for dungeon encounters, not regular room challenges

**Expected Results:**
- Befriend/Defeat badges display correctly for dungeon encounters
- Badges are color-coded (green for befriend, red for defeat)
- Badges only appear for encounter quests, not room challenges
- Badge text is clear and readable

---

## Test Case 6: Rewards Display

**Objective:** Verify that all reward types display correctly in the card layout.

**Steps:**
1. Create quests with different reward combinations:
   - Quest with XP only
   - Quest with Paper Scraps only
   - Quest with Ink Drops only
   - Quest with Items only
   - Quest with all reward types
2. Verify each reward type displays in its own grid cell:
   - XP shows with "XP" label and value
   - Paper Scraps shows with 📄 emoji and value
   - Ink Drops shows with 💧 emoji and value
   - Items show with images and names
3. Verify reward indicators:
   - Active quests with buffs show "*" indicator
   - Completed quests with modifiers show "✓" indicator
4. Test quests with no rewards - verify "No rewards" message displays

**Expected Results:**
- All reward types display in a grid layout
- Each reward has appropriate label/icon
- Reward indicators show correctly
- Empty rewards show appropriate message

---

## Test Case 7: Action Buttons

**Objective:** Verify that action buttons work correctly in the card layout.

**Steps:**
1. For active quests, verify buttons:
   - "Complete" button appears
   - "Discard" button appears
   - "Delete" button appears
   - "Edit" button appears
2. Click "Complete" and verify:
   - Quest moves to completed tab
   - Card appears in completed quests
3. Click "Edit" and verify:
   - Form populates with quest data
   - Author field populates correctly
   - Changes save correctly
4. Click "Delete" and verify quest is removed
5. Test buttons on completed and discarded quests:
   - Completed quests should only have "Delete" and "Edit"
   - Discarded quests should only have "Delete" and "Edit"

**Expected Results:**
- All action buttons display correctly
- Buttons are properly sized and clickable
- Button actions work as expected
- Buttons are hidden when printing (no-print class)

---

## Test Case 8: Cross-Tab Consistency

**Objective:** Verify that quest cards display consistently across all tabs.

**Steps:**
1. Create quests in different states:
   - Active quest
   - Complete a quest
   - Discard a quest
2. Verify cards display consistently in:
   - Active Book Assignments tab
   - Archived Quests → Completed Quests tab
   - Archived Quests → Discarded Quests tab
3. Verify all information displays the same way:
   - Book title and author
   - Rewards
   - Buffs/Items
   - Notes
   - Action buttons (where applicable)

**Expected Results:**
- Cards have consistent styling across all tabs
- All information displays correctly in each tab
- No layout differences between tabs

---

## Test Case 9: Data Persistence

**Objective:** Verify that quest data, including author, persists correctly.

**Steps:**
1. Create several quests with authors
2. Refresh the page (F5)
3. Verify:
   - All quests still display
   - Authors are still visible
   - All card information persists
4. Check localStorage (DevTools → Application → Local Storage):
   - Verify `activeAssignments`, `completedQuests`, `discardedQuests` contain quest data
   - Verify `bookAuthor` field is stored for each quest
5. Clear localStorage and reload - verify quests are cleared

**Expected Results:**
- All quest data persists across page refreshes
- Author field is saved and loaded correctly
- Data structure is valid JSON

---

## Test Case 10: Edge Cases

**Objective:** Test edge cases and error handling.

**Steps:**
1. Test with special characters in book title/author:
   - Title: "Test & Book"
   - Author: "Author <script>alert('xss')</script>"
   - Verify HTML is escaped and displays as text
2. Test with very long author names
3. Test with empty/null values
4. Test with quests that have many items (5+)
5. Test with quests that have many buffs
6. Test printing the page - verify cards print correctly

**Expected Results:**
- Special characters are escaped and display safely
- Long content wraps appropriately
- Empty values handled gracefully
- Many items/buffs display without breaking layout
- Cards print correctly (action buttons hidden)

---

## Browser Compatibility Testing

Test in the following browsers:
- Chrome (latest)
- Firefox (latest)
- Safari (if available)
- Edge (if available)

Verify:
- Cards display correctly in all browsers
- Responsive breakpoints work
- No console errors
- localStorage works correctly

---

## Performance Testing

**Steps:**
1. Create 20+ quests
2. Verify:
   - Page loads in reasonable time
   - Cards render quickly
   - Scrolling is smooth
   - No performance issues

**Expected Results:**
- Page remains responsive with many quests
- No noticeable lag when rendering cards
