# sanctumBenefits.json audit

## Behavior mismatches
- Sanctum effects remain legacy/hardcoded in atmospheric reward services rather than effect-pipeline data paths.
- Data is keyed by display name without stable IDs, making rename persistence brittle.
- `associatedBuffs` references are not strongly validated against atmospheric catalog entries.

## Test coverage status
- Covered: key sanctum reward/highlight behavior in UI/view-model/reward tests.
- Missing: schema-level contract tests for sanctum data and cross-file references.
- Missing: guard tests for renderer assumptions (hero maps and fixed sanctum list behavior).

## Missing tests to add
- Sanctum schema contract and cross-catalog reference tests.
- Config/text alignment tests for sanctum multiplier wording.
- Persistence compatibility tests for sanctum key changes.

## Risk summary
- Medium risk from silent data drift and architectural divergence from pipeline conventions.
