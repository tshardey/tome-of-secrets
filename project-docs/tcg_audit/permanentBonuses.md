# permanentBonuses.json audit

## Behavior mismatches
- Several permanent bonuses are displayed/discovered but not fully enforced by runtime reward mechanics.
- Some effects are inferred from prose heuristics rather than structured effect schema, creating fragility.
- Page-count and atmospheric-specific permanent bonus behaviors are not consistently implemented.

## Test coverage status
- Covered: data presence and UI rendering/discovery basics.
- Partial: helper discovery classification exists.
- Missing: end-to-end mechanic tests for permanent bonus effects in reward flows.

## Missing tests to add
- Book completion tests for level-based permanent XP bonuses.
- Atmospheric reward tests for permanent bonus modifiers.
- Contract tests for prose parsing stability or migration to structured schema.

## Risk summary
- High gameplay drift risk: visible permanent bonuses may not execute as players expect.
