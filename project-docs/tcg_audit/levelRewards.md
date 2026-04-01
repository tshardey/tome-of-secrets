# levelRewards.json audit

## Behavior mismatches
- Leveling table has hardcoded assumptions (`1..20`, `+1` slot display wording) that can drift from raw data values.
- Runtime arithmetic does not strongly coerce/validate reward numeric fields, increasing malformed-data risk.
- Adjacent XP table labeling may imply cumulative semantics while runtime uses threshold semantics.

## Test coverage status
- Covered: level-up rewards in controller/sheet tests.
- Partial: table rendering tests assert fixed known strings, not full data-driven behavior.
- Missing: schema contract tests for `levelRewards.json` and direct `SlotService` unit tests.

## Missing tests to add
- Data contract tests for key continuity and numeric value constraints.
- Direct `SlotService` milestone and edge-case tests.
- Renderer robustness tests ensuring display reflects raw `inventorySlot` values.

## Risk summary
- Medium risk now, high drift risk on future content edits.
