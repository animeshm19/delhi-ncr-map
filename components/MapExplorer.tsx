"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import type { Map as MLMap, GeoJSONSource, LngLatBounds } from "maplibre-gl";
import { KINDS, SECTORS, sectorColor, sectorLabel } from "@/lib/taxonomy";
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
  area: string | null;
  founded: number | null;
  lng: number | null;
  lat: number | null;
  radius_m: number | null;
  hiring: boolean | null;
  href: string;
}

// OpenFreeMap serves OpenMapTiles vector tiles from OSM data, free and keyless.
// It's what the Edmonton map uses.
const STYLE_URL = "https://tiles.openfreemap.org/styles/dark";
const GURUGRAM: [number, number] = [77.06, 28.46];

type Layer = "companies" | "support";

export default function MapExplorer({ orgs, areas }: { orgs: ExplorerOrg[]; areas: Area[] }) {
  const mapEl = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MLMap | null>(null);
  const listRef = useRef<HTMLUListElement>(null);

  const [layer, setLayer] = useState<Layer>("companies");
  const [sector, setSector] = useState<string>("");
  const [query, setQuery] = useState("");
  const [followMap, setFollowMap] = useState(false);
  const [bounds, setBounds] = useState<LngLatBounds | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [is3d, setIs3d] = useState(false);
  const [ready, setReady] = useState(false);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return orgs.filter((o) => {
      if (layer === "companies" ? o.kind !== "company" : o.kind === "company") return false;
      if (sector && !o.sectors.includes(sector)) return false;
      if (q && !`${o.name} ${o.one_liner ?? ""} ${o.place}`.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [orgs, layer, sector, query]);

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

  // ---- Create the map once ----
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const maplibregl = (await import("maplibre-gl")).default;
      if (cancelled || !mapEl.current) return;

      const map = new maplibregl.Map({
        container: mapEl.current,
        style: STYLE_URL,
        center: GURUGRAM,
        zoom: 11.3,
        attributionControl: { compact: true },
        cooperativeGestures: false,
      });
      mapRef.current = map;
      map.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), "top-right");

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

        map.addSource("orgs", { type: "geojson", data: emptyFC() });
        map.addLayer({
          id: "orgs",
          type: "circle",
          source: "orgs",
          paint: {
            "circle-color": ["get", "color"],
            "circle-radius": ["interpolate", ["linear"], ["zoom"], 9, 4, 14, 8],
            "circle-stroke-color": "#0a0b0d",
            "circle-stroke-width": 1.5,
            "circle-opacity": ["case", ["==", ["get", "precision"], "area"], 0.75, 1],
          },
        });
        map.addLayer({
          id: "orgs-selected",
          type: "circle",
          source: "orgs",
          filter: ["==", ["get", "slug"], ""],
          paint: {
            "circle-color": "transparent",
            "circle-radius": ["interpolate", ["linear"], ["zoom"], 9, 9, 14, 14],
            "circle-stroke-color": "#ffffff",
            "circle-stroke-width": 2,
          },
        });

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

        map.on("click", "orgs", (e) => {
          const slug = e.features?.[0]?.properties?.slug as string | undefined;
          if (slug) setSelected(slug);
        });
        map.on("mouseenter", "orgs", () => (map.getCanvas().style.cursor = "pointer"));
        map.on("mouseleave", "orgs", () => (map.getCanvas().style.cursor = ""));
        map.on("moveend", () => setBounds(map.getBounds()));

        setBounds(map.getBounds());
        setReady(true);

        // Deep link: /?c=slug selects an organisation, like the Edmonton map.
        const c = new URLSearchParams(window.location.search).get("c");
        if (c) setSelected(c);
      });
    })();
    return () => {
      cancelled = true;
      mapRef.current?.remove();
      mapRef.current = null;
    };
  }, []);

  // ---- Push filtered data to the map ----
  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map) return;
    const pinned = filtered.filter((o) => o.lng != null && o.lat != null);
    (map.getSource("orgs") as GeoJSONSource).setData({
      type: "FeatureCollection",
      features: pinned.map((o) => ({
        type: "Feature",
        geometry: { type: "Point", coordinates: [o.lng!, o.lat!] },
        properties: {
          slug: o.slug,
          name: o.name,
          precision: o.precision,
          color: o.kind === "company" ? sectorColor(o.sectors[0]) : KINDS[o.kind].color,
        },
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
  }, [filtered, ready, areas]);

  // ---- Selection: highlight pin, fly to it, popup, scroll list ----
  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map) return;
    map.setFilter("orgs-selected", ["==", ["get", "slug"], selected ?? ""]);
    const org = orgs.find((o) => o.slug === selected);
    document.querySelector(`[data-slug="${selected}"]`)?.scrollIntoView({ block: "nearest" });
    if (!org || org.lng == null || org.lat == null) return;
    map.easeTo({ center: [org.lng, org.lat], zoom: Math.max(map.getZoom(), 13.5) });
    let popup: import("maplibre-gl").Popup | null = null;
    import("maplibre-gl").then(({ default: ml }) => {
      const el = document.createElement("div");
      const strong = document.createElement("strong");
      strong.textContent = org.name;
      const sub = document.createElement("div");
      sub.className = "muted";
      sub.textContent = org.precision === "area" ? `${org.place} (approx.)` : org.place;
      const a = document.createElement("a");
      a.href = org.href;
      a.textContent = "Open profile →";
      el.append(strong, sub, a);
      popup = new ml.Popup({ offset: 12, closeButton: false }).setLngLat([org.lng!, org.lat!]).setDOMContent(el).addTo(map);
    });
    return () => {
      popup?.remove();
    };
  }, [selected, ready, orgs]);

  // ---- 2D / 3D ----
  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map) return;
    if (map.getLayer("buildings-3d")) map.setLayoutProperty("buildings-3d", "visibility", is3d ? "visible" : "none");
    map.easeTo(is3d ? { pitch: 60, bearing: -20, zoom: Math.max(map.getZoom(), 14) } : { pitch: 0, bearing: 0 });
  }, [is3d, ready]);

  return (
    <div className="explorer">
      <aside className="sidebar" aria-label="Search and list">
        <header>
          <div className="brand">
            <h1>Gurugram Startup Map</h1>
            <nav>
              <Link href="/directory">Directory</Link>
              <Link href="/about">About</Link>
              <Link href="/data">Data</Link>
            </nav>
          </div>
          <input
            className="search"
            type="search"
            placeholder="Search companies, sectors, places"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-label="Search"
          />
          <div className="tabs" role="group" aria-label="Layer">
            <button className="chip" aria-pressed={layer === "companies"} onClick={() => setLayer("companies")}>Companies</button>
            <button className="chip" aria-pressed={layer === "support"} onClick={() => setLayer("support")}>Support</button>
            <select className="chip" value={sector} onChange={(e) => setSector(e.target.value)} aria-label="Sector">
              <option value="">All sectors</option>
              {usedSectors.map((s) => (
                <option key={s} value={s}>
                  {sectorLabel(s)} ({orgs.filter((o) => o.sectors.includes(s)).length})
                </option>
              ))}
            </select>
          </div>
          <div className="stats">
            <div className="stat"><b>{stats.companies}</b><span>Companies</span></div>
            <div className="stat"><b>{stats.sectors}</b><span>Sectors</span></div>
            <div className="stat"><b>{stats.hiring}</b><span>Hiring</span></div>
            <div className="stat"><b>{stats.support}</b><span>Support</span></div>
          </div>
        </header>

        <div className="listmeta">
          <span>
            {onMap} on the map · {filtered.length - onMap} listed without an address
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
                onClick={(e) => {
                  // First click selects on the map; a click on the selected item opens the profile.
                  if (o.lng != null && o.slug !== selected) {
                    e.preventDefault();
                    setSelected(o.slug);
                  }
                }}
              >
                <span
                  className="logo"
                  style={{ background: o.kind === "company" ? sectorColor(o.sectors[0]) : KINDS[o.kind].color }}
                  aria-hidden
                >
                  {initials(o.name)}
                </span>
                <span>
                  <h3>
                    {o.name}
                    {o.status !== "active" && <span className="badge">{o.status}</span>}
                    {o.hiring && <span className="badge">Hiring</span>}
                  </h3>
                  {o.one_liner && <p>{o.one_liner}</p>}
                  <small>
                    {o.kind === "company" ? o.sectors.map(sectorLabel).join(" · ") || "Company" : KINDS[o.kind].label}
                    {" · "}
                    {o.place}
                    {o.precision !== "exact" && o.precision !== "building" ? " (approx.)" : ""}
                    {o.founded ? ` · est. ${o.founded}` : ""}
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
        </div>
        <div ref={mapEl} className="map" role="region" aria-label="Map of Gurugram" />
      </div>
    </div>
  );
}

function initials(name: string) {
  return name
    .replace(/\(.*?\)/g, "")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join("");
}

function emptyFC(): GeoJSON.FeatureCollection {
  return { type: "FeatureCollection", features: [] };
}

/** A 64-sided polygon approximating a circle of `radius` metres. */
function circlePolygon([lng, lat]: [number, number], radius: number): GeoJSON.Polygon {
  const coords: [number, number][] = [];
  const dLat = radius / 111_320;
  const dLng = radius / (111_320 * Math.cos((lat * Math.PI) / 180));
  for (let i = 0; i <= 64; i++) {
    const t = (i / 64) * 2 * Math.PI;
    coords.push([lng + dLng * Math.cos(t), lat + dLat * Math.sin(t)]);
  }
  return { type: "Polygon", coordinates: [coords] };
}
