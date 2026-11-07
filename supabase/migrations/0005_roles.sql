-- Access levels: customer (default for anyone who signs up), artist (linked to their person in
-- the catalog; may add covers and sound files to their own releases) and admin (label staff).
create table if not exists public.profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  email text,
  role text not null default 'customer' check (role in ('customer','artist','admin')),
  person_key text references public.people(key),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
alter table public.profiles enable row level security;
drop policy if exists profiles_own_read on public.profiles;
create policy profiles_own_read on public.profiles for select using (user_id = auth.uid() or public.is_staff());
drop policy if exists profiles_staff_all on public.profiles;
create policy profiles_staff_all on public.profiles for all using (public.is_staff()) with check (public.is_staff());

-- Everyone who has signed in so far gets a profile.
insert into public.profiles (user_id, email, role)
  select u.id, u.email, case when exists (select 1 from public.staff s where s.user_id = u.id) then 'admin' else 'customer' end
  from auth.users u on conflict (user_id) do nothing;

-- New sign-ups get a profile: admin if invited, otherwise customer.
create or replace function public.profile_for_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (user_id, email, role)
  values (new.id, new.email,
          case when exists (select 1 from public.staff_invites i where lower(i.email) = lower(new.email)) then 'admin' else 'customer' end)
  on conflict (user_id) do update set email = excluded.email;
  return new;
end $$;
drop trigger if exists on_auth_user_profile on auth.users;
create trigger on_auth_user_profile after insert or update of email on auth.users
  for each row execute function public.profile_for_new_user();

-- The staff list follows the admin role.
create or replace function public.sync_staff_from_profile() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.role = 'admin' then insert into public.staff (user_id) values (new.user_id) on conflict do nothing;
  else delete from public.staff where user_id = new.user_id; end if;
  new.updated_at = now();
  return new;
end $$;
drop trigger if exists profiles_sync_staff on public.profiles;
create trigger profiles_sync_staff before insert or update of role on public.profiles
  for each row execute function public.sync_staff_from_profile();

-- Who am I, and which releases are mine?
create or replace function public.my_role() returns text language sql stable security definer set search_path = public as $$
  select case when auth.uid() is null then 'visitor'
              else coalesce((select role from public.profiles where user_id = auth.uid()), 'customer') end $$;
create or replace function public.my_person_key() returns text language sql stable security definer set search_path = public as $$
  select person_key from public.profiles where user_id = auth.uid() and role = 'artist' $$;
create or replace function public.my_release_ids() returns setof bigint language sql stable security definer set search_path = public as $$
  select release_id from public.release_artists where person_key = public.my_person_key()
  union select release_id from public.credits where person_key = public.my_person_key() $$;
create or replace function public.can_edit_release(rid text) returns boolean language sql stable security definer set search_path = public as $$
  select public.is_staff() or (rid ~ '^[0-9]+$' and rid::bigint in (select public.my_release_ids())) $$;
grant execute on function public.my_role(), public.my_person_key(), public.my_release_ids(), public.can_edit_release(text) to anon, authenticated;

-- Artists may add, change and remove covers and sound files on their own releases.
drop policy if exists app_docs_artist_write on public.app_docs;
create policy app_docs_artist_write on public.app_docs for all
  using (collection in ('audio','artwork') and public.can_edit_release(split_part(id, '_', 1)))
  with check (collection in ('audio','artwork') and public.can_edit_release(split_part(id, '_', 1)));

drop policy if exists audio_artist_write on storage.objects;
create policy audio_artist_write on storage.objects for insert with check (bucket_id = 'audio' and public.can_edit_release(split_part(name, '/', 1)));
drop policy if exists audio_artist_delete on storage.objects;
create policy audio_artist_delete on storage.objects for delete using (bucket_id = 'audio' and public.can_edit_release(split_part(name, '/', 1)));
drop policy if exists artwork_artist_write on storage.objects;
create policy artwork_artist_write on storage.objects for insert with check (bucket_id = 'artwork' and public.my_role() = 'artist');
drop policy if exists artwork_artist_delete on storage.objects;
create policy artwork_artist_delete on storage.objects for delete using (bucket_id = 'artwork' and owner = auth.uid());

-- Admins list every account with its sign-in details.
create or replace function public.list_accounts()
returns table (user_id uuid, email text, role text, person_key text, created_at timestamptz, last_sign_in_at timestamptz)
language sql stable security definer set search_path = public as $$
  select p.user_id, p.email, p.role, p.person_key, u.created_at, u.last_sign_in_at
  from public.profiles p join auth.users u on u.id = p.user_id
  where public.is_staff() order by u.created_at $$;
grant execute on function public.list_accounts() to authenticated;
