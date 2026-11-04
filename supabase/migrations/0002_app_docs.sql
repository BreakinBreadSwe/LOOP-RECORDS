-- Document store used by the Loop Records web app (public site + back office).
-- The app keeps its working records (products, orders, events, sync deals, rights,
-- artwork overrides, settings) as JSON documents grouped by collection. This keeps the
-- front end simple and lets the Breakin Bread push read everything in one query.

create table if not exists public.app_docs (
  collection text not null,
  id text not null,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  updated_by uuid default auth.uid(),
  primary key (collection, id)
);

create index if not exists app_docs_collection_idx on public.app_docs (collection);

create or replace function public.app_docs_touch() returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;
drop trigger if exists app_docs_touch on public.app_docs;
create trigger app_docs_touch before update on public.app_docs for each row execute function public.app_docs_touch();

alter table public.app_docs enable row level security;

-- Anyone can read artwork overrides (they show on the public site). Everything else is staff only.
drop policy if exists app_docs_public_artwork on public.app_docs;
create policy app_docs_public_artwork on public.app_docs for select using (collection = 'artwork');
drop policy if exists app_docs_staff_all on public.app_docs;
create policy app_docs_staff_all on public.app_docs for all using (public.is_staff()) with check (public.is_staff());

-- Live updates for the back office.
do $$ begin
  alter publication supabase_realtime add table public.app_docs;
exception when duplicate_object then null; when undefined_object then null; end $$;

-- Public bucket for sleeve art uploaded from the back office.
insert into storage.buckets (id, name, public) values ('artwork', 'artwork', true)
  on conflict (id) do nothing;
drop policy if exists artwork_public_read on storage.objects;
create policy artwork_public_read on storage.objects for select using (bucket_id = 'artwork');
drop policy if exists artwork_staff_write on storage.objects;
create policy artwork_staff_write on storage.objects for insert with check (bucket_id = 'artwork' and public.is_staff());
drop policy if exists artwork_staff_delete on storage.objects;
create policy artwork_staff_delete on storage.objects for delete using (bucket_id = 'artwork' and public.is_staff());

-- Breakin Bread is a partner platform; record each push.
alter table public.partner_sync_log add column if not exists partner text default 'breakinbread';
alter table public.partner_sync_log add column if not exists ok boolean;
alter table public.partner_sync_log add column if not exists response jsonb;

-- Let a signed-in user ask whether they are staff (used by the web app).
grant execute on function public.is_staff() to anon, authenticated;
