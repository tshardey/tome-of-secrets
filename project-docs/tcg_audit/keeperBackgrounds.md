# keeperBackgrounds.json audit

## Behavior mismatches
- `prophet` and `archivist` conditions depend on quest/book metadata that is not consistently persisted (tags/genre), making triggers unreliable.
- Legacy manual background bonus cards still exist and can overlap with pipeline auto-apply behavior.
- `cartographer` wording relies on a room-card-to-drafted-quest 1:1 assumption.

## Test coverage status
- Covered: `cartographer`, `scribe`, `biblioslinker`, and grove atmospheric behavior in targeted tests.
- Missing: real-data integration tests for `archivist` and `prophet` condition firing.
- Missing: regression tests for double-application with legacy manual background cards.

## Missing tests to add
- Reward integration tests for `archivist`/`prophet` with real persisted field sources.
- Explicit no-double-stack test between background auto effects and legacy manual bonus cards.
- Schema-contract tests tying condition keys to guaranteed payload fields.

## Risk summary
- High risk that some background effects are effectively dead in real state.
- Medium risk of ambiguous stacking from dual legacy + pipeline behavior.
