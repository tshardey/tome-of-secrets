# Dollar Economy Overhaul — Design

**Date:** 2026-11-08
**Branch:** `tshardey/reward-refactor-and-cleanup`
**Status:** Draft for maintainer approval

## Intent

The maintainer plays Tome of Secrets less than they'd like to. Four mechanics are the friction:

1. **Journaling** almost never gets done.
2. **Multiple currencies.** Ink Drops and Paper Scraps especially are hard to reason about.
3. **The Shroud** (curses / Worn Pages) punishes taking on long books, because a long book risks a missed quest pool.
4. **The shopping page** is too heavy.

The model to copy is the maintainer's workout tracker, which works well for them. A completed workout earns a fixed $5–10 into a real-dollar fund. When they buy something related, they deduct it. There are no conversions and no multipliers.

**Success:** the game becomes a lightweight real-money book budget. Over time, **roughly one book's worth of money is earned per book read**. Earning gets easier as the player levels, and that is intended.

## Goals

- One spendable currency: **real dollars (the Fund)**.
- **Every completed quest pays a $15 base**, whatever its type (genre, side quest, dungeon room, extra credit). The maintainer's words: dungeons "are really just a different type of prompt experience."
- All bonuses are **flat dollar amounts**. Most are **$1–5**, and **$10** is the ceiling for something rare. **No multipliers anywhere.**
- Atmospheric (environment) buffs pay **$1 per buff per active day**, so several buffs on one day each pay.
- **Remove the Shroud / curse system entirely.**
- **Remove journaling entirely**, including references, the tracker field, and the rewards it grants.
- **Replace the shopping page** with a Fund widget in the character sheet's Resources panel: the balance, a deduct form (amount and note), and a deduction receipt log grouped by month.
- **Keep:** XP and levels (progression), SMP and mastery abilities, Blueprints (they still unlock restoration projects), and **the reward receipt pop-up shown when a quest is completed**. That last one was called out explicitly.

## Non-goals

- Book box subscription tracking. It moves to the separate `tos-personal-library` app later and is simply dropped here.
- Linking purchases to library books.
- Converting old Ink and Paper balances into dollars. **The Fund starts at $0**, because the maintainer has untracked recent purchases.
- A ledger of earnings. The per-quest receipt pop-up covers that. Only deductions are logged.
- Supabase SQL changes. Cloud saves are one jsonb blob, and no projection reads curses, shopping, or journaling.

## Anti-goals (a failure even if it technically works)

- Any multiplier surviving anywhere. This includes XP. Every multiply effect becomes a flat amount.
- The quest-completion receipt pop-up disappearing or losing its line-by-line breakdown.
- Leftover Ink Drop, Paper Scrap, Worn Page, or journaling wording in the UI, rules pages, or item text.
- Bonus logic duplicated between the ADR-003 pipeline and the legacy `rewardModifier` path.
- The upgrade corrupting XP, level, SMP, blueprints, inventory, quests, or the library.

## Constraints

- Follow ADR-003 (`project-docs/ADR-003-tcg-modifier-pipeline.md`). Deterministic bonuses are `effects` on catalog JSON in `assets/data/`, resolved by `EffectRegistry` and `ModifierPipeline`. Run `node scripts/generate-data.js` and `validate-data` after editing JSON.
- Persisted state changes need a schema bump (v17 → v18) with a migration. Today `loadAndMigrateState` does not migrate the `CHARACTER_SHEET_FORM` blob, which is where `inkDrops`, `paperScraps`, `xp-current`, and `smp` live. The v18 step must handle that blob, and so must `cloudSync.applySnapshot` when restoring older snapshots.
- Visual style must stay Dark Academia. Reuse the existing `rpg-stats-panel` styles.
- Engineering rules from AGENTS.md apply: DRY, pragmatic tests, small reviewable changes, and a subagent pre-commit review for code. **Beads is not used** (maintainer preference).

---

## The new economy

### Fund (dollars)

