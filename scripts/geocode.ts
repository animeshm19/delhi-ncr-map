/**
 * Geocode an address and decide whether it may be pinned.
 *
 *   npm run geocode -- "Plot 119, Sector 44, Gurugram"
 *
 * Edmonton checks City parcel zoning to make sure a pin is never a home. Gurugram has
 * no equivalent open API, so this uses OpenStreetMap instead:
 *   1. Nominatim finds the point (bounded to Gurugram).
 *   2. Overpass looks at the land use and building tags around it.
 *   3. Only commercial / office / retail / industrial land, or an office/commercial
 *      building, earns an exact pin. Anything residential or unknown is downgraded
 *      to the sector (area precision). When in doubt, it counts as a home.
 *
 * Respect the usage policies: 1 request/second, a real User-Agent, and cache results.
 *   https://operations.osmfoundation.org/policies/nominatim/
 */

const UA = `GurugramStartupMap/0.1 (+${process.env.CRAWLER_CONTACT ?? "https://example.com/about"})`;
// Gurugram bounding box: west, north, east, south
const VIEWBOX = "76.85,28.56,77.17,28.33";

const OK_LANDUSE = new Set(["commercial", "retail", "industrial", "office"]);
const OK_BUILDING = new Set(["office", "commercial", "retail", "industrial", "warehouse"]);
const HOME = new Set(["residential", "house", "apartments", "detached", "terrace", "dormitory"]);

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function nominatim(q: string) {
  const url = new URL("https://nominatim.openstreetmap.org/search");
  url.search = new URLSearchParams({
    q, format: "jsonv2", countrycodes: "in", viewbox: VIEWBOX, bounded: "1", limit: "1", addressdetails: "1",
  }).toString();
  const res = await fetch(url, { headers: { "user-agent": UA } });
  if (!res.ok) throw new Error(`Nominatim ${res.status}`);
  const [hit] = (await res.json()) as any[];
  return hit ? { lat: Number(hit.lat), lng: Number(hit.lon), display: hit.display_name as string, addr: hit.address } : null;
}

async function landUseAt(lat: number, lng: number) {
  const query = `[out:json][timeout:20];
    is_in(${lat},${lng})->.a;
    (way(pivot.a)[landuse]; relation(pivot.a)[landuse]; way(pivot.a)[building];);
    out tags;
    way(around:25,${lat},${lng})[building];
    out tags;`;
  const res = await fetch("https://overpass-api.de/api/interpreter", {
    method: "POST",
    headers: { "user-agent": UA, "content-type": "application/x-www-form-urlencoded" },
    body: "data=" + encodeURIComponent(query),
  });
  if (!res.ok) throw new Error(`Overpass ${res.status}`);
  const d = (await res.json()) as { elements: { tags?: Record<string, string> }[] };
  const landuse = d.elements.map((e) => e.tags?.landuse).filter(Boolean) as string[];
  const buildings = d.elements.map((e) => e.tags?.building).filter(Boolean) as string[];
  return { landuse, buildings };
}

export function decide(landuse: string[], buildings: string[]) {
  if (landuse.some((l) => HOME.has(l)) || buildings.some((b) => HOME.has(b))) return "area" as const;
  if (landuse.some((l) => OK_LANDUSE.has(l)) || buildings.some((b) => OK_BUILDING.has(b))) return "exact" as const;
  return "area" as const; // unknown → treat as a possible home
}

async function main() {
  const q = process.argv.slice(2).join(" ");
  if (!q) {
    console.error('Usage: npm run geocode -- "address, Gurugram"');
    process.exit(1);
  }
  const hit = await nominatim(q);
  if (!hit) {
    console.log(JSON.stringify({ query: q, result: null, precision: "municipality" }, null, 2));
    return;
  }
  await sleep(1100);
  const { landuse, buildings } = await landUseAt(hit.lat, hit.lng);
  const precision = decide(landuse, buildings);
  console.log(
    JSON.stringify(
      {
        query: q,
        matched: hit.display,
        lat: hit.lat,
        lng: hit.lng,
        osm_landuse: landuse,
        osm_building: buildings,
        precision,
        suburb: hit.addr?.suburb ?? hit.addr?.neighbourhood ?? null,
        note:
          precision === "exact"
            ? "Non-residential per OSM: OK to pin the address."
            : "Residential or unknown land use: pin the sector centroid only, never the address.",
      },
      null,
      2,
    ),
  );
}

if (import.meta.url === `file://${process.argv[1]}`) main();
