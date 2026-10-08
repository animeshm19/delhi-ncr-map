import "server-only";
import { cache } from "react";
import { createClient } from "@supabase/supabase-js";
import { readFile } from "node:fs/promises";
import path from "node:path";
import areasJson from "@/data/areas.json";
import type { Area, EventItem, Job, Org } from "./types";
import { spreadAreaPins } from "./geo";

export const AREAS = areasJson as Area[];
const areaBySlug = new Map(AREAS.map((a) => [a.slug, a]));

export function getArea(slug?: string | null) {
  return slug ? areaBySlug.get(slug) ?? null : null;
}

export const supabase =
  process.env.SUPABASE_URL && process.env.SUPABASE_ANON_KEY
    ? createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY, {
        auth: { persistSession: false },
      })
    : null;

export const dataSource = supabase ? "supabase" : "seed";

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
  return spreadAreaPins(rows, getArea).sort((a, b) => a.name.localeCompare(b.name, "en", { sensitivity: "base" }));
});

export async function getOrg(slug: string) {
  const orgs = await getOrgs();
  return orgs.find((o) => o.slug === slug) ?? null;
}

/** Where to measure distances from: the office for exact/building pins, the sector centre for approximate ones. */
export function anchorOf(o: Pick<Org, "location_precision" | "lng" | "lat" | "area">): [number, number] | null {
  if ((o.location_precision === "exact" || o.location_precision === "building") && o.lng != null && o.lat != null) return [o.lng, o.lat];
  if (o.location_precision === "area") return getArea(o.area)?.center ?? null;
  return null;
}

export function profilePath(o: Pick<Org, "slug" | "kind">) {
  return o.kind === "company" ? `/c/${o.slug}` : `/orgs/${o.slug}`;
}

/**
 * Open roles synced from public job boards (only for published organisations; RLS enforces it).
 * Roles are extra information, so a failure here shows no roles rather than breaking the page.
 */
export const getJobs = cache(async (): Promise<Job[]> => {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from("jobs")
    .select("org_slug, title, team, location, url, posted, first_seen")
    .order("first_seen", { ascending: false })
    .limit(2000);
  if (error) {
    console.error("jobs unavailable:", error.message);
    return [];
  }
  return (data ?? []) as Job[];
});

/**
 * Published events from `fromIso` on (default: started up to 6 hours ago), soonest first.
 * Like roles, events are extra: a failure shows none rather than breaking the page.
 */
export async function getEvents(opts: { fromIso?: string; toIso?: string; limit?: number } = {}): Promise<EventItem[]> {
  if (!supabase) return [];
  let q = supabase
    .from("events")
    .select("id, title, starts_at, ends_at, venue, area, city, url, organizer, description, created_at")
    .gte("starts_at", opts.fromIso ?? new Date(Date.now() - 6 * 3600_000).toISOString())
    .order("starts_at")
    .limit(opts.limit ?? 200);
  if (opts.toIso) q = q.lt("starts_at", opts.toIso);
  const { data, error } = await q;
  if (error) {
    console.error("events unavailable:", error.message);
    return [];
  }
  return (data ?? []) as EventItem[];
}
