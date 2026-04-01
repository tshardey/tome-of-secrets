# expansions.json audit

## Behavior mismatches
- Manifest fields like `services` are not fully consumed/validated by runtime tooling.
- Expansion gating is partially declarative; many data imports are static and not feature-gated by manifest flags.
- `core.enabled` semantics are not consistently enforced across helper methods.

## Test coverage status
- Covered: basic content-registry checks and one expansion-gated repair path.
- Missing: dependency edge-case tests (requires chains/cycles), manifest-to-export parity checks, and validator behavior tests.

## Missing tests to add
- Content-registry tests for disabled core, transitive requirements, and cycle safety.
- Manifest/data-file parity tests against generated exports.
- Validation tests for manifest schema and referenced service/file existence.

## Risk summary
- Medium risk: manifest can drift into metadata-only status with weak behavioral guarantees.
