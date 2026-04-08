-- Fix: projection stubs were declared as RETURNS trigger but called via PERFORM,
-- which fails with "trigger functions can only be called as triggers".
-- Change stubs to plain functions that accept (jsonb) and return void.
-- The dispatcher passes NEW.data to each projection.

-- Drop the old trigger-signature stubs
DROP FUNCTION IF EXISTS public.tos_project_save_summary() CASCADE;
DROP FUNCTION IF EXISTS public.tos_project_inventory() CASCADE;
DROP FUNCTION IF EXISTS public.tos_project_quests() CASCADE;

-- Recreate as plain functions that accept the save row's fields
CREATE OR REPLACE FUNCTION public.tos_project_save_summary(p_user_id uuid, p_data jsonb)
RETURNS void AS $$
BEGIN
  -- Stub: replaced by bead tome-of-secrets-hhc
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.tos_project_inventory(p_user_id uuid, p_data jsonb)
RETURNS void AS $$
BEGIN
  -- Stub: replaced by bead tome-of-secrets-ujb
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.tos_project_quests(p_user_id uuid, p_data jsonb)
RETURNS void AS $$
BEGIN
  -- Stub: replaced by bead tome-of-secrets-fhb
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Recreate the dispatcher as a proper trigger function
CREATE OR REPLACE FUNCTION public.tos_projection_dispatcher()
RETURNS trigger AS $$
BEGIN
  PERFORM public.tos_project_save_summary(NEW.user_id, NEW.data);
  PERFORM public.tos_project_inventory(NEW.user_id, NEW.data);
  PERFORM public.tos_project_quests(NEW.user_id, NEW.data);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Re-wire the trigger (dispatcher signature unchanged, but recreate to be safe)
DROP TRIGGER IF EXISTS tos_saves_project_on_upsert ON public.tos_saves;
CREATE TRIGGER tos_saves_project_on_upsert
  AFTER INSERT OR UPDATE ON public.tos_saves
  FOR EACH ROW
  EXECUTE FUNCTION public.tos_projection_dispatcher();
