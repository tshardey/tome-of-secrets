# genreQuests.json audit

## Behavior mismatches
- `genreQuests.rewards` is used for preview/deck surfaces, but completion reward resolution still depends on config constants in core reward logic.
- Validator coverage for genre quest schema is weaker than runtime expectations (`genre`, `description`, `blueprintReward`, full reward fields).
- Duplicate genre label risk can silently overwrite map-style lookups.

## Test coverage status
- Covered: basic shape/id checks and rendering presence.
- Partial: blueprint collision case exists, but broad real-data parity is missing.
- Missing: end-to-end contract tests that preview rewards equal awarded rewards.

## Missing tests to add
- Full schema contract test for each quest entry.
- Uniqueness tests for ID and genre labels.
- Runtime parity tests between deck preview and completed quest rewards.

## Risk summary
- Medium-high risk of split source-of-truth drift between data display and awarded rewards.
