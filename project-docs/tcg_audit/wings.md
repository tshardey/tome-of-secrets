# wings.json audit

## Behavior mismatches
- Special wing with empty `rooms` can produce division-by-zero progress UI artifacts (`NaN%`) in library rendering.
- Runtime consumes fields (`name`, `genres`, `theme`, `colorPalette`) that validator does not fully enforce.
- Library map uses hardcoded wing order, reducing data-driven extensibility.

## Test coverage status
- Covered: basic lookup and some restoration behavior using wing IDs.
- Missing: direct tests for `wingProgress` service and `libraryRenderer` edge cases.
- Missing: validator tests for full wing schema and cross-file room consistency.

## Missing tests to add
- Zero-room wing progress rendering test.
- Contract tests for wing required fields and room references.
- Cross-file tests ensuring room-to-wing consistency with `dungeonRooms.json`.

## Risk summary
- Medium risk of UI breakage and silent schema drift when wing data changes.
