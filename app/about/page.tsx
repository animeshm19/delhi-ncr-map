import type { Metadata } from "next";
import Link from "next/link";
import SiteFooter from "@/components/SiteFooter";
import { getOrgs } from "@/lib/data";

export const revalidate = 3600;
export const metadata: Metadata = {
  title: "About and methodology",
  description:
    "How delhincr-map is made: public sources only, every fact linked to its source, no home addresses, corrections open to anyone.",
};

export default async function About() {
  const orgs = await getOrgs();
  const companies = orgs.filter((o) => o.kind === "company").length;
  return (
    <main id="main" className="page">
      <nav className="crumbs"><Link href="/">Map</Link>/<span>About</span></nav>
      <h1>Delhi NCR&apos;s innovation ecosystem, in one place</h1>
      <p className="lede">
        A public, community-owned map and directory of the startups and tech companies in Delhi NCR, and the
        organisations that support them. {orgs.length} organisations listed today, {companies} of them companies.
        Gurugram, Noida and Greater Noida are mapped today; Delhi is next.
      </p>

      <h2>Who&apos;s included</h2>
      <p>
        Every company a public startup list or directory names as based in Gurugram, Noida or Greater Noida, at any
        age, including acquired and closed companies (tagged as such). That covers venture-funded startups, D2C
        brands, software and IT-services firms and digital agencies, each tagged by sector so you can filter. Support
        organisations get their own layer: incubators and accelerators, investors, coworking spaces, universities and
        research labs, government programmes and community groups.
      </p>
      <p>
        Big tech and large companies are listed alongside the startups, not in a separate layer: any company,
        wherever it is headquartered, with an office in Gurugram, Noida or Greater Noida that does tech work there
        (software, data, IT, engineering or R&amp;D, or a global capability centre). Each needs a public page placing
        that office in the city and showing the work. Customer-service-only sites, sales offices and centres that
        are announced but not yet open are left out until a source shows otherwise.
      </p>
      <p>
        Left out: subsidiaries or products of a company already listed; entries that aren&apos;t companies (events, parks, shops, industry bodies); names we can&apos;t
        identify; and traditional businesses with no digital product (property developers, contract manufacturers,
        hotel owners, hospitals, staffing firms). Every exclusion is listed with its reason in{" "}
        <a href="https://github.com/animeshm19/delhi-ncr-map/blob/main/data/EXCLUSIONS.md" rel="noopener">the data notes</a>.
      </p>

      <h2>How the data is collected</h2>
      <ul>
        <li><b>Who&apos;s listed.</b> Every organisation comes from a public list that places it in the region:
          Inc42&apos;s city lists (overall, high-growth, fintech, edtech, healthtech, AI, SaaS, ecommerce, D2C and
          enterprise tech) for Gurugram and Noida; Seedtable; StartupBlink; Y Combinator&apos;s directory; eChai&apos;s
          Startup Grid, which also gives the sector or locality where a team works; Fliarbi; Wellfound; Wikipedia;
          and news of funding rounds. Sector, founding year, funding and the one-line description come from the
          same lists. Where two lists disagree on the city, the headquarters lists (Inc42, Y Combinator, Seedtable)
          win.</li>
        <li><b>Where they are.</b> An office location comes from public records: the company&apos;s state GST
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
        <a href="https://map.techwednesdays.ca">Edmonton Startup Map</a> hosted by Edmonton Tech Wednesdays. Base map
        from <a href="https://openfreemap.org">OpenFreeMap</a>. Every metro and Namo Bharat line, station and track
        shape comes from <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> (© OpenStreetMap
        contributors, ODbL); each station links to its OpenStreetMap entry in the data.
      </p>
      <SiteFooter />
    </main>
  );
}
