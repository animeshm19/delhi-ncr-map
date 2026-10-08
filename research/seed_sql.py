"""Turns data/areas.json + data/seed.json into idempotent SQL batches for Supabase."""
import json, pathlib
ROOT = pathlib.Path(__file__).resolve().parent.parent
areas = json.loads((ROOT/"data/areas.json").read_text())
orgs = json.loads((ROOT/"data/seed.json").read_text())

def q(v):
    if v is None: return "null"
    if isinstance(v, bool): return "true" if v else "false"
    if isinstance(v, (int, float)): return str(v)
    if isinstance(v, list): return "array[" + ",".join(q(x) for x in v) + "]::text[]" if v else "'{}'::text[]"
    return "'" + str(v).replace("'", "''") + "'"

out = []
rows = [f"({q(a['slug'])},{q(a['name'])},extensions.st_setsrid(extensions.st_makepoint({a['center'][0]},{a['center'][1]}),4326)::extensions.geography,{a['radius_m']})" for a in areas]
out.append("insert into areas (slug,name,center,radius_m) values\n" + ",\n".join(rows) +
           "\non conflict (slug) do update set name=excluded.name, center=excluded.center, radius_m=excluded.radius_m;")

cols = "slug,name,kind,sectors,status,one_liner,website,founded_year,municipality,area,location_precision,funding_note,hiring,verification,published,updated_at"
rows = []
for o in orgs:
    rows.append("(" + ",".join([q(o["slug"]), q(o["name"]), q(o["kind"]) + "::org_kind", q(o["sectors"]), q(o["status"]) + "::org_status",
        q(o.get("one_liner")), q(o.get("website")), q(o.get("founded_year")), q(o["municipality"]), q(o.get("area")),
        q(o["location_precision"]) + "::loc_precision", q(o.get("funding_note")), q(o.get("hiring")),
        q(o["verification"]) + "::verification", "true", q(o["updated_at"]) + "::timestamptz"]) + ")")
upd = ",".join(f"{c}=excluded.{c}" for c in cols.split(",")[1:])
out.append(f"insert into organizations ({cols}) values\n" + ",\n".join(rows) + f"\non conflict (slug) do update set {upd};")
acq = [o for o in orgs if o.get("acquired_by")]
for o in acq:
    out.append(f"update organizations set acquired_by={q(o['acquired_by'])} where slug={q(o['slug'])};")

slugs = ",".join(q(o["slug"]) for o in orgs)
srows = [f"({q(o['slug'])},{q(s['url'])},{q(s['note'])},{q(s['fields'])},{q(s['retrieved'])}::date)" for o in orgs for s in o["sources"]]
out.append(f"delete from sources where org_slug in ({slugs});\ninsert into sources (org_slug,url,note,fields,retrieved) values\n" + ",\n".join(srows) + ";")

rels = [(o["slug"], t, o["sources"][0]["url"]) for o in orgs for t in o["connected_to"]]
if rels:
    out.append("insert into relationships (from_slug,to_slug,relation,source_url) values\n" +
               ",\n".join(f"({q(a)},{q(b)},'parent_or_subsidiary',{q(u)})" for a, b, u in rels) +
               "\non conflict (from_slug,to_slug,relation) do nothing;")

pathlib.Path(ROOT/"supabase/seed.sql").write_text("\n\n".join(out) + "\n")
print(len(orgs), "orgs;", len(srows), "sources;", len(rels), "relationships;", sum(len(x) for x in out), "bytes")

# Optional: write small batches (for loading through a size-limited SQL console)
import sys
if len(sys.argv) > 1:
    d = pathlib.Path(sys.argv[1]); d.mkdir(parents=True, exist_ok=True)
    for f in d.glob("*.sql"): f.unlink()
    n = 0
    def orgrow(o):
        return "(" + ",".join([q(o["slug"]), q(o["name"]), q(o["kind"]) + "::org_kind", q(o["sectors"]), q(o["status"]) + "::org_status",
            q(o.get("one_liner")), q(o.get("website")), q(o.get("founded_year")), q(o["municipality"]), q(o.get("area")),
            q(o["location_precision"]) + "::loc_precision", q(o.get("funding_note")), q(o.get("hiring")),
            q(o["verification"]) + "::verification", "true", q(o["updated_at"]) + "::timestamptz"]) + ")"
    for i in range(0, len(orgs), 28):
        n += 1
        (d/f"{n:02d}_orgs.sql").write_text(f"insert into organizations ({cols}) values\n" + ",\n".join(orgrow(o) for o in orgs[i:i+28]) + f"\non conflict (slug) do update set {upd};\n")
    srcs = [(o["slug"], s) for o in orgs for s in o["sources"]]
    for i in range(0, len(srcs), 45):
        n += 1
        (d/f"{n:02d}_src.sql").write_text("insert into sources (org_slug,url,note,fields,retrieved) values\n" + ",\n".join(f"({q(a)},{q(s['url'])},{q(s['note'])},{q(s['fields'])},{q(s['retrieved'])}::date)" for a, s in srcs[i:i+45]) + ";\n")
    for f in sorted(d.glob("*.sql")): print(f.name, len(f.read_text()))
