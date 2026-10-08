import type { Metadata } from "next";
import Link from "next/link";
import SiteFooter from "@/components/SiteFooter";
import { getOrgs } from "@/lib/data";
import { SITE_NAME } from "@/lib/site";

export const revalidate = 3600;
export const metadata: Metadata = { title: "Open data" };

export default async function DataPage() {
  const orgs = await getOrgs();
  const pinned = orgs.filter((o) => o.lng != null).length;
  const sources = orgs.reduce((n, o) => n + o.sources.length, 0);
  const files = [
    { href: "/data/organizations.csv", label: "Organisations (CSV)", count: `${orgs.length} rows` },
    { href: "/data/organizations.geojson", label: "Organisations (GeoJSON)", count: `${pinned} points` },
    { href: "/data/sources.csv", label: "Sources (CSV)", count: `${sources} rows` },
  ];
  return (
    <main id="main" className="page">
      <nav className="crumbs"><Link href="/">Map</Link>/<span>Open data</span></nav>
      <h1>The map&apos;s data is yours to use</h1>
      <p className="lede">
        Every organisation, where it is, what it&apos;s connected to and the public source of each fact, under CC BY 4.0.
        Rebuilt hourly from the live map.
      </p>
      <h2>Downloads</h2>
      <ul className="sources">
        {files.map((f) => (
          <li key={f.href}>
            <a href={f.href}>{f.label}</a>
            <small>{f.href} · {f.count}</small>
          </li>
        ))}
      </ul>
      <h2>Licence</h2>
      <p>
        Credit it as &ldquo;{SITE_NAME}, CC BY 4.0&rdquo;. Descriptions quoted from organisations&apos; own
        sites and their logos are left out, because they aren&apos;t ours to license.
      </p>
      <SiteFooter />
    </main>
  );
}
