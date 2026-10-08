import "server-only";
import { createClient } from "@supabase/supabase-js";
import seed from "@/data/seed.json";
import areasJson from "@/data/areas.json";
import type { Area, Org } from "./types";

export const AREAS = areasJson as Area[];
const areaBySlug = new Map(AREAS.map((a) => [a.slug, a]));

export function getArea(slug?: string | null) {
  return slug ? areaBySlug.get(slug) ?? null : null;
}

/** Fill in pin coordinates for area-precision orgs from the area centroid. */
function withCoordinates(o: Org): Org {
  if (o.location_precision === "municipality") return { ...o, lng: null, lat: null };
  if (o.lng != null && o.lat != null) return o;
  const area = getArea(o.area);
  return area ? { ...o, lng: area.center[0], lat: area.center[1] } : { ...o, lng: null, lat: null };
}

const supabase =
  process.env.SUPABASE_URL && process.env.SUPABASE_ANON_KEY
    ? createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY, {
        auth: { persistSession: false },
      })
    : null;

/**
 * Source of truth: Supabase when configured, otherwise data/seed.json.
 * Pages using this are statically generated and revalidated hourly,
 * the same cadence as the Edmonton map's open-data rebuild.
 */
export async function getOrgs(): Promise<Org[]> {
  let rows: Org[];
  if (supabase) {
    const { data, error } = await supabase
      .from("organizations_public")
      .select("*")
      .order("name");
    if (error) throw new Error(`Supabase: ${error.message}`);
    rows = (data ?? []) as Org[];
  } else {
    rows = seed as Org[];
  }
  return rows
    .map(withCoordinates)
    .sort((a, b) => a.name.localeCompare(b.name, "en", { sensitivity: "base" }));
}

export async function getOrg(slug: string) {
  const orgs = await getOrgs();
  return orgs.find((o) => o.slug === slug) ?? null;
}

export function profilePath(o: Pick<Org, "slug" | "kind">) {
  return o.kind === "company" ? `/c/${o.slug}` : `/orgs/${o.slug}`;
}
