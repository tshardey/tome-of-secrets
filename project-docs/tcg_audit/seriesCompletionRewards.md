# seriesCompletionRewards.json audit

## Behavior mismatches
- Multiple stop descriptions promise mechanical upgrades that are not applied by runtime reward logic (notably stop 2, 5, 7, and 10 text portions).
- `passive-rule-modifier` style rewards are currently treated as narrative/display outcomes only.
- Map and stop schema fields are not fully contract-tested against runtime assumptions.

## Test coverage status
- Covered: expedition progression and typed reward plumbing in `SeriesCompletionService` tests.
- Partial: helper discovery has synthetic checks, not comprehensive real-data behavior locking.
- Missing: tests for mechanical enforcement of text-promised stop effects.

## Missing tests to add
- Integration tests for each mechanical stop promise and associated reward paths.
- Stop 10 split behavior tests (slot unlock + dungeon XP claim).
- Data-shape and coordinate-system contract tests.

## Risk summary
- High risk of player-facing text/runtime divergence in expedition rewards.
