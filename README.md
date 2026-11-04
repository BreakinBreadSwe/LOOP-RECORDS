# Loop Records

Every release, every credit, every video from Loop Records, Stockholm 1993 to 1998 —
plus the label's back office, and one button that sends all of it to **Breakin Bread**.

| Part | Where | What it does |
| --- | --- | --- |
| Public site | `src/app.template.html` → `public/index.html` | Catalog of 62 releases, 156 people, credits, tracklists, sleeves, YouTube videos. Search, artist pages, light/dark theme. Works with no backend. |
| Back office | `src/admin.js` (built into the same page) | For signed-in staff: products, orders, events and tickets, sync licensing, rights and splits, royalties, export, **Breakin Bread**. |
| Runtime | `src/runtime.js` | Connects the page to Supabase: staff sign-in (email link), live document store, artwork uploads, file downloads. |
| API | `api/` (Vercel functions) | `GET /api/config` public Supabase settings. `POST /api/breakin-bread/push` builds and sends the Breakin Bread bundle. |
| Bundle | `lib/bundle.js` | Turns catalog + back-office records into Breakin Bread's shape (labels, artists, releases, works, videos, events, commerce) with stable ids. |
| Database | `supabase/` | `0001` relational label schema, `0002` app document store + artwork bucket + sync log. `seed.sql` loads the full catalog. |
| Catalog data | `data/catalog.json`, `public/art/` | From the Discogs API (label 179847), retrieved 3 Nov 2026, with sleeve scans. |

## Send everything to Breakin Bread

Back office → **Breakin Bread** → **Send everything to Breakin Bread**.

1. The browser calls `POST /api/breakin-bread/push` with the staff member's Supabase token.
2. The server checks the user is in `public.staff`, reads `data/catalog.json` and every row of
   `app_docs`, and builds the bundle (`loop-records.breakinbread/v1`): label profile, 156 artists,
   62 releases, 338 tracks (as works), all release and track credits, 237 videos, artwork, events
   with ticket tiers, products, sync deals, rights splits, ISRCs and orders.
3. It posts the bundle to Breakin Bread's `POST /api/admin/label-import` with a shared secret.
   Breakin Bread upserts by stable id (`loop-…`), so sending again updates, never duplicates.
4. The result is shown on the page and logged in `partner_sync_log`.

**Check first, don't send** builds the bundle and shows the counts without sending.
Customer names, emails and addresses, and licensee contacts, stay at Loop — orders go over with
country, items and totals only.

The receiving end lives in `BreakinBreadSwe/bb-native`: `src/app/api/admin/label-import/route.ts`
and `src/lib/label-import.ts`.

## Set up

1. **Supabase**: create a project, then run `supabase/migrations/0001_loop_backoffice.sql`,
   `supabase/migrations/0002_app_docs.sql` and `supabase/seed.sql` in the SQL editor
   (or `supabase db push`). Under Authentication → URL configuration, add the site URL.
2. **First staff member**: sign in once on the site with **Staff sign in**, then in SQL:
   `insert into public.staff (user_id) select id from auth.users where email = 'you@example.com';`
3. **Vercel**: import this repo. No framework preset; `vercel.json` sets the build. Add the
   environment variables from `.env.example`.
4. **Breakin Bread**: on the bb-native Vercel project set `LOOP_IMPORT_SECRET` to a long random
   value (`openssl rand -hex 32`). Put the same value in `BREAKINBREAD_IMPORT_SECRET` here and set
   `BREAKINBREAD_IMPORT_URL=https://www.breakinbread.com/api/admin/label-import`.

Until step 4 is done the button answers "Breakin Bread isn't connected yet", and the dry run still works.

## Develop

```
npm install
npm test            # bundle tests
npm run build       # builds public/index.html, public/runtime.js, public/catalog.json
npx vercel dev      # site + API locally (needs .env)
```

Open `public/index.html` straight from disk for the read-only catalog without any backend.
