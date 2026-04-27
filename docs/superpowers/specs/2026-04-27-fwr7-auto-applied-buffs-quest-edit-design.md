# fwr.7: Display Auto-Applied Buffs and Items on Quest Edit

## Summary

Change the quest edit drawer's bonus card section from manual buff/item selection to a tag-aware display. Items and backgrounds with `tagMatch` conditions are shown as auto-applied (or grayed out if unmatched), while subjective items (Scatter Brain Scarab, Coffee Elemental) and temp buffs remain toggleable.

## Card States

Each bonus card in the drawer is classified into one of three states based on whether it has `tagMatch` conditions and whether those conditions match the quest's linked book tags.

### 1. Auto-applied (matched tagMatch)

- Green border, `✓ Auto` badge, non-clickable
- The item/background has effects with `tagMatch` conditions, and at least one group matches the book's tags
- Always included in the saved buffs array — no player action needed
- No tag badges shown (the match is self-evident)

### 2. Unmatched (has tagMatch, no match)

- Grayed out (reduced opacity), non-clickable
- Shows "Needs: [tag badges]" using `renderItemTagBadges` from fwr.8
- Player can see what tags would activate this item
- Not included in saved buffs

### 3. Subjective (no tagMatch conditions)

- Purple accent, `Your Choice` badge, clickable toggle
- Items without `tagMatch` conditions: Scatter Brain Scarab, Coffee Elemental, temporary buffs, Cartographer background (uses `firstDungeonCrawl` condition, not tagMatch)
- Player toggles selection as before

## Data Flow

1. `populateQuestEditDrawer(quest)` reads `quest.bookId`
2. Looks up the linked book from `characterState[STORAGE_KEYS.BOOKS]`
3. Extracts the book's `tags` array (or empty array if no book/tags)
4. Passes tags to `updateEditQuestBuffsDropdown(selectedValues, bookTags)`
5. `renderBonusCards` receives `bookTags` as a new optional parameter
6. For each bonus:
   - If it has `itemData`, call `extractItemTagGroups(itemData)` to check for tagMatch conditions
   - For backgrounds, check whether the background data in `keeperBackgrounds` has effects with tagMatch
   - If tagMatch groups exist, evaluate with `ModifierPipeline.evaluateCondition({ tagMatch: groups }, { tags: bookTags })` or equivalent inline check
   - Classify as auto-applied, unmatched, or subjective
7. Render card with appropriate state
8. Auto-applied cards are force-included in the hidden input value; subjective cards toggle as before

## Edge Cases

### No linked book or no tags

All items with `tagMatch` conditions are shown grayed out. A message at the top of the bonus section reads: "No tags on book — add tags to see auto-applied bonuses." Subjective items remain toggleable.

### Quest-create drawer (not edit)

The quest-create flow (`updateQuestBuffsDropdown`) does not pass `bookTags`, so `renderBonusCards` falls back to the current all-manual behavior. No changes to the create flow.

### Background classification

- **Archivist** and **Prophet** backgrounds have `tagMatch` conditions in their effects → classified as auto-applied or unmatched based on book tags
- **Cartographer** background uses `firstDungeonCrawl` condition (not tagMatch) → classified as subjective

## Changes Required

### `ui.js` — `renderBonusCards`

- Add optional `bookTags` parameter
- Import `extractItemTagGroups` from `renderComponents.js`
- For each bonus, determine card state (auto-applied / unmatched / subjective)
- Pass state to `createBonusCard`

### `ui.js` — `createBonusCard`

- Accept card state parameter
- Auto-applied: add `auto-applied` CSS class, render `✓ Auto` badge, skip click handler
- Unmatched: add `unmatched` CSS class, render tag badges via `renderItemTagBadges`, skip click handler
- Subjective: add `subjective` CSS class, render `Your Choice` badge, keep click handler

### `ui.js` — `updateEditQuestBuffsDropdown`

- Accept `bookTags` parameter and pass to `renderBonusCards`

### `ui.js` — `updateBonusSelection`

- Include auto-applied cards in the hidden input value alongside manually selected cards

### `QuestController.js` — `populateQuestEditDrawer`

- Look up the linked book's tags from `characterState`
- Pass tags to `updateEditQuestBuffsDropdown`

### CSS

- `.quest-bonus-card.auto-applied` — green border, non-interactive
- `.quest-bonus-card.unmatched` — reduced opacity, non-interactive
- `.quest-bonus-card.subjective` — purple accent, interactive

### Tests

- Test card state classification logic (auto-applied, unmatched, subjective)
- Test that auto-applied cards are included in hidden input
- Test that unmatched cards are excluded from hidden input
- Test edge case: no book tags → all tagMatch items grayed out
- Test subjective items remain toggleable regardless of tags
