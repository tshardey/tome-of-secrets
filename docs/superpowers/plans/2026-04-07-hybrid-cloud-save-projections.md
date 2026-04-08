# Hybrid Cloud-Save Projections and Observability — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Bead:** `tome-of-secrets-lh7` — Add hybrid cloud-save projections and observability

**Goal:** Establish the foundational SQL schema, Postgres trigger infrastructure, and client-side changes that enable all 8 downstream beads (projection tables, sync event logging, metadata persistence, and troubleshooting docs).

**Architecture:** The current cloud save stores one JSONB blob per user in `tos_saves`. This plan adds: (1) first-class columns on `tos_saves` for `snapshot_hash`, `schema_version`, and `saved_at` so they're queryable without JSONB extraction; (2) a `tos_sync_events` table for audit/observability of sync lifecycle; (3) skeleton projection tables (`tos_inventory`, `tos_quests`, `tos_save_summary`) that downstream beads will populate via Postgres trigger functions; (4) a dispatcher trigger on `tos_saves` that calls projection stubs; (5) client-side changes to `cloudSync.js` to pass metadata in upserts.

**Tech Stack:** Supabase (Postgres), vanilla JS (browser), Jest (jsdom)

**Key constraint:** This is a static site (Jekyll + GitHub Pages). All SQL runs manually in Supabase SQL Editor. The repo stores migration scripts as documentation. No server-side application code exists.

---

## File Structure

| Action | File | Responsibility |
|--------|------|----------------|
| Create | `sql/001-projections-foundation.sql` | All DDL: tos_saves enhancements, tos_sync_events, projection tables, trigger + dispatcher function |
| Modify | `assets/js/services/cloudSync.js` | Pass `snapshot_hash`, `schema_version`, `saved_at` as top-level columns in upsert payload |
| Create | `tests/cloudSyncMetadata.test.js` | Tests for new metadata in upsert payload |
| Modify | `project-docs/SUPABASE-CLOUD-SAVE.md` | Document migration step and new tables |

---

### Task 1: Create the SQL migration script — tos_saves column enhancements

**Files:**
- Create: `sql/001-projections-foundation.sql`

This task adds the first section of the migration: new columns on `tos_saves` for queryable metadata. Currently `snapshot_hash`, `schema_version`, and `saved_at` exist only inside the JSONB `data` column (or are computed client-side). Promoting them to real columns enables SQL queries, indexes, and trigger logic without JSONB extraction.

- [ ] **Step 1: Create the SQL migration file with tos_saves enhancements**

Create `sql/001-projections-foundation.sql` with the following content. This is the first section — subsequent tasks append to this file.

```sql
-- 001-projections-foundation.sql
-- Foundation for hybrid cloud-save projections and observability
-- Bead: tome-of-secrets-lh7
-- Run in Supabase SQL Editor after backing up tos_saves
--
-- Prerequisites: tos_saves table exists per SUPABASE-CLOUD-SAVE.md
-- Idempotent: uses IF NOT EXISTS / OR REPLACE throughout

-- ============================================================
-- Section 1: Enhance tos_saves with queryable metadata columns
-- ============================================================

ALTER TABLE public.tos_saves
  ADD COLUMN IF NOT EXISTS snapshot_hash text,
  ADD COLUMN IF NOT EXISTS schema_version integer,
  ADD COLUMN IF NOT EXISTS saved_at timestamptz;

COMMENT ON COLUMN public.tos_saves.snapshot_hash IS 'Client-computed djb2 hash of canonical snapshot data; enables server-side drift detection';
COMMENT ON COLUMN public.tos_saves.schema_version IS 'Client schema version at time of save; mirrors snapshot.version';
COMMENT ON COLUMN public.tos_saves.saved_at IS 'Client-reported save timestamp; distinct from server-side updated_at';
```

- [ ] **Step 2: Verify the SQL is syntactically valid**

Read the file back and confirm:
- `ALTER TABLE` uses `ADD COLUMN IF NOT EXISTS` (idempotent)
- All three columns have correct types (`text`, `integer`, `timestamptz`)
- Comments are present for documentation

