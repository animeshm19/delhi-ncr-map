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
        community groups. IT-services shops, agencies and multinationals with only a sales office are left out; so are
        airlines, hotel owners and consumer brands without a tech product. Exclusions are recorded with their
        reasons in the project&apos;s data notes.
      </p>

      <h2>How the data is collected</h2>
      <ul>
        <li><b>Who&apos;s listed.</b> Every organisation comes from a public list that places it in Gurugram: Inc42&apos;s
          Gurugram startup lists (overall, fintech, edtech, healthtech, AI, ecommerce, enterprise tech), Seedtable,
          Wikipedia, and news of funding rounds. Sector and founding year come from the same lists.</li>
        <li><b>Where they are.</b> An office location comes from public records: the company&apos;s Haryana GST
          registration (place of business), its company-registry filing, or its own contact page. Each one is linked
          on the profile, with the date it was read.</li>
        <li><b>Fields stay empty when no source states them.</b> A thin, true entry beats a rich, invented one. Where
          a list gave no description, the profile has none.</li>
        <li><b>Polite crawling.</b> Sites&apos; robots.txt rules are respected. LinkedIn, Crunchbase and Tracxn are
          never scraped.</li>
      </ul>

      <h2>Locations and privacy</h2>
      <p>
        Pins mark the <b>sector or business district</b> of a company&apos;s public office (for example Sector 44,
        Udyog Vihar or Golf Course Road), never the street address, so no building can be identified from the map.
        Companies sharing a sector are spread out inside its dashed circle so each pin can be clicked; the circle is
        the honest answer to &ldquo;where&rdquo;. Sector centres are approximate, anchored on metro stations and
        landmarks. Organisations with no public office address found yet are listed but not mapped. The downloads
        give the sector centre, not the display spot.
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
