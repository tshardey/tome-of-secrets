# atmosphericBuffs.json audit

## Behavior mismatches
- Runtime mostly keys atmospheric buffs by display name, not stable ID, making rename/migration fragile.
- End-of-month atmospheric rewards iterate state directly and can award for unknown/stale keys.
- Forced atmospheric buff names are not strongly validated against the data catalog.

## Test coverage status
- Covered: atmospheric reward math, UI behavior, view models, and room-visualization interactions.
- Missing: direct tests for catalog-vs-state drift and forced-name validity checks.
- Missing: strict schema/data-contract tests for runtime-critical fields like `stickerSlug`.

## Missing tests to add
- Drift test ensuring unknown state keys are ignored or explicitly handled.
- Cross-file slug mapping tests with `roomThemes.json`.
- Contract tests for required atmospheric fields and ID/name stability behavior.

## Risk summary
- Medium-high correctness risk from catalog/state drift and name-key coupling.
