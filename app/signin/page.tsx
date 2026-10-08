import type { Metadata } from "next";
import Link from "next/link";
import SignInForm from "./SignInForm";
import SiteFooter from "@/components/SiteFooter";
import { safeNext } from "@/lib/auth-shared";

export const metadata: Metadata = { title: "Sign in", robots: { index: false } };

export default async function SignIn({ searchParams }: { searchParams: Promise<{ next?: string; error?: string }> }) {
  const sp = await searchParams;
  return (
    <main id="main" className="page">
      <nav className="crumbs"><Link href="/">Map</Link>/<span>Sign in</span></nav>
      <h1>Sign in</h1>
      <p className="lede">
        For people whose claim on a company profile was approved, and for reviewers. We email you a one-time link;
        there&apos;s no password to remember.
      </p>
      {sp.error && <p className="error" role="alert">That sign-in link didn&apos;t work. It may have expired or been used already.</p>}
      <SignInForm next={safeNext(sp.next)} />
      <p className="muted" style={{ marginTop: 24 }}>
        Want to manage a company that&apos;s on the map? <Link href="/directory">Find it</Link> and choose &ldquo;Claim this
        profile&rdquo; first.
      </p>
      <SiteFooter />
    </main>
  );
}
