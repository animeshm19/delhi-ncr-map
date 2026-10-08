import { describe, expect, it } from "vitest";
import { METRO, formatDistance, getStation, metroGeoJSON, nearestStation, stationsByDistance, walkMinutes } from "@/lib/metro";

describe("metro data", () => {
  it("every station is sourced, inside Delhi NCR, and on a known line", () => {
    const lineSlugs = new Set(METRO.lines.map((l) => l.slug));
    for (const s of METRO.stations) {
      expect(s.id).toMatch(/^[a-z0-9-]+$/);
      expect(s.source.url).toMatch(/^https:\/\/en\.wikipedia\.org\/wiki\//);
      expect(s.source.retrieved).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(s.lat).toBeGreaterThan(28.2);
      expect(s.lat).toBeLessThan(28.9);
      expect(s.lng).toBeGreaterThan(76.8);
      expect(s.lng).toBeLessThan(77.7);
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

  it("consecutive stations on a drawn line are a plausible distance apart", () => {
    for (const line of METRO.lines.filter((l) => l.complete)) {
      const pts = line.stations.map((id) => getStation(id)!);
      for (let i = 1; i < pts.length; i++) {
        const [d] = stationsByDistance(pts[i - 1].lng, pts[i - 1].lat, [pts[i]]);
        expect(d.meters, `${pts[i - 1].id} → ${pts[i].id}`).toBeLessThan(3500);
        expect(d.meters).toBeGreaterThan(300);
      }
    }
  });

  it("Sikanderpur is the Yellow Line / Rapid Metro interchange", () => {
    expect(getStation("sikanderpur")!.lines.sort()).toEqual(["rapid", "yellow"]);
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
  it("draws complete lines and every station, but no line for partly sourced ones", () => {
    const g = metroGeoJSON();
    expect(g.lines.features.map((f) => f.properties.line).sort()).toEqual(["rapid", "yellow"]);
    expect(g.stations.features).toHaveLength(METRO.stations.length);
    expect(g.stations.features.find((f) => f.properties.id === "sikanderpur")!.properties.interchange).toBe(true);
  });
});
