# xpLevels.json audit

## Behavior mismatches
- Max-level (`"Max"`) handling differs between some UI surfaces (main sheet vs status widget behavior).
- Missing-level fallback can be treated as max-level in some paths, masking bad keys/out-of-range states.
- Semantics around “cumulative” display labeling vs runtime threshold usage are ambiguous.

## Test coverage status
- Covered: happy-path progression and max behavior in major UI tests.
- Partial: status widget tests are limited and do not assert level 20 consistency.
- Missing: strict schema contract tests and malformed-value resilience tests.

## Missing tests to add
- Contract tests for contiguous keys, numeric monotonic values, and strict `20 = "Max"` rule.
- Cross-surface max-level consistency tests.
- Invalid/malformed key/value handling tests to prevent NaN state corruption.

## Risk summary
- Medium risk of confusing XP/progression displays and hidden data-shape failures.
