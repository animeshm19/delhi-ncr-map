import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import OrgTable from "@/components/OrgTable";
import SiteFooter from "@/components/SiteFooter";
import { AREAS, getArea, getOrgs } from "@/lib/data";

export const revalidate = 3600;
type Params = { params: Promise<{ slug: string }> };

export function generateStaticParams() {
  return AREAS.map((a) => ({ slug: a.slug }));
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const a = getArea((await params).slug);
  return a ? { title: `Startups in ${a.name}, Gurugram` } : {};
}

export default async function AreaPage({ params }: Params) {
  const area = getArea((await params).slug);
  if (!area) notFound();
  const orgs = (await getOrgs()).filter((o) => o.area === area.slug);
  return (
    <main id="main" className="page wide">
      <nav className="crumbs"><Link href="/">Map</Link>/<Link href="/directory">Directory</Link>/<span>{area.name}</span></nav>
      <h1>{area.name}</h1>
      <p className="lede">
        {orgs.length} organisations with a public office in this part of Gurugram. Pins are placed at the area, not the
        street address.
      </p>
      {orgs.length ? <OrgTable orgs={orgs} /> : <p className="muted">None listed yet.</p>}
      <SiteFooter />
    </main>
  );
}
