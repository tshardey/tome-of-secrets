# temporaryBuffsFromRewards.json audit

## Behavior mismatches
- Duplicated buff definitions across `temporaryBuffs` and `temporaryBuffsFromRewards` create drift risk.
- Merge order in effect collection lets legacy entries override on collisions.
- `Long Read Focus` prose implies scaling, but runtime applies flat modifier behavior.

## Test coverage status
- Covered: one fallback lookup path indirectly.
- Missing: direct tests for legacy lookup helpers and collision precedence.
- Missing: validation tests for this file's schema and runtime semantics.

## Missing tests to add
- Lookup tests for reward-temp-buff APIs by key/id/name.
- Precedence tests when both buff catalogs define same entry.
- Semantic tests for scaling vs flat handling of `Long Read Focus`.

## Risk summary
- Medium risk: current data works but future divergence is likely to go undetected.
