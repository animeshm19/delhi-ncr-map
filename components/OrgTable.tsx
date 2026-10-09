import Link from "next/link";
import { getArea, profilePath } from "@/lib/data";
import { KINDS, sectorLabel } from "@/lib/taxonomy";
import type { Org } from "@/lib/types";
import { orgLogo } from "@/lib/logos";
import { sectorColor } from "@/lib/taxonomy";
import OrgLogo from "./OrgLogo";

export default function OrgTable({ orgs }: { orgs: Org[] }) {
  return (
    <div className="tablewrap">
      <table className="orgs">
        <thead>
          <tr>
            <th>Name</th>
            <th>Sector</th>
            <th>Where</th>
            <th className="num">Founded</th>
            <th className="num">Funding</th>
          </tr>
        </thead>
        <tbody>
          {orgs.map((o) => {
            const area = getArea(o.area);
            return (
              <tr key={o.slug}>
                <td>
                  <Link href={profilePath(o)} className="name-cell">
                    <OrgLogo name={o.name} src={orgLogo(o)} size={28} color={o.kind === "company" ? sectorColor(o.sectors[0]) : KINDS[o.kind].color} />
                    {o.name}
                  </Link>
                  {o.status !== "active" && <span className="badge" style={{ marginLeft: 6 }}>{o.status}</span>}
                </td>
                <td>{o.kind === "company" ? o.sectors.map(sectorLabel).join(", ") : KINDS[o.kind].label}</td>
                <td>{area ? <Link href={`/area/${area.slug}`}>{area.name}</Link> : <span className="muted">{o.municipality}</span>}</td>
                <td className="num">{o.founded_year ?? <span className="muted">—</span>}</td>
                <td className="num">{o.funding_note ?? <span className="muted">—</span>}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
