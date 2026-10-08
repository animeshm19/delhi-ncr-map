import { describe, expect, it } from "vitest";
import { csvCell, orgsToCsv, orgsToGeoJson, sourcesToCsv } from "@/lib/export";
import type { Org } from "@/lib/types";

const base: Org = {
  slug: "acme",
  name: "Acme",
  kind: "company",
  sectors: ["fintech"],
  status: "active",
  municipality: "Gurugram",
  area: "sector-44",
  location_precision: "area",
  lng: 77.08,
  lat: 28.46,
  connected_to: [],
  verification: "unverified",
  sources: [{ url: "https://example.com", note: "a, \"quoted\" note", fields: ["listing"], retrieved: "2026-10-08" }],
  updated_at: "2026-10-08",
};

describe("csvCell", () => {
  it.each(["=HYPERLINK(\"http://evil\")", "+1+1", "-2+3", "@SUM(A1)", "\tcmd", "\rcmd"])(
    "neutralises spreadsheet formula %j",
    (v) => expect(csvCell(v).replace(/^"/, "")).toMatch(/^'/),
  );
  it("leaves numbers, including negative ones, alone", () => {
    expect(csvCell(-12.5)).toBe("-12.5");
    expect(csvCell("-12.5")).toBe("-12.5");
    expect(csvCell(2015)).toBe("2015");
  });
  it("quotes commas, quotes and newlines", () => {
    expect(csvCell('a,"b"')).toBe('"a,""b"""');
    expect(csvCell("line1\nline2")).toBe('"line1\nline2"');
  });
});

describe("exports", () => {
  it("never publishes a street address for area-precision orgs", () => {
    const csv = orgsToCsv([{ ...base, address: "Flat 4, Somewhere" }]);
    expect(csv).not.toContain("Flat 4");
  });
  it("exports the sector centroid, not the spread-out display point", () => {
    const fc = orgsToGeoJson([{ ...base, lng: 1, lat: 2 }]) as { features: { geometry: { coordinates: number[] } }[] };
    expect(fc.features[0].geometry.coordinates).toEqual([77.0715, 28.4535]);
  });
  it("leaves organisations without a pin out of the GeoJSON", () => {
    const fc = orgsToGeoJson([{ ...base, location_precision: "municipality", area: null, lng: null, lat: null }]) as {
      features: unknown[];
    };
    expect(fc.features).toHaveLength(0);
  });
  it("escapes a malicious organisation name in the CSV", () => {
    const csv = orgsToCsv([{ ...base, name: "=cmd|' /C calc'!A0" }]);
    expect(csv.split("\n")[1]).toContain("'=cmd");
  });
  it("writes one sources row per source with escaped notes", () => {
    const csv = sourcesToCsv([base]);
    expect(csv.trim().split("\n")).toHaveLength(2);
    expect(csv).toContain('"a, ""quoted"" note"');
  });
});
