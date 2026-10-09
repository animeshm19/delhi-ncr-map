"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import type { Map as MLMap, GeoJSONSource, LngLatBounds } from "maplibre-gl";
import { KINDS, SECTORS, sectorColor, sectorLabel } from "@/lib/taxonomy";
import { CITIES, SITE_NAME } from "@/lib/site";
import { circlePolygon, haversineMeters } from "@/lib/geo";
import { METRO, formatDistance, getStation, metroGeoJSON } from "@/lib/metro";
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
  /** Unspread location used for distances: the office, or the sector centre for approximate pins */
  anchor: [number, number] | null;
}

const RADII = [500, 1000, 2000];

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
  const listRef = useRef<HTMLUListElement>(null);

  const [layer, setLayer] = useState<Layer>("companies");
  const [sector, setSector] = useState<string>("");
  const [city, setCity] = useState<string>("");
  const [query, setQuery] = useState("");
  const [followMap, setFollowMap] = useState(false);
  const [bounds, setBounds] = useState<LngLatBounds | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
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

  // ---- Create the map once ----
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const maplibregl = await import("maplibre-gl");
      if (cancelled || !mapEl.current) return;
      maplibregl.setWorkerUrl("/maplibre/maplibre-gl-worker.mjs");

      const map = new maplibregl.Map({
        container: mapEl.current,
        style: STYLE_URL,
        center: NCR_CENTER,
        zoom: 10,
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

        // Metro: lines are straight station-to-station segments (schematic), under the pins.
        const metro = metroGeoJSON();
        map.addSource("radius", { type: "geojson", data: emptyFC() });
        map.addLayer({
          id: "radius",
          type: "line",
          source: "radius",
          paint: { "line-color": "#ffffff", "line-opacity": 0.5, "line-width": 1.5, "line-dasharray": [3, 2] },
        });
        map.addSource("metro-lines", { type: "geojson", data: metro.lines });
        map.addLayer({
          id: "metro-lines",
          type: "line",
          source: "metro-lines",
          layout: { "line-cap": "round", "line-join": "round" },
          paint: { "line-color": ["get", "color"], "line-width": ["interpolate", ["linear"], ["zoom"], 9, 2, 14, 5], "line-opacity": 0.85 },
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
            layout: { "text-field": ["get", "name"], "text-size": 11, "text-offset": [0, 1.1], "text-anchor": "top" },
            paint: { "text-color": "#d0d4da", "text-halo-color": "#0a0b0d", "text-halo-width": 1.5 },
          });
        }
        map.on("click", "metro-stations", (e) => {
          const id = e.features?.[0]?.properties?.id as string | undefined;
          if (id) setStation(id);
        });
        map.on("mouseenter", "metro-stations", () => (map.getCanvas().style.cursor = "pointer"));
        map.on("mouseleave", "metro-stations", () => (map.getCanvas().style.cursor = ""));

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

        // Frame whatever is pinned (Gurugram today; Noida and Delhi as they're added).
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

        // Deep link: /?c=slug selects an organisation, like the Edmonton map.
        const params = new URLSearchParams(window.location.search);
        const c = params.get("c");
        if (c) setSelected(c);
        // /?station=cyber-city&r=1000 — "companies near this station".
        const st = params.get("station");
        if (st && getStation(st)) setStation(st);
        const r = Number(params.get("r"));
        if (RADII.includes(r)) setRadius(r);
        // Filters for shared links and embeds: ?sector=fintech&city=Gurugram&hiring=1
        const sec = params.get("sector");
        if (sec && SECTORS[sec]) setSector(sec);
        const cty = params.get("city");
        if (cty && CITIES.some((x) => x.live && x.name === cty)) setCity(cty);
        if (params.get("hiring") === "1") setHiringOnly(true);
        if (params.get("layer") === "support") setLayer("support");
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
    import("maplibre-gl").then((ml) => {
      const el = document.createElement("div");
      const strong = document.createElement("strong");
      strong.textContent = org.name;
      const sub = document.createElement("div");
      sub.className = "muted";
      sub.textContent = org.precision === "area" ? `${org.place} (approx.)` : org.place;
      const a = document.createElement("a");
      a.href = embedded ? `${siteUrl}${org.href}` : org.href;
      a.textContent = "Open profile";
      if (embedded) {
        a.target = "_blank";
        a.rel = "noopener";
      }
      el.append(strong, sub, a);
      popup = new ml.Popup({ offset: 12, closeButton: false }).setLngLat([org.lng!, org.lat!]).setDOMContent(el).addTo(map);
    });
    return () => {
      popup?.remove();
    };
  }, [selected, ready, orgs]);

  // ---- Metro layer and the station radius ----
  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map) return;
    for (const id of ["metro-lines", "metro-stations", "metro-labels"]) {
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
      map.easeTo({ center: [stationObj.lng, stationObj.lat], zoom });
      setShowMetro(true);
    }
    // Keep the URL shareable.
    const url = new URL(window.location.href);
    if (stationObj) {
      url.searchParams.set("station", stationObj.id);
      url.searchParams.set("r", String(radius));
    } else {
      url.searchParams.delete("station");
      url.searchParams.delete("r");
    }
    window.history.replaceState(null, "", url);
  }, [stationObj, radius, ready]);

  // ---- 2D / 3D ----
  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map) return;
    if (map.getLayer("buildings-3d")) map.setLayoutProperty("buildings-3d", "visibility", is3d ? "visible" : "none");
    map.easeTo(is3d ? { pitch: 60, bearing: -20, zoom: Math.max(map.getZoom(), 14) } : { pitch: 0, bearing: 0 });
  }, [is3d, ready]);

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
    <div className="explorer">
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
                <optgroup key={l.slug} label={`${l.name} (${l.operator})`}>
                  {METRO.stations
                    .filter((st) => st.lines[0] === l.slug)
                    .map((st) => (
                      <option key={st.id} value={st.id}>{st.name}</option>
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
            <button className="chip" aria-pressed={showMetro} onClick={() => setShowMetro((v) => !v)}>Metro</button>
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
                onClick={(e) => {
                  // First click selects on the map; a click on the selected item opens the profile.
                  if (o.lng != null && o.slug !== selected) {
                    e.preventDefault();
                    setSelected(o.slug);
                  }
                }}
              >
                {o.logo ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img className="logo logo-photo" src={o.logo} alt="" width={40} height={40} loading="lazy" />
                ) : (
                  <span className="logo" aria-hidden>
                    {initials(o.name)}
                  </span>
                )}
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
                      {o.precision !== "exact" && o.precision !== "building" ? " (approx.)" : ""}
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
        </div>
        <div ref={mapEl} className="map" role="region" aria-label="Map of Delhi NCR" />
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
