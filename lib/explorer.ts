import "server-only";
import type { ExplorerOrg } from "@/components/MapExplorer";
import { anchorOf, getArea, profilePath } from "@/lib/data";
import { logoUrl } from "@/lib/logos";
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
    logo: logoUrl(o.logo_path),
    anchor: anchorOf(o),
  }));
}
