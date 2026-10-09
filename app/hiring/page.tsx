import { orgLogo } from "@/lib/logos";
import type { Metadata } from "next";
import Link from "next/link";
import HiringBoard, { type BoardRole } from "@/components/HiringBoard";
import SiteFooter from "@/components/SiteFooter";
import { getJobs, getOrgs, profilePath } from "@/lib/data";
import { SECTORS } from "@/lib/taxonomy";
import { REGION } from "@/lib/site";

export const revalidate = 3600;
export const metadata: Metadata = {
  title: "Hiring",
  description: `Open roles at ${REGION} startups, read daily from their public job boards.`,
  alternates: { canonical: "/hiring" },
};

const WEEK = 7 * 24 * 3600 * 1000;

export default async function Hiring() {
  const [orgs, jobs] = await Promise.all([getOrgs(), getJobs()]);
  const bySlug = new Map(orgs.map((o) => [o.slug, o]));
  const now = Date.now();

  const roles: BoardRole[] = jobs
    .filter((j) => bySlug.has(j.org_slug))
    .map((j) => {
      const o = bySlug.get(j.org_slug)!;
      return {
        title: j.title,
        team: j.team,
        location: j.location,
        url: j.url,
        posted: j.posted,
        isNew: now - new Date(j.first_seen).getTime() < WEEK,
        company: { slug: o.slug, name: o.name, sectors: o.sectors, logo: orgLogo(o) },
      };
    });

  const synced = new Set(roles.map((r) => r.company.slug));
  // Hiring, but on a job system we can't read (Keka, Darwinbox, Zoho…): link to their careers page.
  const elsewhere = orgs
    .filter((o) => o.hiring && !synced.has(o.slug))
    .sort((a, b) => a.name.localeCompare(b.name));
  const usedSectors = Object.keys(SECTORS)
    .filter((s) => roles.some((r) => r.company.sectors.includes(s)))
    .map((s) => ({ slug: s, label: SECTORS[s].label }));

  return (
    <main id="main" className="page wide">
      <nav className="crumbs"><Link href="/">Map</Link>/<span>Hiring</span></nav>
      <h1>Hiring in {REGION}</h1>
      <p className="lede">
        {roles.length} open roles at {synced.size} companies, read once a day from their public Greenhouse, Lever and
        Ashby job boards. Every role links to the company&apos;s own posting.
      </p>
      {roles.length > 0 ? (
        <HiringBoard roles={roles} sectors={usedSectors} />
      ) : (
        <p className="muted">No synced job boards yet.</p>
      )}

      {elsewhere.length > 0 && (
        <>
          <h2>Also hiring</h2>
          <p className="muted">These companies list roles on their own careers pages.</p>
          <ul className="also-hiring">
            {elsewhere.map((o) => (
              <li key={o.slug}>
                <Link href={profilePath(o)}>{o.name}</Link>
                {o.careers_url && (
                  <>
                    {" · "}
                    <a href={o.careers_url} rel="noopener nofollow">Careers page</a>
                  </>
                )}
              </li>
            ))}
          </ul>
        </>
      )}

      <h2>Add your roles</h2>
      <p>
        If you run a company on the map, <Link href="/account">sign in</Link> after <Link href="/directory">claiming its
        profile</Link> and add your Greenhouse, Lever or Ashby board, or a link to your careers page. Roles appear the
        next morning.
      </p>
      <SiteFooter />
    </main>
  );
}
