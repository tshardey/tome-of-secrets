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
