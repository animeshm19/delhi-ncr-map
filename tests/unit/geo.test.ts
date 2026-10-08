import { describe, expect, it } from "vitest";
import { circlePolygon, haversineMeters, spreadAreaPins } from "@/lib/geo";
import type { Area, Org } from "@/lib/types";

const area: Area = { slug: "s44", name: "Sector 44", city: "Gurugram", center: [77.0715, 28.4535], radius_m: 800 };
const getArea = (s?: string | null) => (s === "s44" ? area : null);
const org = (slug: string, extra: Partial<Org> = {}): Org => ({
  slug,
  name: slug,
  kind: "company",
  sectors: [],
  status: "active",
  municipality: "Gurugram",
  area: "s44",
  location_precision: "area",
  connected_to: [],
  verification: "unverified",
  sources: [],
  updated_at: "2026-10-08",
  ...extra,
});

describe("haversineMeters", () => {
  it("is zero for the same point and ~111 km per degree of latitude", () => {
    expect(haversineMeters([77, 28], [77, 28])).toBe(0);
    expect(haversineMeters([77, 28], [77, 29])).toBeGreaterThan(110_000);
    expect(haversineMeters([77, 28], [77, 29])).toBeLessThan(112_000);
  });
});

describe("spreadAreaPins", () => {
  const orgs = Array.from({ length: 12 }, (_, i) => org(`o${i}`));
  const out = spreadAreaPins(orgs, getArea);
  it("gives every organisation in a sector its own spot", () => {
    expect(new Set(out.map((o) => `${o.lng},${o.lat}`)).size).toBe(12);
  });
  it("keeps every pin inside the sector circle", () => {
    for (const o of out) expect(haversineMeters([o.lng!, o.lat!], area.center)).toBeLessThan(area.radius_m * 0.6);
  });
  it("is deterministic regardless of input order", () => {
    const again = spreadAreaPins([...orgs].reverse(), getArea);
    const pos = (list: Org[]) => Object.fromEntries(list.map((o) => [o.slug, [o.lng, o.lat]]));
    expect(pos(again)).toEqual(pos(out));
  });
  it("puts a lone organisation at the centre", () => {
    expect(spreadAreaPins([org("solo")], getArea)[0]).toMatchObject({ lng: area.center[0], lat: area.center[1] });
  });
  it("never pins city-only organisations, even if coordinates leak in", () => {
    const r = spreadAreaPins([org("city", { location_precision: "municipality", area: null, lng: 1, lat: 2 })], getArea);
    expect(r[0].lng).toBeNull();
  });
  it("drops the pin when an area is unknown rather than guessing", () => {
    expect(spreadAreaPins([org("lost", { area: "nowhere", lng: 5, lat: 5 })], getArea)[0].lng).toBeNull();
  });
});

describe("circlePolygon", () => {
  it("is closed and the right size", () => {
    const ring = circlePolygon(area.center, 800).coordinates[0];
    expect(ring[0]).toEqual(ring[ring.length - 1]);
    expect(Math.round(haversineMeters(ring[0] as [number, number], area.center))).toBeGreaterThan(790);
  });
});