---

### Task 2: Add tos_sync_events table to migration

**Files:**
- Modify: `sql/001-projections-foundation.sql`

This table records sync lifecycle events (push, pull, conflict, error) for observability. Each row is one sync operation. RLS restricts users to their own events.

- [ ] **Step 1: Append tos_sync_events DDL to the migration file**

Append the following section to `sql/001-projections-foundation.sql`:

```sql

-- ============================================================
-- Section 2: Sync event log for observability
-- ============================================================

CREATE TABLE IF NOT EXISTS public.tos_sync_events (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  event_type text NOT NULL,          -- 'push' | 'pull' | 'conflict_push' | 'conflict_pull' | 'noop' | 'error'
  snapshot_hash text,                -- hash of the snapshot involved
  schema_version integer,            -- client schema version at time of event
  detail text,                       -- human-readable detail string from sync result
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sync_events_user_created
  ON public.tos_sync_events (user_id, created_at DESC);

COMMENT ON TABLE public.tos_sync_events IS 'Audit log of cloud sync operations per user; one row per sync attempt';

ALTER TABLE public.tos_sync_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "tos_sync_events_select_own" ON public.tos_sync_events;
CREATE POLICY "tos_sync_events_select_own"
  ON public.tos_sync_events FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "tos_sync_events_insert_own" ON public.tos_sync_events;
CREATE POLICY "tos_sync_events_insert_own"
  ON public.tos_sync_events FOR INSERT
  WITH CHECK (auth.uid() = user_id);
```

- [ ] **Step 2: Verify the section**

Confirm:
- Table has identity PK, user_id FK with cascade, event_type NOT NULL
- Index on (user_id, created_at DESC) for efficient per-user queries
- RLS enabled with select_own and insert_own policies (users cannot delete/update events — append-only log)

---

### Task 3: Add projection table DDL — tos_save_summary, tos_inventory, tos_quests

**Files:**
- Modify: `sql/001-projections-foundation.sql`

These are **read-side projection tables** populated by Postgres trigger functions when `tos_saves.data` is updated. They provide queryable, normalized views of the JSONB snapshot. Each table has a 1:1 (summary) or 1:N (inventory, quests) relationship with a user. Child beads will implement the trigger functions that populate these; this task creates the table structures.

- [ ] **Step 1: Append projection table DDL**

Append to `sql/001-projections-foundation.sql`:

```sql

-- ============================================================
-- Section 3: Projection tables (read-side views of snapshot)
-- ============================================================

-- 3a: Save summary — one row per user, denormalized headline stats
CREATE TABLE IF NOT EXISTS public.tos_save_summary (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  keeper_name text,
  level text,
  school text,
  sanctum text,
  background text,
  schema_version integer,
  snapshot_hash text,
  books_count integer DEFAULT 0,
  quests_completed integer DEFAULT 0,
  items_count integer DEFAULT 0,
  projected_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.tos_save_summary ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "tos_save_summary_select_own" ON public.tos_save_summary;
CREATE POLICY "tos_save_summary_select_own"
  ON public.tos_save_summary FOR SELECT
  USING (auth.uid() = user_id);

COMMENT ON TABLE public.tos_save_summary IS 'Projected headline stats from latest save snapshot; updated by trigger on tos_saves';

-- 3b: Inventory projection — one row per equipped/inventory item per user
CREATE TABLE IF NOT EXISTS public.tos_inventory (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  item_key text NOT NULL,            -- item identifier from allItems.json
  slot text,                         -- 'equipped' | 'inventory' | 'passive_item' | 'passive_familiar'
  projected_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, item_key, slot)
);

CREATE INDEX IF NOT EXISTS idx_inventory_user
  ON public.tos_inventory (user_id);

ALTER TABLE public.tos_inventory ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "tos_inventory_select_own" ON public.tos_inventory;
CREATE POLICY "tos_inventory_select_own"
  ON public.tos_inventory FOR SELECT
  USING (auth.uid() = user_id);

COMMENT ON TABLE public.tos_inventory IS 'Projected inventory from latest save snapshot; replace-all on each save';

-- 3c: Quests projection — one row per quest per user
CREATE TABLE IF NOT EXISTS public.tos_quests (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  quest_type text NOT NULL,          -- 'active' | 'completed' | 'discarded'
  quest_data jsonb NOT NULL DEFAULT '{}',  -- the quest object from snapshot
  projected_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_quests_user_type
  ON public.tos_quests (user_id, quest_type);

ALTER TABLE public.tos_quests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "tos_quests_select_own" ON public.tos_quests;
CREATE POLICY "tos_quests_select_own"
  ON public.tos_quests FOR SELECT
  USING (auth.uid() = user_id);

COMMENT ON TABLE public.tos_quests IS 'Projected quests from latest save snapshot; replace-all on each save';
```

