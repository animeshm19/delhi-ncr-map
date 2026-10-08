import type { Area, Org } from "./types";
import areasJson from "@/data/areas.json";

const AREA = new Map((areasJson as Area[]).map((a) => [a.slug, a]));

/** Exports give the honest point: the sector centroid for area pins, not the spread-out display spot. */
function point(o: Org): [number, number] | null {
  if (o.location_precision === "area") {
    const a = o.area ? AREA.get(o.area) : null;
    return a ? a.center : null;
  }
  return o.lng != null && o.lat != null ? [o.lng, o.lat] : null;
}

const SITE = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

export const ATTRIBUTION =
  "Gurugram Startup Map, CC BY 4.0. Map data © OpenStreetMap contributors.";

function coordKind(o: Org) {
  if (o.location_precision === "exact") return "address";
  if (o.location_precision === "building") return "building";
  if (o.location_precision === "area") return "area centroid";
  return "";
}

function profileUrl(o: Org) {
  return `${SITE}${o.kind === "company" ? "/c/" : "/orgs/"}${o.slug}`;
}

/** Descriptions are left out of exports: quoted text isn't ours to license. */
export function orgsToCsv(orgs: Org[]) {
  const cols = [
    "slug", "name", "kind", "sectors", "status", "website", "founded_year",
    "acquired_by", "funding_note", "municipality", "area", "location_precision", "address",
    "longitude", "latitude", "coordinates", "connected_to", "hiring",
    "verification", "profile_url", "updated_at",
  ];
  const rows = orgs.map((o) => [
    o.slug, o.name, o.kind, o.sectors.join(";"), o.status, o.website ?? "",
    o.founded_year ?? "", o.acquired_by ?? "", o.funding_note ?? "", o.municipality, o.area ?? "",
    o.location_precision,
    o.location_precision === "exact" || o.location_precision === "building" ? o.address ?? "" : "",
    point(o)?.[0] ?? "", point(o)?.[1] ?? "", coordKind(o), o.connected_to.join(";"),
    o.hiring == null ? "" : String(o.hiring), o.verification, profileUrl(o), o.updated_at,
  ]);
  return toCsv([cols, ...rows]);
}

export function sourcesToCsv(orgs: Org[]) {
  const rows = orgs.flatMap((o) =>
    o.sources.map((s) => [o.slug, s.url, s.note, s.fields.join(";"), s.retrieved]),
  );
  return toCsv([["slug", "url", "note", "fields", "retrieved"], ...rows]);
}

export function orgsToGeoJson(orgs: Org[]) {
  return {
    type: "FeatureCollection",
    attribution: ATTRIBUTION,
    features: orgs
      .filter((o) => point(o) != null)
      .map((o) => ({
        type: "Feature",
        geometry: { type: "Point", coordinates: point(o) },
        properties: {
          slug: o.slug,
          name: o.name,
          kind: o.kind,
          sectors: o.sectors.join(";"),
          status: o.status,
          location_precision: o.location_precision,
          coordinates: coordKind(o),
          profile_url: profileUrl(o),
        },
      })),
  };
}

function toCsv(rows: (string | number)[][]) {
  return rows
    .map((r) =>
      r
        .map((v) => {
          const s = String(v);
          return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
        })
        .join(","),
    )
    .join("\n") + "\n";
}
