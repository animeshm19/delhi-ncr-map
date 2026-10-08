import { getArea, getOrg } from "@/lib/data";
import { OG_SIZE, ogCard } from "@/lib/og";
import { SITE_NAME } from "@/lib/site";
import { SECTORS, sectorColor } from "@/lib/taxonomy";

export const alt = `Company profile on ${SITE_NAME}`;
export const size = OG_SIZE;
export const contentType = "image/png";
export const revalidate = 3600;

export default async function Image({ params }: { params: Promise<{ slug: string }> }) {
  const org = await getOrg((await params).slug);
  if (!org || org.kind !== "company") {
    return ogCard({ eyebrow: "Delhi NCR", title: SITE_NAME, subtitle: "Profile not found", footer: "delhi-ncr-map" });
  }
  const place = [getArea(org.area)?.name, org.municipality].filter(Boolean).join(", ");
  return ogCard({
    eyebrow: [place, org.founded_year ? `est. ${org.founded_year}` : null].filter(Boolean).join(" · "),
    title: org.name,
    subtitle: org.one_liner,
    chips: [
      ...org.sectors.map((s) => ({ label: SECTORS[s]?.label ?? s, color: sectorColor(s) })),
      ...(org.hiring ? [{ label: "Hiring", color: "#7ee2a8" }] : []),
    ],
    accent: sectorColor(org.sectors[0]),
    footer: SITE_NAME,
  });
}
