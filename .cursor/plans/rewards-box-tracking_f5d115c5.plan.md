---
name: rewards-box-tracking
overview: "Plan the rewards overhaul work around a real shopping ledger, a new `Physical TBR` book field, and hybrid subscription tracking: setup on the Character Sheet, monthly charge/skip logging on `shopping.md`. The plan follows the repo’s existing state-validation-migration-test patterns so the new data is durable and backward compatible."
todos:
  - id: beads-breakdown
    content: Create/update Beads issues for shopping ledger, Physical TBR, subscription setup/history, summaries, and tests.
    status: completed
  - id: state-schema
    content: Add persisted shopping/subscription state, validator updates, migrator updates, and large-state persistence wiring.
    status: in_progress
  - id: book-physical-tbr
    content: Extend books with `shelfCategory` and expose `Physical TBR` in library add/edit flows.
    status: pending
  - id: shopping-ledger
    content: Upgrade shopping options and renderer to capture purchase metadata, link books, and persist shopping log entries.
    status: pending
  - id: subscription-tracking
    content: Add subscription setup on the Character Sheet plus monthly purchase/skip logging on `shopping.md`.
    status: pending
  - id: summaries-tests
    content: Add monthly totals, thumbs-up ratio summaries, and automated coverage for new flows and migrations.
    status: pending
isProject: false
---

# Rewards Overhaul And Book Box Tracking Plan

## Decisions Locked In

- Model `Physical TBR` as a new field on the core book record, separate from reading status.
- Use a hybrid subscription flow: manage subscription definitions on the Character Sheet, then log each monthly purchase or skip from `shopping.md`.

## Current Constraints

- `[/workspaces/tome-of-secrets/assets/js/page-renderers/shoppingRenderer.js](/workspaces/tome-of-secrets/assets/js/page-renderers/shoppingRenderer.js)` only deducts `inkDrops` / `paperScraps`; it does not persist purchases, books, or subscription history.
- `[/workspaces/tome-of-secrets/assets/js/character-sheet/stateAdapter.js](/workspaces/tome-of-secrets/assets/js/character-sheet/stateAdapter.js)` already owns durable user state for books, curriculum, and series, so shopping/subscription data should follow the same pattern.
- `[/workspaces/tome-of-secrets/assets/js/character-sheet/dataValidator.js](/workspaces/tome-of-secrets/assets/js/character-sheet/dataValidator.js)` validates book shape and schema versioning; any new state needs validator + migrator coverage.
- `[/workspaces/tome-of-secrets/character-sheet.md](/workspaces/tome-of-secrets/character-sheet.md)` currently exposes only book `status` (`reading`, `completed`, `other`), so `Physical TBR` needs new UI.

## Proposed Data Model

- Extend each book in `[/workspaces/tome-of-secrets/assets/js/character-sheet/stateAdapter.js](/workspaces/tome-of-secrets/assets/js/character-sheet/stateAdapter.js)` and `[/workspaces/tome-of-secrets/assets/js/character-sheet/dataValidator.js](/workspaces/tome-of-secrets/assets/js/character-sheet/dataValidator.js)` with a new field such as `shelfCategory`.
- Initial `shelfCategory` values:
  - `general`
  - `physical-tbr`
- Default normal library adds to `general`.
- Default shopping-linked book adds to `physical-tbr`.
- Add new persisted state keys for:
  - `shoppingLog`: one record per redeemed shopping action
  - `bookBoxSubscriptions`: reusable subscription definitions
  - `bookBoxHistory`: one record per subscription month
- Keep monthly totals derived from `shoppingLog` / `bookBoxHistory` rather than storing duplicate aggregates.

## Shopping Log Scope

- Upgrade `[/workspaces/tome-of-secrets/assets/data/shoppingOptions.json](/workspaces/tome-of-secrets/assets/data/shoppingOptions.json)` from label-only entries to richer option metadata with stable ids and type hints.
- Extend `[/workspaces/tome-of-secrets/assets/js/page-renderers/shoppingRenderer.js](/workspaces/tome-of-secrets/assets/js/page-renderers/shoppingRenderer.js)` so redeeming opens or includes structured fields for:
  - purchased item / option
  - linked book(s)
  - actual money spent
  - store / vendor name
  - log date
  - in-game cost actually charged (`inkDrops`, `paperScraps`)
