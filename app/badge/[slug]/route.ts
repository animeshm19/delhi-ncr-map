import { getOrg } from "@/lib/data";
import { badgeSvg } from "@/lib/badge";
import { SITE_NAME } from "@/lib/site";
import { sectorColor } from "@/lib/taxonomy";

// <img src="https://…/badge/spinny"> on a company's site. ?theme=light for light backgrounds.
// Security headers (sandboxed CSP, nosniff, cross-origin) come from next.config.ts.
export const revalidate = 3600;

const SLUG_RE = /^[a-z0-9-]{1,80}$/;

export async function GET(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const slug = (await params).slug.replace(/\.svg$/, "");
  const org = SLUG_RE.test(slug) ? await getOrg(slug) : null;
  if (!org) return new Response("Not found", { status: 404, headers: { "content-type": "text/plain; charset=utf-8" } });
  const theme = new URL(req.url).searchParams.get("theme") === "light" ? "light" : "dark";
  const svg = badgeSvg({
    label: SITE_NAME,
    value: org.hiring ? `${org.name} · hiring` : org.name,
    color: org.kind === "company" ? sectorColor(org.sectors[0]) : "#7cc4ff",
    theme,
  });
  return new Response(svg, {
    headers: {
      "content-type": "image/svg+xml; charset=utf-8",
      "cache-control": "public, max-age=3600, stale-while-revalidate=86400",
    },
  });
}
