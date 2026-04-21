# Projection Function Implementations Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Beads:** `tome-of-secrets-hhc`, `tome-of-secrets-ujb`, `tome-of-secrets-fhb` (closes `tome-of-secrets-1ys` and unblocks `tome-of-secrets-lh7`)

**Goal:** Replace the three stub projection functions with real implementations that extract data from the save snapshot JSONB and populate `tos_save_summary`, `tos_inventory`, and `tos_quests` on every save.

**Architecture:** The dispatcher trigger (`tos_projection_dispatcher`) already fires AFTER INSERT OR UPDATE on `tos_saves` and calls three stub functions with `(p_user_id uuid, p_data jsonb)`. This plan replaces those stubs with real SQL logic. Each function wraps its body in `BEGIN ... EXCEPTION WHEN OTHERS` so one projection failure doesn't abort the others. The summary uses upsert; inventory and quests use delete-and-replace.

**Tech Stack:** Supabase (Postgres/plpgsql), single idempotent migration

**Key constraint:** This is a static Jekyll site. SQL runs manually in Supabase SQL Editor. No server-side application code. The `p_data` parameter is the full snapshot: `{ version, updatedAt, data: { formData, characterState, monthlyCompletedBooks } }`.

---

## Snapshot JSON Reference

The dispatcher passes `NEW.user_id` and `NEW.data` (the full snapshot JSONB). Key paths:

**For save summary (`tos_save_summary`):**
- `p_data->'data'->'formData'->>'keeperName'` → `keeper_name`
- `p_data->'data'->'formData'->>'level'` → `level`
- `p_data->'data'->'formData'->>'wizardSchool'` → `school`
- `p_data->'data'->'formData'->>'librarySanctum'` → `sanctum`
- `p_data->'data'->'formData'->>'keeperBackground'` → `background`
- `p_data->>'version'` → `schema_version` (cast to integer)
- `p_data->'data'->'monthlyCompletedBooks'` → `books_count` (array length)
- `p_data->'data'->'characterState'->'completedQuests'` → `quests_completed` (array length)
- Sum of 4 inventory arrays → `items_count`

**For inventory (`tos_inventory`):**
- `p_data->'data'->'characterState'->'equippedItems'` — array of `{ name: "..." }` → slot `'equipped'`
- `p_data->'data'->'characterState'->'inventoryItems'` — array of `{ name: "..." }` → slot `'inventory'`
- `p_data->'data'->'characterState'->'passiveItemSlots'` — array of `{ itemName: "..." }` → slot `'passive_item'`
- `p_data->'data'->'characterState'->'passiveFamiliarSlots'` — array of `{ itemName: "..." }` → slot `'passive_familiar'`

Note: `equippedItems`/`inventoryItems` use `.name`; `passiveItemSlots`/`passiveFamiliarSlots` use `.itemName`.

**For quests (`tos_quests`):**
- `p_data->'data'->'characterState'->'activeAssignments'` → `quest_type = 'active'`
- `p_data->'data'->'characterState'->'completedQuests'` → `quest_type = 'completed'`
- `p_data->'data'->'characterState'->'discardedQuests'` → `quest_type = 'discarded'`

Each array element is stored as the full `quest_data` JSONB.

---

## File Structure

| Action | File | Responsibility |
|--------|------|----------------|
| Create | `supabase/migrations/20260421000000_implement-projection-functions.sql` | Replace all 3 stub functions with real logic |

Single migration file. All three functions use `CREATE OR REPLACE` so the migration is idempotent.

---

### Task 1: Implement tos_project_save_summary

**Files:**
- Create: `supabase/migrations/20260421000000_implement-projection-functions.sql`

- [ ] **Step 1: Create the migration file with the save summary projection**

Create `supabase/migrations/20260421000000_implement-projection-functions.sql`:

