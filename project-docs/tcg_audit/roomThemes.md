# roomThemes.json audit

## Behavior mismatches
- Current slug mappings appear aligned, but runtime has limited defensive checks for malformed theme/sticker shapes.
- Theme selection is hardcoded (`cozy-modern`) in key paths, so additional themes in data are inert without code updates.
- Asset-path assumptions are not validated by schema tests.

## Test coverage status
- Covered: room visualization service behavior with mocked data.
- Missing: tests using real `roomThemes.json` and cross-file slug integrity contracts.
- Missing: component/controller integration tests for actual render behavior with production theme data.

## Missing tests to add
- Cross-file integrity tests: atmospheric `stickerSlug` and item sticker slugs must resolve in room theme stickers.
- Real-theme render tests for base/sticker layers and style fields.
- Schema contract tests for theme object shape.

## Risk summary
- Medium risk of silent visual regression if room theme data drifts from assumptions.
