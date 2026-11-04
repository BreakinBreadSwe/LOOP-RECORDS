# Loop Records

Catalog app for Loop Records, the Stockholm techno and experimental house label (1993 to 1998), and its sublabel Plumphouse Records. Owner: Gordon Cyrus (luvlab.io).

## Working with Gordon

Gordon is blind and uses a screen reader, mostly on an Android phone. Everything built here must work fully with a screen reader: real headings, labelled controls, live-region announcements for status changes, focus management on navigation, no information conveyed by colour or position alone. Keep replies to him in plain, warm prose. No em dashes, no heavy bullet formatting.

## Rules that stand

* Do not mention Breakin' Bread anywhere in the app or site for now. The data model is shaped so it can sync with the Breakin' Bread platform later (Gordon's 360 music platform, Supabase + Vercel). The sync code exists but is switched off: the back-office section, the "Breakin Bread" order channel and `/api/breakin-bread/push` only appear when the server has `PARTNER_SYNC=on`. Keep it off until Gordon says otherwise.
* Respect every credit: every person on every release and track is searchable and links to their own page.
* Pasted artwork keeps its own shape. Never crop a sticker or insert in display; use `object-fit: contain`.
* Loop's colours, sampled from the 1993 flyer 7-inch: orange `#FF4400`, royal blue `#1F16B2`, cream. Orange is the accent, blue marks focus.
* Mobile first. Gordon tests on his phone.

## What is in this repository

* `src/app.template.html` is the shared page (public catalog plus back office shell). `src/admin.js` is the back office, spliced in at `/*__ADMIN__*/`. `src/runtime.js` connects the page to Supabase (staff sign-in by email link, live document store, artwork uploads, downloads) by implementing the small `window.claude` API the page was written against.
* `npm run build` (`scripts/build.mjs`) writes `public/index.html`, `public/runtime.js`, `public/catalog.json`. Never edit those by hand. `public/art/` holds the pasted cover images.
* `data/catalog.json` is the full catalog: 62 releases, 156 people, tracklists, credits, video links. Shape `loop-records.catalog/v0`.
* `api/config.js` hands the browser the public Supabase URL and anon key. `api/breakin-bread/push.js` is the switched-off partner sync. `lib/bundle.js` builds the sync payload; `lib/server.js` holds server helpers.
* `supabase/migrations/0001_loop_backoffice.sql` is the relational schema (labels, people, releases, tracks, credits, splits, products, customers, orders, events, sync deals, staff, with row level security; money in öre). `0002_app_docs.sql` adds the document store the back office uses today (`app_docs`), the public `artwork` storage bucket and sync-log columns. `supabase/seed.sql` loads the whole catalog, idempotent.
* `tests/` runs with `npm test` (node --test). Run `npm test && npm run build` before committing.
* `data/catalog.json` is built from `data/discogs/` (raw Discogs release data) and `data/youtube.json` (extra videos found by search) by `scripts/build_catalog.py`. It carries no images; `data/artwork.json` maps release ids to the covers Gordon pasted into `public/art/` (31 images, 9 releases), and `lib/catalog.js` merges the two for the website and the partner sync. `data/artwork-db/` and `data/artwork-manifest.csv` record what was pasted in the Claude-hosted version.
* Python build scripts (Python 3, no dependencies): `build_catalog.py` rebuilds `data/catalog.json`, `make_seed.py` regenerates `supabase/seed.sql`, `build_claude_app.py` rebuilds the Claude-hosted version into `dist/` (raw catalog, no pasted covers, since that version keeps its own artwork store), `fetch_discogs_art.py` downloads Discogs covers once Discogs is reachable. The old `build_site.py` is replaced by `npm run build`.

## Where things stand

The Claude-hosted version is live as a private artifact on claude.ai; that is where Gordon pastes covers today and its data lives in that artifact's own store. This repository runs the same page as a normal website on Vercel with Supabase behind it. Deploy needs `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `PUBLIC_SITE_URL` (see `.env.example`). First staff member: sign in once, then `insert into public.staff (user_id) select id from auth.users where email = '...';`.

## Next steps, in order

1. Deploy on Vercel (repo is `BreakinBreadSwe/LOOP-RECORDS`).
2. Create the Supabase project in the Breakin' Bread account, run both migrations and the seed.
3. Decide whether to move to Next.js reading the relational tables, or keep the current static page plus API functions. Copy the remaining covers from the Claude version into Supabase Storage.
4. A real checkout for digital files, vinyl, CD, cassette, merch and tickets.
5. Native apps: Mac first, then iOS, then Android. Then switch on Breakin' Bread sync.

Open items: Wrong Steps Records and Loop Music are listed as sublabels on Discogs but their releases are not in the catalog yet. Six releases in the "related" group are only loosely tied to Loop and may be dropped.
