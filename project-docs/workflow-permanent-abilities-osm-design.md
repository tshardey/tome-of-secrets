# Workflow permanent abilities — design (`tome-of-secrets-osm.5`)

This document satisfies the acceptance criteria for bead **tome-of-secrets-osm.5**: where each remaining **workflow** disposition effect should live, what state to persist, how monthly resets interact with **End of Month**, and which controller/service modules should own the behavior.

Canonical disposition labels already exist in `assets/js/services/PermanentEffectCapabilities.js` (`DISPOSITION.WORKFLOW` for these effects).

**Scope note:** This is an implementation-ready *design*. Full UI for every button can be split into follow-up beads per surface (dungeon drawer vs. currency panel vs. library) if engineering prefers smaller PRs.

---

## Shared infrastructure (recommended first)

### 1. Monthly workflow usage blob

Several effects are **once per month** and are **not** covered by the curse/quest-draw helper allowlists (`CURSE_HELPER_STATE`, `QUEST_DRAW_HELPER_STATE`), which are tuned for Worn Page mitigation and quest-pool/dice text.

**Recommendation:** Add a dedicated persisted object, e.g. `STORAGE_KEYS.MONTHLY_WORKFLOW_USAGE` (name TBD), shaped like:

```js
{
  cycleId: string | null,       // e.g. `${year}-${month}` or opaque id bumped at EOM
  evocationQuickReadUsed: boolean,
  transmutationExchangeUsed: boolean,
  philosophersStoneUsed: boolean,
  irresistibleCharmUsed: boolean
}
```

- **Reset:** `EndOfMonthController` clears or re-keys this object when the month advances (same moment as `refreshCurseHelpersAtEndOfMonth` / `refreshQuestDrawHelpersAtEndOfMonth`).
- **Validation:** `dataValidator.js` — optional object with known keys only; unknown keys stripped or rejected per project conventions.
- **Migration:** `dataMigrator.js` — default `{}` or full default shape for older saves.

**Alternative (lighter):** Store per-effect booleans on `characterState` at top level. The blob scales better if more monthly workflow actions are added later.

### 2. Dungeon quest annotations (optional fields)

`DungeonQuestHandler` already builds plain quest objects with `roomNumber`, `isEncounter`, `encounterName`, `isBefriend`, etc. (`assets/js/quest-handlers/DungeonQuestHandler.js`).

**Recommendation:** Allow optional, validated fields on completed dungeon quests only, for receipts and automation:

| Field | Purpose |
| --- | --- |
| `evocationBenefitApplied` | `true` if this completion used the school Evocation “short read” substitution (and consumed monthly usage if applicable). |
| `evocationQuickShotChallenge` | `true` if **Quick Shot** allowed treating a non-monster **room challenge** as eligible for that substitution. |
| `concussiveBlastExtraPromptId` | Identifier of a second prompt auto-completed in the same room (see Concussive Blast). |
| `irresistibleCharmAutoBefriend` | `true` if the monthly **Irresistible Charm** auto-success was used (no book required for befriend prompt). |

These fields are **not** required for core quest storage but enable: display in UI, tests, and future automation. `dataValidator` should accept them only on `♠ Dungeon Crawl` quests.

### 3. Typed capability reads

Gameplay and UI should call `resolvePermanentEffectCapabilitiesFromAdapter(stateAdapter, formSnapshot)` (or the lower-level `resolvePermanentEffectCapabilities`) instead of re-parsing JSON. Extend `flags` or add `flags.workflow` with booleans such as:

- `canUseEvocationDungeonBenefit` — school Evocation selected **and** monthly charge available
- `hasQuickShot`, `hasConcussiveBlast`, `hasIrresistibleCharm`, `hasPhilosophersStone`, `hasAlchemicFocus`
- `canUseTransmutationExchange` — school Transmutation **and** monthly charge available

---

## Per-effect design

### School: Evocation — short story / novella vs. monster (`school.evocation.dungeon_short_read`)

**Rule (from `schoolBenefits.json`):** Once per month, when battling a monster in a dungeon, you may defeat it quickly by reading a short story or novella instead of a novel.

**Current code:** `DungeonQuestHandler` creates encounter quests with prompts from room data; length-of-read is not enforced in code. `RewardCalculator` applies encounter rewards by type (e.g. Monster) — see `RewardCalculator._getDungeonRewards`.

**UI surface:**

