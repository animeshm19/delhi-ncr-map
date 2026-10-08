import MapExplorer from "@/components/MapExplorer";
import { AREAS, getOrgs } from "@/lib/data";
import { toExplorer } from "@/lib/explorer";

export const revalidate = 3600;

export default async function Home() {
  return (
    <main id="main">
      <MapExplorer orgs={toExplorer(await getOrgs())} areas={AREAS} />
    </main>
  );
}
