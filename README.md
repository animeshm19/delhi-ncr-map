# Gurugram Startup Map

A public, community-owned map and directory of Gurugram's startups and tech companies and the
organisations that support them. Modelled on the [Edmonton Startup Map](https://map.techwednesdays.ca)
(hosted by Edmonton Tech Wednesdays, code MIT, data CC BY 4.0).

```bash
npm install
npm run dev          # http://localhost:3000 — runs from data/seed.json, no database needed
```

---

## How the Edmonton map is built (reverse-engineered)

Everything below comes from its public pages, page metadata, asset URLs, `/about`, `/data` and `/share`.

| Layer | What they use | Evidence |
|---|---|---|
| Framework | **Next.js (App Router)**, server-rendered + statically generated pages | `next-size-adjust` meta, per-route `opengraph-image` URLs |
| Map | **MapLibre GL** with **OpenFreeMap** vector tiles (OpenMapTiles schema, OSM data); 2D/3D toggle = pitch + extruded buildings | Attribution on `/about`; "2d / 3d" control |
| Database + files | **Supabase** (Postgres; Storage bucket `logos/{slug}/tile.webp`) | Logo URLs on `*.supabase.co/storage/v1/object/public/logos/…` |
| Data model | organizations, relationships, funding rounds, sources (one row per fact) | `/data` downloads: 845 orgs, 688 relationships, 41 rounds, ~8.9k sources |
| Routes | `/c/{slug}` companies, `/orgs/{slug}` support orgs, `/sector/…`, `/area/…`, `/hiring`, `/events`, `/timeline`, `/stats`, `/this-week`, `/support/{type}`, `/submit`, `/edit|claim|removal/{slug}`, `/embed`, `/share`, `/badge/{theme}/{slug}.svg` | Footer + profile links |
| Open data | CSV + GeoJSON rebuilt hourly; RSS / JSON Feed / iCal; sitemap | `/data`, `/llms.txt` |
| AI access | Read-only **remote MCP server** at `/mcp` (Streamable HTTP, rate-limited): `search_organizations`, `get_organization`, `list_connectors`, `get_connections`, `upcoming_events`, `open_roles`, `ecosystem_summary` | `/data` |
| Hiring | Daily read of each company's **public ATS board** (e.g. Lever) | "Read daily from its public job board" on profiles |

**The pipeline (the hard part — the UI is the easy part):**

1. **Discovery** from public lists: accelerator cohorts, fund portfolios, ecosystem directories, local news
   (Taproot), meetup employer lists, association member pages (some read via WordPress `wp-json`).
2. **Extraction** from each org's own site: name, summary, sectors, logo, socials, careers page. Text is only
   kept after matching it word-for-word against the cited page. Empty beats invented.
3. **Geocoding with a privacy gate**: addresses are matched to the City's parcel-address open data, then
   checked against **zoning / assessment** — only non-residential land gets an exact pin. Otherwise the pin is
   the neighbourhood centroid with a faint circle, or the org is listed without a pin.
4. **Provenance**: every field links to its source URL + retrieval date (the `sources` table).
5. **Trust ladder**: unverified → community checked → claimed (email on own domain) → verified.
6. **Corrections**: per-profile suggest-edit / claim / removal forms into a review queue.
7. **Distribution**: hourly open-data rebuild, OG images per profile and per filtered view, embeddable map,
   badges, MCP.

---

## What changes for Gurugram

| Edmonton | Gurugram equivalent |
|---|---|
| City of Edmonton parcel addresses + zoning (Socrata) | No open parcel API. Use **Nominatim** + **OSM land use / building tags via Overpass** (`scripts/geocode.ts`). Treat unknown as a home. |
| Neighbourhoods | HSVP **sectors** and business districts (Cyber City, Udyog Vihar, Golf Course Rd/Ext, Sohna Rd, MG Rd…) — `data/areas.json`. Sector polygons are in OSM. |
| Taproot tech roundups | Inc42, Entrackr, YourStory, ET Prime/ET Tech funding coverage (link, don't copy) |
| Program cohorts / portfolios | Startup Haryana incubator list, DPIIT/Startup India recognised startups (filter Gurugram district), university incubators, accelerator portfolio pages |
| Exchange filings | NSE/BSE filings & MCA registered-office data for listed and large companies |
| Lever/Greenhouse | Same, plus Ashby; many Indian startups use **Keka, Darwinbox, Zoho Recruit, Freshteam** — handle per site, respect robots.txt |
| "Home addresses never pinned" | Even more important: many Indian startups are registered at a founder's flat. |

## Live

- Site: https://gurugram-startup-map.vercel.app (Vercel Hobby, free)
- Database: Supabase project `gurugram-startup-map` (Free plan, Mumbai `ap-south-1`)
- Data today: 137 organisations (130 companies, 7 support), 43 pinned at sector level, 220 sources

### Cost: ₹0

Both accounts are on free plans with no payment method attached, so nothing can be billed:

- **Vercel Hobby** — free, but for **non-commercial use only**. If this becomes a business, Vercel requires Pro.
- **Supabase Free** — 500 MB database, plenty for this. A free project **pauses after 7 days with no
  database activity**; the site keeps serving its last cached pages, and you un-pause it from the Supabase
  dashboard in one click. Hourly page revalidation keeps it active while people visit.

### How the data was built

1. **Who**: Inc42's Gurugram lists (top funded overall, fintech, edtech, healthtech, AI, ecommerce, enterprise
   tech), Seedtable, Wikipedia, funding news. Exclusions and reasons: `research/EXCLUDED.md`.
2. **Where**: the company's Haryana GST registration (principal place of business, via knowyourgst.com),
   its company-registry filing (ZaubaCorp), or its own contact page — `research/addresses.tsv`.
3. **Pins**: sector/business-district level only (`data/areas.json`), never the street address. Sector centres
   are approximate, anchored on metro-station coordinates. Companies in the same sector are spread inside the
   sector circle so each pin is clickable (`lib/data.ts`).
4. `python3 research/build_seed.py` → `data/seed.json`; `python3 research/seed_sql.py` → `supabase/seed.sql`.

To add companies: add a row to `ORGS` in `research/build_seed.py` (and an address row to `addresses.tsv` if
you have one), rebuild, then run the generated SQL in the Supabase SQL editor. The site picks it up within an hour.

### Deploying changes

The Vercel project isn't linked to a Git repo yet. Easiest path: push this folder to GitHub and connect the repo
in the Vercel dashboard (Project → Settings → Git) — every push then deploys. Optional env var
`NEXT_PUBLIC_CONTACT_EMAIL` turns on the edit/claim/removal links on profiles.

## What's in this repo

```
app/
  page.tsx                     map + list (server loads data, client renders)
  c/[slug], orgs/[slug]        profiles with sources, connections, similar, edit/claim/removal links
  about, data                  methodology and open-data pages
  data/organizations.csv|.geojson, data/sources.csv   open-data endpoints (hourly ISR)
  sitemap.ts
components/MapExplorer.tsx     MapLibre + OpenFreeMap dark style, 2D/3D, sector/kind filters,
                               search, "search as I move the map", area halos, ?c=slug deep links
lib/                           types (mirrors Edmonton's published schema), taxonomy, data layer, exports
data/seed.json, areas.json     starter dataset (11 orgs, every fact sourced) and Gurugram areas
supabase/migrations/0001_init.sql   Postgres + PostGIS schema, public view, RLS, review queue
scripts/sync-jobs.ts           Greenhouse / Lever / Ashby public boards → hiring flags + jobs
scripts/geocode.ts             Nominatim + Overpass non-residential check
scripts/seed-supabase.ts       load seed into Supabase
```

Locally the app reads `data/seed.json` (an exact copy of the database) unless `SUPABASE_URL` + `SUPABASE_ANON_KEY` are set, in which case it reads the `organizations_public` view.

### The seed data

Eleven organisations whose Gurugram base is confirmed by a cited source. Only three have a known sector or
district (Policybazaar – Sector 44, MakeMyTrip – DLF Cyber City, Eternal – Golf Course Extension Road), so
only those are pinned, at the **area centroid**, not an address. The rest are listed without a pin, exactly as
Edmonton does for municipality-only entries. **Area centroids in `areas.json` are approximate — check them on
the map before launch.** No job-board handles are filled in yet.

## Going live

1. Create a Supabase project, run `supabase/migrations/0001_init.sql`, then `npm run seed:supabase`.
2. Deploy to Vercel; set `NEXT_PUBLIC_SITE_URL`, `SUPABASE_URL`, `SUPABASE_ANON_KEY`.
3. Schedule `npm run sync:jobs` daily (GitHub Actions or Vercel Cron) with the service-role key.

## Roadmap (features the Edmonton map has that this starter doesn't yet)

- Discovery + extraction crawler with word-for-word quote checking
- Submit / edit / claim / removal **forms** writing to `review_queue` (currently mailto links), with
  domain-email verification for claims
- Logos in Supabase Storage; per-profile and per-view OG images (`opengraph-image.tsx`)
- `/hiring`, `/events` (+ iCal), `/timeline`, `/stats`, `/sector/*`, `/area/*` pages
- Connections layer (`?via=program` to show a cohort/portfolio on the map)
- `/embed` iframe and `/badge/{theme}/{slug}.svg`
- Read-only MCP server at `/mcp`
- Funding rounds (publicly announced only, each with its source)

## Licence

Code MIT. Data CC BY 4.0. Map data © OpenStreetMap contributors, served by OpenFreeMap with OpenMapTiles.
