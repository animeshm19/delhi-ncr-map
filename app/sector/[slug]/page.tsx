import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import OrgTable from "@/components/OrgTable";
import SiteFooter from "@/components/SiteFooter";
import { getOrgs } from "@/lib/data";
import { SECTORS } from "@/lib/taxonomy";
import { REGION } from "@/lib/site";

export const revalidate = 3600;
type Params = { params: Promise<{ slug: string }> };

export function generateStaticParams() {
  return Object.keys(SECTORS).map((slug) => ({ slug }));
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const s = SECTORS[(await params).slug];
  return s ? { title: `${s.label} startups in ${REGION}` } : {};
}

export default async function SectorPage({ params }: Params) {
  const slug = (await params).slug;
  const sector = SECTORS[slug];
  if (!sector) notFound();
  const orgs = (await getOrgs()).filter((o) => o.sectors.includes(slug));
  return (
    <main id="main" className="page wide">
      <nav className="crumbs"><Link href="/">Map</Link>/<Link href="/directory">Directory</Link>/<span>{sector.label}</span></nav>
      <h1>
        <span className="dot" style={{ background: sector.color, width: 14, height: 14, marginRight: 10 }} />
        {sector.label} in {REGION}
      </h1>
      <p className="lede">{orgs.length} organisations.</p>
      {orgs.length ? <OrgTable orgs={orgs} /> : <p className="muted">None listed yet.</p>}
      <SiteFooter />
    </main>
  );
}
