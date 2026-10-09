import type { Precision, Status, Verification } from "./types";

export interface PanelOrgSummary {
  slug: string;
  name: string;
  logo: string | null;
  label: string;
  place: string;
  href: string;
  pinned: boolean;
}

/** What /api/orgs/[slug] returns for the map's side panel. */
export interface PanelOrg {
  slug: string;
  name: string;
  kindLabel: string;
  sectors: { slug: string; label: string }[];
  status: Status;
  acquiredBy: { name: string; href: string } | null;
  oneLiner: string | null;
  website: string | null;
  logo: string | null;
  href: string;
  verification: Verification;
  location: { text: string; areaHref: string | null; note: string; precision: Precision };
  nearest: { id: string; name: string; lines: { name: string; color: string }[]; meters: number; walk: number }[];
  founded: number | null;
  funding: string | null;
  hiring: boolean | null;
  openRoles: number;
  careersUrl: string | null;
  connections: PanelOrgSummary[];
  similar: PanelOrgSummary[];
  sources: { url: string; host: string; note: string; fields: string[]; retrieved: string }[];
  updated: string | null;
}
