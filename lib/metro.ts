import metroJson from "@/data/metro.json";
import { haversineMeters } from "./geo";

export type MetroStation = {
  id: string;
  name: string;
  lng: number;
  lat: number;
  lines: string[];
  source: { url: string; retrieved: string };
};
export type MetroLine = {
  slug: string;
  name: string;
  operator: string;
  color: string;
  /** false while some stations' locations aren't sourced yet: show stations, don't draw the line */
  complete: boolean;
  note: string;
  /** Every station on the line, in running order (main line first, then any branch) */
  stations: string[];
  /** Each route in running order: the main line and any branches */
  branches: string[][];
  /** The OpenStreetMap route relations the line is read from */
  source: string[];
};

export const METRO = metroJson as {
  meta: { source: string; license: string; retrieved: string };
  lines: MetroLine[];
  stations: MetroStation[];
};

/** Real track shapes for every line, served as a static file so they stay out of the page's JavaScript. */
export const METRO_TRACKS_URL = "/metro-tracks.json";
const byId = new Map(METRO.stations.map((s) => [s.id, s]));

export function getStation(id: string | null | undefined) {
  return id ? byId.get(id) ?? null : null;
}

export function lineOf(slug: string) {
  return METRO.lines.find((l) => l.slug === slug) ?? null;
}

/** Straight-line distance from a point to every station, nearest first. */
export function stationsByDistance(lng: number, lat: number, stations = METRO.stations) {
  return stations
    .map((s) => ({ station: s, meters: haversineMeters([lng, lat], [s.lng, s.lat]) }))
    .sort((a, b) => a.meters - b.meters);
}

export function nearestStation(lng: number, lat: number) {
  return stationsByDistance(lng, lat)[0] ?? null;
}

/** "650 m" / "1.4 km" */
export function formatDistance(m: number) {
  if (m < 950) return `${Math.max(50, Math.round(m / 50) * 50)} m`;
  return `${(m / 1000).toFixed(1)} km`;
}

/**
 * Rough walking time. Straight-line distance × 1.3 for real streets, at 4.8 km/h.
 * Shown as an estimate, never as a route.
 */
export function walkMinutes(m: number) {
  return Math.max(1, Math.round((m * 1.3) / 80));
}

/**
 * GeoJSON for the map: one Point per station, and a schematic line (station to station) per route.
 * The map draws the real track shapes from METRO_TRACKS_URL; the schematic lines are the fallback.
 */
export function metroGeoJSON() {
  const lines = METRO.lines
    .filter((l) => l.complete)
    .map((l) => ({
      type: "Feature" as const,
      geometry: {
        type: "MultiLineString" as const,
        coordinates: l.branches.map((b) => b.map((id) => [byId.get(id)!.lng, byId.get(id)!.lat])),
      },
      properties: { line: l.slug, name: l.name, color: l.color },
    }));
  const stations = METRO.stations.map((s) => ({
    type: "Feature" as const,
    geometry: { type: "Point" as const, coordinates: [s.lng, s.lat] },
    properties: { id: s.id, name: s.name, color: lineOf(s.lines[0])?.color ?? "#ffffff", interchange: s.lines.length > 1 },
  }));
  return {
    lines: { type: "FeatureCollection" as const, features: lines },
    stations: { type: "FeatureCollection" as const, features: stations },
  };
}