- [ ] **Step 2: Verify projection tables**

Confirm:
- `tos_save_summary` is 1:1 with user (PK = user_id), has headline fields matching formData keys
- `tos_inventory` is 1:N with unique constraint on (user_id, item_key, slot)
- `tos_quests` is 1:N with index on (user_id, quest_type)
- All three have RLS with select_own policy (only trigger functions write; no user INSERT policy needed — they're server-side)
- All have `projected_at` timestamp

---

### Task 4: Add projection dispatcher trigger on tos_saves

**Files:**
- Modify: `sql/001-projections-foundation.sql`

This creates a Postgres trigger function that fires AFTER INSERT OR UPDATE on `tos_saves`. It serves as a dispatcher — calling individual projection functions that child beads will implement. For now the stubs are no-ops.

- [ ] **Step 1: Append trigger + dispatcher function**

Append to `sql/001-projections-foundation.sql`:

```sql

-- ============================================================
-- Section 4: Projection dispatcher trigger on tos_saves
-- ============================================================

-- Stub projection functions — child beads replace these with real logic.
-- Using OR REPLACE so child bead migrations are also idempotent.

CREATE OR REPLACE FUNCTION public.tos_project_save_summary()
RETURNS trigger AS $$
BEGIN
  -- Stub: replaced by bead tome-of-secrets-hhc
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.tos_project_inventory()
RETURNS trigger AS $$
BEGIN
  -- Stub: replaced by bead tome-of-secrets-ujb
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.tos_project_quests()
RETURNS trigger AS $$
BEGIN
  -- Stub: replaced by bead tome-of-secrets-fhb
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Dispatcher: calls each projection function in sequence.
-- Runs AFTER the row is committed so projection failures don't block saves.
CREATE OR REPLACE FUNCTION public.tos_projection_dispatcher()
RETURNS trigger AS $$
BEGIN
  -- Each projection is a separate function so child beads can
  -- replace them independently without touching the dispatcher.
  PERFORM public.tos_project_save_summary();
  PERFORM public.tos_project_inventory();
  PERFORM public.tos_project_quests();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Wire the dispatcher to tos_saves
DROP TRIGGER IF EXISTS tos_saves_project_on_upsert ON public.tos_saves;
CREATE TRIGGER tos_saves_project_on_upsert
  AFTER INSERT OR UPDATE ON public.tos_saves
  FOR EACH ROW
  EXECUTE FUNCTION public.tos_projection_dispatcher();
```

- [ ] **Step 2: Verify trigger design**

Confirm:
- Stub functions use `CREATE OR REPLACE` (child beads can overwrite without migration conflicts)
- Dispatcher uses `PERFORM` (discards return values; projection failures raise exceptions — acceptable for now since stubs are no-ops)
- Trigger is `AFTER INSERT OR UPDATE` (doesn't block the save operation's commit)
- `SECURITY DEFINER` so projection functions can write to tables the user doesn't have INSERT on (RLS is select-only for projection tables)

---

### Task 5: Write the failing test for upsert metadata

**Files:**
- Create: `tests/cloudSyncMetadata.test.js`

The client currently calls `supabase.from('tos_saves').upsert({ user_id, data: snapshot })`. After our changes, it must also include `snapshot_hash`, `schema_version`, and `saved_at`. This test verifies the upsert payload shape.

- [ ] **Step 1: Write the test file**

Create `tests/cloudSyncMetadata.test.js`:

```js
/**
 * @jest-environment jsdom
 */
import { buildLocalSnapshot, snapshotHash } from '../assets/js/services/cloudSync.js';
import { STORAGE_KEYS } from '../assets/js/character-sheet/storageKeys.js';
import { safeSetJSON } from '../assets/js/utils/storage.js';

// We test buildUpsertPayload (new export) which wraps snapshot + metadata
// into the shape sent to Supabase.
import { buildUpsertPayload } from '../assets/js/services/cloudSync.js';

describe('Cloud Sync - Upsert Metadata', () => {
  beforeEach(() => {
    localStorage.clear();
    jest.clearAllMocks();
  });

  it('buildUpsertPayload includes snapshot_hash, schema_version, and saved_at', async () => {
    localStorage.setItem('tomeOfSecrets_schemaVersion', '15');
    safeSetJSON(STORAGE_KEYS.CHARACTER_SHEET_FORM, { keeperName: 'Test' });

    const userId = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
    const payload = await buildUpsertPayload(userId);

    // Must include user_id
    expect(payload.user_id).toBe(userId);

    // Must include data (the full snapshot)
    expect(payload.data).toBeDefined();
    expect(payload.data.data.formData.keeperName).toBe('Test');

    // Must include promoted metadata columns
    expect(payload.snapshot_hash).toBe(snapshotHash(payload.data));
    expect(payload.schema_version).toBe(15);
    expect(payload.saved_at).toBeDefined();
    // saved_at should be a valid ISO string
    expect(new Date(payload.saved_at).toISOString()).toBe(payload.saved_at);
  });

  it('buildUpsertPayload handles null schema version', async () => {
    // No schemaVersion set in localStorage
    safeSetJSON(STORAGE_KEYS.CHARACTER_SHEET_FORM, { keeperName: 'NoVersion' });

    const userId = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
    const payload = await buildUpsertPayload(userId);

    expect(payload.schema_version).toBeNull();
    expect(payload.snapshot_hash).toBeDefined();
    expect(typeof payload.snapshot_hash).toBe('string');
  });

  it('buildUpsertPayload snapshot_hash is stable for same data', async () => {
    localStorage.setItem('tomeOfSecrets_schemaVersion', '15');
    safeSetJSON(STORAGE_KEYS.CHARACTER_SHEET_FORM, { keeperName: 'Stable' });

    const userId = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
    const payload1 = await buildUpsertPayload(userId);
    const payload2 = await buildUpsertPayload(userId);

    // Hash should be identical for same underlying data
    // (saved_at and updatedAt will differ, but hash is computed from data only)
    expect(payload1.snapshot_hash).toBe(payload2.snapshot_hash);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd tests && npx jest cloudSyncMetadata.test.js --no-cache 2>&1 | head -30`

Expected: FAIL — `buildUpsertPayload` is not exported from `cloudSync.js` yet.

---

### Task 6: Implement buildUpsertPayload and wire it into upsertRemoteSave

**Files:**
- Modify: `assets/js/services/cloudSync.js`

Add a new exported function `buildUpsertPayload(userId)` that builds the full upsert row including metadata columns. Update `upsertRemoteSave` to use it.

- [ ] **Step 1: Add buildUpsertPayload export to cloudSync.js**

Add after the `snapshotHash` function (around line 68):

```js
export async function buildUpsertPayload(userId) {
  const snapshot = await buildLocalSnapshot();
  const hash = snapshotHash(snapshot);
  return {
    user_id: userId,
    data: snapshot,
    snapshot_hash: hash,
    schema_version: snapshot.version,
    saved_at: new Date().toISOString()
  };
}
```

- [ ] **Step 2: Update upsertRemoteSave to use buildUpsertPayload**

Replace the existing `upsertRemoteSave` function (around line 134-148) with:

```js
async function upsertRemoteSave(supabase, snapshot) {
  const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
  if (sessionError) throw sessionError;
  const session = sessionData?.session;
  if (!session) {
    throw new Error('Not signed in.');
  }
  const userId = session.user.id;
  const hash = snapshotHash(snapshot);

  const { error } = await supabase
    .from(SYNC_TABLE)
    .upsert({
      user_id: userId,
      data: snapshot,
      snapshot_hash: hash,
      schema_version: snapshot.version ?? null,
      saved_at: new Date().toISOString()
    }, { onConflict: 'user_id' });

  if (error) throw error;
}
```

- [ ] **Step 3: Run the test to verify it passes**

Run: `cd tests && npx jest cloudSyncMetadata.test.js --no-cache 2>&1 | head -30`

Expected: PASS — all 3 tests green.

- [ ] **Step 4: Run the full test suite to check for regressions**

Run: `cd tests && npx jest --no-cache 2>&1 | tail -20`

Expected: All existing tests still pass. The `upsertRemoteSave` change is backward-compatible — Supabase ignores columns that don't exist in the table (they'll exist after running the migration).

