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
