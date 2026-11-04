-- Baseline for table created before CLI adoption.
-- Remote already has it: run `supabase migration repair --status applied 20260407000000` before the next `db push`.

create table if not exists public.tos_saves (
  user_id uuid primary key references auth.users(id) on delete cascade,
  data jsonb not null,
  updated_at timestamptz not null default now()
);

create or replace function public.tos_set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists tos_saves_set_updated_at on public.tos_saves;
create trigger tos_saves_set_updated_at
before update on public.tos_saves
for each row execute function public.tos_set_updated_at();

alter table public.tos_saves enable row level security;

drop policy if exists "tos_saves_select_own" on public.tos_saves;
create policy "tos_saves_select_own"
on public.tos_saves
for select
using (auth.uid() = user_id);

drop policy if exists "tos_saves_insert_own" on public.tos_saves;
create policy "tos_saves_insert_own"
on public.tos_saves
for insert
with check (auth.uid() = user_id);

drop policy if exists "tos_saves_update_own" on public.tos_saves;
create policy "tos_saves_update_own"
on public.tos_saves
for update
using (auth.uid() = user_id)
with check (auth.uid() = user_id);