| Source | Amount |
|---|---|
| Any completed quest (genre, side, dungeon room, dungeon encounter logged as its own quest, extra credit, **restoration project**) | **$15** base |
| A second quest cleared by the same book through an ability (Quick Shot, Irresistible Charm, Concussive Blast) | **$10** base instead of $15 |
| Atmospheric buff | **$1 per buff per active day** |
| Atmospheric buff tied to your chosen sanctum | **+$1 per day** on top (so $2/day) *(builder's call, kept from today's sanctum edge)* |
| Equipped items, backgrounds, school, and abilities with matching triggers | flat $1–5, rare items up to $10 (tables below) |
| Level up | see the Levels table |
| Wing completion | **$25** (+75 XP, unchanged) |
| Dungeon completion draw "The Librarian's Hoard" | **$20** |

**One book, one quest (maintainer decision).** From now on, a library book can be linked to only **one** quest. Linking UI and validation must stop a second link. Existing saves that already have multi-linked books are left alone; the rule applies to new links only. The abilities that let one book clear two quests stay. The quest the ability clears pays a **$10** base instead of $15. Its item and other bonuses still apply normally *(builder's call)*. Restoration project quests (`RestorationQuestHandler`) now pay the $15 base, and they still cost blueprints to start.

The dollar resource should be a single key (suggestion: `dollars`) used throughout the reward object, the effects schema, and the receipt. The builder chooses its storage location, with one constraint: it must be covered by the v18 migration and by cloud sync. A key in character state managed by StateAdapter is preferred over the form blob. The balance stays **directly editable** for corrections, like today's resource inputs.

### What stays the same

- **XP.** Quest XP bases stay at today's rates (genre 15, default 25, side quests and dungeon rooms as authored, monster encounter 30). Marking a library book complete still gives **15 XP**, with the existing first-10-books-a-month rule. Library book completion pays **no** dollars.
- **Blueprints.** All current blueprint sources and restoration costs stay as they are (genre quests 15–25, extra credit 10, side quests, Haggler's Ledger, Mender's Thread, Keeper's Blessing 50).
- **SMP** and mastery abilities stay. The costs stay. Some abilities get new effects (below).
- The XP and blueprint parts of item effects are unchanged. Only the Ink and Paper parts convert to dollars.

### Removed

- Ink Drops and Paper Scraps: the inputs, display, reward fields, effects, receipts, and the currency warning link to the shop.
- Ink ↔ Paper transmutation (`QuestController` transmute flow).
- Per-room Ink and Paper rewards in `dungeonRooms.json`, per-quest Ink and Paper in `sideQuestsDetailed.json` and `genreQuests.json`, and the encounter Ink and Paper rewards. All of these are replaced by the flat $15 per quest. The XP and blueprint parts stay.

### Item conversion rule

To translate today's values into dollars, first take **ink-equivalent = Ink + 3 × Paper**. The 3 reflects today's 3:1 transmute rate. Then:

- **Equipped value** = round(ink-equivalent ÷ 5), clamped to $1–5.
- **Passive value** = half the equipped value, rounded down, minimum $1.
- **Multipliers** are hand-set (marked ★).

| Item | Trigger (unchanged unless noted) | Equipped | Passive |
|---|---|---|---|
| Librarian's Compass | new-to-you author | $4 | $2 |
| Amulet of Duality | multiple POVs | $3 | $1 |
| Scatter Brain Scarab ★ | reading three books at once | $5 | $2 |
| Cloak of the Story-Weaver | book in a series | $2 | $1 |
| Blood Fury Tattoo | next book in a series | $3 | $1 |
| The Bookwyrm's Scale | over 500 pages | $2 | $1 |
| Key of the Archive | something unlocked | $3 | $1 |
| **Tome of Potential ★** | over 400 pages | **$10** (rare; a long-book reward now that the Shroud is gone) | $5 |
| Page Sprite ★ | under 300 pages | $3 | $1 |
| Crystal Sprite | beautiful prose | $5 | $2 |
| Pocket Dragon | fantasy series | $4 | $2 |
| Coffee Elemental | cozy / hot beverage | $2 | $1 |
| Lab Assistant Automaton | robots / AI | $3 | $1 |
| Temporal Sprite | non-linear | $4 | $2 |
| Ingredient Sprite | magic systems | $3 | $1 |
| Herb Dragon | nature magic / green covers | $3 | $1 |
| Dancing Shoes | social romance / contemporary | $5 | $2 |
| Dragon Fang | dragons / legendary creatures | $4 | $2 |
| Romance Reader's Ribbon | romance / romantasy | $3 | $1 |
| Star Navigator's Chart | sci-fi | $3 | $1 |
| Fae-Touched Crystal | fae / nature magic | $3 | $1 |
| Warding Candle | horror / dark fantasy | $3 | $1 |
| Detective's Magnifying Glass | mystery / crime | $3 | $1 |
| Literary Medallion | classics / literary (keeps +20/+10 XP) | $4 | $2 |
| Baby Hollyphant | faith / philosophy (keeps XP) | $3 | $1 |
| The Reveler's Mask | outside usual genres (keeps XP) | $5 | $2 |
| Visiting Scholar's Sigil | translated / new country (keeps XP) | $5 | $2 |
| The Crossroads Fox | recommended (keeps XP and activation) | $5 | $2 |
| Gilded Painting / Garden Gnome / Mystical Moth | per day in that setting (environment) | **$1 per day** | — |
| Tome-Bound Cat ★ | atmospheric buff days | **+$1 per atmospheric buff day** (replaces ×2) | — |

Items with no currency part (Celestial Koi Fish, Reading Glasses, Lantern, Scepter, Grand Key, Haggler's Ledger, Mender's Thread) are unchanged.

### Former Worn Page and journaling content: new thematic triggers *(proposed; maintainer to tweak)*

| Entity | New effect |
|---|---|
| Chalice of Restoration (item) | +$3 equipped / $1 passive for finishing a book you had previously put down and picked back up |
| Raven Familiar | +$3 equipped / $1 passive for epistolary books, or books where letters or messages drive the plot |
| Librarian's Quill (item) | +$2 equipped / $1 passive for books with a writer, scholar, or librarian protagonist |
| Golden Pen (item) | +$3 equipped / $1 passive for award-winning books |
| Ward Against the Shroud (1 SMP) | Once per month, +$5 at month end if you completed your full monthly quest pool |
| Grand Dispelling (2 SMP) | Once per month, +$5 on a completed book over 500 pages |
| Abjuration (school) | +$3 on books that have been on your TBR for over a year |
| The Scribe's Acolyte (background) | +$3 on illustrated, illuminated, or special-edition books, or books with maps |
| Librarian's Blessing (temp buff) | +$5 on your next two completed quests |
| Unwavering Resolve (temp buff) | For the next month, +$3 on books over 400 pages |
| Midnight Waystation series reward / side quests with `countsAsJournalEntry` / Weaver's Hollow "ignore Shroud penalty" | Rewrite to a flat dollar or XP reward of equal weight. The Nymph and side-quest "odd = Worn Page" outcomes become "odd = no bonus". The builder writes these. |

Mechanic names keep the "Shroud" wording (Ward Against the Shroud, The Shroud's Heart room). The Shroud remains as world lore (`index.md`) with no curse mechanic.

### Backgrounds, schools, and abilities with currency

| Entity | Today | New |
|---|---|---|
| Archivist's Apprentice | +10 ink | +$2 (same trigger) |
| Cloistered Prophet | +15 ink | +$3 |
| Cartographer's Guild | +15 ink on drafting a dungeon quest | +$3 (same trigger) |
| Biblioslinker | +10 paper on dungeons | +$3 |
| Enchantment (school) | XP ×1.5 vs monsters | +10 XP flat on the same trigger (no multipliers) |
| Transmutation (school) | ink ↔ paper conversion | Once per month, convert up to 20 Blueprints into $2, or $2 into 20 Blueprints *(builder's call)* |
| Silver Tongue | +5 paper per quest | +$1 per quest |
| Empowered Bond | familiar bonus +5 | the equipped familiar's dollar bonus +$1 |
| Echo Chamber | familiar bonuses ×2 | each equipped familiar's dollar bonus +$3 |
| Philosopher's Stone | −50 XP → +50 ink, +10 paper | Once per month, −50 XP → +$5 |
| Alchemic Focus | +5 XP | unchanged |

### Temporary buffs with currency

| Buff | New |
|---|---|
| The Librarian's Hoard | +$20 |
| Long Read Focus | +$3 on next completed quest |
| Disjointed Perception | +$3 |
| Enchanted Focus | +$2 on each of the next three completed quests (was ×1.5) |
| The Archivist's Favor | "buy a merchant item at 50% off" option becomes "+$10" |
| Story Surge (dungeon completion draw) | +$2 on each of the next five completed quests (was ×2 Ink) *(builder's call)* |

### Side-quest stakes *(builder's call)*

Stakes only change the bonus they name. **A failed stake never reduces the $15 base.** Stake multipliers become flat amounts:

- Haggler's Row ×2 blueprints → +the quest's blueprint reward again, as a flat number.
- The Communal Table "halve XP" → −half the quest's authored XP, as a flat number.
- The Blind Stall "forfeit XP" → unchanged (forfeit is a removal, not a multiplier).
- The Masked Procession's journaling gate ("journal ≥ 3 sentences") is replaced by a non-journaling condition with a $3 reward.

The validator's no-MULTIPLY ban covers both catalog `effects` and stake JSON.

### Library curriculum synergy *(builder's call)*

The +5 Paper / +10 Ink granted on library book completion when a book is linked to a curriculum prompt (`stateAdapter.js` ~2076) is **removed**, because books pay no money. Curriculum prompts keep their non-currency role.

### Levels *(builder's call; replaces Ink/Paper in `levelRewards.json`)*

| Levels | Dollars | Blueprints | SMP |
|---|---|---|---|
| 2–4 | $10 each | +10 each | +1 at 3 |
| 5–9 | $15 each | +10 each | +1 at 5 and 7 |
| 10–14 | $20 each | +15 each | +1 at 10 and 13 |
| 15–19 | $25 each | +15 each | +1 at 15 and 17 |
| 20 | $50 | +25 | +1 |

This is 8 SMP total, up from 4. Inventory slot unlocks stay at levels 4, 8, 12, 16, and 19. Permanent bonus text at level 7 ("+1 atmospheric paper") is reworded to "+$1 on atmospheric days". This is text only, the same as today.

### Series expedition stops

Convert Ink and Paper with the item rule (no clamp): 50 ink + 10 paper → $15; 150 XP + 50 ink → 150 XP + $10. XP-only stops are unchanged. The Echoing Caverns series passive (+15 Ink on series books) → +$3 *(builder's call)*.

### Sanity check against the target

A typical quest pays $15 base plus one or two matching items at $2–5. That is about **$18–25 per book** before atmospheric days. At ~10 atmospheric days a month, that adds ~$10–20 a month. This lands near "one book's worth of money per book read", with level-ups making it easier over time.

---

## Removals

### Shroud / curses (the whole system)

Delete or retire:

- `shroud.md` and its nav link
- `curseTableDetailed.json` and its generate/validate hooks
- the Curses tab (`_includes/character-sheet/tabs/curses.html`, `tab-nav`)
- `CurseController`
- `curseViewModel` and `WornPagePrevention`
- the curse parts of `ui.js`, `renderComponents.js`, `models/Character.js`, `stateAdapter.js`, `table-renderer.js`, `data.js`, and CSS
- the `remove_all_worn_pages` action
- the dead `curse-removal` case in `SeriesCompletionService`
- state keys `activeCurses`, `completedCurses`, and `curseHelperState`

**Keep shared helpers.** Before deleting `curseHelperDiscovery.js`, move `buildSourceId` and `getCadenceFromText` (used by `questDrawHelperDiscovery.js`) and `validateCurseHelperState` (used for `QUEST_DRAW_HELPER_STATE`) to a neutral module.

Update `core-mechanics.md`, `AGENTS.md`, `EXTENDING-THE-CODEBASE.md`, and `expansions.json` references.

### Journaling

Remove:

- the "Keeper's Journal" section of `core-mechanics.md` and all "Journaling:" or prompt blocks in the rules drawers and pages
- the `#journal-entries-completed` input and its end-of-month text
- `calculateJournalEntryRewards`
- the `endOfMonth.journalEntry` config
- the `ON_JOURNAL_ENTRY` trigger and `_journalEntryMultiplier`
- its `TriggerPayload` handling

Retarget content per the table above. Reword taglines that call the game a "journaling game" (`README.md`, `_config.yml`, `AGENTS.md`) to "reading game". Update the ADR-001 and ADR-003 references.

### Shopping page

Remove:

- `shopping.md` and its nav link
- `shoppingOptions.json`
- `shoppingRenderer.js` and `ShoppingBalanceService.js`
- the dead `BookBoxSubscriptionController.js`
- state keys `shoppingLog`, `bookBoxSubscriptions`, and `bookBoxHistory`
- `currencyWarning.js` (it points to the shop), unless it is repurposed for the Fund

## The Fund widget (Resources panel)

It lives in `_includes/character-sheet/tabs/character.html` in the existing "💰 Resources" panel, replacing the Ink and Paper inputs. Blueprints and SMP stay in the panel.

- **Balance:** shown as `$123`, editable for corrections.
- **Deduct form:** amount (required, positive, cents allowed), note (optional, for example "Legendarium purchase"), and date (defaults to today). Submitting subtracts the amount from the balance and appends `{id, date, amount, note}` to a new deduction log state key.
- **Negative balance:** allowed after a confirm, same as today's overdraft prompt.
- **Receipt log:** below the form, **grouped by month**, newest first. Each month shows a total spent. Each entry can be deleted, which refunds its amount to the balance.

## Quest-completion receipt (must keep)

The pop-up receipt (`ui.js` receipts, `RewardCalculator` receipt) keeps its line-by-line breakdown: base $15, each item, background, ability, and buff line, then XP and blueprints. Ink and Paper columns become one dollar column. **Old completed quests** keep their history, but stored Ink and Paper amounts are hidden rather than shown as dollars. The same applies to the end-of-month atmospheric summary.

## Migration (schema v18)

Run it on load, and on cloud snapshot restore:

1. Drop the curse, shopping, and book-box state keys, and `formData.journal-entries-completed`.
2. Drop the `inkDrops` and `paperScraps` form fields.
3. Initialise the Fund balance to **0** and the deduction log to `[]`.
4. Leave XP, level, SMP, blueprints, inventory, quests, the library, and restoration untouched.
5. Strip temp buffs that no longer exist or no longer apply. Remap renamed ones.

Update `CHARACTER_STATE_KEYS`, `createEmptyCharacterState`, `persistence.js`, `dataValidator.js`, and `cloudSync`.

## Tests

Use pragmatic coverage:

- the reward calculation (base $15 for each quest type, flat bonuses, no multiply path remaining)
- atmospheric $1/day and the sanctum +$1
- level-up payouts
- the v18 migration (from a realistic v17 fixture, including the form blob and cloud snapshot)
- Fund deduct and refund, and month grouping
- `validate-data` asserting no `MULTIPLY` effects and no `inkDrops`/`paperScraps` resources remain in catalog JSON

Delete tests for removed systems. Do not port them.

## Left to the builder

- Storage shape and naming for the Fund and deduction log, within the constraints above
- Order of work and how to split PRs. The suggested order: shroud removal → journaling removal → dollar economy and migration → Fund widget and shop removal → content and rules-page rewrite.
- Exact wording of rewritten item, bonus, and rules text
- Whether the `ModifierPipeline` MULTIPLY type is deleted or left unused with a validator ban
