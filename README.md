# Delhi NCR Map

A public, community-owned map and directory of Delhi NCR's startups and tech companies, and the
organisations that support them. Every fact links to a public source. Modelled on the
[Edmonton Startup Map](https://map.techwednesdays.ca) (Edmonton Tech Wednesdays; code MIT, data CC BY 4.0).

**Live:** https://delhi-ncr-map-pink.vercel.app

| | Today |
|---|---|
| Organisations | 640: 633 companies, 7 support organisations |
| Cities | Gurugram (398 companies), Noida (216), Greater Noida (19); Delhi next |
| On the map | 223, pinned to their sector or business district (never a street address) |
| Logos | Every organisation with a known website (348) gets its logo; the rest show initials |
| Metro | 13 lines, 296 stations, 31 interchanges: all of Delhi Metro, Rapid Metro Gurugram, Noida Aqua Line, Namo Bharat and Meerut Metro, with real track shapes |
| Sources | Every organisation has at least one public listing; about 1,300 source rows in all |

```bash
npm install
npm run dev          # http://localhost:3000, runs from data/seed.json, no database needed
```

---

## What it does

**The map** (`/`)
- MapLibre with OpenFreeMap's dark vector tiles; 2D and 3D (extruded buildings).
- **Logo pins.** Each organisation is its logo on a white tile (or a name tag when there's no logo). Nearby
  pins group into one, shown by the best-known member (has a logo, then most funded) with a **+N** badge;
  clicking a group zooms in.
- **Side panel.** Click a company in the list or on the map: the map flies to its pin (a pulsing ring marks
  it) and a panel slides in with the logo, summary, **Full profile** button, website, location, nearest
  metro stations with walking time, founded, status, funding, hiring, sectors, connections, similar
  companies (they open in the same panel), sources and the edit/claim/removal links. `?c=slug` links open
  it; Esc closes it; on phones it's a sheet under the map.
- **Filters:** search, companies/support, sector, city (Gurugram, Noida, Greater Noida), hiring, and
  **near a metro station** within 500 m / 1 km / 2 km (nearest first, shareable as `?station=…&r=…`).
- **Metro layer** with a **Metro** button on the map to hide or show it (remembered per browser).
- "Search as I move the map", and every filter is a shareable link.

**Pages**
- `/c/{slug}`, `/orgs/{slug}`: profiles with sources, nearest metro, open roles, connections, similar.
- `/directory`, `/sector/{slug}`, `/area/{slug}`: tables with logos.
- `/metro`: companies within walking distance of every station, line by line.
- `/hiring`: open roles read daily from companies' public job boards (Greenhouse, Lever, Ashby).
- `/events` (+ iCal at `/events.ics`), `/this-week`, `/stats`, `/about`, `/data`.
- `/submit`, `/edit|claim|removal/{slug}`: requests go to a review queue; nothing publishes automatically.
- `/account`: magic-link sign-in; approved owners edit their own profile (one-liner, website, hiring, job
  board, logo upload). `/admin`: admins review requests.

**Share as an image** (to promote the map)
- "Share this view" on the map, and a share button on every panel and profile, make an Instagram-ready
  card: a 4:5 post (1080×1350) or a 9:16 story (1080×1920) with the count, the metro line, a wall of real
  company logos and the link (`/card?station=…&r=…&sector=…&city=…` or `/card?c=slug`).
- On phones it opens the share sheet straight to Instagram (or any app); elsewhere it downloads the image.
  A caption with the link and hashtags is ready to copy, plus WhatsApp.

**Open data and reuse**
- `/data/organizations.csv`, `/data/organizations.geojson`, `/data/sources.csv` (CC BY 4.0), `/feed.xml`.
- `/embed`: the map in an iframe for other sites (same filters as links).
- `/badge/{slug}`: an SVG "listed on" badge.
- `/api/mcp`: a read-only MCP server for AI assistants: `search_organizations`, `get_organization`,
  `near_metro_station`, `list_metro_stations`, `upcoming_events`, `open_roles`, `ecosystem_stats`.
- `/api/orgs/{slug}`: the side panel's public JSON. `/logo/{slug}`: an organisation's logo.

## How the data is built

1. **Who.** Public lists only: Inc42 (city and sector lists), Y Combinator (via vcbacked.co), Seedtable,
   StartupBlink, Fliarbi, Clera, Wellfound and the eChai Startup Grid, plus Wikipedia/Wikidata. A company is
   in if a public list places it in a live city. What was left out and why: [`data/EXCLUSIONS.md`](data/EXCLUSIONS.md).
2. **Facts.** Fields are filled only when a source gives them, and each source row says which fields it
   backs (`listing`, `sector`, `founded_year`, `description`, `area`, `website`, `status`). Empty beats invented.
3. **Where.** Pins are at **sector / business-district level only** (`data/areas.json`), placed from a
   company's public office address (GST registration, company-registry filing, its own contact page, or a
   directory that shows it). Sector centres are anchored on cited coordinates. Companies sharing a sector are
   spread inside its dashed circle so each can be clicked. Companies with only a city are listed, not pinned.
4. **Websites and logos.** Websites come from the eChai Startup Grid's company pages, Y Combinator's
   listing and Wikidata, each cited. A logo is an uploaded file if the owner added one, otherwise the icon
   from the company's own website (fetched through Google's public favicon service by `/logo/{slug}`,
   size-checked, cached for a month); otherwise initials.
