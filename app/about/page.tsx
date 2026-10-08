import type { Metadata } from "next";
import Link from "next/link";
import SiteFooter from "@/components/SiteFooter";
import { getOrgs } from "@/lib/data";

export const revalidate = 3600;
export const metadata: Metadata = {
  title: "About and methodology",
  description:
    "How the Gurugram Startup Map is made: public sources only, every fact linked to its source, no home addresses, corrections open to anyone.",
};

export default async function About() {
  const orgs = await getOrgs();
  const companies = orgs.filter((o) => o.kind === "company").length;
  return (
    <main id="main" className="page">
      <nav className="crumbs"><Link href="/">Map</Link>/<span>About</span></nav>
      <h1>Gurugram&apos;s innovation ecosystem, in one place</h1>
      <p className="lede">
        A public, community-owned map and directory of the startups and tech companies in Gurugram, and the
        organisations that support them. {orgs.length} organisations listed today, {companies} of them companies.
      </p>

      <h2>Who&apos;s included</h2>
      <p>
        Any innovative or tech company headquartered or with a real team in Gurugram, at any age, including acquired
        and closed companies (tagged as such). Support organisations get their own layer: incubators and
        accelerators, investors, coworking spaces, universities and research labs, government programmes and
        community groups. IT-services shops, agencies and multinationals with only a sales office are left out, and
        every exclusion is written down with its reason.
      </p>

      <h2>How the data is collected</h2>
      <ul>
        <li><b>Public sources only.</b> Startup Haryana and DPIIT/Startup India listings, incubator cohorts and
          portfolios, stock-exchange filings, Wikipedia, local tech news and each organisation&apos;s own website.
          Every fact on a profile links to the page it came from, with the date it was read.</li>
        <li><b>Fields stay empty when no source states them.</b> A thin, true entry beats a rich, invented one.</li>
        <li><b>Polite crawling.</b> The crawler identifies itself, follows robots.txt, waits between requests and
          skips sites whose terms forbid automated access. LinkedIn, Crunchbase and Tracxn are never scraped.</li>
      </ul>

      <h2>Locations and privacy</h2>
      <p>
        A pin marks an office only when the address is public <i>and</i> the land use at that point is commercial,
        office, retail or industrial in OpenStreetMap (Gurugram has no open parcel-zoning API like Edmonton&apos;s,
        so OSM land use and building tags stand in). Otherwise the location is approximate: a sector or business
        district, shown as a pin with a faint circle. Organisations known only by city are listed but not mapped.
        <b> A home address is never pinned, even when it&apos;s public</b> — many Indian startups register at a
        founder&apos;s residence, so when in doubt, it counts as a home.
      </p>

      <h2>What &ldquo;verified&rdquo; means</h2>
      <ol>
        <li><b>Unverified</b>: compiled from public sources; most profiles start here.</li>
        <li><b>Community checked</b>: a moderator reviewed it against its sources.</li>
        <li><b>Claimed</b>: someone proved control with an email on the organisation&apos;s own domain.</li>
        <li><b>Verified</b>: checked by the maintainers.</li>
      </ol>

      <h2>Licences and credits</h2>
      <p>
        Code MIT. Dataset CC BY 4.0 (<Link href="/data">download it</Link>). Inspired by the{" "}
        <a href="https://map.techwednesdays.ca">Edmonton Startup Map</a> hosted by Edmonton Tech Wednesdays.
      </p>
      <SiteFooter />
    </main>
  );
}
