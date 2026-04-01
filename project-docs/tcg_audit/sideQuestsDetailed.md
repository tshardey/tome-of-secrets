# sideQuestsDetailed.json audit

## Behavior mismatches
- Runtime matching still depends heavily on prompt/name text, not stable quest IDs from data.
- Some narrative rewards diverge from executable logic (e.g., deterministic item grant vs described roll branch).
- Completion logic differs between table and side-quest deck services in fallback behavior.

## Test coverage status
- Covered: structural checks, rendering presence, and basic reward smoke paths.
- Missing: direct tests for `SideQuestDeckService` behavior contracts.
- Missing: tests for narrative-to-runtime parity on side quest reward semantics.

## Missing tests to add
- Service-level completion/availability tests with exact and fallback matching.
- Parity tests ensuring table/deck completion logic agrees.
- Behavior-contract tests for quests with branching/scaling reward text.

## Risk summary
- High risk of player-facing drift and completion-history fragility from text-based matching.