```sql
-- Implement projection functions for tos_save_summary, tos_inventory, tos_quests
-- Beads: tome-of-secrets-hhc, tome-of-secrets-ujb, tome-of-secrets-fhb
--
-- Replaces stub functions created in 20260408015258_projections-foundation.sql
-- and fixed in 20260408021359_fix-projection-function-signatures.sql.
-- Idempotent: uses CREATE OR REPLACE throughout.
--
-- Run in Supabase SQL Editor after the foundation migration.

-- ============================================================
-- Section 1: tos_project_save_summary (bead hhc)
-- ============================================================
-- Upserts one row per user with headline stats extracted from the snapshot.

CREATE OR REPLACE FUNCTION public.tos_project_save_summary(p_user_id uuid, p_data jsonb)
RETURNS void AS $$
DECLARE
  v_form jsonb;
  v_state jsonb;
  v_books jsonb;
  v_completed_quests jsonb;
  v_items_count integer;
BEGIN
  v_form  := p_data->'data'->'formData';
  v_state := p_data->'data'->'characterState';
  v_books := p_data->'data'->'monthlyCompletedBooks';
  v_completed_quests := v_state->'completedQuests';

  -- Count items across all 4 slots
  v_items_count := COALESCE(jsonb_array_length(v_state->'equippedItems'), 0)
                 + COALESCE(jsonb_array_length(v_state->'inventoryItems'), 0)
                 + COALESCE(jsonb_array_length(v_state->'passiveItemSlots'), 0)
                 + COALESCE(jsonb_array_length(v_state->'passiveFamiliarSlots'), 0);

  INSERT INTO public.tos_save_summary (
    user_id, keeper_name, level, school, sanctum, background,
    schema_version, snapshot_hash, books_count, quests_completed, items_count, projected_at
  ) VALUES (
    p_user_id,
    v_form->>'keeperName',
    v_form->>'level',
    v_form->>'wizardSchool',
    v_form->>'librarySanctum',
    v_form->>'keeperBackground',
    (p_data->>'version')::integer,
    NULL,  -- snapshot_hash is on tos_saves row, not inside p_data
    COALESCE(jsonb_array_length(v_books), 0),
    COALESCE(jsonb_array_length(v_completed_quests), 0),
    v_items_count,
    now()
  )
  ON CONFLICT (user_id) DO UPDATE SET
    keeper_name      = EXCLUDED.keeper_name,
    level            = EXCLUDED.level,
    school           = EXCLUDED.school,
    sanctum          = EXCLUDED.sanctum,
    background       = EXCLUDED.background,
    schema_version   = EXCLUDED.schema_version,
    snapshot_hash    = EXCLUDED.snapshot_hash,
    books_count      = EXCLUDED.books_count,
    quests_completed = EXCLUDED.quests_completed,
    items_count      = EXCLUDED.items_count,
    projected_at     = now();

EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'tos_project_save_summary failed for user %: %', p_user_id, SQLERRM;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
```

- [ ] **Step 2: Verify the SQL**

Read the file back and confirm:
- Uses `CREATE OR REPLACE` (idempotent, replaces the stub)
- Extracts formData fields with `->>` (text extraction)
- Casts `version` to integer
- Uses `COALESCE(jsonb_array_length(...), 0)` to handle null/missing arrays
- `ON CONFLICT (user_id) DO UPDATE` for upsert
- `EXCEPTION WHEN OTHERS` with `RAISE WARNING` so failures are logged but don't abort

---

### Task 2: Implement tos_project_inventory

**Files:**
- Modify: `supabase/migrations/20260421000000_implement-projection-functions.sql`

- [ ] **Step 1: Append the inventory projection function**

Append to the migration file:

```sql

-- ============================================================
-- Section 2: tos_project_inventory (bead ujb)
-- ============================================================
-- Deletes all inventory rows for the user, then inserts from 4 snapshot arrays.
-- equippedItems/inventoryItems use .name; passiveItemSlots/passiveFamiliarSlots use .itemName.

CREATE OR REPLACE FUNCTION public.tos_project_inventory(p_user_id uuid, p_data jsonb)
RETURNS void AS $$
DECLARE
  v_state jsonb;
  v_item jsonb;
BEGIN
  v_state := p_data->'data'->'characterState';

  DELETE FROM public.tos_inventory WHERE user_id = p_user_id;

  -- equippedItems: items with .name property
  IF v_state->'equippedItems' IS NOT NULL THEN
    FOR v_item IN SELECT * FROM jsonb_array_elements(v_state->'equippedItems')
    LOOP
      IF v_item->>'name' IS NOT NULL THEN
        INSERT INTO public.tos_inventory (user_id, item_key, slot, projected_at)
        VALUES (p_user_id, v_item->>'name', 'equipped', now());
      END IF;
    END LOOP;
  END IF;

  -- inventoryItems: items with .name property
  IF v_state->'inventoryItems' IS NOT NULL THEN
    FOR v_item IN SELECT * FROM jsonb_array_elements(v_state->'inventoryItems')
    LOOP
      IF v_item->>'name' IS NOT NULL THEN
        INSERT INTO public.tos_inventory (user_id, item_key, slot, projected_at)
        VALUES (p_user_id, v_item->>'name', 'inventory', now());
      END IF;
    END LOOP;
  END IF;

  -- passiveItemSlots: slots with .itemName property
  IF v_state->'passiveItemSlots' IS NOT NULL THEN
    FOR v_item IN SELECT * FROM jsonb_array_elements(v_state->'passiveItemSlots')
    LOOP
      IF v_item->>'itemName' IS NOT NULL THEN
        INSERT INTO public.tos_inventory (user_id, item_key, slot, projected_at)
        VALUES (p_user_id, v_item->>'itemName', 'passive_item', now());
      END IF;
    END LOOP;
  END IF;

  -- passiveFamiliarSlots: slots with .itemName property
  IF v_state->'passiveFamiliarSlots' IS NOT NULL THEN
    FOR v_item IN SELECT * FROM jsonb_array_elements(v_state->'passiveFamiliarSlots')
    LOOP
      IF v_item->>'itemName' IS NOT NULL THEN
        INSERT INTO public.tos_inventory (user_id, item_key, slot, projected_at)
        VALUES (p_user_id, v_item->>'itemName', 'passive_familiar', now());
      END IF;
    END LOOP;
  END IF;

EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'tos_project_inventory failed for user %: %', p_user_id, SQLERRM;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
```

