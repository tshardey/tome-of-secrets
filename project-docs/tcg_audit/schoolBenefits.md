# schoolBenefits.json audit

## Behavior mismatches
- `Abjuration` prevention flow is implemented, but the full follow-up benefit (draw/choose/complete) is not fully represented in runtime.
- `Evocation` is data-defined as an activated school effect, but current action handling appears incomplete in controller logic.
- `Conjuration`, `Transmutation`, and `Enchantment` are generally aligned with current paths.

## Test coverage status
- Covered: Enchantment auto-apply and Abjuration prevention basics.
- Covered: Divination helper behavior through draw-helper tests.
- Missing: school activation action tests and Conjuration slot-unlock assertions tied to school selection.

## Missing tests to add
- Controller tests for school activation actions and cooldown enforcement.
- Slot service test for Conjuration-based familiar slot increase.
- Data-contract tests for school effect semantics and supported actions.

## Risk summary
- High risk for partially implemented school abilities appearing fully functional in UI/data.
- Medium risk from sparse activation-path coverage.
