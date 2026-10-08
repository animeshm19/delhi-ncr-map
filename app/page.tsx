import MapExplorer, { type ExplorerOrg } from "@/components/MapExplorer";
import { AREAS, getArea, getOrgs, profilePath } from "@/lib/data";

export const revalidate = 3600;

export default async function Home() {
  const orgs = await getOrgs();

  // Send the client only what the map and list need.
  const slim: ExplorerOrg[] = orgs.map((o) => ({
    slug: o.slug,
    name: o.name,
    kind: o.kind,
    sectors: o.sectors,
    status: o.status,
    one_liner: o.one_liner ?? null,
    place: [getArea(o.area)?.name, o.municipality].filter(Boolean).join(", "),
    precision: o.location_precision,
    area: o.area ?? null,
    founded: o.founded_year ?? null,
    lng: o.lng ?? null,
    lat: o.lat ?? null,
    radius_m: o.location_precision === "area" ? getArea(o.area)?.radius_m ?? null : null,
    hiring: o.hiring ?? null,
    href: profilePath(o),
  }));

  return (
    <main id="main">
      <MapExplorer orgs={slim} areas={AREAS} />
    </main>
  );
}
