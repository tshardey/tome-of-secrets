# 8MFG: Economy Rebalance — Paper Scrap Faucets and Negative Balances

## Summary

After several months of play the economy has broken in a predictable direction: the player holds 1000+ Ink Drops and zero Paper Scraps at level 4. This spec rebalances the currency economy so that Paper Scraps become an earnable resource, gives the Ink Drop stockpile somewhere to go, and unblocks the shopping log when the player cannot pay.

Expanding the side quest pool is a related but separately-directed piece of work, tracked outside this spec (see Out of Scope).

## Problem Statement

Two problems, addressed together because they share the currency contract:

1. **Ink inflation with paper drought.** 24 of 38 catalog items grant Ink Drops; only 4 grant Paper Scraps. `ModifierPipeline.resolve()` applies every `ADD_FLAT` before any `MULTIPLY`, so flat item bonuses stack and are *then* multiplied: base 10 + Compass 20 + Dragon Fang 20 = 50, times Tome of Potential's x3 = 150 Ink for a single book. Atmospheric buffs add a second large ink faucet at 1-2 Ink/day. Nothing comparable exists for Paper Scraps.
2. **The shopping log refuses to record reality.** Book box subscriptions arrive whether or not the player can pay for them, but the log hard-blocks any purchase the balance cannot cover, so those months go unrecorded.

## Design Decisions

Decisions made during brainstorming, recorded here because they constrain the implementation:

| Decision | Chosen | Rejected |
|---|---|---|
| Item conversion | Convert a thematic subset entirely to Paper at ~1/3 the ink value | Adding a paper trickle to every ink item; cutting ink values across the board |
| Multipliers | Leave x2/x3 values and pipeline order untouched | Multiplying base-only; lowering multiplier values |
| Atmospheric rate | 2 Paper/day base, 3/day sanctum-associated, no ink | 4/day sanctum; keeping ink alongside paper |
| Negative balances | Allowed, behind a `confirm()` step | Hard block; silent allow; subscriptions-only |
| Ink sinks | New ink-heavy shop options | Raising prices on existing options; ink-cost side quests |

**The guiding economic principle:** Ink Drops buy *volume and secondhand* — crawls, hauls, library sales. Paper Scraps buy *new and special* — indie stores, deluxe editions, book boxes. Ink is the reading-throughput currency; paper is the reflection currency, earned by journaling, atmosphere, and structurally demanding books.

**Why leaving multipliers alone still fixes inflation:** `ModifierPipeline._applyMultiply()` is resource-scoped — it reads `modifier.resource` and only touches `reward[resource]`. Tome of Potential's `MULTIPLY inkDrops x3` therefore cannot touch Paper Scraps. Every item converted from ink to paper leaves the multiplier's blast radius as a side effect. The x3 combo still exists and still feels good; it simply has fewer flat bonuses feeding it.

## Requirements

### R1: Item conversion

Nine items change reward currency. Eight are pure conversions (change `resource` and `value` on the existing effects); Literary Medallion keeps its XP and gains paper.

| Item | Condition | Now (equipped/passive) | After (equipped/passive) |
|---|---|---|---|
| Amulet of Duality | `tagMatch: multiple-pov` | +15 / +7 Ink | **+5 / +2 Paper** |
| Key of the Archive | `tagMatch: unlocked` | +15 / +7 Ink | **+5 / +2 Paper** |
| Temporal Sprite | `tagMatch: non-linear-narrative` | +20 / +10 Ink | **+7 / +3 Paper** |
| Detective's Magnifying Glass | `tagMatch: mystery` | +15 / +7 Ink | **+5 / +2 Paper** |
| Ingredient Sprite | `tagMatch: magic-system` | +15 / +7 Ink | **+5 / +2 Paper** |
| Star Navigator's Chart | `tagMatch: sci-fi` | +15 / +7 Ink | **+5 / +2 Paper** |
| Cloak of the Story-Weaver | `tagMatch: series` | +10 / +5 Ink | **+3 / +1 Paper** |
| The Bookwyrm's Scale | `pageCount.min: 500` | +10 / +5 Ink | **+3 / +1 Paper** |
| Literary Medallion | `tagMatch: classics, literary-fiction` | +20 / +10 XP | +20 / +10 XP **and +6 / +3 Paper** |

