import type { Area, Org } from "./types";

export type LngLat = [number, number];

const EARTH_R = 6_371_000;

/** Great-circle distance in metres. */
export function haversineMeters([lng1, lat1]: LngLat, [lng2, lat2]: LngLat) {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_R * Math.asin(Math.min(1, Math.sqrt(a)));
}

/** Move a point by metres east/north (good enough at city scale). */
export function offsetMeters([lng, lat]: LngLat, east: number, north: number): LngLat {
  return [lng + east / (111_320 * Math.cos((lat * Math.PI) / 180)), lat + north / 111_320];
}

/**
 * Organisations pinned only to a sector all share its centroid. Spread them on a
 * sunflower spiral inside the sector's circle so every pin can be clicked, while
 * staying inside the "somewhere in here" halo. Deterministic: same set, same spots.
 * Organisations known only by city lose their coordinates entirely.
 */
export function spreadAreaPins(orgs: Org[], getArea: (slug?: string | null) => Area | null): Org[] {
  const groups = new Map<string, Org[]>();
  for (const o of orgs) {
    if (o.location_precision === "area" && o.area) {
      const g = groups.get(o.area) ?? [];
      g.push(o);
      groups.set(o.area, g);
    }
  }
  const placed = new Map<string, LngLat>();
  const golden = Math.PI * (3 - Math.sqrt(5));
  for (const [slug, group] of groups) {
    const area = getArea(slug);
    if (!area) continue;
    const maxR = area.radius_m * 0.55;
    const sorted = [...group].sort((a, b) => a.slug.localeCompare(b.slug));
    sorted.forEach((o, i) => {
      if (sorted.length === 1) return void placed.set(o.slug, area.center);
      const r = maxR * Math.sqrt((i + 0.5) / sorted.length);
      const t = i * golden;
      placed.set(o.slug, offsetMeters(area.center, r * Math.cos(t), r * Math.sin(t)));
    });
  }
  return orgs.map((o) => {
    if (o.location_precision === "municipality") return { ...o, lng: null, lat: null };
    if (o.location_precision === "area") {
      const p = placed.get(o.slug);
      return p ? { ...o, lng: p[0], lat: p[1] } : { ...o, lng: null, lat: null };
    }
    return o;
  });
}

/** A 64-sided polygon approximating a circle of `radius` metres. */
export function circlePolygon(center: LngLat, radius: number): GeoJSON.Polygon {
  const coords: LngLat[] = [];
  for (let i = 0; i <= 64; i++) {
    const t = (i / 64) * 2 * Math.PI;
    coords.push(offsetMeters(center, radius * Math.cos(t), radius * Math.sin(t)));
  }
  return { type: "Polygon", coordinates: [coords] };
}
