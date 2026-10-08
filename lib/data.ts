import "server-only";
import { cache } from "react";
import { createClient } from "@supabase/supabase-js";
import { readFile } from "node:fs/promises";
import path from "node:path";
import areasJson from "@/data/areas.json";
import type { Area, Job, Org } from "./types";
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
