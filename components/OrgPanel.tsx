"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import type { ExplorerOrg } from "./MapExplorer";
import type { PanelOrg, PanelOrgSummary } from "@/lib/panel-types";
import { KINDS, sectorColor, sectorLabel } from "@/lib/taxonomy";
import { formatDistance } from "@/lib/metro";
import OrgLogo from "./OrgLogo";

const VERIFICATION_LABEL: Record<PanelOrg["verification"], string> = {
  unverified: "Unverified",
  community_verified: "Community checked",
  company_claimed: "Claimed",
  admin_verified: "Verified",
};

// Details already fetched this visit, so going back to a company is instant.
const cache = new Map<string, PanelOrg>();

/**
 * The side panel the map opens when you pick an organisation, like the Edmonton map:
 * what we already know shows straight away, the rest loads in.
 */
export default function OrgPanel({
  org,
  closing,
  onClose,
  onSelect,
  onStation,
}: {
  org: ExplorerOrg;
  closing: boolean;
  onClose: () => void;
  onSelect: (slug: string) => void;
  onStation: (id: string) => void;
}) {
  const [detail, setDetail] = useState<PanelOrg | null>(() => cache.get(org.slug) ?? null);
  const [failed, setFailed] = useState(false);
  const [copied, setCopied] = useState(false);
  const bodyRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bodyRef.current?.scrollTo({ top: 0 });
    setCopied(false);
    setFailed(false);
    const hit = cache.get(org.slug);
    setDetail(hit ?? null);
    if (hit) return;
    const ctrl = new AbortController();
    fetch(`/api/orgs/${encodeURIComponent(org.slug)}`, { signal: ctrl.signal })
      .then((r) => (r.ok ? (r.json() as Promise<PanelOrg>) : Promise.reject(new Error(String(r.status)))))
      .then((d) => {
        cache.set(d.slug, d);
        setDetail(d);
      })
      .catch((e: unknown) => {
        if ((e as Error).name !== "AbortError") setFailed(true);
      });
    return () => ctrl.abort();
  }, [org.slug]);

  const color = org.kind === "company" ? sectorColor(org.sectors[0]) : KINDS[org.kind].color;
  const label = org.kind === "company" ? (org.sectors[0] ? sectorLabel(org.sectors[0]) : "Company") : KINDS[org.kind].label;

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(`${window.location.origin}/?c=${org.slug}`);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      /* clipboard blocked: the address bar already has the link */
    }
  };

  return (
    <aside
      className={`org-panel${closing ? " closing" : ""}`}
      aria-label={`${org.name} details`}
      data-testid="org-panel"
      style={{ "--c": color } as React.CSSProperties}
    >
      <div className="panel-tools">
        <button className="icon-btn" onClick={copyLink} aria-label="Copy a link to this organisation" title="Copy link">
          {copied ? <CheckIcon /> : <LinkIcon />}
        </button>
        <button className="icon-btn" onClick={onClose} aria-label={`Close ${org.name}`} title="Close (Esc)">
          <CloseIcon />
        </button>
      </div>
      {copied && <span className="panel-toast" role="status">Link copied</span>}

      <div className="panel-body" ref={bodyRef}>
        <div className="panel-content" key={org.slug}>
          <header className="panel-head">
            <OrgLogo name={org.name} src={org.logo} size={64} color={color} eager />
            <div>
              <h2>{org.name}</h2>
              <p className="panel-kind">
                <i aria-hidden />
                {org.kind === "company" ? "Company" : KINDS[org.kind].label} · {label}
              </p>
              {detail && <span className="badge verif">{VERIFICATION_LABEL[detail.verification]}</span>}
            </div>
          </header>

          {org.one_liner && <p className="panel-lede">{org.one_liner}</p>}

          <div className="panel-actions">
            <Link href={org.href} className="btn small" prefetch={false}>
              <DocIcon /> Full profile
            </Link>
            {detail?.website && (
              <a href={detail.website} className="btn ghost small" rel="noopener nofollow" target="_blank">
                {detail.website.replace(/^https?:\/\/(www\.)?/, "").replace(/\/$/, "")}
              </a>
            )}
          </div>

          <h3 className="panel-h">Details</h3>
          <dl className="panel-dl">
            <div className="full">
              <dt>Location</dt>
              <dd>
                {detail?.location.areaHref ? (
                  <Link href={detail.location.areaHref} prefetch={false}>{detail.location.text}</Link>
                ) : (
                  detail?.location.text ?? org.place
                )}
                <small>{detail?.location.note ?? (org.precision === "area" ? "Approximate: pinned to the sector" : org.lng == null ? "City only, not on the map" : "")}</small>
              </dd>
            </div>
            {detail && detail.nearest.length > 0 && (
              <div className="full">
                <dt>Nearest metro</dt>
                <dd className="panel-metro">
                  {detail.nearest.map((n) => (
                    <button key={n.id} type="button" className="metro-pill" onClick={() => onStation(n.id)} title={`Companies near ${n.name}`}>
                      <span className="dots" aria-hidden>
                        {n.lines.map((l) => <i key={l.name} style={{ background: l.color }} />)}
                      </span>
                      <span>
                        <b>{n.name}</b>
                        <small>
                          {n.lines.map((l) => l.name).join(" · ")} · {formatDistance(n.meters)}, ~{n.walk} min walk
                        </small>
                      </span>
                    </button>
                  ))}
                </dd>
              </div>
            )}
            <div>
              <dt>Founded</dt>
              <dd>{org.founded ?? <span className="muted">Not published</span>}</dd>
            </div>
            <div>
              <dt>Status</dt>
              <dd className="cap">
                {org.status}
                {detail?.acquiredBy && (
                  <> by <Link href={detail.acquiredBy.href} prefetch={false}>{detail.acquiredBy.name}</Link></>
                )}
              </dd>
            </div>
            {detail?.funding && (
              <div>
                <dt>Funding</dt>
                <dd>
                  {detail.funding}
                  <small>Total disclosed, per its source</small>
                </dd>
              </div>
            )}
            <div>
              <dt>Hiring</dt>
              <dd>
                {org.hiring == null ? <span className="muted">Unknown</span> : org.hiring ? <span className="badge hiring">Hiring</span> : "No open roles"}
                {detail && detail.openRoles > 0 && (
                  <small><Link href={`${org.href}#roles`} prefetch={false}>{detail.openRoles} open {detail.openRoles === 1 ? "role" : "roles"}</Link></small>
                )}
              </dd>
            </div>
            {org.sectors.length > 0 && (
              <div className="full">
                <dt>Sectors</dt>
                <dd className="panel-tags">
                  {org.sectors.map((s) => (
                    <Link key={s} href={`/sector/${s}`} className="tag" prefetch={false}>
                      <i style={{ background: sectorColor(s) }} aria-hidden />
                      {sectorLabel(s)}
                    </Link>
                  ))}
                </dd>
              </div>
            )}
          </dl>

          {!detail && !failed && (
            <div className="panel-skeleton" aria-hidden>
              <span /><span /><span />
            </div>
          )}
          {failed && <p className="muted">Couldn&apos;t load the rest just now. The full profile has everything.</p>}

          {detail && detail.connections.length > 0 && (
            <OrgList title={`Connections (${detail.connections.length})`} items={detail.connections} onSelect={onSelect} />
          )}
          {detail && detail.similar.length > 0 && <OrgList title="Similar" items={detail.similar} onSelect={onSelect} />}

          {detail && (
            <details className="panel-sources">
              <summary>
                <b>Sources ({detail.sources.length})</b>
                <small>Every fact links to a public page.{detail.updated && ` Updated ${detail.updated}.`}</small>
              </summary>
              <ul>
                {detail.sources.map((s) => (
                  <li key={s.url + s.fields.join()}>
                    <a href={s.url} rel="noopener nofollow" target="_blank">{s.host}</a> — {s.note}
                    <small>{s.fields.join(", ")} · read {s.retrieved}</small>
                  </li>
                ))}
              </ul>
            </details>
          )}

          <div className="panel-foot">
            <Link href={`/edit/${org.slug}`} prefetch={false}>Suggest an edit</Link>
            <Link href={`/claim/${org.slug}`} prefetch={false}>Claim this profile</Link>
            <Link href={`/removal/${org.slug}`} prefetch={false}>Request removal</Link>
          </div>
          <p className="panel-note">This listing is compiled from public information only, and every fact links to its source.</p>
        </div>
      </div>
    </aside>
  );
}

