import "server-only";
import { cache } from "react";
import { createClient } from "@supabase/supabase-js";
import { readFile } from "node:fs/promises";
import path from "node:path";
import areasJson from "@/data/areas.json";
import type { Area, Org } from "./types";

export const AREAS = areasJson as Area[];
const areaBySlug = new Map(AREAS.map((a) => [a.slug, a]));

export function getArea(slug?: string | null) {
  return slug ? areaBySlug.get(slug) ?? null : null;
}

const supabase =
  process.env.SUPABASE_URL && process.env.SUPABASE_ANON_KEY
    ? createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY, {
        auth: { persistSession: false },
      })
    : null;

export const dataSource = supabase ? "supabase" : "seed";

/**
 * Organisations pinned only to a sector all share its centroid. Spread them on a
 * sunflower spiral inside the sector's circle so every pin can be clicked, while
 * staying inside the "somewhere in here" halo. Deterministic: same order, same spot.
 */
function spreadAreaPins(orgs: Org[]): Org[] {
  const groups = new Map<string, Org[]>();
  for (const o of orgs) {
    if (o.location_precision === "area" && o.area) {
      const g = groups.get(o.area) ?? [];
      g.push(o);
      groups.set(o.area, g);
    }
  }
  const placed = new Map<string, [number, number]>();
  const golden = Math.PI * (3 - Math.sqrt(5));
  for (const [slug, group] of groups) {
    const area = getArea(slug);
    if (!area) continue;
    const [lng0, lat0] = area.center;
    const maxR = area.radius_m * 0.55;
    group.sort((a, b) => a.slug.localeCompare(b.slug));
    group.forEach((o, i) => {
      if (group.length === 1) return placed.set(o.slug, [lng0, lat0]);
      const r = maxR * Math.sqrt((i + 0.5) / group.length);
      const t = i * golden;
      const dLat = (r * Math.sin(t)) / 111_320;
      const dLng = (r * Math.cos(t)) / (111_320 * Math.cos((lat0 * Math.PI) / 180));
      placed.set(o.slug, [lng0 + dLng, lat0 + dLat]);
    });
  }
  return orgs.map((o) => {
    if (o.location_precision === "municipality") return { ...o, lng: null, lat: null };
    const p = placed.get(o.slug);
    if (p) return { ...o, lng: p[0], lat: p[1] };
    return o;
  });
}

/**
 * Source of truth: Supabase when configured, otherwise data/seed.json (an exact copy).
 * Pages are statically generated and revalidated hourly.
 */
export const getOrgs = cache(async (): Promise<Org[]> => {
  let rows: Org[];
  if (supabase) {
    const { data, error } = await supabase.from("organizations_public").select("*").order("name");
    if (error) throw new Error(`Supabase: ${error.message}`);
    rows = (data ?? []) as Org[];
  } else {
    // Local fallback, read at runtime so deployments don't need to ship the file.
    rows = JSON.parse(await readFile(path.join(process.cwd(), "data", "seed.json"), "utf8")) as Org[];
  }
  return spreadAreaPins(rows).sort((a, b) => a.name.localeCompare(b.name, "en", { sensitivity: "base" }));
});

export async function getOrg(slug: string) {
  const orgs = await getOrgs();
  return orgs.find((o) => o.slug === slug) ?? null;
}

export function profilePath(o: Pick<Org, "slug" | "kind">) {
  return o.kind === "company" ? `/c/${o.slug}` : `/orgs/${o.slug}`;
}
