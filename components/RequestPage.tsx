import Link from "next/link";
import { notFound } from "next/navigation";
import RequestForm from "./RequestForm";
import SiteFooter from "./SiteFooter";
import { getOrg, profilePath } from "@/lib/data";

type OrgRequest = "edit" | "claim" | "removal";

const COPY: Record<OrgRequest, { title: (n: string) => string; intro: string }> = {
  edit: {
    title: (n) => `Suggest an edit to ${n}`,
    intro: "Tell us what's wrong and, ideally, link a public page that shows the right answer. A person reviews it before the profile changes.",
  },
  claim: {
    title: (n) => `Claim ${n}`,
    intro: "Work there? Claim the profile to keep it current. An email on the organisation's own domain is approved fastest; other addresses are checked by a person.",
  },
  removal: {
    title: (n) => `Request removal from ${n}`,
    intro: "Ask us to remove the location, a detail, or the whole listing. Requests about a home address or a person's safety are handled first.",
  },
};

export default async function RequestPage({ type, slug }: { type: OrgRequest; slug: string }) {
  const org = await getOrg(slug);
  if (!org) notFound();
  const domain = org.website?.replace(/^https?:\/\/(www\.)?/, "").replace(/\/.*$/, "");
  return (
    <main id="main" className="page">
      <nav className="crumbs">
        <Link href="/">Map</Link>/<Link href={profilePath(org)}>{org.name}</Link>/<span>{type}</span>
      </nav>
      <h1>{COPY[type].title(org.name)}</h1>
      <p className="lede">{COPY[type].intro}</p>
      <RequestForm
        type={type}
        slug={org.slug}
        emailHint={type === "claim" && domain ? `Use an @${domain} address for the quickest review. Never published.` : undefined}
      />
      <SiteFooter />
    </main>
  );
}
