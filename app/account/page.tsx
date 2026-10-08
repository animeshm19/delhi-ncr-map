import type { Metadata } from "next";
import Link from "next/link";
import SiteFooter from "@/components/SiteFooter";
import { requireUser } from "@/lib/auth";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Your account", robots: { index: false } };

export default async function Account({ searchParams }: { searchParams: Promise<{ denied?: string }> }) {
  const { sb, user } = await requireUser("/account");
  const sp = await searchParams;
  const [{ data: owned }, { data: isAdmin }] = await Promise.all([
    sb.from("company_owners").select("org_slug, organizations(name)").order("org_slug"),
    sb.rpc("is_admin"),
  ]);
  return (
    <main id="main" className="page">
      <nav className="crumbs"><Link href="/">Map</Link>/<span>Account</span></nav>
      <h1>Your account</h1>
      <p className="lede">Signed in as {user.email}.</p>
      {sp.denied && <p className="error" role="alert">That page is for reviewers only.</p>}
      {isAdmin === true && (
        <p>
          <Link className="btn" href="/admin">Open the review queue →</Link>
        </p>
      )}
      <h2>Profiles you manage</h2>
      {owned && owned.length > 0 ? (
        <ul className="sources">
          {owned.map((o) => {
            const name = (o.organizations as unknown as { name: string } | null)?.name ?? o.org_slug;
            return (
              <li key={o.org_slug}>
                <Link href={`/account/${o.org_slug}`}>{name}</Link>
                <small>Edit the description, website, hiring status, job board and logo.</small>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="muted">
          None yet. Find your company in the <Link href="/directory">directory</Link> and choose &ldquo;Claim this
          profile&rdquo;. Once a reviewer approves it, it appears here.
        </p>
      )}
      <form action="/signout" method="post" style={{ marginTop: 32 }}>
        <button className="btn ghost" type="submit">Sign out</button>
      </form>
      <SiteFooter />
    </main>
  );
}