Every one of these is an `effects`-array item on the ADR-003 pipeline, so each conversion is a `resource`/`value` edit on an existing effect entry. Literary Medallion gains two additional effect entries (one `equipped`, one `passive`) reusing its existing `tagMatch` condition. No `rewardModifier` legacy fields are involved.

The `bonus` and `passiveBonus` display strings must be rewritten to match — these render on `rewards.md` and in item cards, and a mismatch between the string and the effect is the exact class of bug this spec also fixes elsewhere.

**Explicitly unchanged** (remain Ink): Librarian's Compass, Blood Fury Tattoo, Pocket Dragon, Coffee Elemental, Lab Assistant Automaton, Herb Dragon, Dancing Shoes, Dragon Fang, Romance Reader's Ribbon, Fae-Touched Crystal, Warding Candle. **Multipliers unchanged**: Scatter Brain Scarab (x3/x1.5), Tome of Potential (x3/x1.5), Page Sprite (x2/x1.5).

### R2: Atmospheric buffs pay Paper Scraps

Atmospheric buffs stop granting Ink Drops entirely and grant Paper Scraps instead, at **2/day base and 3/day for sanctum-associated buffs**.

`GAME_CONFIG.atmospheric` becomes:

```js
atmospheric: {
    resource: 'paperScraps',
    baseValue: 2,
    sanctumBonus: 3
}
```

The `resource` key exists so the currency stays a one-line balance knob rather than a value hardcoded across the calculator, the view model, and the service.

The four atmospheric-reward items convert with it:

| Item | Kind | Now | After |
|---|---|---|---|
| Gilded Painting | trackable | +2 / +1 Ink per day | **+2 / +1 Paper per day** |
| Garden Gnome | trackable | +2 / +1 Ink per day | **+2 / +1 Paper per day** |
| Mystical Moth | trackable | +2 / +1 Ink per day | **+2 / +1 Paper per day** |
| Tome-Bound Cat | modifier | x2 / x1.5 on buff totals | **x2 / x1.5 on Paper from buffs** |

