# curseTableDetailed.json audit

## Behavior mismatches
- Current data is coherent, but validator checks are weaker than runtime assumptions (`name`, `description`, `number` constraints).
- Requirement text is derived from description sentence structure, so wording edits can alter behavior silently.
- Duplicate `name`/`number` collision handling is not explicitly enforced.

## Test coverage status
- Covered: core curse lookup/render/controller behavior and derived requirement basics.
- Missing: direct validator tests and malformed-description derivation tests.
- Missing: collision and numeric-input lookup edge-case coverage.

## Missing tests to add
- Validator tests for required fields and number uniqueness/order.
- Data derivation tests for requirement extraction robustness.
- Lookup tests for numeric input and duplicate conflict handling.

## Risk summary
- Medium maintenance risk: format-sensitive derivation with light schema enforcement.