---

### Task 7: Update SUPABASE-CLOUD-SAVE.md with migration instructions

**Files:**
- Modify: `project-docs/SUPABASE-CLOUD-SAVE.md`

Add a section documenting the new migration and tables.

- [ ] **Step 1: Append migration section to SUPABASE-CLOUD-SAVE.md**

Add before the "GitHub Pages" section (before line 99):

```markdown

## 5) Projections and observability migration

After the initial `tos_saves` table is set up (step 3), run the projections migration to enable observability and downstream features:

```bash
# In Supabase SQL Editor, run:
sql/001-projections-foundation.sql
```

This migration:
- Adds `snapshot_hash`, `schema_version`, `saved_at` columns to `tos_saves`
- Creates `tos_sync_events` table (append-only sync audit log)
- Creates projection tables: `tos_save_summary`, `tos_inventory`, `tos_quests`
- Installs a dispatcher trigger on `tos_saves` that will populate projections on each save

All statements are idempotent (safe to re-run). Projection functions start as no-op stubs; downstream beads replace them with real logic.

**New tables:**

| Table | Purpose | Rows per user |
|-------|---------|---------------|
| `tos_sync_events` | Audit log of sync operations | Many (append-only) |
| `tos_save_summary` | Headline stats (name, level, counts) | 1 |
| `tos_inventory` | Equipped + inventory items | N |
| `tos_quests` | Active, completed, discarded quests | N |

All tables have RLS (users can only read their own rows). Projection tables are written by server-side trigger functions, not client inserts.
```

