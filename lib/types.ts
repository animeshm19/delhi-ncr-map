// Mirrors the Edmonton map's published schema (map.techwednesdays.ca/data),
// adapted for Gurugram.

export type Kind =
  | "company"
  | "accelerator"
  | "investor"
  | "coworking"
  | "university_research"
  | "government_program"
  | "community_group";

export type Status = "active" | "acquired" | "closed" | "unknown";

/**
 * exact     – a street address confirmed as non-residential (pinned)
 * building  – a shared commercial building (pinned)
 * area      – a sector / business district (pinned at the centroid with a faint circle)
 * municipality – only the city is known (listed, NOT pinned)
 */
export type Precision = "exact" | "building" | "area" | "municipality";

export type Verification =
  | "unverified"
  | "community_verified"
  | "company_claimed"
  | "admin_verified";

export interface Source {
  url: string;
  /** What the page says, in our words */
  note: string;
  /** Which profile fields this source backs */
  fields: string[];
  /** ISO date the page was read */
  retrieved: string;
}

export interface JobBoard {
  provider: "greenhouse" | "lever" | "ashby";
  handle: string;
}

export interface Org {
  slug: string;
  name: string;
  kind: Kind;
  sectors: string[];
  status: Status;
  one_liner?: string | null;
  website?: string | null;
  founded_year?: number | null;
  acquired_by?: string | null;
  /** Total disclosed funding as reported by a cited list, e.g. "$106M" */
  funding_note?: string | null;
  municipality: string;
  /** Slug from data/areas.json */
  area?: string | null;
  location_precision: Precision;
  /** Only for exact/building precision, and never a home */
  address?: string | null;
  lng?: number | null;
  lat?: number | null;
  connected_to: string[];
  hiring?: boolean | null;
  job_board?: JobBoard | null;
  verification: Verification;
  sources: Source[];
  updated_at: string;
}

export interface Area {
  slug: string;
  name: string;
  /** [lng, lat] approximate centroid */
  center: [number, number];
  /** Rough radius in metres, for the faint "somewhere in here" circle */
  radius_m: number;
}

export interface Job {
  org: string;
  title: string;
  location: string;
  url: string;
  posted?: string | null;
}