function OrgList({ title, items, onSelect }: { title: string; items: PanelOrgSummary[]; onSelect: (slug: string) => void }) {
  return (
    <>
      <h3 className="panel-h">{title}</h3>
      <ul className="panel-orgs">
        {items.map((s) => (
          <li key={s.slug}>
            <a
              href={s.href}
              onClick={(e) => {
                if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
                e.preventDefault();
                onSelect(s.slug);
              }}
            >
              <OrgLogo name={s.name} src={s.logo} size={32} />
              <span>
                <b>{s.name}</b>
                <small>{s.label} · {s.place}</small>
              </span>
            </a>
          </li>
        ))}
      </ul>
    </>
  );
}

const svg = { width: 16, height: 16, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round" as const, strokeLinejoin: "round" as const, "aria-hidden": true };
const LinkIcon = () => (
  <svg {...svg}><path d="M10 13a5 5 0 0 0 7.07 0l3-3a5 5 0 0 0-7.07-7.07l-1.5 1.5" /><path d="M14 11a5 5 0 0 0-7.07 0l-3 3a5 5 0 0 0 7.07 7.07l1.5-1.5" /></svg>
);
const CheckIcon = () => <svg {...svg}><path d="M20 6 9 17l-5-5" /></svg>;
const CloseIcon = () => <svg {...svg}><path d="M18 6 6 18M6 6l12 12" /></svg>;
const DocIcon = () => (
  <svg {...svg} width={14} height={14}><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" /><path d="M14 3v5h5M9 13h6M9 17h6" /></svg>
);