- [ ] **Step 2: Verify the SQL**

Read the appended section and confirm:
- Deletes all existing rows for user before inserting (clean replace)
- Handles null/missing arrays with `IS NOT NULL` checks before iterating
- Uses `->>'name'` for equipped/inventory items, `->>'itemName'` for passive slots
- Skips items with null keys (empty passive slots have no itemName)
- `EXCEPTION WHEN OTHERS` wraps the entire body

---

### Task 3: Implement tos_project_quests

**Files:**
- Modify: `supabase/migrations/20260421000000_implement-projection-functions.sql`

- [ ] **Step 1: Append the quests projection function**

Append to the migration file:

```sql

-- ============================================================
-- Section 3: tos_project_quests (bead fhb)
-- ============================================================
-- Deletes all quest rows for the user, then inserts from 3 snapshot arrays.
-- Each array element is stored as the full quest_data JSONB.

CREATE OR REPLACE FUNCTION public.tos_project_quests(p_user_id uuid, p_data jsonb)
RETURNS void AS $$
DECLARE
  v_state jsonb;
  v_quest jsonb;
BEGIN
  v_state := p_data->'data'->'characterState';

  DELETE FROM public.tos_quests WHERE user_id = p_user_id;

  -- activeAssignments -> quest_type 'active'
  IF v_state->'activeAssignments' IS NOT NULL THEN
    FOR v_quest IN SELECT * FROM jsonb_array_elements(v_state->'activeAssignments')
    LOOP
      INSERT INTO public.tos_quests (user_id, quest_type, quest_data, projected_at)
      VALUES (p_user_id, 'active', v_quest, now());
    END LOOP;
  END IF;

  -- completedQuests -> quest_type 'completed'
  IF v_state->'completedQuests' IS NOT NULL THEN
    FOR v_quest IN SELECT * FROM jsonb_array_elements(v_state->'completedQuests')
    LOOP
      INSERT INTO public.tos_quests (user_id, quest_type, quest_data, projected_at)
      VALUES (p_user_id, 'completed', v_quest, now());
    END LOOP;
  END IF;

  -- discardedQuests -> quest_type 'discarded'
  IF v_state->'discardedQuests' IS NOT NULL THEN
    FOR v_quest IN SELECT * FROM jsonb_array_elements(v_state->'discardedQuests')
    LOOP
      INSERT INTO public.tos_quests (user_id, quest_type, quest_data, projected_at)
      VALUES (p_user_id, 'discarded', v_quest, now());
    END LOOP;
  END IF;

EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'tos_project_quests failed for user %: %', p_user_id, SQLERRM;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
```

- [ ] **Step 2: Verify the SQL**

Read the appended section and confirm:
- Deletes all existing quest rows for user before inserting
- Handles null/missing arrays with `IS NOT NULL` checks
- Stores the full quest object as `quest_data` JSONB (no extraction needed)
- Maps array source to correct `quest_type` value
- `EXCEPTION WHEN OTHERS` wraps the entire body

---

### Task 4: Final verification

**Files:**
- Read: `supabase/migrations/20260421000000_implement-projection-functions.sql`

- [ ] **Step 1: Read the complete migration file end-to-end**

Verify it contains all 3 sections:
1. `tos_project_save_summary` — upsert from formData + counts
2. `tos_project_inventory` — delete-replace from 4 item arrays
3. `tos_project_quests` — delete-replace from 3 quest arrays

All use `CREATE OR REPLACE`, `SECURITY DEFINER`, and `EXCEPTION WHEN OTHERS`.

- [ ] **Step 2: Verify no test suite regressions**

Run: `cd /workspaces/tome-of-secrets/tests && npx jest --no-cache 2>&1 | tail -10`

Expected: No regressions (this is a SQL-only migration, no JS changes).

- [ ] **Step 3: Close the beads**

```bash
bd close hhc --comment "Implemented tos_project_save_summary: upserts keeper_name, level, school, sanctum, background, schema_version, books_count, quests_completed, items_count from snapshot JSONB."
bd close ujb --comment "Implemented tos_project_inventory: delete-and-replace from equippedItems, inventoryItems, passiveItemSlots, passiveFamiliarSlots arrays."
bd close fhb --comment "Implemented tos_project_quests: delete-and-replace from activeAssignments, completedQuests, discardedQuests arrays."
bd close 1ys --comment "All three projection writers (hhc, ujb, fhb) are implemented. Stubs replaced with real upsert/delete-replace logic."
```