- Support quick-linking an existing library book and quick-adding a new book from the shopping flow using the existing book search patterns from `[/workspaces/tome-of-secrets/assets/js/controllers/LibraryController.js](/workspaces/tome-of-secrets/assets/js/controllers/LibraryController.js)`.
- When a new book is created from shopping, assign `shelfCategory = 'physical-tbr'` automatically.

## Subscription Tracking Scope

- Add a Character Sheet area for reusable subscription setup in `[/workspaces/tome-of-secrets/character-sheet.md](/workspaces/tome-of-secrets/character-sheet.md)`, backed by new adapter methods in `[/workspaces/tome-of-secrets/assets/js/character-sheet/stateAdapter.js](/workspaces/tome-of-secrets/assets/js/character-sheet/stateAdapter.js)`.
- Subscription definition fields:
  - company
  - tier
  - optional default monthly money cost
  - skips allowed per year
- Treat company as parent and tier as child in the stored shape.
- Log each month on `shopping.md` as either:
  - `purchased`: deduct in-game currency, capture actual spend, link received books
  - `skipped`: no in-game currency deduction, decrement skips remaining, no spend required
- Allow variable-cost months by overriding the default tier cost during monthly logging.
- Add optional monthly reaction (`thumbsUp`, `thumbsDown`, or neutral) and render a summary tile showing `thumbsUp / ratedMonths` per subscription.

## UI Split

- Character Sheet:
  - manage reusable book box subscriptions
  - view subscription summary tiles and skips remaining
  - edit a book’s `shelfCategory`, including `Physical TBR`
- `shopping.md`:
  - redeem standard shopping purchases into a persistent purchase log
  - log monthly subscription charge or skip
  - link books during the shopping visit
  - show monthly spend total and month-scoped purchase history

## Persistence And Migration Work

- Update `[/workspaces/tome-of-secrets/assets/js/character-sheet/storageKeys.js](/workspaces/tome-of-secrets/assets/js/character-sheet/storageKeys.js)`, `[/workspaces/tome-of-secrets/assets/js/character-sheet/state.js](/workspaces/tome-of-secrets/assets/js/character-sheet/state.js)`, and `[/workspaces/tome-of-secrets/assets/js/character-sheet/persistence.js](/workspaces/tome-of-secrets/assets/js/character-sheet/persistence.js)` to register the new state.
- Store growing log/history collections with the large-state persistence path.
- Increment schema version and add safe defaults / migration in `[/workspaces/tome-of-secrets/assets/js/character-sheet/dataValidator.js](/workspaces/tome-of-secrets/assets/js/character-sheet/dataValidator.js)` and `[/workspaces/tome-of-secrets/assets/js/character-sheet/dataMigrator.js](/workspaces/tome-of-secrets/assets/js/character-sheet/dataMigrator.js)`.
- Preserve backward compatibility so existing books simply gain `shelfCategory: 'general'`.

## Test Plan

- Update or add tests for shopping UI and flow in `[/workspaces/tome-of-secrets/tests/pageRenderers.test.js](/workspaces/tome-of-secrets/tests/pageRenderers.test.js)`.
- Add book schema/controller coverage for `Physical TBR` in `[/workspaces/tome-of-secrets/tests/bookState.test.js](/workspaces/tome-of-secrets/tests/bookState.test.js)` and `[/workspaces/tome-of-secrets/tests/libraryController.test.js](/workspaces/tome-of-secrets/tests/libraryController.test.js)`.
- Add new state tests for subscription definitions/history and migration behavior alongside the existing character-state tests.
- Verify edge cases:
  - skip month does not deduct `inkDrops` / `paperScraps`
  - purchase month does deduct them
  - variable-cost month overrides tier default
  - shopping-linked new books default to `Physical TBR`
  - monthly totals match persisted log entries
  - thumbs-up ratio ignores unrated months

## Recommended Bead Breakdown

- Expand or supersede existing shopping-log issue with child work items for:
  - shopping option metadata + ledger schema
  - `Physical TBR` book field + library UI
  - subscription definition state + Character Sheet UI
  - shopping month logging + skip/charge behavior
  - monthly summary tiles + thumbs ratio
  - tests and migration coverage

## Delivery Sequence

1. State and schema foundation.
2. `Physical TBR` book field and library UI.
3. Shopping log UX and purchase persistence.
4. Subscription setup UI and monthly logging.
5. Summary tiles, monthly totals, and ratings.
6. Full regression tests and polish.

