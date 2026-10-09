import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { METRO, formatDistance, getStation, metroGeoJSON, nearestStation, stationsByDistance, walkMinutes } from "@/lib/metro";

const tracks = JSON.parse(readFileSync("public/metro-tracks.json", "utf8")) as GeoJSON.FeatureCollection<GeoJSON.MultiLineString, { line: string; color: string }>;

describe("metro data", () => {
  it("covers every line in the region", () => {
    expect(METRO.lines.map((l) => l.slug)).toEqual([
      "red", "yellow", "blue", "green", "violet", "pink", "magenta", "grey", "airport", "rapid", "aqua", "namo-bharat", "meerut",
    ]);
    expect(METRO.stations.length).toBeGreaterThan(280);
    for (const l of METRO.lines) {
      expect(l.complete, l.slug).toBe(true);
      expect(l.source.length, l.slug).toBeGreaterThan(0);
      for (const url of l.source) expect(url).toMatch(/^https:\/\/www\.openstreetmap\.org\/relation\/\d+$/);
      expect(l.color).toMatch(/^#[0-9a-f]{6}$/i);
    }
  });

  it("every station is sourced, inside Delhi NCR, and on a known line", () => {
    const lineSlugs = new Set(METRO.lines.map((l) => l.slug));
    for (const s of METRO.stations) {
      expect(s.id).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
      expect(s.name.trim().length).toBeGreaterThan(0);
      expect(s.source.url, s.id).toMatch(/^https:\/\/www\.openstreetmap\.org\/(node|way)\/\d+$/);
      expect(s.source.retrieved).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      // Delhi NCR, from Bahadurgarh and Gurugram to Greater Noida and Meerut.
      expect(s.lat, s.id).toBeGreaterThan(28.2);
      expect(s.lat, s.id).toBeLessThan(29.15);
      expect(s.lng, s.id).toBeGreaterThan(76.8);
      expect(s.lng, s.id).toBeLessThan(77.8);
      expect(s.lines.length, s.id).toBeGreaterThan(0);
      for (const l of s.lines) expect(lineSlugs.has(l)).toBe(true);
    }
    expect(new Set(METRO.stations.map((s) => s.id)).size).toBe(METRO.stations.length);
  });

  it("lines only reference stations that exist and serve them", () => {
    for (const line of METRO.lines) {
      for (const id of line.stations) {
        const s = getStation(id);
        expect(s, `${line.slug}: ${id}`).not.toBeNull();
        expect(s!.lines).toContain(line.slug);
      }
    }
  });

  it("consecutive stations on each route are a plausible distance apart", () => {
    for (const line of METRO.lines) {
      // Regional rail and the airport line have long gaps between stops.
      const max = line.slug === "namo-bharat" ? 10_000 : line.slug === "airport" ? 7_000 : 4_000;
      for (const branch of line.branches) {
        expect(branch.length, line.slug).toBeGreaterThan(1);
        const pts = branch.map((id) => getStation(id)!);
        for (let i = 1; i < pts.length; i++) {
          const [d] = stationsByDistance(pts[i - 1].lng, pts[i - 1].lat, [pts[i]]);
          expect(d.meters, `${pts[i - 1].id} → ${pts[i].id}`).toBeLessThan(max);
          expect(d.meters, `${pts[i - 1].id} → ${pts[i].id}`).toBeGreaterThan(300);
        }
      }
      expect(new Set(line.branches.flat())).toEqual(new Set(line.stations));
    }
  });

  it("knows the big interchanges", () => {
    expect(getStation("sikanderpur")!.lines.sort()).toEqual(["rapid", "yellow"]);
    expect(getStation("rajiv-chowk")!.lines.sort()).toEqual(["blue", "yellow"]);
    expect(getStation("kashmere-gate")!.lines.sort()).toEqual(["red", "violet", "yellow"]);
    expect(getStation("botanical-garden")!.lines.sort()).toEqual(["blue", "magenta"]);
    expect(getStation("anand-vihar")!.lines.sort()).toEqual(["blue", "namo-bharat", "pink"]);
  });

  it("has a real track shape for every line, and every station sits on it", () => {
    const toXY = ([lng, lat]: number[]) => [lng * 97_800, lat * 111_200];
    const segDist = (p: number[], a: number[], b: number[]) => {
      const [px, py] = toXY(p), [ax, ay] = toXY(a), [bx, by] = toXY(b);
      const dx = bx - ax, dy = by - ay, l = dx * dx + dy * dy;
      const u = l ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / l)) : 0;
      return Math.hypot(px - ax - u * dx, py - ay - u * dy);
    };
    for (const line of METRO.lines) {
      const f = tracks.features.find((x) => x.properties.line === line.slug);
      expect(f, line.slug).toBeDefined();
      expect(f!.properties.color).toBe(line.color);
      const polys = f!.geometry.coordinates;
      for (const id of line.stations) {
        const s = getStation(id)!;
        let best = Infinity;
        for (const poly of polys) for (let i = 1; i < poly.length; i++) best = Math.min(best, segDist([s.lng, s.lat], poly[i - 1], poly[i]));
        expect(best, `${line.slug}: ${id}`).toBeLessThan(300);
      }
    }
  });
});

describe("distances", () => {
  it("finds the nearest station", () => {
    // A point in DLF Cyber City.
    const n = nearestStation(77.0885, 28.4955)!;
    expect(n.station.id).toBe("cyber-city");
    expect(n.meters).toBeLessThan(400);
  });

  it("formats distances and walking estimates", () => {
    expect(formatDistance(12)).toBe("50 m");
    expect(formatDistance(640)).toBe("650 m");
    expect(formatDistance(1449)).toBe("1.4 km");
    expect(walkMinutes(800)).toBe(13);
    expect(walkMinutes(0)).toBe(1);
  });
});

describe("metroGeoJSON", () => {
  it("draws every line (schematic fallback) and every station", () => {
    const g = metroGeoJSON();
    expect(g.lines.features).toHaveLength(METRO.lines.length);
    expect(g.lines.features.find((f) => f.properties.line === "blue")!.geometry.coordinates).toHaveLength(2);
    expect(g.stations.features).toHaveLength(METRO.stations.length);
    expect(g.stations.features.find((f) => f.properties.id === "sikanderpur")!.properties.interchange).toBe(true);
  });
});
