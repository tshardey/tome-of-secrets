# fwr.8 — Display applicable tags on reward items

## Summary

Add a "Responds to:" section to item cards showing which book tags trigger the item's bonus via `tagMatch` conditions. Read-only display only — no interaction. Items without `tagMatch` effects show no tags.

## Tag extraction

A utility function reads an item's `effects` array, collects all `tagMatch` groups across all effects, deduplicates them, and returns the unique groups. Each group is an array of tag IDs — a group with multiple IDs means AND (all tags required).

For example, Dancing Shoes has effects with `tagMatch: [["romance"], ["contemporary-fiction"], ["social"]]` across equipped and passive slots. The extraction deduplicates to three single-tag groups: `[["romance"], ["contemporary-fiction"], ["social"]]`.

## Display

**Label:** Small uppercase "Responds to:" above the tag badges, styled in muted gold (`#8a7a61`).

**Tag badges:** Gold pill-shaped badges — `background: rgba(184,159,98,0.15)`, `border: 1px solid rgba(184,159,98,0.3)`, `color: #b89f62`, `border-radius: 10px`, small font.

**Placement:** After bonus text, before action buttons in `renderItemCard()`.

**Connector rules:**

- All single-tag groups: badges side by side, no connectors
- AND within a group: `+` text between tags in the group
- Mixed AND groups + other groups: *or* (italic) between groups, `+` within AND groups

**Tag labels:** Resolved from `bookTags.json` via tag ID lookup. E.g. `"new-author"` displays as `"New-to-You Author"`.

## Scope

**In scope:**

- Tag display on item cards (equipped, inventory, passive slots)
- Tag extraction utility with deduplication
- CSS for tag badges and connectors

**Not in scope:**

- Tag display on backgrounds, schools, or mastery abilities
- Tag filtering or interactive behavior
- Tooltip hover behavior

## Files changed

1. `assets/js/character-sheet/renderComponents.js` — add tag rendering to `renderItemCard()`
2. `assets/css/style.scss` — add CSS for `.item-tag-section`, `.item-tag-badge`, connector elements

## Testing

- Unit test for tag extraction: single tags, AND groups, mixed OR/AND, no effects, no tagMatch, deduplication across slots
- Unit test for connector logic: when to show `+`, when to show *or*, when neither
- Full test suite passes (`cd tests && npm test`)
