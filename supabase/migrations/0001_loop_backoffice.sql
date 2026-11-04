-- Loop Records back office schema (loop-records.backoffice/v0), shaped for later partner-platform sync
-- Mirrors the collections used by the Loop Records web app so data moves 1:1 between them.
-- Money is stored in minor units (öre) as integers. Prices include VAT; vat_rate is stored per line.

create extension if not exists "pgcrypto";

create table public.labels (
  id text primary key,                        -- 'loop', 'plumphouse'
  name text not null,
  discogs_id integer,
  city text, country text, founded integer
);

create table public.people (
  key text primary key,                       -- 'd27' (Discogs artist id) or 'n-<slug>'
  discogs_id integer,
  name text not null,
  aliases text[] default '{}',
  email text, stim_ipi text, sami_id text, payout_details_ref text,
  created_at timestamptz default now()
);

create table public.releases (
  id bigint primary key,                      -- Discogs release id
  label_id text references public.labels(id),
  grp text check (grp in ('loop','plump','related')),
  catno text, title text not null, year integer, released text, country text,
  format text, genres text[] default '{}', styles text[] default '{}',
  upc text, artwork_url text, discogs_url text,
  status text default 'catalog' check (status in ('catalog','reissue_planned','live','withdrawn')),
  notes text,
  updated_at timestamptz default now()
);

create table public.release_artists (
  release_id bigint references public.releases(id) on delete cascade,
  person_key text references public.people(key),
  position integer default 0,
  primary key (release_id, person_key)
);

create table public.tracks (
  id uuid primary key default gen_random_uuid(),
  release_id bigint references public.releases(id) on delete cascade,
  position text, title text not null, duration text,
  isrc text, iswc text, stim_work_id text,
  stim_status text default 'unregistered' check (stim_status in ('unregistered','submitted','registered')),
  sami_status text default 'unregistered' check (sami_status in ('unregistered','submitted','registered'))
);

create table public.credits (
  id uuid primary key default gen_random_uuid(),
  release_id bigint references public.releases(id) on delete cascade,
  track_id uuid references public.tracks(id) on delete cascade,  -- null = release-level credit
  person_key text references public.people(key),
  role text not null
);

-- Revenue splits per release. Shares must add up to 100 per release and kind.
create table public.splits (
  id uuid primary key default gen_random_uuid(),
  release_id bigint references public.releases(id) on delete cascade,
  kind text default 'all' check (kind in ('all','sales','sync')),
  party_key text references public.people(key),  -- null when party is the label or another company
  party_name text not null,
  role text,                                   -- artist, producer, remixer, label, publisher
  share numeric(6,3) not null check (share >= 0 and share <= 100)
);

create table public.products (
  id uuid primary key default gen_random_uuid(),
  sku text unique not null,
  type text not null check (type in ('digital_release','digital_track','vinyl','cd','cassette','merch','ticket','bundle')),
  release_id bigint references public.releases(id),
  event_id uuid,
  title text not null, variant text,
  price_minor integer,                         -- incl. VAT
  currency text default 'SEK',
  vat_rate numeric(5,2) default 25,
  stock integer,                               -- null = unlimited (digital)
  weight_g integer,
  status text default 'draft' check (status in ('draft','live','sold_out','archived')),
  partner_sync boolean default true,
  created_at timestamptz default now(), updated_at timestamptz default now()
);

create table public.customers (
  id uuid primary key default gen_random_uuid(),
  name text, email text, country text, address text,
  marketing_ok boolean default false,
  created_at timestamptz default now()
);

create table public.orders (
  id uuid primary key default gen_random_uuid(),
  number text unique not null,                 -- LR-2026-0001
  customer_id uuid references public.customers(id),
  channel text default 'loop' check (channel in ('loop','breakinbread','event_door','mail','discogs','bandcamp','other')),
  status text default 'pending' check (status in ('pending','paid','packed','shipped','delivered','refunded','cancelled')),
  shipping_minor integer default 0,
  total_minor integer not null,
  vat_minor integer not null,
  currency text default 'SEK',
  tracking text, note text,
  created_at timestamptz default now(), paid_at timestamptz
);

create table public.order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid references public.orders(id) on delete cascade,
  product_id uuid references public.products(id),
  release_id bigint references public.releases(id),
  title text, qty integer not null default 1,
  unit_minor integer not null, vat_rate numeric(5,2) not null,
  ticket_codes text[] default '{}',
  checked_in text[] default '{}'
);

create table public.events (
  id uuid primary key default gen_random_uuid(),
  name text not null, starts_at timestamptz, ends_at timestamptz,
  venue text, city text, country text default 'Sweden',
  capacity integer, lineup text[] default '{}', description text,
  status text default 'draft' check (status in ('draft','on_sale','sold_out','done','cancelled'))
);
alter table public.products add constraint products_event_fk foreign key (event_id) references public.events(id) on delete set null;

create table public.sync_deals (
  id uuid primary key default gen_random_uuid(),
  licensee text not null, contact text, project text,
  media text check (media in ('film','tv','advert','game','online','trailer','other')),
  territory text, term text,
  release_id bigint references public.releases(id),
  track_title text,
  fee_minor integer, currency text default 'SEK',
  status text default 'enquiry' check (status in ('enquiry','quoted','negotiating','licensed','invoiced','paid','declined')),
  due_date date, note text,
  created_at timestamptz default now()
);

create table public.partner_sync_log (
  id uuid primary key default gen_random_uuid(),
  direction text check (direction in ('export','import')),
  counts jsonb, at timestamptz default now(), by_user uuid
);

-- Row level security: public reads only what a storefront needs; everything else is staff only.
alter table public.labels enable row level security;
alter table public.people enable row level security;
alter table public.releases enable row level security;
alter table public.release_artists enable row level security;
alter table public.tracks enable row level security;
alter table public.credits enable row level security;
alter table public.splits enable row level security;
alter table public.products enable row level security;
alter table public.customers enable row level security;
alter table public.orders enable row level security;
alter table public.order_items enable row level security;
alter table public.events enable row level security;
alter table public.sync_deals enable row level security;
alter table public.partner_sync_log enable row level security;

create table public.staff (user_id uuid primary key references auth.users(id), role text default 'admin');
alter table public.staff enable row level security;
create or replace function public.is_staff() returns boolean language sql stable security definer set search_path = public
  as $$ select exists(select 1 from public.staff where user_id = auth.uid()) $$;
create policy staff_self on public.staff for select using (user_id = auth.uid());

do $$
declare t text;
begin
  foreach t in array array['labels','people','releases','release_artists','tracks','credits'] loop
    execute format('create policy %I on public.%I for select using (true)', t||'_public_read', t);
  end loop;
  foreach t in array array['labels','people','releases','release_artists','tracks','credits','splits','products','customers','orders','order_items','events','sync_deals','partner_sync_log'] loop
    execute format('create policy %I on public.%I for all using (public.is_staff()) with check (public.is_staff())', t||'_staff_all', t);
  end loop;
end $$;
create policy products_public_live on public.products for select using (status in ('live','sold_out'));
create policy events_public_live on public.events for select using (status in ('on_sale','sold_out','done'));
