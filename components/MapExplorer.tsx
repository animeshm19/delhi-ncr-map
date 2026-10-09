"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import type { Map as MLMap, GeoJSONSource, LngLatBounds } from "maplibre-gl";
import { KINDS, SECTORS, sectorColor, sectorLabel } from "@/lib/taxonomy";
import { CITIES, SITE_NAME } from "@/lib/site";
import { circlePolygon, haversineMeters } from "@/lib/geo";
import { METRO, METRO_TRACKS_URL, formatDistance, getStation, metroGeoJSON } from "@/lib/metro";
import OrgPanel from "./OrgPanel";
import OrgLogo, { isBlank } from "./OrgLogo";
import type { Area, Kind, Precision, Status } from "@/lib/types";

export interface ExplorerOrg {
  slug: string;
  name: string;
  kind: Kind;
  sectors: string[];
  status: Status;
  one_liner: string | null;
  place: string;
  precision: Precision;
  city: string;
  area: string | null;
  founded: number | null;
  lng: number | null;
  lat: number | null;
  radius_m: number | null;
  hiring: boolean | null;
  href: string;
  logo: string | null;
  /** Higher = better face for a group of pins (has a logo, then funding) */
  score: number;
  /** Unspread location used for distances: the office, or the sector centre for approximate pins */
  anchor: [number, number] | null;
}

const RADII = [500, 1000, 2000];
/** Width of the side panel on wide screens (matches .org-panel in globals.css). */
const PANEL_WIDTH = 400;

// OpenFreeMap serves OpenMapTiles vector tiles from OSM data, free and keyless.
// It's what the Edmonton map uses.
const STYLE_URL = "https://tiles.openfreemap.org/styles/dark";
const NCR_CENTER: [number, number] = [77.2, 28.55];

type Layer = "companies" | "support";

