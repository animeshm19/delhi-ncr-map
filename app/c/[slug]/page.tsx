import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Profile from "@/components/Profile";
import { getOrg, getOrgs } from "@/lib/data";
import { sectorLabel } from "@/lib/taxonomy";

export const revalidate = 3600;

type Params = { params: Promise<{ slug: string }> };

export async function generateStaticParams() {
  return (await getOrgs()).filter((o) => o.kind === "company").map((o) => ({ slug: o.slug }));
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const org = await getOrg((await params).slug);
  if (!org) return {};
  const sector = org.sectors[0] ? `${sectorLabel(org.sectors[0])} ` : "";
  return {
    title: `${org.name}: Gurugram ${sector}startup`,
    description: org.one_liner ?? undefined,
    alternates: { canonical: `/c/${org.slug}` },
  };
}

export default async function CompanyPage({ params }: Params) {
  const org = await getOrg((await params).slug);
  if (!org || org.kind !== "company") notFound();
  return <Profile org={org} />;
}
