# dungeonRewards.json audit

## Behavior mismatches
- `dungeonRewards.json` is display-only in table rendering; runtime reward calculations source from config/room data paths.
- Penalty strings shown in this file are not mechanically enforced by reward services.
- Renderer assumes fixed schema keys and can silently emit `undefined` if shape drifts.

## Test coverage status
- Covered: basic table rendering includes reward labels.
- Covered separately: runtime reward behavior (but not tied to this file).
- Missing: schema contract and cross-source alignment tests.

## Missing tests to add
- Contract tests for required keys/fields and string values.
- Renderer tests for penalty text and missing-key behavior.
- Alignment tests ensuring display reward strings match runtime-config values.

## Risk summary
- Medium risk of player-facing doc/runtime mismatch due to dual source of truth.
