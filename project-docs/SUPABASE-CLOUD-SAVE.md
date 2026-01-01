# Supabase Cloud Save (Magic Link Email)

This project is **local-first** (IndexedDB + localStorage). Supabase is optional and provides **cross-device sync**.

## 1) Create a Supabase project

- Create a project in Supabase.
- Copy:
  - **Project URL**
  - **Publishable key** (Supabase’s public browser key; formerly “anon”)

Add them to an environment-specific config (recommended):

- **Local dev**: copy `_config.supabase.yml.example` → `_config.supabase.yml` (git-ignored)
- **GitHub Pages**: store them as GitHub Actions secrets (see below)

If you really want to, you *can* put them in `_config.yml`, but that commits your instance details to git.

Keys:

- `supabase_url`
- `supabase_publishable_key` (preferred) or `supabase_anon_key` (legacy)

## 2) Enable Magic Link in Supabase

- In Supabase Dashboard → **Authentication → Providers → Email**:
  - Ensure Email provider is enabled
  - Ensure “Magic Link” is enabled (Supabase Email OTP / Magic Link)

Configure **redirect URLs** in Supabase Auth settings to include your site URLs, e.g.:

- Local dev: `http://localhost:4000/character-sheet.html`
- If you browse locally with a baseurl in the path: `http://localhost:4000/tome-of-secrets/character-sheet.html`
- GitHub pages: `https://<user>.github.io/<repo>/character-sheet.html`

Tip: this code uses the **exact current page URL** as `emailRedirectTo`, so you must allowlist the URL you see in your browser’s address bar.

## 3) Create the save table + RLS

Run this SQL in Supabase (SQL Editor):

```sql
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
```

## 4) Use it

Once configured, you’ll see a **Cloud Save** panel in the sidebar:

- Enter email + **Send magic link**
- **Sync now**
- **Sign out**

Sync stores **one** cloud snapshot per user.

Notes:

- We don’t sync UI-only state like the last active tab; it’s intentionally local to avoid noisy “newer cloud changes” prompts when multiple windows are open.
- Auto-sync may **pull** newer cloud data only when the local device has no unsynced changes (safe fast-forward). In that case the page reloads to apply the update.

## GitHub Pages (GitHub Actions) production setup

This repo builds via `.github/workflows/jekyll.yml`. Configure these **repository secrets**:

- `SUPABASE_URL` = your Supabase project URL (e.g. `https://<ref>.supabase.co`)
- `SUPABASE_PUBLISHABLE_KEY` = your Supabase publishable key (`sb_publishable_...`)

The workflow writes a temporary `_config.supabase.yml` during the build and runs:

- `bundle exec jekyll build --config _config.yml,_config.supabase.yml`