- [ ] **Step 2: Verify the doc reads correctly**

Read the modified file and confirm:
- The new section number (5) doesn't conflict with existing sections
- The table references match the DDL in `sql/001-projections-foundation.sql`
- No broken markdown

---

### Task 8: Final verification and cleanup

**Files:**
- All files from previous tasks

- [ ] **Step 1: Run the full test suite**

Run: `cd tests && npx jest --no-cache 2>&1`

Expected: All tests pass, including the new `cloudSyncMetadata.test.js`.

- [ ] **Step 2: Verify the SQL migration is complete and self-contained**

Read `sql/001-projections-foundation.sql` end-to-end and confirm it contains all 4 sections:
1. tos_saves column enhancements
2. tos_sync_events table + RLS
3. Projection tables (tos_save_summary, tos_inventory, tos_quests) + RLS
4. Dispatcher trigger + stub functions

- [ ] **Step 3: Stage files**

```bash
bd update tome-of-secrets-lh7 --status in_progress
git add sql/001-projections-foundation.sql
git add assets/js/services/cloudSync.js
git add tests/cloudSyncMetadata.test.js
git add project-docs/SUPABASE-CLOUD-SAVE.md
bd sync
git add .beads/issues.jsonl
git status
```

Expected: 5 files staged (sql migration, cloudSync.js, test, docs, beads jsonl). No untracked artifacts.
