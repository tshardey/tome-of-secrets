# dungeonCompletionRewards.json audit

## Behavior mismatches
- Some rolls map to rewards that are currently runtime no-ops (notably `Story Surge`).
- Multiple reward texts imply constrained or multi-use semantics that are not enforced by current state/effect handling.
- File shape assumptions are not strongly schema-validated.

## Test coverage status
- Covered: reward draw lookup/clamping and duplicate item refund behavior.
- Covered: table rendering spot checks for selected entries.
- Missing: full 1..20 contract coverage and mechanical effect assertions for each reward entry.

## Missing tests to add
- Full roll-to-applied-effect contract tests for all completion rewards.
- Explicit tests for text-promised semantics (`Librarian's Blessing`, `Enchanted Focus`, `The Archivist's Favor`).
- Schema tests for required fields and link-shape validity.

## Risk summary
- High functional risk: some completion rewards may appear awarded without actual game-state effect.
