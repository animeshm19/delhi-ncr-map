import "server-only";
import { anchorOf, getArea, getJobs, getOrgs, profilePath } from "@/lib/data";
import { logoUrl } from "@/lib/logos";
import { lineOf, stationsByDistance, walkMinutes } from "@/lib/metro";
import { KINDS, sectorLabel } from "@/lib/taxonomy";
import type { Org } from "@/lib/types";
import type { PanelOrg } from "@/lib/panel-types";

const PRECISION_NOTE: Record<Org["location_precision"], string> = {
  exact: "Office",
  building: "Shared building",
  area: "Approximate: pinned to the sector, not the street address",
  municipality: "City only, not on the map",
};

/** Everything the map's side panel shows for one organisation, from public data only. */
export async function buildPanel(slug: string): Promise<PanelOrg | null> {
  const [all, jobs] = await Promise.all([getOrgs(), getJobs()]);
  const org = all.find((o) => o.slug === slug);
  if (!org) return null;
  const bySlug = new Map(all.map((o) => [o.slug, o]));
  const area = getArea(org.area);
  const anchor = anchorOf(org);
  const place = (o: Org) => [getArea(o.area)?.name, o.municipality].filter(Boolean).join(", ");
  const summary = (o: Org) => ({
    slug: o.slug,
    name: o.name,
    logo: logoUrl(o.logo_path),
    label: o.kind === "company" ? (o.sectors[0] ? sectorLabel(o.sectors[0]) : "Company") : KINDS[o.kind].label,
    place: place(o) + (o.location_precision === "area" ? " (approx.)" : ""),
    href: profilePath(o),
    pinned: o.lng != null && o.lat != null,
  });

  const nearest = anchor
    ? stationsByDistance(anchor[0], anchor[1])
        .filter((n) => n.meters <= 3000)
        .slice(0, 2)
        .map((n) => ({
          id: n.station.id,
          name: n.station.name,
          lines: n.station.lines.map((l) => ({ name: lineOf(l)?.name ?? l, color: lineOf(l)?.color ?? "#fff" })),
          meters: Math.round(n.meters),
          walk: walkMinutes(n.meters),
        }))
    : [];

  const similar = all
    .filter((o) => o.slug !== org.slug && o.kind === org.kind && o.sectors.some((s) => org.sectors.includes(s)))
    // Same city first, then pinned ones, so "similar" is also "nearby" where possible.
    .sort((a, b) => Number(b.municipality === org.municipality) - Number(a.municipality === org.municipality) || Number(b.lng != null) - Number(a.lng != null))
    .slice(0, 4)
    .map(summary);

  const acquirer = org.acquired_by ? bySlug.get(org.acquired_by) : undefined;
  const roles = jobs.filter((j) => j.org_slug === org.slug).length;

  return {
    slug: org.slug,
    name: org.name,
    kindLabel: KINDS[org.kind].label,
    sectors: org.sectors.map((s) => ({ slug: s, label: sectorLabel(s) })),
    status: org.status,
    acquiredBy: acquirer ? { name: acquirer.name, href: profilePath(acquirer) } : null,
    oneLiner: org.one_liner ?? null,
    website: safeHttpUrl(org.website),
    logo: logoUrl(org.logo_path),
    href: profilePath(org),
    verification: org.verification,
    location: {
      text: org.address ?? (area ? `${area.name}, ${org.municipality}` : org.municipality),
      areaHref: area ? `/area/${area.slug}` : null,
      note: PRECISION_NOTE[org.location_precision],
      precision: org.location_precision,
    },
    nearest,
    founded: org.founded_year ?? null,
    funding: org.funding_note ?? null,
    hiring: org.hiring ?? null,
    openRoles: roles,
    careersUrl: safeHttpUrl(org.careers_url),
    connections: org.connected_to.map((s) => bySlug.get(s)).filter((o): o is Org => Boolean(o)).map(summary),
    similar,
    sources: org.sources
      .map((s) => ({ url: safeHttpUrl(s.url), host: hostOf(s.url), note: s.note, fields: s.fields, retrieved: s.retrieved }))
      .filter((s): s is PanelOrg["sources"][number] => s.url != null),
    updated: org.updated_at?.slice(0, 10) ?? null,
  };
}

/** Only http(s) links reach the page, so a bad row can't become a javascript: link. */
function safeHttpUrl(u?: string | null) {
  if (!u) return null;
  try {
    const url = new URL(u);
    return url.protocol === "https:" || url.protocol === "http:" ? url.toString() : null;
  } catch {
    return null;
  }
}

function hostOf(u: string) {
  try {
    return new URL(u).hostname.replace(/^www\./, "");
  } catch {
    return u;
  }
}