5. **Metro.** Lines, stations (in running order, with branches) and track shapes come from OpenStreetMap
   route relations via the Overpass API (© OpenStreetMap contributors, ODbL). Each station links to its
   OpenStreetMap entry. Rebuild with `python3 scripts/metro/build.py` (the queries are in the file).
6. **Trust ladder.** Unverified → community checked → claimed (an email on the company's own domain) →
   verified.

`data/seed.json` is an exact copy of the published database. `node scripts/build-seed-sql.mjs` turns it (and
`areas.json`) into `supabase/seed.sql`; a unit test fails if the two drift apart.

## Architecture

| Layer | What |
|---|---|
| App | Next.js 16 (App Router), static pages revalidated hourly, server actions for forms |
| Map | MapLibre GL 6, OpenFreeMap tiles (keyless), logo markers with clustering |
| Database | Supabase Postgres + PostGIS, row-level security everywhere; writes only through `SECURITY DEFINER` functions in a `private` schema; Storage bucket `logos` |
| Auth | Supabase magic links (PKCE) |
| Hosting | Vercel Hobby, Mumbai region (`bom1`); one daily cron (`/api/cron/jobs`, 01:30 UTC) syncs job boards |
| Data fallback | With no database configured, the app reads `data/seed.json` |

### Security

- The browser only ever gets the anon key; RLS hides unpublished organisations, the review queue and
  emails. Requests are validated and rate-limited inside the database (per email and per client).
- Strict Content-Security-Policy, HSTS, no framing except `/embed`; badges and logos are served as
  sandboxed images; the logo route only ever calls one fixed host.
- Claims are flagged only when the email is on the organisation's real domain (look-alikes are caught).
- `supabase/tests/*.test.sql` attack RLS and the request functions as anonymous and signed-in users.

## Running it

```bash
cp .env.example .env.local   # leave Supabase empty to run from data/seed.json
npm run dev
```

| Variable | Where | What |
|---|---|---|
| `NEXT_PUBLIC_SITE_URL` | optional | Canonical URL; on Vercel it's derived from the production domain |
| `SUPABASE_URL`, `SUPABASE_ANON_KEY` | server | Read the database instead of `seed.json` |
| `NEXT_PUBLIC_SUPABASE_URL` | browser | Logo and sign-in URLs |
| `SUPABASE_SERVICE_ROLE_KEY` | scripts only | Seeding; never exposed to the browser |
| `INGEST_TOKEN` | server | Lets the job sync write roles through `ingest_jobs()` |
| `CRON_SECRET` | server | Authorises Vercel Cron's call to `/api/cron/jobs` |
| `CRAWLER_CONTACT` | scripts | Identifies the job-board reader |

### Tests

```bash
npm test                         # unit tests (Vitest): data integrity, metro, logos, security helpers…
PGHOST=/tmp npm run test:db      # database security tests on a throwaway Postgres + PostGIS
npm run test:e2e                 # Playwright on a local stack (Postgres, PostgREST, auth gateway, the app)
npm run verify                   # types + unit tests + build on a clean tree; run before every push
```

CI (`.github/workflows/ci.yml`) runs all of this plus `npm audit` on every push.

### Deploying

Pushing to `main` deploys to Vercel. Database changes are migrations in `supabase/migrations/` (apply them
in order). To publish data changes, regenerate `supabase/seed.sql` and run the new rows in the Supabase SQL
editor; the site picks them up within an hour.

### Cost: ₹0

- **Vercel Hobby**: free, for non-commercial use.
- **Supabase Free**: 500 MB database. A free project pauses after 7 days without activity; the site keeps
  serving cached pages, and one click in the dashboard resumes it.
- OpenFreeMap, OpenStreetMap and Google's favicon service need no keys.

## Repository

```
app/                         pages and routes (map, profiles, directory, metro, hiring, events, data, embed, badge, MCP, logo…)
components/MapExplorer.tsx   the map: logo pins and groups, filters, metro, fly-to
components/OrgPanel.tsx      the side panel
components/OrgLogo.tsx       logo tile with initials fallback, used everywhere
lib/                         data access, panel details, metro, logos, taxonomy, security, exports, MCP
data/seed.json               every organisation with its sources (exact copy of the database)
data/areas.json              sectors and business districts, each anchored on cited coordinates
data/metro.json              metro lines and stations (OpenStreetMap)
public/metro-tracks.json     metro track shapes (OpenStreetMap)
data/EXCLUSIONS.md           who was left out and why
supabase/migrations/         schema, RLS, request/account/job/event functions
supabase/tests/              database security tests
scripts/                     seed SQL builder, metro builder, job sync, DB/e2e harness, verify
tests/unit, tests/e2e        Vitest and Playwright suites
```

## Roadmap

- Delhi as a live city.
- More websites (so more logos) and street-level verification for the `municipality`-only companies.
- Funding rounds with their announcements; a timeline page.
- Program cohorts and investor portfolios as connections (`?via=program` on the map).

## Licence and credits

Code MIT. Data CC BY 4.0. Base map © OpenStreetMap contributors via OpenFreeMap (OpenMapTiles). Metro lines,
stations and tracks © OpenStreetMap contributors, ODbL. Inspired by the Edmonton Startup Map.
