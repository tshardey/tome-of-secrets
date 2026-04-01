# shoppingOptions.json audit

## Behavior mismatches
- `allowQuantity` is ignored for `subscription-month` cards in current renderer path.
- Unknown `type` values silently degrade to generic rendering instead of explicit failure.
- Shopping is out-of-band from modifier pipeline; costs are direct deductions from shopping config path.

## Test coverage status
- Covered: core shopping rendering, purchase flow, and insufficiency handling.
- Covered: shopping-related persisted-state validation.
- Missing: schema-contract tests for enum/type/ID constraints and duplicate-ID collisions.

## Missing tests to add
- Contract tests for unique IDs, valid `type`, numeric non-negative costs, and boolean flags.
- Tests for malformed options and duplicate ID handling.
- Explicit boundary tests documenting that shopping spend is intentionally not pipeline-modified.

## Risk summary
- Medium risk of silent data drift because schema assumptions are not strongly enforced.
