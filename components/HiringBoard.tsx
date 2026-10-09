"use client";

import OrgLogo from "./OrgLogo";
import { useMemo, useState } from "react";
import Link from "next/link";

export type BoardRole = {
  title: string;
  team: string | null;
  location: string | null;
  url: string;
  posted: string | null;
  isNew: boolean;
  company: { slug: string; name: string; sectors: string[]; logo: string | null };
};

export default function HiringBoard({ roles, sectors }: { roles: BoardRole[]; sectors: { slug: string; label: string }[] }) {
  const [q, setQ] = useState("");
  const [sector, setSector] = useState("");
  const [remote, setRemote] = useState(false);

  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return roles.filter((r) => {
      if (sector && !r.company.sectors.includes(sector)) return false;
      if (remote && !/remote|anywhere|work from home/i.test(r.location ?? "")) return false;
      if (needle && !`${r.title} ${r.team ?? ""} ${r.location ?? ""} ${r.company.name}`.toLowerCase().includes(needle)) return false;
      return true;
    });
  }, [roles, q, sector, remote]);

  return (
    <section aria-label="Open roles">
      <div className="toolbar">
        <input
          className="search"
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search roles, teams, companies"
          aria-label="Search roles"
        />
        <select className="chip" value={sector} onChange={(e) => setSector(e.target.value)} aria-label="Sector">
          <option value="">All sectors</option>
          {sectors.map((s) => (
            <option key={s.slug} value={s.slug}>{s.label}</option>
          ))}
        </select>
        <button className="chip" aria-pressed={remote} onClick={() => setRemote((v) => !v)}>Remote</button>
      </div>
      <p className="muted" aria-live="polite">
        {shown.length} of {roles.length} roles
      </p>
      <ul className="roles">
        {shown.map((r) => (
          <li key={r.url} className="role">
            <div>
              <a href={r.url} rel="noopener nofollow" target="_blank" className="role-title">
                {r.title}
              </a>
              {r.isNew && <span className="badge new">New</span>}
              <div className="muted">
                <Link href={`/c/${r.company.slug}`} className="name-cell">
                  <OrgLogo name={r.company.name} src={r.company.logo} size={24} />
                  {r.company.name}
                </Link>
                {r.team && <> · {r.team}</>}
                {r.location && <> · {r.location}</>}
              </div>
            </div>
            {r.posted && <time dateTime={r.posted} className="muted">{r.posted}</time>}
          </li>
        ))}
        {shown.length === 0 && <li className="muted">No roles match. Clear a filter to see more.</li>}
      </ul>
    </section>
  );
}