- **Primary:** Dungeon archive / add-quest flow: when the player completes a **monster** encounter (befriend or defeat path), expose a clear control: “Use Evocation (once this month): count this as a short read.”
- **Secondary:** If the flow stays deck-first (`DungeonDeckController`), the same affordance should appear when converting drawn cards to quests or when marking the linked book complete.

**State / reset:**

- Increment **monthly** usage in `MONTHLY_WORKFLOW_USAGE.evocationQuickReadUsed` (or equivalent) when the player confirms the substitution for a qualifying encounter.
- Reset at EOM with other monthly workflow keys.

**Controller / service touchpoints:**

- `DungeonQuestHandler` — set `evocationBenefitApplied` on the encounter quest when used.
- `DungeonDeckController` / `character-sheet.js` — wire buttons that depend on caps from `PermanentEffectCapabilities`.
- Optional: `RewardCalculator` or quest completion path — only if rules later tie rewards to “short read” explicitly (today mostly narrative).

**Deferred / follow-up:** Enforcing page-count bands (short story vs novella vs novel) from Library book metadata — only if product wants mechanical validation; otherwise remain player-attested via checkbox.

---

### Mastery: Quick Shot (`mastery.quick_shot`)

**Rule:** Evocation may be used to complete **any single dungeon room challenge** with a short story, not only a monster encounter.

**Dependency:** Requires Evocation school benefit conceptually; implementation should check **school Evocation** + learned **Quick Shot** + monthly Evocation charge still available (same charge as base Evocation unless you later split charges — default: **one monthly Evocation benefit** shared by base + Quick Shot).

**UI:** When adding/completing the **room challenge** quest (`isEncounter: false`), offer “Use Evocation quick read” if `resolvePermanentEffectCapabilities` indicates Quick Shot + eligible room.

**State:** Same monthly flag as Evocation; set `evocationQuickShotChallenge: true` on the room-challenge quest when used.

**Touchpoints:** `DungeonQuestHandler`, `DungeonDeckController` / completion UI, `PermanentEffectCapabilities` flags.

---

### Mastery: Concussive Blast (`mastery.concussive_blast`)

**Rule:** When you use Evocation to complete a **dungeon room challenge**, you also complete a **second prompt in the same room** if one exists.

**Interpretation:** “Second prompt” = another incomplete required piece in that room: typically the **encounter** line if the room challenge was completed first, or the room challenge if an encounter was done first — product should confirm ordering. Default design: **on completion of the quest where Evocation was applied to the room challenge**, auto-complete one remaining encounter in that `roomNumber` (player picks which if multiple encounters exist, or deterministic rule: first incomplete encounter).

**UI:** Confirmation modal when Evocation + Concussive Blast apply: “Also resolve [encounter X]?” or auto-apply with toast.

**State:**

- Store `concussiveBlastExtraPromptId` or link second quest id created/closed in the same transaction.
- Consume same monthly Evocation use as the room challenge (one blast, two prompts).

**Touchpoints:** `DungeonQuestHandler` (possibly emit two completed quests or one quest + auto-complete flag), `stateAdapter` batch updates, `DungeonDeckService.checkRoomCompletionStatus` for consistency.

**Risk:** High — needs careful ordering with active vs completed quests. **Recommend** a follow-up bead “Implement Concussive Blast resolution” after Evocation + Quick Shot plumbing exists.

---

### Mastery: Irresistible Charm (`mastery.irresistible_charm`)

**Rule:** Once per month, auto-succeed at befriending a monster **without** reading a book for the befriend prompt.

**UI:** On monster encounter with befriend path, button “Use Irresistible Charm (once this month)” that marks completion without requiring `bookId` / pages for that quest (or uses a dummy narrative attestation).

**State:** `MONTHLY_WORKFLOW_USAGE.irresistibleCharmUsed`; quest flag `irresistibleCharmAutoBefriend: true`.

**Touchpoints:** `DungeonQuestHandler` validation (currently expects book fields from common form — may need a branch), `QuestController` complete flow, `dataValidator` for optional null book when flag set.

---

### School: Transmutation — currency exchange (`school.transmutation.monthly_currency_exchange`)

**Rule:** Once per month, exchange 3 Ink → 1 Paper or 1 Paper → 3 Ink.

**UI:**

- **Recommended:** Small control block on **Character** sheet near currency (or Inventory) — “Transmute (once this month)” with direction toggle and confirm.
- Alternative: modal from Permanent Bonuses / school panel.

