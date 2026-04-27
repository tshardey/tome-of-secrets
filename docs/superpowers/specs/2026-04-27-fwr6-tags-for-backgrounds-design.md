# fwr.6 — Tags for backgrounds, schools, and mastery abilities

## Summary

Convert background effects that use legacy content-based conditions (`genre`, `hasTag`) to the `tagMatch` system. Add two new tags to the vocabulary to support the conversions. Schools and mastery abilities have no content-based conditions and require no changes.

## New tags

Add to `assets/data/bookTags.json`:

| ID | Label | Category |
|----|-------|----------|
| `historical-fiction` | Historical Fiction | `genre` |
| `mythology` | Mythology | `content` |

## Archivist conversion

**Current condition:**
```json
{ "genre": ["Non-Fiction", "Historical Fiction"] }
```

**New condition:**
```json
{ "tagMatch": [["non-fiction"], ["historical-fiction"]] }
```

Benefit text unchanged — already matches the tag semantics.

## Prophet conversion

**Current condition:**
```json
{ "hasTag": ["religious", "spiritual", "mythological"] }
```

**New condition:**
```json
{ "tagMatch": [["philosophical"], ["mythology"], ["celestial"]] }
```

Benefit text updated to: "Gain a +15 Ink Drop bonus any time you complete a quest by reading a book with a spiritual, mythological, or celestial premise."

## Schools and mastery abilities

No changes. All effects are mechanical (quest type conditions, activations, cooldowns, familiar scaling) — none are content-based.

## Files changed

1. `assets/data/bookTags.json` — add `historical-fiction` and `mythology` tags
2. `assets/data/keeperBackgrounds.json` — convert Archivist and Prophet conditions to `tagMatch`
3. Run `node scripts/generate-data.js` after JSON edits

## Testing

- Existing `tagMatch` tests continue to pass
- Add test cases verifying Archivist effect fires with `non-fiction` and `historical-fiction` tags
- Add test cases verifying Prophet effect fires with `philosophical`, `mythology`, and `celestial` tags
- Full test suite passes (`cd tests && npm test`)
