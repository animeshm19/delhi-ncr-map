import type { Org } from "./types";

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
    "acquired_by", "municipality", "area", "location_precision", "address",
    "longitude", "latitude", "coordinates", "connected_to", "hiring",
    "verification", "profile_url", "updated_at",
  ];
  const rows = orgs.map((o) => [
    o.slug, o.name, o.kind, o.sectors.join(";"), o.status, o.website ?? "",
    o.founded_year ?? "", o.acquired_by ?? "", o.municipality, o.area ?? "",
    o.location_precision,
    o.location_precision === "exact" || o.location_precision === "building" ? o.address ?? "" : "",
    o.lng ?? "", o.lat ?? "", coordKind(o), o.connected_to.join(";"),
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
      .filter((o) => o.lng != null && o.lat != null)
      .map((o) => ({
        type: "Feature",
        geometry: { type: "Point", coordinates: [o.lng, o.lat] },
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
