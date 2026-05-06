# FWR.10: Highlight Applicable Tags in Tag Picker

## Summary

When the tag picker renders in book add/edit forms, tags that would trigger a bonus from the player's current active effects (equipped items, background, magical powers) get a visual color accent. This lets players see at a glance which tags are "live" with their current loadout.

## Requirements

- All tags remain visible and selectable (no filtering)
- Tags whose ID appears in a `tagMatch` or `hasTag` condition from any active effect source get a gold/amber accent
- Active effect sources: equipped items, background, magical powers
- Highlighting is static — computed once when the tag picker renders
- Applies to both the add-book and edit-book tag pickers

## Architecture

### Data Flow

1. On tag picker render, gather all active effects from equipped items, background, and magical powers
2. Extract the set of tag IDs referenced in `tagMatch` and `hasTag` conditions across those effects
3. Pass that set into `_renderTagPicker`
4. Tags in that set receive a CSS class (`tag--applicable`) for visual accent

### Changes

#### `LibraryController.js`

- New method: `_getApplicableTagIds()`
  - Queries state for equipped items (via `stateAdapter`)
  - Queries state for active background and magical powers
  - Iterates all `effects` arrays from those sources
  - For each effect with a `condition.tagMatch`, flattens the nested arrays and collects tag IDs
  - For each effect with a `condition.hasTag`, collects those tag IDs
  - Returns a `Set<string>` of all referenced tag IDs

- Modified method: `_renderTagPicker(container, selectedTags = [], applicableTags = new Set())`
  - When rendering each tag checkbox/label, checks if `applicableTags.has(tag.id)`
  - If true, adds `tag--applicable` class to the label element

- Modified call sites:
  - Add form (line ~85): compute applicable tags, pass to `_renderTagPicker`
  - Edit form (line ~564): compute applicable tags, pass to `_renderTagPicker`

#### CSS

- New class `.tag--applicable`: gold/amber left-border or background tint on the tag label
- Should be subtle enough not to overwhelm but clearly distinguishable from non-applicable tags

### Condition Extraction Logic

```javascript
_getApplicableTagIds() {
    const tagIds = new Set();
    // Get all active effect sources (items, background, magical powers)
    // For each effect:
    //   if condition.tagMatch exists: flatten groups, add each tag ID
    //   if condition.hasTag exists: add each tag ID
    return tagIds;
}
```

This reuses the same condition schema defined in `effectSchema.js` (lines 38-39) and mirrors the matching logic in `ModifierPipeline.evaluateCondition()`.

## Visual Treatment

- `.tag--applicable` applies a subtle gold/amber accent (left border or background tint)
- Existing checkbox layout is unchanged
- No additional icons, tooltips, or badges in this iteration

## Out of Scope

- Dynamic updating (re-rendering if loadout changes while picker is open)
- Toggle to filter/hide non-applicable tags
- Tooltip showing which item/source triggers the bonus
