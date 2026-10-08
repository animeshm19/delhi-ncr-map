import type { Metadata } from "next";
import Link from "next/link";
import SiteFooter from "@/components/SiteFooter";
import { requireAdmin } from "@/lib/auth";
import { AREAS, getOrgs } from "@/lib/data";
import { SECTORS } from "@/lib/taxonomy";
import { approveClaim, approveSubmission, applyEdit, reject, setHiring, syncJobsNow } from "./actions";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Review queue", robots: { index: false } };

type Req = {
  id: number;
  type: string;
  org_slug: string | null;
  payload: Record<string, string>;
  contact: string;
  domain_match: boolean | null;
  status: string;
  created_at: string;
  reviewed_by: string | null;
  reviewed_at: string | null;
  review_note: string | null;
};

const EDIT_FIELD: Record<string, string> = {
  description: "one_liner",
  website: "website",
  sector: "sectors",
  founded: "founded_year",
  location: "area",
  status: "status",
  funding: "funding_note",
};

function slugify(s: string) {
  return s.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80);
}

function Payload({ p }: { p: Record<string, string> }) {
  return (
    <dl className="details compact">
      {Object.entries(p).map(([k, v]) => (
        <div key={k} style={{ display: "contents" }}>
          <dt>{k.replace(/_/g, " ")}</dt>
          <dd>{/^https?:\/\//.test(v) ? <a href={v} rel="noopener noreferrer nofollow" target="_blank">{v}</a> : v}</dd>
        </div>
      ))}
    </dl>
  );
}

function RejectForm({ id }: { id: number }) {
  return (
    <form action={reject} className="inline-form">
      <input type="hidden" name="id" value={id} />
      <input name="note" placeholder="Reason (kept private)" maxLength={500} aria-label="Reason for rejecting" />
      <button className="btn ghost" type="submit">Reject</button>
    </form>
  );
}

export default async function Admin({ searchParams }: { searchParams: Promise<{ done?: string; error?: string }> }) {
  const { sb, user } = await requireAdmin();
  const sp = await searchParams;
  const [{ data: pending }, { data: recent }] = await Promise.all([
    sb.from("review_queue").select("*").eq("status", "pending").order("created_at").limit(100),
    sb.from("review_queue").select("*").neq("status", "pending").order("reviewed_at", { ascending: false }).limit(15),
  ]);
  const reqs = (pending ?? []) as Req[];
  const companies = (await getOrgs()).filter((o) => o.kind === "company");
  const withBoards = companies.filter((o) => o.job_board);
  return (
    <main id="main" className="page wide">
      <nav className="crumbs"><Link href="/account">Account</Link>/<span>Review queue</span></nav>
      <h1>Review queue</h1>
      <p className="lede">
        {reqs.length} pending. Signed in as {user.email}. Check each request against a public source before approving;
        every action is logged.
      </p>
      {sp.done && <p className="success" role="status">{sp.done}</p>}
      {sp.error && <p className="error" role="alert">{sp.error}</p>}

      {reqs.map((r) => (
        <section key={r.id} className="card review" data-testid={`request-${r.id}`}>
          <header className="review-head">
            <span className={`badge type-${r.type}`}>{r.type}</span>
            {r.org_slug && <Link href={`/c/${r.org_slug}`}>{r.org_slug}</Link>}
            <span className="muted">#{r.id} · {new Date(r.created_at).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })}</span>
          </header>
          <p className="muted">
            From {r.contact}
            {r.type === "claim" && (r.domain_match ? <span className="badge ok"> email matches the company&apos;s domain</span> : <span className="badge warn"> email is not on the company&apos;s domain</span>)}
          </p>
          <Payload p={r.payload} />

          {r.type === "submit" && (
            <form action={approveSubmission} className="form grid2">
              <input type="hidden" name="id" value={r.id} />
              <label><span>Slug</span><input name="slug" required defaultValue={slugify(r.payload.company_name ?? "")} pattern="[a-z0-9][a-z0-9-]*[a-z0-9]" /></label>
              <label><span>Name</span><input name="name" required defaultValue={r.payload.company_name ?? ""} maxLength={120} /></label>
              <label><span>Kind</span>
                <select name="kind" defaultValue="company">
                  {["company", "accelerator", "investor", "coworking", "university_research", "government_program", "community_group"].map((k) => <option key={k} value={k}>{k}</option>)}
                </select>
              </label>
              <label><span>Sectors (comma separated)</span><input name="sectors" defaultValue={r.payload.sector ?? ""} list="sector-list" /></label>
              <label><span>City</span><input name="municipality" defaultValue={r.payload.city ?? "Gurugram"} maxLength={60} /></label>
              <label><span>Area (only if a public office address confirms it)</span>
                <select name="area" defaultValue="">
                  <option value="">Not on the map yet</option>
                  {AREAS.filter((a) => a.slug !== "gurugram").map((a) => <option key={a.slug} value={a.slug}>{a.name}</option>)}
                </select>
              </label>
              <label className="span2"><span>One-liner</span><input name="one_liner" defaultValue={r.payload.description ?? ""} maxLength={280} /></label>
              <label><span>Website</span><input name="website" type="url" defaultValue={r.payload.website ?? ""} /></label>
              <label><span>Source you checked</span><input name="source" type="url" defaultValue={r.payload.source ?? r.payload.website ?? ""} required /></label>
              <div className="span2 actions">
                <button className="btn" type="submit">Publish</button>
              </div>
            </form>
          )}

          {(r.type === "edit" || r.type === "removal") && r.org_slug && (
            <form action={applyEdit} className="form grid2">
              <input type="hidden" name="id" value={r.id} />
              <input type="hidden" name="slug" value={r.org_slug} />
              <label><span>Field</span>
                <select name="field" defaultValue={r.type === "removal" ? (r.payload.what === "listing" ? "published" : r.payload.what === "location" ? "area" : "") : EDIT_FIELD[r.payload.field] ?? ""}>
                  <option value="" disabled>Choose…</option>
                  {["name", "one_liner", "website", "founded_year", "sectors", "status", "funding_note", "area", "municipality", "published"].map((f) => <option key={f} value={f}>{f}</option>)}
                </select>
              </label>
              <label><span>New value</span><input name="value" defaultValue={r.type === "removal" ? (r.payload.what === "listing" ? "false" : "") : r.payload.correct_value ?? ""} maxLength={300} /></label>
              <label className="span2"><span>Source (required for name, year, status, funding, location)</span><input name="source" type="url" defaultValue={r.payload.source ?? ""} /></label>
              <div className="span2 actions"><button className="btn" type="submit">Apply change</button></div>
            </form>
          )}

          {r.type === "claim" && (
            <form action={approveClaim} className="actions">
              <input type="hidden" name="id" value={r.id} />
              <button className="btn" type="submit">Approve claim</button>
            </form>
          )}
          <RejectForm id={r.id} />
        </section>
      ))}
      {reqs.length === 0 && <p className="card muted">Nothing waiting. 🎉</p>}

      <datalist id="sector-list">
        {Object.keys(SECTORS).map((s) => <option key={s} value={s} />)}
      </datalist>

      <h2 id="hiring">Hiring details</h2>
      <p className="muted">
        Set a company&apos;s public job board (read every morning) or careers page. Check the board belongs to the company first.
      </p>
      <form action={setHiring} className="form grid2 card" data-testid="admin-hiring">
        <label><span>Company</span>
          <select name="slug" required defaultValue="">
            <option value="" disabled>Choose…</option>
            {companies.map((o) => <option key={o.slug} value={o.slug}>{o.name}</option>)}
          </select>
        </label>
        <label><span>Hiring</span>
          <select name="hiring" defaultValue="">
            <option value="">Leave as is</option>
            <option value="yes">Yes</option>
            <option value="no">No</option>
          </select>
        </label>
        <label><span>Job board</span>
          <select name="job_board_provider" defaultValue="">
            <option value="">None</option>
            <option value="greenhouse">Greenhouse</option>
            <option value="lever">Lever</option>
            <option value="ashby">Ashby</option>
          </select>
        </label>
        <label><span>Board handle</span><input name="job_board_handle" maxLength={80} pattern="[A-Za-z0-9_.\-]*" placeholder="e.g. acme in jobs.lever.co/acme" /></label>
        <label className="span2"><span>Careers page</span><input name="careers_url" type="url" placeholder="https://" /></label>
        <div className="span2 actions"><button className="btn" type="submit">Save hiring details</button></div>
      </form>
      <form action={syncJobsNow} className="actions">
        <button className="btn ghost" type="submit">Read all job boards now</button>
        <span className="muted">
          {withBoards.length} boards:{" "}
          {withBoards.map((o) => `${o.name} (${o.open_roles ?? 0} roles${o.jobs_checked_at ? `, read ${o.jobs_checked_at.slice(0, 10)}` : ", not read yet"})`).join(" · ") || "none yet"}
        </span>
      </form>

      <h2>Recently reviewed</h2>
      <ul className="sources">
        {((recent ?? []) as Req[]).map((r) => (
          <li key={r.id}>
            #{r.id} {r.type} {r.org_slug ?? r.payload.company_name} — <b>{r.status}</b>
            <small>{r.reviewed_by} · {r.reviewed_at && new Date(r.reviewed_at).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })}{r.review_note ? ` · ${r.review_note}` : ""}</small>
          </li>
        ))}
      </ul>
      <SiteFooter />
    </main>
  );
}
