import { getEvents, getOrgs, profilePath } from "@/lib/data";
import { addedSinceLaunch } from "@/lib/launch";
import { buildRss, type FeedItem } from "@/lib/rss";
import { REGION, SITE_NAME, SITE_URL } from "@/lib/site";
import { formatEventTime } from "@/lib/time";

// New organisations and newly listed events, newest first.
export const revalidate = 3600;

export async function GET() {
  const [orgs, events] = await Promise.all([getOrgs(), getEvents({ limit: 100 })]);
  const items: FeedItem[] = [
    ...addedSinceLaunch(orgs).map((o) => ({
        title: `New on the map: ${o.name}`,
        link: `${SITE_URL}${profilePath(o)}`,
        guid: `org-${o.slug}`,
        date: new Date(o.created_at!),
        description: o.one_liner,
        category: "Companies",
      })),
    ...events.map((e) => ({
      title: `Event: ${e.title}`,
      link: `${SITE_URL}/events`,
      guid: `event-${e.id}`,
      date: new Date(e.created_at),
      description: [formatEventTime(new Date(e.starts_at), e.ends_at ? new Date(e.ends_at) : null), e.venue, e.city, e.description]
        .filter(Boolean)
        .join(" · "),
      category: "Events",
    })),
  ]
    .sort((a, b) => b.date.getTime() - a.date.getTime())
    .slice(0, 50);

  const body = buildRss({
    title: SITE_NAME,
    link: `${SITE_URL}/this-week`,
    self: `${SITE_URL}/feed.xml`,
    description: `New startups and tech events in ${REGION}.`,
    items,
  });
  return new Response(body, { headers: { "content-type": "application/rss+xml; charset=utf-8" } });
}
