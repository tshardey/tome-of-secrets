# temporaryBuffs.json audit

## Behavior mismatches
- Several buffs have richer prose semantics than runtime enforces (choose-one effects, multi-book counters, strict expiration).
- End-of-month does not auto-expire temporary buffs despite `until-end-month` durations in data.
- Rewards page still focuses legacy source for temporary buff rendering, leaving catalog split concerns.

## Test coverage status
- Covered: lookup basics and some controller add/use behavior.
- Partial: reward-modifier paths exist, but text-level semantics are not enforced in tests.
- Missing: tests for choice handling, use-count handling, and strict duration behavior.

## Missing tests to add
- Data contract tests for temp buff schema and allowed durations.
- Behavior tests for `The Archivist's Favor`, `Enchanted Focus`, and `Unwavering Resolve` semantics.
- Cross-file consistency tests between temporary buff catalogs.

## Risk summary
- High risk of player-facing rules/runtime mismatch for key temporary buffs.
