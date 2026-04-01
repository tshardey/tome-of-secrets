# dungeonRooms.json audit

## Behavior mismatches
- Room completion semantics differ across runtime surfaces (deck progression vs claim/table completion rules).
- Dual encounter structures (`encounters` and `encountersDetailed`) are consumed by different systems and can drift.
- Validator coverage does not fully enforce `encountersDetailed` fields used by runtime.

## Test coverage status
- Covered: core room reward behavior and deck service paths.
- Partial: some table edge cases are tested.
- Missing: full parity tests between `encounters` and `encountersDetailed` and wing consistency checks.

## Missing tests to add
- Contract tests that both encounter structures stay in sync per room.
- Full-room sweep tests through reward resolution for all encounter entries.
- Cross-file consistency tests with `wings.json`.

## Risk summary
- Medium risk of silent divergence when room content is edited in only one encounter structure.
