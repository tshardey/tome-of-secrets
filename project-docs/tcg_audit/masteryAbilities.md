# masteryAbilities.json audit

## Behavior mismatches
- `Quick Shot`, `Concussive Blast`, and `Irresistible Charm` use `ACTIVATE` modifiers on `ON_QUEST_COMPLETED`, which does not execute through current activation paths.
- `Echo Chamber` behavior in data appears inconsistent with refactor plan notes (slot unlock vs familiar multiplier).
- Familiar-related modifiers use `target` fields that rely on special-case reward code instead of generic pipeline resource handling.

## Test coverage status
- Covered: `Silver Tongue` and `Alchemic Focus` reward behavior in `tests/RewardCalculator.test.js`.
- Partial: draw-helper mastery behaviors are mostly tested with mocks, not real catalog data.
- Missing: activated mastery paths and cooldown behavior for multiple abilities.

## Missing tests to add
- Integration tests for activation discovery/execution from real `masteryAbilities.json`.
- Contract tests that `ACTIVATE` effects use `ON_ACTIVATE` and reward modifiers have required fields.
- Regression tests for non-functional abilities to make current gaps explicit.

## Risk summary
- High risk of silent no-op effects for several mastery abilities.
- Medium risk of schema drift due to mixed generic vs special-case modifier handling.
