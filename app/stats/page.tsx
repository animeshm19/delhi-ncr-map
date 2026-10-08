import type { Metadata } from "next";
import Link from "next/link";
import { BarChart, ColumnChart } from "@/components/Charts";
import SiteFooter from "@/components/SiteFooter";
import { AREAS, getOrgs } from "@/lib/data";
import { REGION } from "@/lib/site";
import { ecosystemStats } from "@/lib/stats";

export const revalidate = 3600;
export const metadata: Metadata = {
  title: "Ecosystem stats",
  description: `${REGION}'s startup ecosystem in numbers: sectors, founding years, neighbourhoods and support organisations.`,
  alternates: { canonical: "/stats" },
};

export default async function Stats() {
  const s = ecosystemStats(await getOrgs(), AREAS);
  const t = s.totals;
  return (
    <main id="main" className="page wide">
      <nav className="crumbs"><Link href="/">Map</Link>/<span>Stats</span></nav>
      <h1>{REGION} in numbers</h1>
      <p className="lede">
        Counted from every published profile, updated hourly. These describe what&apos;s on the map, which grows as
        companies are added; they aren&apos;t a census.
      </p>

      <div className="stats big" data-testid="totals">
        <div className="stat"><b>{t.companies}</b><span>Companies</span></div>
        <div className="stat"><b>{t.support}</b><span>Support orgs</span></div>
        <div className="stat"><b>{t.hiring}</b><span>Hiring</span></div>
        <div className="stat"><b>{t.medianFounded ?? "–"}</b><span>Median founding year</span></div>
      </div>
      <p className="muted">
        {t.pinned} of {t.companies} companies are on the map; the rest are listed until a public office address is found.
        {" "}{t.claimed} profiles are claimed by their companies. Founding year is known for {t.foundedKnown}.
      </p>

      <h2>Companies by sector</h2>
      <p className="muted">A company can be in more than one sector.</p>
      <BarChart data={s.bySector} title="Sector" />

      <h2>Founded by year</h2>
      <ColumnChart data={s.byYear} title="Year founded" />

      {s.byArea.length > 0 && (
        <>
          <h2>Where they are</h2>
          <p className="muted">Companies with a known office sector or business district.</p>
          <BarChart data={s.byArea} title="Area" />
        </>
      )}

      {s.byCity.length > 1 && (
        <>
          <h2>By city</h2>
          <BarChart data={s.byCity} title="City" />
        </>
      )}

      <h2>Support organisations</h2>
      <BarChart data={s.support} title="Kind" unit="organisations" />

      <p className="muted">
        Want the raw numbers? Everything here comes from the <Link href="/data">open data</Link> (CC BY 4.0).
      </p>
      <SiteFooter />
    </main>
  );
}
