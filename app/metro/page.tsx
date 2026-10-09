import type { Metadata } from "next";
import Link from "next/link";
import SiteFooter from "@/components/SiteFooter";
import OrgLogo from "@/components/OrgLogo";
import { orgLogo } from "@/lib/logos";
import { anchorOf, getOrgs, profilePath } from "@/lib/data";
import { haversineMeters } from "@/lib/geo";
import { METRO, formatDistance, getStation } from "@/lib/metro";
import { REGION } from "@/lib/site";

export const revalidate = 3600;
export const metadata: Metadata = {
  title: "Startups by metro station",
  description: `Which ${REGION} startups are within walking distance of each Delhi Metro, Rapid Metro, Noida Metro and Namo Bharat station.`,
  alternates: { canonical: "/metro" },
};

const WALK = 1000;

export default async function Metro() {
  const companies = (await getOrgs()).filter((o) => o.kind === "company");
  const located = companies.map((o) => ({ o, anchor: anchorOf(o) })).filter((x) => x.anchor);

  const near = (id: string) => {
    const s = getStation(id)!;
    return located
      .map(({ o, anchor }) => ({ o, m: haversineMeters(anchor!, [s.lng, s.lat]) }))
      .filter((x) => x.m <= WALK)
      .sort((a, b) => a.m - b.m);
  };

  return (
    <main id="main" className="page wide">
      <nav className="crumbs"><Link href="/">Map</Link>/<span>Metro</span></nav>
      <h1>Startups by metro station</h1>
      <p className="lede">
        Companies within {formatDistance(WALK)} (straight line) of each station. Approximate pins are measured from the
        centre of their sector, so treat these as a guide, not a route.
      </p>

      <nav className="line-jump" aria-label="Lines">
        {METRO.lines.map((line) => (
          <a key={line.slug} href={`#line-${line.slug}`} className="chip">
            <span className="line-swatch" style={{ background: line.color }} aria-hidden /> {line.name}
          </a>
        ))}
      </nav>
      <p className="muted">
        {METRO.stations.length} stations on {METRO.lines.length} lines across Delhi, Gurugram, Noida, Greater Noida,
        Faridabad, Ghaziabad, Bahadurgarh and Meerut.
      </p>

      {METRO.lines.map((line) => (
        <section key={line.slug} aria-labelledby={`line-${line.slug}`}>
          <h2 id={`line-${line.slug}`}>
            <span className="line-swatch" style={{ background: line.color }} aria-hidden /> {line.name}{" "}
            <span className="muted">· {line.operator}</span>
          </h2>
          <p className="muted">
            {line.note} {line.stations.length} stations.{" "}
            {line.source.map((url, i) => (
              <span key={url}>
                {i > 0 && " · "}
                <a href={url} rel="noopener">{line.source.length > 1 ? `Source ${i + 1}` : "Source"}</a>
              </span>
            ))}
          </p>
          <div className="tablewrap">
            <table className="orgs metro-table">
              <thead>
                <tr>
                  <th scope="col">Station</th>
                  <th scope="col">Within {formatDistance(WALK)}</th>
                  <th scope="col">Closest</th>
                </tr>
              </thead>
              <tbody>
                {[...new Set(line.stations)].map((id) => {
                  const s = getStation(id)!;
                  const list = near(id);
                  return (
                    <tr key={id} data-station={id}>
                      <td>
                        <Link href={`/?station=${id}&r=${WALK}`}>{s.name}</Link>
                        {s.lines.length > 1 && <span className="badge">Interchange</span>}
                      </td>
                      <td>{list.length}</td>
                      <td>
                        {list.slice(0, 4).map(({ o, m }, i) => (
                          <span key={o.slug}>
                            {i > 0 && ", "}
                            <Link href={profilePath(o)} className="name-cell inline">
                              <OrgLogo name={o.name} src={orgLogo(o)} size={18} />
                              {o.name}
                            </Link>{" "}
                            <span className="muted">{formatDistance(m)}</span>
                          </span>
                        ))}
                        {list.length > 4 && <span className="muted"> and {list.length - 4} more</span>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      ))}

      <p className="muted">
        Lines, stations and track shapes from OpenStreetMap ({METRO.meta.license}), read {METRO.meta.retrieved}. Each
        station links to its OpenStreetMap entry from the map.
      </p>
      <SiteFooter />
    </main>
  );
}
