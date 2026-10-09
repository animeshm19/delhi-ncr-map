"""Build data/metro.json and public/metro-tracks.json from OpenStreetMap.

Usage:  python3 scripts/metro/build.py <dir with osm/rels.json and osm/nodes.json> <repo root>

The two inputs come from the Overpass API (https://overpass-api.de/api/interpreter):

  osm/rels.json   the route relations listed in LINES below, with member geometry:
                    [out:json];rel(id:<ids>);out geom;
                  saved as [{id, tags, members: [{t: "n"|"w", ref, role, p: [lng, lat] | g: [[lng, lat], ...]}]}]

  osm/nodes.json  the relations' stop nodes and the station objects near them:
                    [out:json];rel(id:<ids>)->.r;node(r.r)->.n;.n out tags;
                    (node(around.n:400)["railway"="station"];node(around.n:400)["public_transport"="station"];
                     way(around.n:400)["railway"="station"];)->.s;.s out tags center;
                  saved as [{type, id, lon, lat, t: {tags}}]

Find route ids for new lines with:
  [out:json];rel["type"="route"]["route"~"^(subway|light_rail|monorail)$"](28.2,76.8,28.95,77.75);out tags;

Station positions are the OpenStreetMap station objects; tracks are the routes' ways, simplified.
Data © OpenStreetMap contributors, ODbL.
"""
import json, math, re, sys

S = sys.argv[1]
ROOT = sys.argv[2]
RETRIEVED = "2026-10-09"

rels = {r["id"]: r for r in json.load(open(f"{S}/osm/rels.json"))}
nodes = json.load(open(f"{S}/osm/nodes.json"))
node_by_id = {n["id"]: n for n in nodes if n["type"] == "node"}
station_objs = [n for n in nodes if n.get("lon") is not None and (n["t"].get("railway") == "station" or n["t"].get("public_transport") == "station")]

# slug, name, operator, colour (brightened where the official colour vanishes on a dark map), relations
LINES = [
    ("red", "Red Line", "Delhi Metro", "#ef4444", [447214]),
    ("yellow", "Yellow Line", "Delhi Metro", "#f2c40c", [447210]),
    ("blue", "Blue Line", "Delhi Metro", "#3b82f6", [447209, 2535795]),
    ("green", "Green Line", "Delhi Metro", "#22a55b", [8037666, 2535796]),
    ("violet", "Violet Line", "Delhi Metro", "#8b5cf6", [2535797]),
    ("pink", "Pink Line", "Delhi Metro", "#f9a8c4", [8241298]),
    ("magenta", "Magenta Line", "Delhi Metro", "#d946a0", [8385429, 20300114]),
    ("grey", "Grey Line", "Delhi Metro", "#9ca3af", [3537978]),
    ("airport", "Airport Express", "Delhi Metro", "#f97316", [2535798]),
    ("rapid", "Rapid Metro", "Rapid Metro Gurugram", "#3fa9f5", [4481323]),
    ("aqua", "Aqua Line", "Noida Metro", "#14b8a6", [9268568]),
    ("namo-bharat", "Namo Bharat", "NCRTC (Delhi–Meerut RRTS)", "#ea580c", [17337287]),
    ("meerut", "Meerut Metro", "NCRTC", "#e05a56", [16661918]),
]

# Station ids already used in shared links, tests and the MCP tool stay the same.
KEEP_IDS = {
    "Millennium City Centre Gurugram": "millennium-city-centre", "IFFCO Chowk": "iffco-chowk", "MG Road": "mg-road",
    "Sikanderpur": "sikanderpur", "Guru Dronacharya": "guru-dronacharya", "Arjan Garh": "arjan-garh",
    "Sector 55–56": "sector-55-56", "Sector 54 Chowk": "sector-54-chowk", "Sector 53–54": "sector-53-54",
    "Sector 42–43": "sector-42-43", "DLF Phase 1": "phase-1", "DLF Phase 2": "phase-2", "Belvedere Towers": "belvedere-towers",
    "Cyber City": "cyber-city", "Moulsari Avenue": "moulsari-avenue", "DLF Phase 3": "phase-3",
    "Noida Sector 51": "noida-sector-51", "Depot Station": "aqua-depot", "Noida Sector 62": "noida-sector-62",
    "Noida Sector 59": "noida-sector-59", "Noida Sector 16": "noida-sector-16", "Noida Sector 18": "noida-sector-18",
}
RENAME = {"M G Road": "MG Road", "Phase 3": "DLF Phase 3", "Sector 53-54": "Sector 53–54", "Sector 42-43": "Sector 42–43",
          "Moulsari Avenue Station": "Moulsari Avenue", "Phase 3 Station": "DLF Phase 3", "A.I.I.M.S.": "AIIMS",
          "N.H.P.C. Chowk": "NHPC Chowk", "R. K. Puram": "RK Puram"}


