import type { Metadata } from "next";
import Link from "next/link";
import SiteFooter from "@/components/SiteFooter";
import { anchorOf, getOrgs, profilePath } from "@/lib/data";
import { haversineMeters } from "@/lib/geo";
import { METRO, formatDistance, getStation } from "@/lib/metro";
import { REGION } from "@/lib/site";

export const revalidate = 3600;
export const metadata: Metadata = {
  title: "Startups by metro station",
  description: `Which ${REGION} startups are within walking distance of each Yellow Line, Rapid Metro and Aqua Line station.`,
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

      {METRO.lines.map((line) => (
        <section key={line.slug} aria-labelledby={`line-${line.slug}`}>
          <h2 id={`line-${line.slug}`}>
            <span className="line-swatch" style={{ background: line.color }} aria-hidden /> {line.name}{" "}
            <span className="muted">· {line.operator}</span>
          </h2>
          <p className="muted">
            {line.note} <a href={line.source} rel="noopener">Source</a>
          </p>
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
                          <Link href={profilePath(o)}>{o.name}</Link> <span className="muted">{formatDistance(m)}</span>
                        </span>
                      ))}
                      {list.length > 4 && <span className="muted"> and {list.length - 4} more</span>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </section>
      ))}

      <p className="muted">
        Station locations from each station&apos;s Wikipedia page, read {METRO.stations[0].source.retrieved}. Lines are
        drawn as straight segments between stations.
      </p>
      <SiteFooter />
    </main>
  );
}
