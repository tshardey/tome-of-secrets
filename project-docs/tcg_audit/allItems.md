# allItems.json audit

## Behavior mismatches
- Plan-expected updates are missing/incomplete for some items (notably `Celestial Koi Fish`, `Lantern of Foresight`) in structured `effects`.
- `The Scepter of Knowledge`, `Chalice of Restoration`, and `Raven Familiar` have cooldown/every-2-month text mismatches between passive copy and effect modeling.
- `Golden Pen` has `ON_JOURNAL_ENTRY` effect but lacks `excludeFromQuestBonuses`, so it can leak into quest bonus-card selection.

## Test coverage status
- Covered: structural item checks and legacy reward-modifier behavior.
- Partial: pipeline behavior is tested mostly with mocked catalogs, not real `allItems.json`.
- Missing: integration tests for journal-triggered and cooldown-triggered item effects from real data.

## Missing tests to add
- Real-data integration tests for journal effects (`Librarian's Quill`, `Golden Pen`) and cooldown prevention items.
- UI bonus-card filtering test to ensure non-quest items are excluded.
- Cadence consistency tests for passive slot semantics.

## Risk summary
- High risk of trigger-surface leakage and incorrect bonuses.
- Medium risk of design drift where updated content does not map to executable effects.