def clean(name):
    n = re.sub(r"\s*\((Red|Yellow|Blue|Green|Violet|Pink|Magenta|Grey|Gray|Airport Express|Aqua) Line\)\s*$", "", name).strip()
    n = RENAME.get(n, n)
    if n.endswith(" Station") and n != "Depot Station":
        n = n[: -len(" Station")]
    return RENAME.get(n, n)


def key(name):
    return re.sub(r"[^a-z0-9]", "", name.lower())


def dist(a, b):
    R = 6371000
    p1, p2 = math.radians(a[1]), math.radians(b[1])
    dp, dl = p2 - p1, math.radians(b[0] - a[0])
    h = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * R * math.asin(math.sqrt(h))


def slugify(name):
    return re.sub(r"-+", "-", re.sub(r"[^a-z0-9]+", "-", name.lower().replace("&", "and"))).strip("-")


def station_obj_for(stop):
    """The railway=station object for a stop: same name within 500 m, else the nearest within 250 m."""
    p = (stop["lon"], stop["lat"])
    nm = key(clean(stop["t"].get("name", "")))
    best = None
    for s in station_objs:
        d = dist(p, (s["lon"], s["lat"]))
        same = key(clean(s["t"].get("name", ""))) == nm
        if (same and d < 500) or d < 250:
            score = d - (1000 if same else 0)
            if best is None or score < best[0]:
                best = (score, s)
    return best[1] if best else None


stations = []  # {id,name,lng,lat,lines,source,_key}


def find_or_add(name, lng, lat, src):
    k = key(name)
    for s in stations:
        if s["_key"] == k and dist((s["lng"], s["lat"]), (lng, lat)) < 700:
            return s
    s = {"name": name, "lng": round(lng, 6), "lat": round(lat, 6), "lines": [], "source": src, "_key": k}
    stations.append(s)
    return s


lines_out = []
tracks = {}
for slug, name, operator, color, rids in LINES:
    branches = []
    for rid in rids:
        r = rels[rid]
        seq = []
        for m in r["members"]:
            if m["t"] != "n" or not m["role"].startswith("stop"):
                continue
            stop = dict(node_by_id.get(m["ref"], {"type": "node", "id": m["ref"], "t": {}}))
            stop["lon"], stop["lat"] = m["p"]
            obj = station_obj_for(stop) or stop
            nm = clean(stop["t"].get("name") or obj["t"].get("name"))
            st = find_or_add(nm, obj["lon"], obj["lat"],
                             {"url": f"https://www.openstreetmap.org/{obj['type']}/{obj['id']}", "retrieved": RETRIEVED})
            if slug not in st["lines"]:
                st["lines"].append(slug)
            seq.append(st)
        branches.append(seq)
    lines_out.append({"slug": slug, "name": name, "operator": operator, "color": color, "_branches": branches,
                      "source": [f"https://www.openstreetmap.org/relation/{rid}" for rid in rids]})
    # Track: the relation's ways (one direction), simplified.
    segs = []
    for rid in rids:
        for m in rels[rid]["members"]:
            if m["t"] == "w" and m["role"] == "" and len(m.get("g", [])) > 1:
                segs.append(m["g"])
    tracks[slug] = segs

# Ids
used = set()
for s in stations:
    sid = KEEP_IDS.get(s["name"]) or slugify(s["name"])
    base, i = sid, 2
    while sid in used:
        sid = f"{base}-{i}"; i += 1
    used.add(sid)
    s["id"] = sid


