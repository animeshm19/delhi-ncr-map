"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import type { ExplorerOrg } from "./MapExplorer";
import OrgLogo from "./OrgLogo";
import SaveButton from "./SaveButton";
import { addSaved, clearSaved, removeSaved, useSaved } from "@/lib/saved";
import { KINDS, sectorColor, sectorLabel } from "@/lib/taxonomy";

const SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/;

/** Your saved companies, or a list someone shared with you (/saved?ids=a,b,c). */
export default function SavedList({ orgs }: { orgs: ExplorerOrg[] }) {
  const saved = useSaved();
  const bySlug = useMemo(() => new Map(orgs.map((o) => [o.slug, o])), [orgs]);
  const [shared, setShared] = useState<string[] | null>(null);
  const [status, setStatus] = useState("");
  const [confirmClear, setConfirmClear] = useState(false);

  useEffect(() => {
    const ids = new URLSearchParams(window.location.search).get("ids");
    if (ids) setShared([...new Set(ids.split(",").map((s) => s.trim()).filter((s) => SLUG.test(s) && bySlug.has(s)))].slice(0, 500));
  }, [bySlug]);

  const flash = (s: string) => {
    setStatus(s);
    window.setTimeout(() => setStatus(""), 2200);
  };
  const viewing = shared ?? saved;
  const list = viewing.map((s) => bySlug.get(s)).filter((o): o is ExplorerOrg => Boolean(o));

  const shareLink = () => `${window.location.origin}/saved?ids=${list.map((o) => o.slug).join(",")}`;
  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(shareLink());
      flash("Link copied: anyone with it sees this list");
    } catch {
      flash("Copying is blocked in this browser");
    }
  };
  const downloadCsv = () => {
    const esc = (v: string | number | null) => {
      const s = v == null ? "" : String(v);
      // Quote everything, and defuse spreadsheet formulas.
      return `"${(/^[=+\-@]/.test(s) ? `'${s}` : s).replace(/"/g, '""')}"`;
    };
    const rows = [
      ["Name", "Sectors", "Place", "Founded", "Status", "Profile"],
      ...list.map((o) => [o.name, o.sectors.map(sectorLabel).join("; "), o.place, o.founded, o.status, `${window.location.origin}${o.href}`]),
    ];
    const blob = new Blob([rows.map((r) => r.map(esc).join(",")).join("\r\n")], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "delhincr-map-saved.csv";
    document.body.append(a);
    a.click();
    a.remove();
    window.setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  };

  return (
    <section className="saved" aria-labelledby="saved-title">
      <h1 id="saved-title">{shared ? "A shared list" : "Saved companies"}</h1>
      <p className="lede">
        {shared
          ? `${list.length} ${list.length === 1 ? "company" : "companies"} someone shared with you.`
          : list.length
            ? `${list.length} saved on this device. Nothing is sent anywhere; share the list with a link.`
            : "Nothing saved yet. Tap the bookmark on any company in the list, its panel or its profile to keep it here."}
      </p>

      <div className="actions saved-actions">
        {shared ? (
          <>
            <button type="button" className="btn" onClick={() => { addSaved(list.map((o) => o.slug)); flash("Added to your saved companies"); }} disabled={!list.length}>
              Save all to my list
            </button>
            <Link href="/saved" className="btn ghost" onClick={() => setShared(null)}>My saved ({saved.length})</Link>
          </>
        ) : (
          <>
            <Link href="/?saved=1" className={`btn${list.length ? "" : " disabled"}`} aria-disabled={!list.length}>Show on the map</Link>
            <button type="button" className="btn ghost" onClick={copyLink} disabled={!list.length}>Share this list</button>
            <button type="button" className="btn ghost" onClick={downloadCsv} disabled={!list.length}>Download CSV</button>
            {list.length > 0 &&
              (confirmClear ? (
                <>
                  <button type="button" className="btn ghost danger" onClick={() => { clearSaved(); setConfirmClear(false); }}>Yes, clear all</button>
                  <button type="button" className="btn ghost" onClick={() => setConfirmClear(false)}>Keep them</button>
                </>
              ) : (
                <button type="button" className="btn ghost" onClick={() => setConfirmClear(true)}>Clear all</button>
              ))}
          </>
        )}
        <span className="share-status" role="status">{status}</span>
      </div>

      {list.length > 0 && (
        <ul className="saved-list">
          {list.map((o) => (
            <li key={o.slug} data-slug={o.slug}>
              <OrgLogo name={o.name} src={o.logo} size={44} color={o.kind === "company" ? sectorColor(o.sectors[0]) : KINDS[o.kind].color} />
              <div className="saved-body">
                <Link href={o.href} className="saved-name">{o.name}</Link>
                {o.one_liner && <p>{o.one_liner}</p>}
                <small className="muted">
                  {[o.kind === "company" ? o.sectors.map(sectorLabel).join(", ") || "Company" : KINDS[o.kind].label, o.place + (o.precision === "area" ? " (approx.)" : ""), o.founded ? `est. ${o.founded}` : null].filter(Boolean).join(" · ")}
                </small>
              </div>
              <div className="saved-tools">
                {o.lng != null && <Link href={`/?c=${o.slug}`} className="btn ghost small">On the map</Link>}
                {shared ? (
                  <SaveButton slug={o.slug} name={o.name} variant="btn" />
                ) : (
                  <button type="button" className="btn ghost small" onClick={() => removeSaved(o.slug)} aria-label={`Remove ${o.name}`}>Remove</button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
