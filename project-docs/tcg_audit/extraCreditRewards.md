# extraCreditRewards.json audit

## Behavior mismatches
- `extraCreditRewards.json` appears non-authoritative at runtime; reward execution uses `GAME_CONFIG` values.
- Data file includes XP/Ink values, while runtime awards only paper scraps for Extra Credit.
- This creates a split source-of-truth that can mislead content updates.

## Test coverage status
- Covered: runtime Extra Credit behavior via RewardCalculator and related flow tests.
- Missing: tests that reference `extraCreditRewards.json` contract or alignment.
- Missing: explicit source-of-truth tests.

## Missing tests to add
- Schema contract tests for `extraCreditRewards.json`.
- Alignment tests between canonical runtime source and data file.
- Migration tests that verify defaults use intended canonical values.

## Risk summary
- Medium maintainability risk and high drift risk for contributors expecting JSON edits to affect runtime.
