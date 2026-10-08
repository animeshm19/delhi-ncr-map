import type { Metadata } from "next";
import Link from "next/link";
import SiteFooter from "@/components/SiteFooter";
import { getOrgs } from "@/lib/data";
import { SITE_NAME, SITE_URL } from "@/lib/site";

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
      <h2 id="embed">Embed the map</h2>
      <p>Put a live map on your own site. Filters work in the URL: a sector, a metro station and radius, or hiring only.</p>
      <pre className="snippet" data-testid="embed-snippet">{`<iframe src="${SITE_URL}/embed?sector=fintech"
  width="100%" height="480" style="border:0;border-radius:10px"
  title="${SITE_NAME}" loading="lazy"></iframe>`}</pre>
      <p className="muted">
        Other examples: <code>/embed?station=cyber-city&amp;r=1000</code>, <code>/embed?hiring=1</code>,{" "}
        <code>/embed?layer=support</code>.
      </p>

      <h2 id="badge">Badge for your company&apos;s site</h2>
      <p>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/badge/spinny" alt={`Spinny on ${SITE_NAME}`} height={22} />{" "}
        Swap in your profile&apos;s slug (the end of its address). Add <code>?theme=light</code> on light backgrounds.
      </p>
      <pre className="snippet">{`<a href="${SITE_URL}/c/YOUR-SLUG"><img src="${SITE_URL}/badge/YOUR-SLUG"
  alt="On ${SITE_NAME}" height="22"></a>`}</pre>

      <h2 id="feeds">Feeds and AI assistants</h2>
      <ul className="sources">
        <li><a href="/feed.xml">RSS</a><small>New companies and events</small></li>
        <li><a href="/events.ics">Events calendar (.ics)</a><small>Subscribe in Google Calendar, Outlook or Apple Calendar</small></li>
        <li>
          <code>{`${SITE_URL}/api/mcp`}</code>
          <small>
            A read-only MCP server: add it to an AI assistant as a remote MCP server to search companies, find
            them near a metro station, list open roles and events, and get ecosystem stats.
          </small>
        </li>
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
