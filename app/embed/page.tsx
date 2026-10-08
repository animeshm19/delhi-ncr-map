import type { Metadata } from "next";
import MapExplorer from "@/components/MapExplorer";
import { AREAS, getOrgs } from "@/lib/data";
import { toExplorer } from "@/lib/explorer";
import { SITE_NAME, SITE_URL } from "@/lib/site";

// The map alone, for <iframe> embeds. Frameable (see next.config.ts); filters come from the URL:
//   /embed?sector=fintech  /embed?station=cyber-city&r=1000  /embed?hiring=1
export const revalidate = 3600;
export const metadata: Metadata = {
  title: `Map · ${SITE_NAME}`,
  robots: { index: false },
  alternates: { canonical: "/" },
};

export default async function Embed() {
  return (
    <main id="main">
      <MapExplorer orgs={toExplorer(await getOrgs())} areas={AREAS} embedded siteUrl={SITE_URL} />
    </main>
  );
}
