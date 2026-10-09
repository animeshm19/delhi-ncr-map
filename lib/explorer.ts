import "server-only";
import type { ExplorerOrg } from "@/components/MapExplorer";
import { anchorOf, getArea, profilePath } from "@/lib/data";
import { orgLogo } from "@/lib/logos";
import type { Org } from "@/lib/types";

/** Send the client only what the map and list need. */
export function toExplorer(orgs: Org[]): ExplorerOrg[] {
  return orgs.map((o) => ({
    slug: o.slug,
    name: o.name,
    kind: o.kind,
    sectors: o.sectors,
    status: o.status,
    one_liner: o.one_liner ?? null,
    place: [getArea(o.area)?.name, o.municipality].filter(Boolean).join(", "),
    precision: o.location_precision,
    city: o.municipality,
    area: o.area ?? null,
    founded: o.founded_year ?? null,
    lng: o.lng ?? null,
    lat: o.lat ?? null,
    radius_m: o.location_precision === "area" ? getArea(o.area)?.radius_m ?? null : null,
    hiring: o.hiring ?? null,
    href: profilePath(o),
    logo: orgLogo(o),
    score: score(o),
    anchor: anchorOf(o),
  }));
}

/**
 * Which organisation represents a group of pins on the map: ones with a logo first,
 * then the best funded, so a "+5" bubble shows a recognisable face.
 */
function score(o: Org) {
  const m = /^\$([\d.]+)([KMB])$/.exec(o.funding_note ?? "");
  const usd = m ? Number(m[1]) * { K: 1e3, M: 1e6, B: 1e9 }[m[2] as "K" | "M" | "B"] : 0;
  return (orgLogo(o) ? 100 : 0) + Math.min(99, Math.round(Math.log10(usd + 1) * 9));
}
