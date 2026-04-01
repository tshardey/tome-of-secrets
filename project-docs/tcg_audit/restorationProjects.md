# restorationProjects.json audit

## Behavior mismatches
- Many `reward.suggestedItems` entries do not resolve to real items in `allItems.json`, creating guidance/runtime drift.
- Canonical project ID assumptions (`key` vs `project.id`) are not strongly enforced by tests or validator.
- Validation does not fully enforce runtime-required field completeness/types.

## Test coverage status
- Covered: restoration completion/spend flows and basic registry usage.
- Missing: cross-file suggested-item existence tests.
- Missing: contract tests ensuring key/ID integrity and reward-type schema constraints.

## Missing tests to add
- Cross-file test that each suggested item exists in the item catalog.
- Contract tests for required restoration fields and `reward.type` enums.
- Validator tests for restoration project malformed fixtures.

## Risk summary
- Medium risk of content-authoring drift and confusing suggested rewards.
