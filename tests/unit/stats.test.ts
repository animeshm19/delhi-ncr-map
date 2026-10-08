import { describe, expect, it } from "vitest";
import { ecosystemStats, median } from "@/lib/stats";
import type { Area, Org } from "@/lib/types";

const org = (o: Partial<Org>): Org => ({
  slug: o.slug ?? "x",
  name: o.name ?? "X",
  kind: "company",
  sectors: [],
  status: "active",
  municipality: "Gurugram",
  location_precision: "municipality",
  connected_to: [],
  verification: "unverified",
  sources: [],
  updated_at: "2026-10-08",
  ...o,
});
const areas: Area[] = [{ slug: "sector-44", name: "Sector 44", city: "Gurugram", center: [77.07, 28.45], radius_m: 900 }];

describe("ecosystemStats", () => {
  const orgs = [
    org({ slug: "a", sectors: ["fintech", "ai-ml"], founded_year: 2015, hiring: true, area: "sector-44", location_precision: "area", lng: 77, lat: 28 }),
    org({ slug: "b", sectors: ["fintech"], founded_year: 2019, verification: "company_claimed" }),
    org({ slug: "c", sectors: ["edtech"], founded_year: 1990, status: "acquired" }),
    org({ slug: "d", sectors: [], founded_year: null, municipality: "Noida" }),
    org({ slug: "e", kind: "investor" }),
    org({ slug: "f", kind: "coworking" }),
  ];
  const s = ecosystemStats(orgs, areas, 2026);

  it("counts totals", () => {
    expect(s.totals).toEqual({
      companies: 4,
      support: 2,
      hiring: 1,
      pinned: 1,
      claimed: 1,
      foundedKnown: 3,
      medianFounded: 2015,
      acquiredOrClosed: 1,
    });
  });

  it("ranks sectors, counting multi-sector companies in each", () => {
    expect(s.bySector.map((b) => [b.key, b.value])).toEqual([["fintech", 2], ["ai-ml", 1], ["edtech", 1]]);
    expect(s.bySector[0].label).toBe("Fintech");
  });

  it("buckets founding years into a continuous 25-year range, folding older ones into the first bar", () => {
    expect(s.byYear[0]).toMatchObject({ key: "2001", label: "≤2001", value: 1 });
    expect(s.byYear.at(-1)!.key).toBe("2026");
    expect(s.byYear).toHaveLength(26);
    expect(s.byYear.find((b) => b.key === "2015")!.value).toBe(1);
    expect(s.byYear.reduce((n, b) => n + b.value, 0)).toBe(3);
  });

  it("only places companies with a known area, and splits cities and support kinds", () => {
    expect(s.byArea).toEqual([{ key: "sector-44", label: "Sector 44", value: 1 }]);
    expect(s.byCity.map((b) => [b.key, b.value])).toEqual([["Gurugram", 3], ["Noida", 1]]);
    expect(s.support.map((b) => b.key).sort()).toEqual(["coworking", "investor"]);
  });

  it("handles an empty map", () => {
    const e = ecosystemStats([], [], 2026);
    expect(e.totals.companies).toBe(0);
    expect(e.totals.medianFounded).toBeNull();
    expect(e.byYear).toHaveLength(1);
  });

  it("median", () => {
    expect(median([3, 1, 2])).toBe(2);
    expect(median([1, 2, 3, 4])).toBe(3);
    expect(median([])).toBeNull();
  });
});
