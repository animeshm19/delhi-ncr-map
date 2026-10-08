import type { Metadata } from "next";
import Link from "next/link";
import EventList from "@/components/EventList";
import SiteFooter from "@/components/SiteFooter";
import { profilePath } from "@/lib/data";
import { getWeek } from "@/lib/digest";
import { REGION } from "@/lib/site";
import { sectorLabel } from "@/lib/taxonomy";

export const revalidate = 3600;
export const metadata: Metadata = {
  title: `This week in ${REGION} tech`,
  description: `New companies on the map, new roles and the week's events in ${REGION}.`,
  alternates: { canonical: "/this-week", types: { "application/rss+xml": "/feed.xml" } },
};

const fmt = (d: Date) => d.toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata", day: "numeric", month: "short" });

export default async function ThisWeek() {
  const w = await getWeek();
  return (
    <main id="main" className="page wide">
      <nav className="crumbs"><Link href="/">Map</Link>/<span>This week</span></nav>
      <h1>This week in {REGION} tech</h1>
      <p className="lede">
        {fmt(w.from)} – {fmt(w.to)}: {w.newOrgs.length} new on the map, {w.totalNewRoles} new roles, {w.events.length} events
        in the next seven days. <a href="/feed.xml">Follow by RSS</a>.
      </p>

      <h2>Events this week</h2>
      {w.events.length ? <EventList events={w.events} /> : <p className="muted">Nothing listed yet. <Link href="/events/submit">Suggest an event</Link>.</p>}

      <h2>New on the map</h2>
      {w.newOrgs.length ? (
        <ul className="sources" data-testid="new-orgs">
          {w.newOrgs.map((o) => (
            <li key={o.slug}>
              <Link href={profilePath(o)}>{o.name}</Link>
              {o.one_liner && <> — {o.one_liner}</>}
              <small>{[o.sectors.map(sectorLabel).join(", "), o.municipality].filter(Boolean).join(" · ")}</small>
            </li>
          ))}
        </ul>
      ) : (
        <p className="muted">No new organisations this week.</p>
      )}

      <h2>New roles</h2>
      {w.newRoles.length ? (
        <ul className="also-hiring" data-testid="new-roles">
          {w.newRoles.map(({ org, n }) => (
            <li key={org.slug}>
              <Link href={`${profilePath(org)}#roles`}>{org.name}</Link> <span className="muted">· {n} new</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="muted">No new roles from synced job boards this week. See the <Link href="/hiring">hiring board</Link>.</p>
      )}
      <SiteFooter />
    </main>
  );
}
