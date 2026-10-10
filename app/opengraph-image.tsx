import { getOrgs } from "@/lib/data";
import { OG_SIZE, ogCard } from "@/lib/og";
import { REGION, SITE_NAME, SITE_TAGLINE } from "@/lib/site";

export const alt = `${SITE_NAME}: ${SITE_TAGLINE}`;
export const size = OG_SIZE;
export const contentType = "image/png";
export const revalidate = 3600;

export default async function Image() {
  const orgs = await getOrgs();
  const companies = orgs.filter((o) => o.kind === "company").length;
  return ogCard({
    eyebrow: `${REGION} · Open data`,
    title: SITE_NAME,
    subtitle: SITE_TAGLINE,
    chips: [
      { label: `${companies} companies` },
      { label: `${orgs.length - companies} support orgs` },
      { label: "Gurugram · Noida · Delhi" },
    ],
    footer: "Delhi Tech Map",
  });
}
