import type { Metadata } from "next";
import Link from "next/link";
import RequestForm from "@/components/RequestForm";
import SiteFooter from "@/components/SiteFooter";
import { REGION } from "@/lib/site";

export const metadata: Metadata = {
  title: "Submit a company",
  description: `Add a startup, tech company, incubator, investor or community group in ${REGION} to the map.`,
};

export default function SubmitPage() {
  return (
    <main id="main" className="page">
      <nav className="crumbs"><Link href="/">Map</Link>/<span>Submit</span></nav>
      <h1>Submit a company or organisation</h1>
      <p className="lede">
        Missing from the map? Startups, tech companies, incubators, investors, coworking spaces and community groups
        anywhere in {REGION} are welcome. Every submission is checked against public sources before it appears.
      </p>
      <RequestForm type="submit" />
      <SiteFooter />
    </main>
  );
}
