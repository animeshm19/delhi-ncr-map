import type { Metadata } from "next";
import Link from "next/link";
import SavedList from "@/components/SavedList";
import SiteFooter from "@/components/SiteFooter";
import { getOrgs } from "@/lib/data";
import { toExplorer } from "@/lib/explorer";

export const revalidate = 3600;
export const metadata: Metadata = {
  title: "Saved companies",
  description: "Companies you've saved on the map, kept on this device. Share the list, download it, or see it on the map.",
  alternates: { canonical: "/saved" },
  robots: { index: false },
};

export default async function SavedPage() {
  return (
    <main id="main" className="page wide">
      <nav className="crumbs"><Link href="/">Map</Link>/<span>Saved</span></nav>
      <SavedList orgs={toExplorer(await getOrgs())} />
      <SiteFooter />
    </main>
  );
}
