import type { Metadata } from "next";
import Link from "next/link";
import OrgTable from "@/components/OrgTable";
import SiteFooter from "@/components/SiteFooter";
import { getOrgs } from "@/lib/data";
import { SECTORS } from "@/lib/taxonomy";

export const revalidate = 3600;
export const metadata: Metadata = {
  title: "Directory",
  description: "Every startup, tech company and support organisation on delhincr-map, in one table.",
};

export default async function Directory() {
  const orgs = await getOrgs();
  const companies = orgs.filter((o) => o.kind === "company");
  const support = orgs.filter((o) => o.kind !== "company");
  const sectorCounts = Object.keys(SECTORS)
    .map((s) => [s, companies.filter((o) => o.sectors.includes(s)).length] as const)
    .filter(([, n]) => n > 0)
    .sort((a, b) => b[1] - a[1]);
  return (
    <main id="main" className="page wide">
      <nav className="crumbs"><Link href="/">Map</Link>/<span>Directory</span></nav>
      <h1>Directory</h1>
      <p className="lede">
        {companies.length} companies and {support.length} support organisations.{" "}
        {orgs.filter((o) => o.lng != null).length} are on the map at sector level; the rest are listed until a public
        office address is found.
      </p>
      <p className="actions">
        {sectorCounts.map(([s, n]) => (
          <Link key={s} href={`/sector/${s}`} className="chip">
            {SECTORS[s].label} <span className="muted">{n}</span>
          </Link>
        ))}
      </p>
      <h2>Companies</h2>
      <OrgTable orgs={companies} />
      <h2>Support organisations</h2>
      <OrgTable orgs={support} />
      <SiteFooter />
    </main>
  );
}
