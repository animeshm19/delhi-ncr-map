import type { MetadataRoute } from "next";
import { getOrgs, profilePath } from "@/lib/data";

import { SITE_URL as SITE } from "@/lib/site";

export const revalidate = 3600;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const orgs = await getOrgs();
  return [
    { url: `${SITE}/` },
    { url: `${SITE}/about` },
    { url: `${SITE}/data` },
    { url: `${SITE}/directory` },
    ...orgs.map((o) => ({ url: `${SITE}${profilePath(o)}`, lastModified: o.updated_at })),
  ];
}
