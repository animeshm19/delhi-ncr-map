/**
 * Loads data/areas.json and data/seed.json into Supabase (after running the migration).
 *
 *   SUPABASE_URL=… SUPABASE_SERVICE_ROLE_KEY=… npm run seed:supabase
 */
import { readFile } from "node:fs/promises";
import { createClient } from "@supabase/supabase-js";

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}
const db = createClient(url, key, { auth: { persistSession: false } });
const read = async (p: string) => JSON.parse(await readFile(new URL(p, import.meta.url), "utf8"));

async function must<T>(p: PromiseLike<{ error: any; data?: T }>, what: string) {
  const { error } = await p;
  if (error) throw new Error(`${what}: ${error.message}`);
}

async function main() {
  const areas = await read("../data/areas.json");
  const orgs = await read("../data/seed.json");

  await must(
    db.from("areas").upsert(
      areas.map((a: any) => ({ slug: a.slug, name: a.name, radius_m: a.radius_m, center: `SRID=4326;POINT(${a.center[0]} ${a.center[1]})` })),
    ),
    "areas",
  );

  // Two passes so acquired_by can reference rows that come later.
  const base = orgs.map((o: any) => ({
    slug: o.slug, name: o.name, kind: o.kind, sectors: o.sectors, status: o.status, one_liner: o.one_liner,
    website: o.website, founded_year: o.founded_year, municipality: o.municipality, area: o.area,
    location_precision: o.location_precision,
    address: ["exact", "building"].includes(o.location_precision) ? o.address : null,
    location: ["exact", "building"].includes(o.location_precision) && o.lng != null ? `SRID=4326;POINT(${o.lng} ${o.lat})` : null,
    hiring: o.hiring, job_board_provider: o.job_board?.provider ?? null, job_board_handle: o.job_board?.handle ?? null,
    verification: o.verification, published: true,
  }));
  await must(db.from("organizations").upsert(base), "organizations");
  for (const o of orgs.filter((o: any) => o.acquired_by)) {
    await must(db.from("organizations").update({ acquired_by: o.acquired_by }).eq("slug", o.slug), `acquired_by ${o.slug}`);
  }

  await must(db.from("sources").delete().in("org_slug", orgs.map((o: any) => o.slug)), "clear sources");
  await must(
    db.from("sources").insert(orgs.flatMap((o: any) => o.sources.map((s: any) => ({ org_slug: o.slug, ...s })))),
    "sources",
  );

  const rels = orgs.flatMap((o: any) =>
    o.connected_to.map((to: string) => ({
      from_slug: o.slug, to_slug: to, relation: "partner",
      source_url: o.sources[0]?.url ?? "",
    })),
  );
  if (rels.length) await must(db.from("relationships").upsert(rels, { onConflict: "from_slug,to_slug,relation" }), "relationships");

  console.log(`Seeded ${areas.length} areas, ${orgs.length} organisations.`);
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