export default function MapExplorer({
  orgs,
  areas,
  embedded = false,
  siteUrl = "",
}: {
  orgs: ExplorerOrg[];
  areas: Area[];
  /** Map only, for <iframe> embeds on other sites: links open in a new tab. */
  embedded?: boolean;
  siteUrl?: string;
}) {
  const mapEl = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MLMap | null>(null);
  const mlRef = useRef<typeof import("maplibre-gl") | null>(null);
  // Logo pins on the map, keyed by what they show (a single org, or a group and its face).
  const pinsRef = useRef(new Map<string, import("maplibre-gl").Marker>());
  // Latest values for map event handlers created once.
  const chooseRef = useRef<(slug: string) => void>(() => {});
  const listRef = useRef<HTMLUListElement>(null);

  const [layer, setLayer] = useState<Layer>("companies");
  const [sector, setSector] = useState<string>("");
  const [city, setCity] = useState<string>("");
  const [query, setQuery] = useState("");
  const [followMap, setFollowMap] = useState(false);
  const [bounds, setBounds] = useState<LngLatBounds | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  // The side panel plays a short exit animation before it unmounts.
  const [closing, setClosing] = useState(false);
  const [is3d, setIs3d] = useState(false);
  const [showMetro, setShowMetro] = useState(true);
  const [station, setStation] = useState("");
  const [radius, setRadius] = useState(1000);
  const [hiringOnly, setHiringOnly] = useState(false);
  const [ready, setReady] = useState(false);

  const stationObj = getStation(station);

  // Straight-line distance from the chosen station to each organisation's office or sector centre.
  const distance = useMemo(() => {
    const d = new Map<string, number>();
    if (!stationObj) return d;
    for (const o of orgs) if (o.anchor) d.set(o.slug, haversineMeters(o.anchor, [stationObj.lng, stationObj.lat]));
    return d;
  }, [orgs, stationObj]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const out = orgs.filter((o) => {
      if (layer === "companies" ? o.kind !== "company" : o.kind === "company") return false;
      if (sector && !o.sectors.includes(sector)) return false;
      if (city && o.city !== city) return false;
      if (hiringOnly && !o.hiring) return false;
      if (stationObj && !((distance.get(o.slug) ?? Infinity) <= radius)) return false;
      if (q && !`${o.name} ${o.one_liner ?? ""} ${o.place}`.toLowerCase().includes(q)) return false;
      return true;
    });
    return stationObj ? out.sort((a, b) => distance.get(a.slug)! - distance.get(b.slug)!) : out;
  }, [orgs, layer, sector, city, query, hiringOnly, stationObj, distance, radius]);

  const listed = useMemo(() => {
    if (!followMap || !bounds) return filtered;
    return filtered.filter((o) => o.lng != null && o.lat != null && bounds.contains([o.lng, o.lat]));
  }, [filtered, followMap, bounds]);

  const onMap = filtered.filter((o) => o.lng != null).length;

  const stats = useMemo(() => {
    const companies = orgs.filter((o) => o.kind === "company");
    return {
      companies: companies.length,
      sectors: new Set(companies.flatMap((o) => o.sectors)).size,
      hiring: companies.filter((o) => o.hiring).length,
      support: orgs.length - companies.length,
    };
  }, [orgs]);

  const usedSectors = useMemo(
    () => Object.keys(SECTORS).filter((s) => orgs.some((o) => o.sectors.includes(s))),
    [orgs],
  );

  // ---- Filters from the link, applied straight away (the list doesn't wait for the map) ----
  const [linkRead, setLinkRead] = useState(false);
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    // /?c=slug selects an organisation, like the Edmonton map.
    const c = params.get("c");
    if (c && orgs.some((o) => o.slug === c)) setSelected(c);
    // /?station=cyber-city&r=1000 — "companies near this station".
    const st = params.get("station");
    if (st && getStation(st)) setStation(st);
    const r = Number(params.get("r"));
    if (RADII.includes(r)) setRadius(r);
    // Filters for shared links and embeds: ?sector=fintech&city=Gurugram&hiring=1&layer=support
    const sec = params.get("sector");
    if (sec && SECTORS[sec]) setSector(sec);
    const cty = params.get("city");
    if (cty && CITIES.some((x) => x.live && x.name === cty)) setCity(cty);
    if (params.get("hiring") === "1") setHiringOnly(true);
    if (params.get("layer") === "support") setLayer("support");
    setLinkRead(true);
  }, [orgs]);

  // Keep the station in the URL so the view can be shared (only after the link has been read).
  useEffect(() => {
    if (!linkRead) return;
    const url = new URL(window.location.href);
    if (stationObj) {
      url.searchParams.set("station", stationObj.id);
      url.searchParams.set("r", String(radius));
    } else {
      url.searchParams.delete("station");
      url.searchParams.delete("r");
    }
    window.history.replaceState(null, "", url);
  }, [stationObj, radius, linkRead]);

  // Keep the open organisation in the URL (?c=slug), like the Edmonton map, so the view can be shared.
  useEffect(() => {
    if (!linkRead || embedded) return;
    const url = new URL(window.location.href);
    if (selected) url.searchParams.set("c", selected);
    else url.searchParams.delete("c");
    if (url.href !== window.location.href) window.history.replaceState(null, "", url);
  }, [selected, linkRead, embedded]);

  const closePanel = () => {
    if (!selected || closing) return;
    setClosing(true);
    window.setTimeout(() => {
      setSelected(null);
      setClosing(false);
    }, 180);
  };
  const choose = (slug: string) => {
    setClosing(false);
    setSelected(slug);
  };

  // Esc closes the panel (unless you're typing in the search box).
  useEffect(() => {
    if (!selected || embedded) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      const el = document.activeElement as HTMLElement | null;
      if (el && (el.tagName === "INPUT" || el.tagName === "SELECT" || el.tagName === "TEXTAREA")) return;
      closePanel();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  // ---- Create the map once ----
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const maplibregl = await import("maplibre-gl");
      if (cancelled || !mapEl.current) return;
      maplibregl.setWorkerUrl("/maplibre/maplibre-gl-worker.mjs");
      mlRef.current = maplibregl;

      const map = new maplibregl.Map({
        container: mapEl.current,
        style: STYLE_URL,
        center: NCR_CENTER,
        zoom: 10,
        attributionControl: { compact: true },
        cooperativeGestures: false,
      });
      mapRef.current = map;
      // Bottom right, like the Edmonton map, so the side panel never covers the zoom buttons.
      map.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), "bottom-right");

      map.on("load", () => {
        map.addSource("halos", { type: "geojson", data: emptyFC() });
        map.addLayer({
          id: "halos",
          type: "fill",
          source: "halos",
          paint: { "fill-color": ["get", "color"], "fill-opacity": 0.06 },
        });
        map.addLayer({
          id: "halos-line",
          type: "line",
          source: "halos",
          paint: { "line-color": ["get", "color"], "line-opacity": 0.35, "line-width": 1, "line-dasharray": [2, 2] },
        });

        // Metro: lines are straight station-to-station segments (schematic), under the pins.
        const metro = metroGeoJSON();
        map.addSource("radius", { type: "geojson", data: emptyFC() });
        map.addLayer({
          id: "radius",
          type: "line",
          source: "radius",
          paint: { "line-color": "#ffffff", "line-opacity": 0.5, "line-width": 1.5, "line-dasharray": [3, 2] },
        });
        // Real track shapes (OpenStreetMap), loaded as a separate file; schematic lines until it arrives.
        map.addSource("metro-lines", { type: "geojson", data: metro.lines });
        fetch(METRO_TRACKS_URL)
          .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
          .then((fc: GeoJSON.FeatureCollection) => (map.getSource("metro-lines") as GeoJSONSource | undefined)?.setData(fc))
          .catch(() => {});
        map.addLayer({
          id: "metro-casing",
          type: "line",
          source: "metro-lines",
          layout: { "line-cap": "round", "line-join": "round" },
          paint: { "line-color": "#0a0b0d", "line-width": ["interpolate", ["linear"], ["zoom"], 9, 3.5, 14, 8], "line-opacity": 0.7 },
        });
        map.addLayer({
          id: "metro-lines",
          type: "line",
          source: "metro-lines",
          layout: { "line-cap": "round", "line-join": "round" },
          paint: { "line-color": ["get", "color"], "line-width": ["interpolate", ["linear"], ["zoom"], 9, 2, 14, 5], "line-opacity": 0.9 },
        });
        map.addSource("metro-stations", { type: "geojson", data: metro.stations });
        map.addLayer({
          id: "metro-stations",
          type: "circle",
          source: "metro-stations",
          paint: {
            "circle-color": "#0a0b0d",
            "circle-stroke-color": ["case", ["get", "interchange"], "#ffffff", ["get", "color"]],
            "circle-stroke-width": ["case", ["get", "interchange"], 3, 2],
            "circle-radius": ["interpolate", ["linear"], ["zoom"], 9, 3, 14, 6],
          },
        });
        // Labels need the basemap's fonts; skip them if the style has none.
        if (map.getStyle().glyphs) {
          map.addLayer({
            id: "metro-labels",
            type: "symbol",
            source: "metro-stations",
            minzoom: 12,
            // Noto Sans is what OpenFreeMap serves; the MapLibre default font isn't there (404s).
            layout: { "text-field": ["get", "name"], "text-font": ["Noto Sans Regular"], "text-size": 11, "text-offset": [0, 1.1], "text-anchor": "top" },
            paint: { "text-color": "#d0d4da", "text-halo-color": "#0a0b0d", "text-halo-width": 1.5 },
          });
        }
        map.on("click", "metro-stations", (e) => {
          const id = e.features?.[0]?.properties?.id as string | undefined;
          if (id) setStation(id);
        });
        map.on("mouseenter", "metro-stations", () => (map.getCanvas().style.cursor = "pointer"));
        map.on("mouseleave", "metro-stations", () => (map.getCanvas().style.cursor = ""));

        // Pins are logo markers (drawn below); nearby ones are grouped, and each group is shown by
        // its best-known member ("best" = highest rank: has a logo, then funding) with a "+N" badge.
        map.addSource("orgs", {
          type: "geojson",
          data: emptyFC(),
          cluster: true,
          clusterRadius: 46,
          clusterMaxZoom: 16,
          clusterProperties: { best: ["max", ["get", "rank"]] },
        });
        // Invisible: the source needs a layer to load, and tests can read it.
        map.addLayer({ id: "orgs", type: "circle", source: "orgs", paint: { "circle-radius": 1, "circle-opacity": 0 } });

        // 3D buildings from the OpenMapTiles "building" layer (hidden in 2D).
        const firstSymbol = map.getStyle().layers.find((l) => l.type === "symbol")?.id;
        if (map.getSource("openmaptiles")) map.addLayer(
          {
            id: "buildings-3d",
            type: "fill-extrusion",
            source: "openmaptiles",
            "source-layer": "building",
            minzoom: 13,
            layout: { visibility: "none" },
            paint: {
              "fill-extrusion-color": "#2a2f3a",
              "fill-extrusion-height": ["coalesce", ["get", "render_height"], 6],
              "fill-extrusion-base": ["coalesce", ["get", "render_min_height"], 0],
              "fill-extrusion-opacity": 0.85,
            },
          },
          firstSymbol,
        );

        // Keep the logo pins in step with the map (cheap: a few hundred points at most).
        let queued = false;
        map.on("render", () => {
          if (queued) return;
          queued = true;
          requestAnimationFrame(() => {
            queued = false;
            syncRef.current();
          });
        });
        map.on("moveend", () => {
          setBounds(map.getBounds());
          // Exposed for tests and debugging: where the camera settled.
          if (mapEl.current) mapEl.current.dataset.zoom = map.getZoom().toFixed(1);
        });

        // Frame whatever is pinned (Gurugram, Noida and Greater Noida today; Delhi as it's added).
        const pts = orgs.filter((o) => o.lng != null && o.lat != null);
        if (pts.length > 1) {
          const lngs = pts.map((o) => o.lng!);
          const lats = pts.map((o) => o.lat!);
          map.fitBounds(
            [[Math.min(...lngs), Math.min(...lats)], [Math.max(...lngs), Math.max(...lats)]],
            { padding: 60, duration: 0, maxZoom: 13 },
          );
        }
        setBounds(map.getBounds());
        setReady(true);

      });
    })();
    return () => {
      cancelled = true;
      mapRef.current?.remove();
      mapRef.current = null;
    };
  }, []);

  // ---- Logo pins ----
  // Each org's rank decides which logo represents a group: score first, list order breaks ties.
  const rankOf = useMemo(() => new Map(orgs.map((o, i) => [o.slug, o.score * 1000 + (999 - (i % 1000))])), [orgs]);
  const byRank = useMemo(() => new Map(orgs.map((o) => [rankOf.get(o.slug)!, o])), [orgs, rankOf]);
  chooseRef.current = choose;

  /** A pin: the logo on a white tile (or a name tag), with a "+N" badge for a group. */
  function pinElement(o: ExplorerOrg, count: number, selectedPin = false) {
    const el = document.createElement("button");
    el.type = "button";
    el.className = `pin${count > 1 ? " group" : ""}${selectedPin ? " selected" : ""}${o.precision === "area" ? " approx" : ""}`;
    el.style.setProperty("--c", o.kind === "company" ? sectorColor(o.sectors[0]) : KINDS[o.kind].color);
    el.dataset.slug = o.slug;
    const label = count > 1 ? `${o.name} and ${count - 1} more nearby` : o.name;
    el.setAttribute("aria-label", count > 1 ? `${label}: zoom in` : `${o.name}: open details`);
    el.title = count > 1 ? label : `${o.name} · ${o.place}${o.precision === "area" ? " (approx.)" : ""}`;
    const nameTag = () => {
      const tag = document.createElement("span");
      tag.className = "pin-name";
      const dot = document.createElement("i");
      tag.append(dot, document.createTextNode(o.name.length > 22 ? `${o.name.slice(0, 21)}…` : o.name));
      return tag;
    };
    if (o.logo) {
      const img = document.createElement("img");
      img.className = "pin-logo";
      img.src = o.logo;
      img.alt = "";
      img.decoding = "async";
      img.onerror = () => img.replaceWith(nameTag());
      img.onload = () => isBlank(img) && img.replaceWith(nameTag());
      el.append(img);
    } else {
      el.append(nameTag());
    }
    if (count > 1) {
      const badge = document.createElement("span");
      badge.className = "pin-count";
      badge.textContent = `+${count - 1}`;
      el.append(badge);
    }
    return el;
  }

  /** Add, move and remove logo pins to match what the clustered source shows right now. */
  function syncPins() {
    const map = mapRef.current;
    const ml = mlRef.current;
    if (!map || !ml || !map.getSource("orgs") || !map.isSourceLoaded("orgs")) return;
    const next = new Map<string, import("maplibre-gl").Marker>();
    for (const f of map.querySourceFeatures("orgs")) {
      const p = f.properties as { cluster?: boolean; cluster_id?: number; point_count?: number; best?: number; slug?: string; rank?: number };
      const count = p.cluster ? p.point_count ?? 1 : 1;
      const org = byRank.get(p.cluster ? p.best! : p.rank!);
      if (!org) continue;
      const key = p.cluster ? `g${p.cluster_id}:${org.slug}:${count}` : `s:${org.slug}`;
      if (next.has(key)) continue;
      const coords = (f.geometry as GeoJSON.Point).coordinates as [number, number];
      let marker = pinsRef.current.get(key);
      if (!marker) {
        const el = pinElement(org, count);
        el.addEventListener("click", (e) => {
          e.stopPropagation();
          if (p.cluster && p.cluster_id != null) {
            (map.getSource("orgs") as GeoJSONSource)
              .getClusterExpansionZoom(p.cluster_id)
              .then((z) => map.easeTo({ center: coords, zoom: Math.min(z + 0.3, 17), duration: 600 }))
              .catch(() => {});
          } else {
            chooseRef.current(org.slug);
          }
        });
        marker = new ml.Marker({ element: el, anchor: "center" }).setLngLat(coords).addTo(map);
      } else {
        marker.setLngLat(coords);
      }
      next.set(key, marker);
    }
    for (const [key, m] of pinsRef.current) if (!next.has(key)) m.remove();
    pinsRef.current = next;
  }

  const syncRef = useRef(syncPins);
  syncRef.current = syncPins;

  // ---- Push filtered data to the map ----
  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map) return;
    const pinned = filtered.filter((o) => o.lng != null && o.lat != null);
    (map.getSource("orgs") as GeoJSONSource).setData({
      type: "FeatureCollection",
      // The open organisation gets its own pin (below), so it's never hidden inside a group.
      features: pinned
        .filter((o) => o.slug !== selected)
        .map((o) => ({
          type: "Feature",
          geometry: { type: "Point", coordinates: [o.lng!, o.lat!] },
          properties: { slug: o.slug, rank: rankOf.get(o.slug)! },
        })),
    });
    // One faint circle per sector that has approximate pins in view.
    const usedAreas = new Set(pinned.filter((o) => o.precision === "area" && o.area).map((o) => o.area!));
    (map.getSource("halos") as GeoJSONSource).setData({
      type: "FeatureCollection",
      features: areas
        .filter((a) => usedAreas.has(a.slug))
        .map((a) => ({
          type: "Feature",
          geometry: circlePolygon(a.center, a.radius_m),
          properties: { color: "#7cc4ff", name: a.name },
        })),
    });
  }, [filtered, ready, areas, selected, rankOf]);

  // ---- Selection: highlight the pin, fly to it, scroll the list ----
  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map) return;
    const org = orgs.find((o) => o.slug === selected);
    document.querySelector(`[data-slug="${selected}"]`)?.scrollIntoView({ block: "nearest", behavior: "smooth" });
    const wide = window.matchMedia("(min-width: 861px)").matches;
    // Keep the pin centred in the part of the map the panel doesn't cover.
    const padding = { top: 0, bottom: 0, left: 0, right: !embedded && org && wide ? PANEL_WIDTH + 24 : 0 };
    if (!org || org.lng == null || org.lat == null) {
      // Panel closed: give the map its full width back (only if it was padded, so this never
      // cancels another camera move, like zooming to a station from a shared link).
      if (!org && !map.isMoving() && (map.getPadding().right ?? 0) > 0) map.easeTo({ padding: { top: 0, bottom: 0, left: 0, right: 0 }, duration: 400 });
      return;
    }
    // Like the Edmonton map: a smooth zoom-out-and-in flight to the pin.
    const target = org.precision === "area" ? 14 : 15.5;
    map.flyTo({
      center: [org.lng, org.lat],
      zoom: Math.max(target, Math.min(map.getZoom(), 17)),
      padding,
      speed: 0.8,
      curve: 1.6,
      essential: false, // skipped for people who ask for reduced motion
    });

    let marker: import("maplibre-gl").Marker | null = null;
    let popup: import("maplibre-gl").Popup | null = null;
    let cancelled = false;
    import("maplibre-gl").then((ml) => {
      if (cancelled) return;
      // The chosen organisation's own pin, raised, with a pulsing ring.
      const el = pinElement(org, 1, true);
      const ring = document.createElement("span");
      ring.className = "pin-pulse";
      ring.setAttribute("aria-hidden", "true");
      el.prepend(ring);
      marker = new ml.Marker({ element: el, anchor: "center" }).setLngLat([org.lng!, org.lat!]).addTo(map);
      if (!embedded) return;
      // Embeds have no side panel: a small popup that opens the profile on the main site.
      const box = document.createElement("div");
      const strong = document.createElement("strong");
      strong.textContent = org.name;
      const sub = document.createElement("div");
      sub.className = "muted";
      sub.textContent = org.precision === "area" ? `${org.place} (approx.)` : org.place;
      const a = document.createElement("a");
      a.href = `${siteUrl}${org.href}`;
      a.textContent = "Open profile";
      a.target = "_blank";
      a.rel = "noopener";
      box.append(strong, sub, a);
      popup = new ml.Popup({ offset: 22, closeButton: false }).setLngLat([org.lng!, org.lat!]).setDOMContent(box).addTo(map);
    });
    return () => {
      cancelled = true;
      marker?.remove();
      popup?.remove();
    };
  }, [selected, ready, orgs, embedded, siteUrl]);

  // Remember whether this visitor likes the metro shown (browser storage can be unavailable: then it's just on).
  const [metroPrefRead, setMetroPrefRead] = useState(false);
  useEffect(() => {
    try {
      if (window.localStorage.getItem("dncr:metro") === "off") setShowMetro(false);
    } catch {}
    setMetroPrefRead(true);
  }, []);
  useEffect(() => {
    if (!metroPrefRead) return;
    try {
      window.localStorage.setItem("dncr:metro", showMetro ? "on" : "off");
    } catch {}
  }, [showMetro, metroPrefRead]);

  // ---- Metro layer and the station radius ----
  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map) return;
    for (const id of ["metro-casing", "metro-lines", "metro-stations", "metro-labels"]) {
      if (map.getLayer(id)) map.setLayoutProperty(id, "visibility", showMetro ? "visible" : "none");
    }
  }, [showMetro, ready]);

  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map) return;
    (map.getSource("radius") as GeoJSONSource).setData(
      stationObj
        ? { type: "FeatureCollection", features: [{ type: "Feature", geometry: circlePolygon([stationObj.lng, stationObj.lat], radius), properties: {} }] }
        : emptyFC(),
    );
    if (stationObj) {
      const zoom = radius <= 500 ? 15 : radius <= 1000 ? 14 : 13;
      map.easeTo({ center: [stationObj.lng, stationObj.lat], zoom, padding: { top: 0, bottom: 0, left: 0, right: 0 } });
      setShowMetro(true);
    }
  }, [stationObj, radius, ready]);

  // ---- 2D / 3D ----
  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map) return;
    if (map.getLayer("buildings-3d")) map.setLayoutProperty("buildings-3d", "visibility", is3d ? "visible" : "none");
    // Only move the camera when the view actually changes; a no-op easeTo would cancel
    // any move already under way (like zooming to a station from a shared link).
    if (is3d) map.easeTo({ pitch: 60, bearing: -20, zoom: Math.max(map.getZoom(), 14) });
    else if (map.getPitch() !== 0 || map.getBearing() !== 0) map.easeTo({ pitch: 0, bearing: 0 });
  }, [is3d, ready]);

  const selectedOrg = selected ? orgs.find((o) => o.slug === selected) ?? null : null;

  if (embedded) {
    return (
      <div className="explorer embedded">
        <div className="mapwrap">
          <div className="embed-head">
            <a href={siteUrl || "/"} target="_blank" rel="noopener">{SITE_NAME}</a>
            <span className="muted" data-testid="embed-count">
              {stationObj ? `${filtered.length} within ${formatDistance(radius)} of ${stationObj.name}` : `${onMap} on the map`}
              {sector ? ` · ${SECTORS[sector]?.label}` : ""}
            </span>
          </div>
          <div ref={mapEl} className="map" role="region" aria-label="Map of Delhi NCR" />
        </div>
      </div>
    );
  }

  return (
    <div className={`explorer${selectedOrg && !closing ? " panel-open" : ""}`}>
      <aside className="sidebar" aria-label="Search and list">
        <header>
          <div className="brand">
            <h1>{SITE_NAME}</h1>
            <Link href="/submit" className="btn small">Add a company</Link>
          </div>
          <nav className="sitenav" aria-label="Site">
            <Link href="/hiring">Hiring</Link>
            <Link href="/events">Events</Link>
            <Link href="/metro">By metro</Link>
            <Link href="/directory">Directory</Link>
            <Link href="/stats">Stats</Link>
            <Link href="/about">About</Link>
          </nav>
          <input
            className="search"
            type="search"
            placeholder="Search companies, sectors, places"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-label="Search"
          />
          <div className="tabs" role="group" aria-label="Layer">
            <span className="seg">
              <button className="chip" aria-pressed={layer === "companies"} onClick={() => setLayer("companies")}>Companies</button>
              <button className="chip" aria-pressed={layer === "support"} onClick={() => setLayer("support")}>Support</button>
            </span>
            <select className="chip" value={sector} onChange={(e) => setSector(e.target.value)} aria-label="Sector">
              <option value="">All sectors</option>
              {usedSectors.map((s) => (
                <option key={s} value={s}>
                  {sectorLabel(s)} ({orgs.filter((o) => o.sectors.includes(s)).length})
                </option>
              ))}
            </select>
          </div>
          <div className="tabs" role="group" aria-label="City">
            <button className="chip" aria-pressed={city === ""} onClick={() => setCity("")}>All of NCR</button>
            {CITIES.map((c) =>
              c.live ? (
                <button key={c.slug} className="chip" aria-pressed={city === c.name} onClick={() => setCity(c.name)}>
                  {c.name}
                </button>
              ) : (
                <span key={c.slug} className="chip soon" title={`${c.name} is being added next`}>
                  {c.name} <span className="soon-tag">soon</span>
                </span>
              ),
            )}
          </div>
          <div className="tabs near" role="group" aria-label="Near a metro station">
            <select className="chip" value={station} onChange={(e) => setStation(e.target.value)} aria-label="Near metro station">
              <option value="">Near a metro station…</option>
              {METRO.lines.map((l) => (
                <optgroup key={l.slug} label={`${l.name} · ${l.operator}`}>
                  {l.stations.map((id) => (
                    <option key={id} value={id}>
                      {getStation(id)!.name}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
            {station && (
              <>
                {RADII.map((r) => (
                  <button key={r} className="chip" aria-pressed={radius === r} onClick={() => setRadius(r)}>
                    {formatDistance(r)}
                  </button>
                ))}
                <button className="chip icon" onClick={() => setStation("")} aria-label="Clear station">✕</button>
              </>
            )}
            <button className="chip" aria-pressed={hiringOnly} onClick={() => setHiringOnly((v) => !v)}>Hiring</button>
          </div>
          <p className="summary">
            <b>{stats.companies}</b> companies in {stats.sectors} sectors
            {stats.hiring > 0 && <>, <b>{stats.hiring}</b> hiring,</>} and <b>{stats.support}</b> organisations supporting
            them. <Link href="/stats">More numbers</Link>
          </p>
        </header>

        <div className="listmeta">
          <span aria-live="polite">
            {stationObj
              ? `${filtered.length} within ${formatDistance(radius)} of ${stationObj.name}`
              : <>{onMap} on the map<span className="sep" />{filtered.length - onMap} without an address</>}
          </span>
          <label>
            <input type="checkbox" checked={followMap} onChange={(e) => setFollowMap(e.target.checked)} />
            Search as I move the map
          </label>
        </div>

        <ul className="list" ref={listRef}>
          {listed.map((o) => (
            <li key={o.slug}>
              <a
                href={o.href}
                className="item"
                data-slug={o.slug}
                data-selected={o.slug === selected}
                style={{ "--c": o.kind === "company" ? sectorColor(o.sectors[0]) : KINDS[o.kind].color } as React.CSSProperties}
                aria-current={o.slug === selected ? "true" : undefined}
                onClick={(e) => {
                  // A click opens the side panel (and flies to the pin); cmd/ctrl-click still opens the profile.
                  if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
                  e.preventDefault();
                  choose(o.slug);
                }}
              >
                <OrgLogo name={o.name} src={o.logo} size={40} color={o.kind === "company" ? sectorColor(o.sectors[0]) : KINDS[o.kind].color} />
                <span className="item-body">
                  <h3>
                    <span className="item-name">{o.name}</span>
                    {o.status !== "active" && <span className="badge">{o.status}</span>}
                    {o.hiring && <span className="badge hiring">Hiring</span>}
                  </h3>
                  {o.one_liner && <p>{o.one_liner}</p>}
                  <small className="meta">
                    {o.kind === "company" ? (
                      o.sectors.length ? (
                        o.sectors.map((sl) => (
                          <span key={sl} className="meta-sector">
                            <i style={{ background: sectorColor(sl) }} aria-hidden />
                            {sectorLabel(sl)}
                          </span>
                        ))
                      ) : (
                        <span>Company</span>
                      )
                    ) : (
                      <span>{KINDS[o.kind].label}</span>
                    )}
                    <span>
                      {o.place}
                      {o.precision === "area" ? " (approx.)" : ""}
                    </span>
                    {o.founded && <span>est. {o.founded}</span>}
                    {stationObj && distance.has(o.slug) && (
                      <span className="dist">{formatDistance(distance.get(o.slug)!)} from {stationObj.name}</span>
                    )}
                  </small>
                </span>
              </a>
            </li>
          ))}
          {listed.length === 0 && <li className="item muted">Nothing matches. Try another filter, or zoom out.</li>}
        </ul>
      </aside>

      <div className="mapwrap">
        <div className="mapctl" role="group" aria-label="View">
          <button className="chip" aria-pressed={!is3d} onClick={() => setIs3d(false)}>2D</button>
          <button className="chip" aria-pressed={is3d} onClick={() => setIs3d(true)}>3D</button>
          <button
            className="chip metro-toggle"
            aria-pressed={showMetro}
            onClick={() => setShowMetro((v) => !v)}
            title={showMetro ? "Hide metro lines and stations" : "Show metro lines and stations"}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <rect x="5" y="3" width="14" height="14" rx="3" />
              <path d="M5 11h14M9 17l-2 4M15 17l2 4" />
              <circle cx="9" cy="14" r="0.5" fill="currentColor" />
              <circle cx="15" cy="14" r="0.5" fill="currentColor" />
            </svg>
            Metro
          </button>
        </div>
        <div ref={mapEl} className="map" role="region" aria-label="Map of Delhi NCR" />
        {selectedOrg && (
          <OrgPanel
            org={selectedOrg}
            closing={closing}
            onClose={closePanel}
            onSelect={choose}
            onStation={(id) => {
              setStation(id);
              closePanel();
            }}
          />
        )}
      </div>
    </div>
  );
}

function emptyFC(): GeoJSON.FeatureCollection {
  return { type: "FeatureCollection", features: [] };
}
