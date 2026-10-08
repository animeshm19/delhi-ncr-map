import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import OwnerForms from "../OwnerForms";
import SiteFooter from "@/components/SiteFooter";
import { requireUser } from "@/lib/auth";
import { logoUrl } from "@/lib/logos";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Manage profile", robots: { index: false } };

export default async function ManageProfile({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const { sb } = await requireUser(`/account/${slug}`);
  const { data: owns } = await sb.rpc("owns_org", { p_slug: slug });
  if (owns !== true) notFound();
  const { data: org } = await sb
    .from("organizations_public")
    .select("slug, name, one_liner, website, hiring, job_board, logo_path")
    .eq("slug", slug)
    .maybeSingle();
  if (!org) notFound();
  const logo = logoUrl(org.logo_path);
  return (
    <main id="main" className="page">
      <nav className="crumbs">
        <Link href="/account">Account</Link>/<span>{org.name}</span>
      </nav>
      <h1>{org.name}</h1>
      <p className="lede">
        Changes appear on <Link href={`/c/${org.slug}`}>the public profile</Link> straight away. Facts like the founding
        year or office location still go through <Link href={`/edit/${org.slug}`}>a reviewed edit</Link>.
      </p>
      {logo && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={logo} alt={`${org.name} logo`} width={72} height={72} className="logo-img" />
      )}
      <OwnerForms org={org} />
      <SiteFooter />
    </main>
  );
}
