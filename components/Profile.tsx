import Link from "next/link";
import { getArea, getOrgs, profilePath } from "@/lib/data";
import { KINDS, sectorLabel } from "@/lib/taxonomy";
import type { Org } from "@/lib/types";
import SiteFooter from "./SiteFooter";

const VERIFICATION_LABEL: Record<Org["verification"], string> = {
  unverified: "Unverified",
  community_verified: "Community checked",
  company_claimed: "Claimed",
  admin_verified: "Verified",
};

const PRECISION_LABEL: Record<Org["location_precision"], string> = {
  exact: "Office",
  building: "Shared building",
  area: "Approximate: pinned to the sector, not the street address",
  municipality: "City only, not on the map",
};

export default async function Profile({ org }: { org: Org }) {
  const all = await getOrgs();
  const bySlug = new Map(all.map((o) => [o.slug, o]));
  const area = getArea(org.area);
  const connections = org.connected_to.map((s) => bySlug.get(s)).filter(Boolean) as Org[];
  const similar = all
    .filter((o) => o.slug !== org.slug && o.kind === org.kind && o.sectors.some((s) => org.sectors.includes(s)))
    .slice(0, 6);

  return (
    <main id="main" className="page">
      <nav className="crumbs">
        <Link href="/">Map</Link>/
        {org.sectors[0] ? <Link href={`/sector/${org.sectors[0]}`}>{sectorLabel(org.sectors[0])}</Link> : <span>{KINDS[org.kind].label}</span>}/
        <span>{org.name}</span>
      </nav>

      <p className="muted" style={{ marginTop: 16 }}>
        {KINDS[org.kind].label} · {org.municipality} · <span className="badge">{VERIFICATION_LABEL[org.verification]}</span>
      </p>
      <h1>{org.name}</h1>
      {org.one_liner && <p className="lede">{org.one_liner}</p>}
      <div className="actions">
        {org.website && (
          <a href={org.website} rel="noopener">{org.website.replace(/^https?:\/\/(www\.)?/, "")}</a>
        )}
        {org.lng != null && <Link href={`/?c=${org.slug}`}>View on the map</Link>}
      </div>

      <h2>Details</h2>
      <dl className="details">
        <dt>Location</dt>
        <dd>
          {org.address ?? (area ? <><Link href={`/area/${area.slug}`}>{area.name}</Link>, {org.municipality}</> : org.municipality)}
          <br />
          <small className="muted">{PRECISION_LABEL[org.location_precision]}</small>
        </dd>
        <dt>Founded</dt>
        <dd>{org.founded_year ?? <span className="muted">Not published</span>}</dd>
        <dt>Status</dt>
        <dd style={{ textTransform: "capitalize" }}>
          {org.status}
          {org.acquired_by && bySlug.get(org.acquired_by) && (
            <> by <Link href={profilePath(bySlug.get(org.acquired_by)!)}>{bySlug.get(org.acquired_by)!.name}</Link></>
          )}
        </dd>
        {org.funding_note && (
          <>
            <dt>Funding</dt>
            <dd>
              {org.funding_note}
              <br />
              <small className="muted">Total disclosed funding as reported by Inc42 (see sources)</small>
            </dd>
          </>
        )}
        <dt>Hiring</dt>
        <dd>{org.hiring == null ? <span className="muted">Unknown</span> : org.hiring ? "Yes" : "No open roles"}</dd>
        {org.sectors.length > 0 && (
          <>
            <dt>Sectors</dt>
            <dd>
              {org.sectors.map((s, i) => (
                <span key={s}>
                  {i > 0 && ", "}
                  <Link href={`/sector/${s}`}>{sectorLabel(s)}</Link>
                </span>
              ))}
            </dd>
          </>
        )}
      </dl>

      {connections.length > 0 && (
        <>
          <h2>Connections ({connections.length})</h2>
          <ul>
            {connections.map((c) => (
              <li key={c.slug}><Link href={profilePath(c)}>{c.name}</Link></li>
            ))}
          </ul>
        </>
      )}

      {similar.length > 0 && (
        <>
          <h2>Similar</h2>
          <ul>
            {similar.map((s) => (
              <li key={s.slug}><Link href={profilePath(s)}>{s.name}</Link> <span className="muted">· {s.municipality}</span></li>
            ))}
          </ul>
        </>
      )}

      <h2>Sources ({org.sources.length})</h2>
      <ul className="sources">
        {org.sources.map((s) => (
          <li key={s.url + s.fields.join()}>
            <a href={s.url} rel="noopener">{new URL(s.url).hostname.replace(/^www\./, "")}</a> — {s.note}
            <small>{s.fields.join(", ")} · retrieved {s.retrieved}</small>
          </li>
        ))}
      </ul>

      <h2>Is something wrong?</h2>
      <p className="muted">
        This profile is compiled from public sources and was last updated {org.updated_at}.
      </p>
      <div className="actions">
        <Link href={`/edit/${org.slug}`}>Suggest an edit →</Link>
        <Link href={`/claim/${org.slug}`}>Claim this profile →</Link>
        <Link href={`/removal/${org.slug}`}>Request removal →</Link>
      </div>
      <SiteFooter />
    </main>
  );
}
