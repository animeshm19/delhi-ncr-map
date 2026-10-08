import "server-only";
import { getEvents, getJobs, getOrgs } from "@/lib/data";
import { addedSinceLaunch } from "@/lib/launch";

const DAY = 24 * 3600_000;

/** What happened in the last 7 days and what's on in the next 7: the "This week" page and the RSS feed. */
export async function getWeek(now = Date.now()) {
  const [orgs, jobs, events] = await Promise.all([
    getOrgs(),
    getJobs(),
    getEvents({ fromIso: new Date(now - 6 * 3600_000).toISOString(), toIso: new Date(now + 7 * DAY).toISOString() }),
  ]);
  const since = now - 7 * DAY;
  const bySlug = new Map(orgs.map((o) => [o.slug, o]));

  const newOrgs = addedSinceLaunch(orgs)
    .filter((o) => Date.parse(o.created_at!) >= since)
    .sort((a, b) => Date.parse(b.created_at!) - Date.parse(a.created_at!));

  const roleCounts = new Map<string, number>();
  for (const j of jobs) if (Date.parse(j.first_seen) >= since) roleCounts.set(j.org_slug, (roleCounts.get(j.org_slug) ?? 0) + 1);
  const newRoles = [...roleCounts]
    .filter(([slug]) => bySlug.has(slug))
    .map(([slug, n]) => ({ org: bySlug.get(slug)!, n }))
    .sort((a, b) => b.n - a.n);

  return { from: new Date(since), to: new Date(now), newOrgs, newRoles, events, totalNewRoles: newRoles.reduce((s, r) => s + r.n, 0) };
}