def simplify(pts, tol):
    if len(pts) < 3:
        return pts
    # Douglas–Peucker in degrees (fine at this scale)
    a, b = pts[0], pts[-1]
    dx, dy = b[0] - a[0], b[1] - a[1]
    L = math.hypot(dx, dy) or 1e-12
    dmax, idx = 0, 0
    for i in range(1, len(pts) - 1):
        d = abs(dy * pts[i][0] - dx * pts[i][1] + b[0] * a[1] - b[1] * a[0]) / L
        if d > dmax:
            dmax, idx = d, i
    if dmax > tol:
        return simplify(pts[: idx + 1], tol)[:-1] + simplify(pts[idx:], tol)
    return [a, b]


def merge(segs):
    """Join ways that share end points into longer polylines."""
    segs = [list(map(tuple, s)) for s in segs]
    out = []
    while segs:
        cur = segs.pop(0)
        grown = True
        while grown:
            grown = False
            for i, s in enumerate(segs):
                if s[0] == cur[-1]: cur += s[1:]
                elif s[-1] == cur[-1]: cur += s[::-1][1:]
                elif s[-1] == cur[0]: cur = s[:-1] + cur
                elif s[0] == cur[0]: cur = s[::-1][:-1] + cur
                else: continue
                segs.pop(i); grown = True; break
        out.append(cur)
    return out


track_fc = {"type": "FeatureCollection", "features": []}
npts = 0
for l in lines_out:
    polys = [simplify([list(p) for p in m], 0.00006) for m in merge(tracks[l["slug"]])]
    polys = [[[round(x, 5), round(y, 5)] for x, y in p] for p in polys if len(p) > 1]
    npts += sum(len(p) for p in polys)
    track_fc["features"].append({"type": "Feature", "properties": {"line": l["slug"], "name": l["name"], "color": l["color"]},
                                 "geometry": {"type": "MultiLineString", "coordinates": polys}})

final_lines = []
for l in lines_out:
    branches = []
    for seq in l["_branches"]:
        ids = []
        for st in seq:
            if not ids or ids[-1] != st["id"]:
                ids.append(st["id"])
        branches.append(ids)
    order = []
    for b in branches:
        for i in b:
            if i not in order:
                order.append(i)
    final_lines.append({"slug": l["slug"], "name": l["name"], "operator": l["operator"], "color": l["color"],
                        "complete": True, "note": "", "stations": order, "branches": branches, "source": l["source"]})

NOTES = {
    "blue": "Main line Dwarka Sector 21 to Noida Electronic City, and the branch from Yamuna Bank to Vaishali.",
    "green": "Inderlok to Brigadier Hoshiyar Singh (Bahadurgarh), and the branch from Kirti Nagar to Ashok Park Main.",
    "pink": "Majlis Park to Shiv Vihar round the city, with the Maujpur extension.",
    "magenta": "Botanical Garden to Krishna Park Extension, and the open Phase 4 section from Majlis Park to Deepali Chowk.",
    "rapid": "Sector 55–56 to Sikanderpur, with a loop round DLF Cyber City.",
    "namo-bharat": "Regional rail (RRTS) from Sarai Kale Khan through Ghaziabad to Meerut.",
    "meerut": "Local metro on the Namo Bharat tracks through Meerut.",
}
for l in final_lines:
    l["note"] = NOTES.get(l["slug"], "")

order_idx = {l["slug"]: i for i, l in enumerate(final_lines)}
out_stations = []
for s in stations:
    out_stations.append({"id": s["id"], "name": s["name"], "lng": s["lng"], "lat": s["lat"],
                         "lines": sorted(s["lines"], key=order_idx.get), "source": s["source"]})

meta = {"source": "OpenStreetMap route relations, read through the Overpass API",
        "license": "© OpenStreetMap contributors, ODbL", "retrieved": RETRIEVED}
json.dump({"meta": meta, "lines": final_lines, "stations": out_stations}, open(f"{ROOT}/data/metro.json", "w"), indent=2, ensure_ascii=False)
json.dump(track_fc, open(f"{ROOT}/public/metro-tracks.json", "w"), separators=(",", ":"))
inter = [s for s in out_stations if len(s["lines"]) > 1]
print(f"{len(final_lines)} lines, {len(out_stations)} stations, {len(inter)} interchanges, {npts} track points")
for l in final_lines:
    print(f"  {l['name']}: {len(l['stations'])} stations")
print("interchanges:", ", ".join(f"{s['name']} ({'/'.join(s['lines'])})" for s in inter))
