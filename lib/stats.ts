import { KINDS, SECTORS } from "./taxonomy";
import type { Area, Org } from "./types";

export type Bar = { key: string; label: string; value: number; color?: string };

/** Everything the stats page shows, computed from the published organisations. Pure, so it's unit-tested. */
export function ecosystemStats(orgs: Org[], areas: Area[], nowYear = new Date().getFullYear()) {
  const companies = orgs.filter((o) => o.kind === "company");
  const count = <K extends string>(keys: K[]) => {
    const m = new Map<K, number>();
    for (const k of keys) m.set(k, (m.get(k) ?? 0) + 1);
    return m;
  };

  const sectorCounts = count(companies.flatMap((o) => o.sectors));
  const bySector: Bar[] = [...sectorCounts]
    .map(([k, v]) => ({ key: k, label: SECTORS[k]?.label ?? k, value: v, color: SECTORS[k]?.color }))
    .sort((a, b) => b.value - a.value || a.label.localeCompare(b.label));

  const years = companies.map((o) => o.founded_year).filter((y): y is number => typeof y === "number" && y > 1900 && y <= nowYear);
  const first = years.length ? Math.max(Math.min(...years), nowYear - 25) : nowYear;
  const yearCounts = count(years.map((y) => String(Math.max(y, first))));
  const byYear: Bar[] = [];
  for (let y = first; y <= nowYear; y++) {
    byYear.push({ key: String(y), label: y === first && years.some((v) => v < first) ? `≤${y}` : String(y), value: yearCounts.get(String(y)) ?? 0 });
  }

  const areaName = new Map(areas.map((a) => [a.slug, a.name]));
  const byArea: Bar[] = [...count(companies.filter((o) => o.area && o.location_precision !== "municipality").map((o) => o.area!))]
    .map(([k, v]) => ({ key: k, label: areaName.get(k) ?? k, value: v }))
    .sort((a, b) => b.value - a.value || a.label.localeCompare(b.label));

  const support: Bar[] = [...count(orgs.filter((o) => o.kind !== "company").map((o) => o.kind))]
    .map(([k, v]) => ({ key: k, label: KINDS[k].plural, value: v, color: KINDS[k].color }))
    .sort((a, b) => b.value - a.value);

  const byCity: Bar[] = [...count(companies.map((o) => o.municipality))]
    .map(([k, v]) => ({ key: k, label: k, value: v }))
    .sort((a, b) => b.value - a.value);

  return {
    totals: {
      companies: companies.length,
      support: orgs.length - companies.length,
      hiring: companies.filter((o) => o.hiring).length,
      pinned: companies.filter((o) => o.lng != null).length,
      claimed: companies.filter((o) => o.verification === "company_claimed" || o.verification === "admin_verified").length,
      foundedKnown: years.length,
      medianFounded: median(years),
      acquiredOrClosed: companies.filter((o) => o.status === "acquired" || o.status === "closed").length,
    },
    bySector,
    byYear,
    byArea,
    byCity,
    support,
  };
}

export function median(xs: number[]) {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : Math.round((s[m - 1] + s[m]) / 2);
}
