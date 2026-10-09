import Link from "next/link";
import { anchorOf, getArea, getJobs, getOrgs, profilePath } from "@/lib/data";
import { formatDistance, lineOf, stationsByDistance, walkMinutes } from "@/lib/metro";
import { KINDS, sectorLabel } from "@/lib/taxonomy";
import type { Org } from "@/lib/types";
import { orgLogo } from "@/lib/logos";
import { sectorColor } from "@/lib/taxonomy";
import OrgLogo from "./OrgLogo";
import ShareCard from "./ShareCard";
import SaveButton from "./SaveButton";
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
  const [all, allJobs] = await Promise.all([getOrgs(), getJobs()]);
  const roles = allJobs.filter((j) => j.org_slug === org.slug);
  const anchor = anchorOf(org);
  const nearby = anchor ? stationsByDistance(anchor[0], anchor[1]).filter((n) => n.meters <= 3000).slice(0, 2) : [];
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
      <div className="profile-head">
        <OrgLogo name={org.name} src={orgLogo(org)} size={64} color={org.kind === "company" ? sectorColor(org.sectors[0]) : KINDS[org.kind].color} eager />
        <h1>{org.name}</h1>
      </div>
      {org.one_liner && <p className="lede">{org.one_liner}</p>}
      <div className="actions">
        {org.website && (
          <a href={org.website} rel="noopener">{org.website.replace(/^https?:\/\/(www\.)?/, "")}</a>
        )}
        {org.lng != null && <Link href={`/?c=${org.slug}`}>View on the map</Link>}
        <SaveButton slug={org.slug} name={org.name} variant="btn" />
        <ShareCard
          query={`c=${org.slug}`}
          link={profilePath(org)}
          caption={`${org.name} is on delhincr-map 📍 ${[area?.name, org.municipality].filter(Boolean).join(", ")}${org.one_liner ? `\n\n${org.one_liner}` : ""}\n\nEvery startup in Delhi NCR on one free map 👇`}
          fileName={`delhincr-map-${org.slug}`}
          label="Share as an image"
          className="btn ghost small"
        />
      </div>

      <h2>Details</h2>
      <dl className="details">
        <dt>Location</dt>
        <dd>
          {org.address ?? (area ? <><Link href={`/area/${area.slug}`}>{area.name}</Link>, {org.municipality}</> : org.municipality)}
          <br />
          <small className="muted">{PRECISION_LABEL[org.location_precision]}</small>
        </dd>
        {nearby.length > 0 && (
          <>
            <dt>Nearest metro</dt>
            <dd data-testid="nearest-metro">
              {nearby.map((n, i) => (
                <span key={n.station.id}>
                  {i > 0 && <br />}
                  <Link href={`/?station=${n.station.id}&r=1000`}>{n.station.name}</Link>{" "}
                  <span className="muted">
                    ({n.station.lines.map((l) => lineOf(l)?.name).join(", ")}) · {formatDistance(n.meters)}, about {walkMinutes(n.meters)} min walk
                  </span>
                </span>
              ))}
              <br />
              <small className="muted">
                Straight-line distance from {org.location_precision === "area" ? "the centre of the sector" : "the office"}; walking time is an estimate.
              </small>
            </dd>
          </>
        )}
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
              <small className="muted">Total disclosed funding, as given by the list it comes from (see sources)</small>
            </dd>
          </>
        )}
        <dt>Hiring</dt>
        <dd>
          {org.hiring == null ? <span className="muted">Unknown</span> : org.hiring ? <span className="badge hiring">Hiring</span> : "No open roles"}
          {roles.length > 0 && <> · <a href="#roles">{roles.length} open {roles.length === 1 ? "role" : "roles"}</a></>}
          {org.careers_url && <> · <a href={org.careers_url} rel="noopener nofollow">Careers page</a></>}
          {org.jobs_checked_at && (
            <>
              <br />
              <small className="muted">Read from their {org.job_board?.provider ?? "job"} board on {org.jobs_checked_at.slice(0, 10)}</small>
            </>
          )}
        </dd>
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

      {roles.length > 0 && (
        <>
          <h2 id="roles">Open roles ({roles.length})</h2>
          <ul className="roles">
            {roles.slice(0, 25).map((r) => (
              <li key={r.url} className="role">
                <div>
                  <a href={r.url} rel="noopener nofollow" target="_blank" className="role-title">{r.title}</a>
                  <div className="muted">{[r.team, r.location].filter(Boolean).join(" · ")}</div>
                </div>
                {r.posted && <time dateTime={r.posted} className="muted">{r.posted}</time>}
              </li>
            ))}
          </ul>
          {roles.length > 25 && <p><Link href="/hiring">All {roles.length} roles on the hiring board</Link></p>}
        </>
      )}

      {connections.length > 0 && (
        <>
          <h2>Connections ({connections.length})</h2>
          <ul>
            {connections.map((c) => (
              <li key={c.slug}>
                <Link href={profilePath(c)} className="name-cell">
                  <OrgLogo name={c.name} src={orgLogo(c)} size={28} />
                  {c.name}
                </Link>
              </li>
            ))}
          </ul>
        </>
      )}

      {similar.length > 0 && (
        <>
          <h2>Similar</h2>
          <ul>
            {similar.map((s) => (
              <li key={s.slug}>
                <Link href={profilePath(s)} className="name-cell">
                  <OrgLogo name={s.name} src={orgLogo(s)} size={28} />
                  {s.name}
                </Link>{" "}
                <span className="muted">· {s.municipality}</span>
              </li>
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
        <Link href={`/edit/${org.slug}`} className="btn ghost small">Suggest an edit</Link>
        <Link href={`/claim/${org.slug}`} className="btn ghost small">Claim this profile</Link>
        <Link href={`/removal/${org.slug}`} className="btn ghost small">Request removal</Link>
      </div>
      <SiteFooter />
    </main>
  );
}