**State:** `transmutationExchangeUsed: true` after one successful exchange; reset at EOM.

**Touchpoints:** New thin `TransmutationWorkflowController` or methods on `CharacterController` / `stateAdapter` (`applyTransmutationExchange(direction)` with bounds checks).

**Validation:** Cannot drive currency negative; atomic update of ink/paper in one save.

---

### Mastery: Philosopher's Stone (`mastery.philosophers_stone`)

**Rule:** Once per month, sacrifice **50 XP** to gain **50 Ink** and **10 Paper**.

**UI:** Button near XP / level (or library advanced panel) visible when ability learned; confirm dialog.

**State:** `philosophersStoneUsed`; apply XP deduction, currency add, in one logical operation.

**Touchpoints:**

- Read/write XP from the same source as leveling (form + persistence via `stateAdapter` / `CHARACTER_SHEET_FORM`).
- `CharacterController` or dedicated workflow handler.

**Validation:** XP ≥ 50; monthly flag; learn check via `PermanentEffectCapabilities`.

---

### Mastery: Alchemic Focus (`mastery.alchemic_focus`)

**Rule:** +5 XP for every book you read **outside of your monthly quest pool**.

**Recommended definition for implementation:**

1. When **marking a book complete** in the Library (`stateAdapter.markBookComplete`), compute whether the book counts as “outside” the monthly quest pool.
2. **Operational definition (pick one and document in rules UI):**
   - **A (link-based):** The book is **not** linked (`book.links.questIds`) to any quest that was part of the **current month’s genre quest pool** (requires a stable definition of “in pool”: e.g. quest ids from assignments created after monthly draw — may need `GenreQuestDeckController` / active assignment metadata).
   - **B (simpler):** The book is **not** linked to any **active or completed** genre-type quest for the **current calendar month** (stricter).
   - **C (minimal):** Book has **no** `questIds` links at completion time — very generous; likely wrong for many play styles.

**Recommendation:** Start with **A** with explicit product sign-off; instrument with debug logging in dev if needed.

**Touchpoints:**

- `stateAdapter.markBookComplete` — after base synergy rewards, add **+5 XP** to the return payload or apply via the same path as other XP grants from library.
- `PermanentEffectCapabilities.rewardModifiers` — add e.g. `alchemicFocusOutOfPoolBonusXp: 5` when ability learned, and let `markBookComplete` multiply by eligibility boolean (0 or 1 books) per book — actually flat +5 per eligible book.

**Validation:** Only when ability learned; idempotent per book (store `booksGrantedAlchemicFocusXp: bookId[]` if double-completion is a risk — usually completion is once).

---

## End of Month integration

Extend `EndOfMonthController` after helper refreshes (~lines 102–127) to:

1. Bump or clear `MONTHLY_WORKFLOW_USAGE` (same cycle as monthly helpers).
2. Re-render any new UI panel that shows “available this month” for workflow actions.

---

## What to implement now vs. defer

| Item | Suggest now | Defer |
| --- | --- | --- |
| `MONTHLY_WORKFLOW_USAGE` + EOM reset + validator/migrator | Yes | — |
| `PermanentEffectCapabilities` workflow flags | Yes | — |
| Evocation + Quick Shot (shared monthly charge) | Yes | — |
| Transmutation exchange | Yes | — |
| Philosopher's Stone | Yes | — |
| Irresistible Charm | Yes (smaller than Concussive) | — |
| Alchemic Focus | Yes *after* pool definition is chosen | Split if rules need debate |
| Concussive Blast | Partial spec above | Full auto-resolution of second prompt |

---

## Testing strategy

- Unit tests for: state defaults, EOM reset, validator acceptance/rejection of dungeon quest optional fields.
- Integration tests: `markBookComplete` with Alchemic Focus + mocked quest links.
- Manual QA scripts: dungeon deck → use Evocation → EOM → availability restored.

---

## References

- `project-docs/permanent-effects-osm-context.md` — audit matrix and architecture direction.
- `assets/js/services/PermanentEffectCapabilities.js` — dispositions and capability resolution.
- `assets/js/quest-handlers/DungeonQuestHandler.js` — dungeon quest shape.
- `assets/js/controllers/EndOfMonthController.js` — monthly reset hub.
- `assets/js/character-sheet/storageKeys.js` — persistence keys.
