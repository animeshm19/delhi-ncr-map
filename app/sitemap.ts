import type { MetadataRoute } from "next";
import { getOrgs, profilePath } from "@/lib/data";

const SITE = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

export const revalidate = 3600;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const orgs = await getOrgs();
  return [
    { url: `${SITE}/` },
    { url: `${SITE}/about` },
    { url: `${SITE}/data` },
    ...orgs.map((o) => ({ url: `${SITE}${profilePath(o)}`, lastModified: o.updated_at })),
  ];
}
