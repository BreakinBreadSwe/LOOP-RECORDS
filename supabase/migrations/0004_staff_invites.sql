-- Staff invites: an email on this list becomes staff automatically the first time that
-- person signs in (and at once if they have already signed in).
create table if not exists public.staff_invites (
  email text primary key,
  note text,
  invited_at timestamptz default now()
);
alter table public.staff_invites enable row level security;
drop policy if exists staff_invites_staff_all on public.staff_invites;
create policy staff_invites_staff_all on public.staff_invites for all using (public.is_staff()) with check (public.is_staff());

create or replace function public.grant_invited_staff() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if exists (select 1 from public.staff_invites where lower(email) = lower(new.email)) then
    insert into public.staff (user_id) values (new.id) on conflict do nothing;
  end if;
  return new;
end $$;

drop trigger if exists on_auth_user_staff_invite on auth.users;
create trigger on_auth_user_staff_invite after insert or update of email on auth.users
  for each row execute function public.grant_invited_staff();

-- Invited so far
insert into public.staff_invites (email, note) values
  ('gordoncyrus@gmail.com', 'Gordon Cyrus'),
  ('joachim@streetstar.se', 'Joachim Hövel')
on conflict (email) do nothing;

-- Anyone invited who has already signed in
insert into public.staff (user_id)
  select u.id from auth.users u join public.staff_invites i on lower(i.email) = lower(u.email)
  on conflict do nothing;