These four are on the legacy `rewardModifier` path (per ADR-003's intentional dual path), so their conversion is a `rewardModifier.inkDrops` to `rewardModifier.paperScraps` rename plus `bonus`/`passiveBonus` string updates.

### R3: Fix two atmospheric payout defects

Both surfaced while tracing R2 and both must be fixed for the Tome-Bound Cat to function as the paper engine this rebalance makes it.

**R3a — The Tome-Bound Cat multiplier is displayed but never paid.** `atmosphericBuffViewModel.js:130` applies `atmosphericMultiplier` to the row's Total column, but `EndOfMonthController.js:90` — the only production caller of `RewardCalculator.calculateAtmosphericBuffRewards()` — passes only `(atmosphericBuffs, associatedBuffs, forcedBuffNames)`. The calculator has no multiplier parameter, so end of month awards the unmultiplied figure. The player is shown x2 and paid x1.

Fix: extract the multiplier lookup currently private to the view model (`getAtmosphericBuffMultiplier()`) into `AtmosphericBuffService`, have both the view model and `EndOfMonthController` source it from there, and add a multiplier parameter to `calculateAtmosphericBuffRewards()`. The receipt line must record the multiplier as its own modifier entry so the player can see where the number came from.

**R3b — Trackable atmospheric items pay nothing at all.** Two compounding defects:

*The value is wrong.* `atmosphericBuffViewModel.js:151` hardcodes `const dailyValue = 1` for trackable item rows, while the Gilded Painting's own text promises +2.

*The award never fires.* Trackable item rows are keyed in `ATMOSPHERIC_BUFFS` state by item name. `updateAtmosphericBuff()` (`stateAdapter.js:1144`) seeds new entries as `{ daysUsed: 0, isActive: false }`, and entering days calls only `setAtmosphericBuffDaysUsed()`, which never touches `isActive`. The row's checkbox is rendered `disabled` (`isDisabled: true`), so `handleAtmosphericBuffToggle()` never fires either — nothing in the system ever sets these entries active. `calculateAtmosphericBuffRewards()` gates on `buff.daysUsed > 0 && (buff.isActive === true || forcedActive.has(buffName))`, so the entry is skipped every month. The tracker displays a Monthly Total (the view model hardcodes `isActive: true` for these rows) that is never paid.

Fix: source the per-day value for trackable item rows from the item's own data (`rewardModifier.paperScraps` when equipped, `passiveRewardModifier.paperScraps` when in a display/adoption slot) in both the view model and the calculator. Treat an equipped or displayed atmospheric item as active for award purposes — matching the view model's existing "equipped/displayed implies active" intent — by passing the trackable item names into the calculator the way `forcedActiveBuffNames` already works for Grove Tender, rather than by writing `isActive` into state from a render path.

### R4: Shopping log may go negative

- The two `Insufficient…` guards — `shoppingRenderer.js:593` (book box month) and `:954` (shop redeem) — become a `confirm()` that states the resulting balance: *"This will put you at -30 Paper Scraps. Log anyway?"* Cancelling aborts the log; confirming proceeds. This mirrors the skips-remaining `confirm()` already at `:573`.
- `updateResources()` at `:168-176` drops its four `Math.max(0, …)` clamps so negative balances actually persist to the form and to `STORAGE_KEYS.CHARACTER_SHEET_FORM`.
- `min="0"` is removed from the `#inkDrops` and `#paperScraps` inputs at `_includes/character-sheet/tabs/character.html:101,108`.
- Negative balances render in a warning color wherever currency is displayed — `updateCurrencyDisplay()` in `shoppingRenderer.js:189` and the `StatusWidget` currency spans at `:102-103,147-152` — so an overdraft is visible rather than silent.

**Deliberately not changed:** the `Math.max(0, …)` calls in `dataValidator.js:149-150,755-756,825-826` and `stateAdapter.js:1903-1904`. Those clamp *reward and cost amounts*, which should never be negative. Only the player's balance becomes signed.

### R5: Ink sinks

Three shopping options added to `shoppingOptions.json`, all `type: "book-purchase"` so the existing book-linking UI at `shoppingRenderer.js:752` applies, and all `allowQuantity: true`:

| Option | Ink | Paper | Quantity means |
|---|---|---|---|
| The Book Crawl | 150 | 5 | Shops visited in one day |
| Used Bookstore Haul | 75 | 0 | Books brought home |
| Library Book Sale | 50 | 0 | Books brought home |

A four-shop crawl costs 600 Ink, which gives a 1000+ stockpile a meaningful destination without touching the existing options' prices. Existing paper-gated options (Indie 100/25, Chain 150/35, Deluxe 50/50, Book Box 25/25) are unchanged, preserving paper as the constraint on new and special editions.

## Architecture

### What changes and why

The rules copy in `core-mechanics.md` states the currency contract in prose and drifts out of true the moment R2 lands. Its "Currencies and Progression" section lists *Triggering Atmospheric Buffs* under **Earn Ink Drops by**; that bullet moves to the **Earn Paper Scraps** list, and the paper list gains the per-day rate. Leaving this stale would reintroduce exactly the display/behavior mismatch R3 exists to fix, one layer up.

The atmospheric currency switch is the only genuinely cross-cutting change. It touches:

- `gameConfig.js` — the `atmospheric` block gains `resource` and new values.
- `AtmosphericBuffService.js` — `calculateTotalInkDrops()` is currency-agnostic arithmetic under a misleading name; rename to `calculateBuffTotal()`. `calculateDailyValue()` hardcodes `? 2 : 1` and must read from `GAME_CONFIG` instead. Gains the `getAtmosphericBuffMultiplier()` function extracted per R3a and a helper for the trackable-item daily value per R3b.
- `RewardCalculator.calculateAtmosphericBuffRewards()` — writes `reward.paperScraps` instead of `reward.inkDrops`, sets `receipt.base.paperScraps` / `receipt.final.paperScraps`, changes the modifier entries' `currency` field to `paperScraps`, and accepts the multiplier parameter.
- `atmosphericBuffViewModel.js` — sources the multiplier and trackable daily values from the service rather than computing them privately.
- `EndOfMonthController.js:90` — passes the multiplier through.

`updateCurrency()` in `currencyService.js` already handles `rewards.paperScraps`, so the EOM award path needs no change beyond what the calculator returns.

### Data flow after the change

```
End of Month
  → EndOfMonthController reads atmospheric buff state + sanctum + forced buffs
  → AtmosphericBuffService.getAtmosphericBuffMultiplier(state)   [NEW: shared]
  → RewardCalculator.calculateAtmosphericBuffRewards(buffs, associated, forced, multiplier)
      · per buff: daysUsed x (sanctumBonus | baseValue)          [now 3 | 2, paper]
      · per trackable item: daysUsed x item's own per-day value  [R3b]
      · total x multiplier                                       [R3a]
  → Reward { paperScraps, receipt }
  → updateCurrency() adds to #paperScraps
```

### Files touched

**Data** (`assets/data/`): `allItems.json` (R1, R2), `shoppingOptions.json` (R5).

**Config/services** (`assets/js/`): `config/gameConfig.js`, `services/AtmosphericBuffService.js`, `services/RewardCalculator.js`, `viewModels/atmosphericBuffViewModel.js`, `controllers/EndOfMonthController.js`, `page-renderers/shoppingRenderer.js`, `components/StatusWidget.js`.

**Markup/content**: `_includes/character-sheet/tabs/character.html` (R4), `core-mechanics.md` (R2 rules copy).

**Generated**: `assets/js/character-sheet/data.json-exports.js` via `node scripts/generate-data.js` — never edited by hand.

## Testing

Existing tests assert the current ink behavior and are the primary verification that the rebalance actually landed:

- `tests/RewardCalculator.test.js:697-770` — the `calculateAtmosphericBuffRewards` block asserts ink totals at the 1/2 per day rates. Updating these to paper at 2/3 per day is how R2 is verified. New cases needed for the multiplier parameter (R3a) and trackable item per-day values (R3b).
- `tests/RewardCalculatorReceipts.test.js:315` — asserts receipt shape for atmospheric rewards; the `currency` field and base/final keys move to `paperScraps`.
- `tests/viewModels/atmosphericBuffViewModel.test.js` — already fixtures Tome-Bound Cat and Garden Gnome; extend to assert the view model's Total now matches what the calculator pays. **This equivalence is the regression guard for both R3a and R3b** — each bug is a divergence between the displayed Total and the awarded amount, so a test that pins them together catches the whole class.
- New: an end-to-end case for a trackable item (Garden Gnome, 10 days, equipped) asserting a non-zero paper award at end of month — the direct guard against R3b, which currently pays zero.
- New: a test asserting `ModifierPipeline` multipliers do not touch `paperScraps`, pinning the property that makes R1 work.
- New: shopping tests covering a confirmed negative log (balance goes negative, entry is recorded) and a cancelled one (no balance change, no entry).

Then, per project convention: `cd tests && npm test`, `npm run validate-data` after the JSON edits, and `node scripts/generate-data.js` to regenerate exports.

## Migration and Compatibility

No state migration is required. Balances are plain numbers that become signed; item effects are read fresh from the catalog on every calculation, so already-owned items pick up their new rewards immediately. Historical shopping log entries and completed quest records are untouched.

**One player-visible consequence worth stating plainly:** the existing 1000+ Ink Drop balance is not reduced by this work. R1 and R2 slow ink accumulation going forward, and R5 gives the stockpile somewhere to go, but the pile itself is left for the player to spend down.

## Out of Scope

- **Expanding the side quest pool.** The deck is exhausted at 8 quests and does need new content, but the maintainer has a specific creative direction for it and will supply a document when it is time to implement. Tracked separately as `tome-of-secrets-4yqq`, outside this epic. Worth noting for whoever picks it up: `SideQuestDeckService.getAvailableSideQuests()` already iterates `data.sideQuestsDetailed` by key, so new entries need no deck changes — but `table-renderer.js:519` hardcodes `for (let i = 1; i <= 8; i++)` and `core-mechanics.md` hardcodes the Clubs d8, and both will need updating.
- Retuning prices on the existing shopping options.
- Changing `ModifierPipeline`'s ADD_FLAT-then-MULTIPLY ordering.
- Adjusting `levelRewards.json`, dungeon rewards, genre quest rewards, or wing completion rewards, all of which grant ink.
- Migrating the four atmospheric items off the legacy `rewardModifier` path onto ADR-003 `effects`.
