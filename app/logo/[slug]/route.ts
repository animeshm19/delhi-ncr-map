import { getOrgs } from "@/lib/data";
import { fetchSiteIcon } from "@/lib/logo-fetch";
import { logoUrl } from "@/lib/logos";

const SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/;

// "No logo" is a 1×1 transparent PNG rather than a 404, so pages don't fill the console with
// errors; the logo component sees the 1-pixel image and shows initials instead.
const BLANK = Uint8Array.from(
  atob("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII="),
  (c) => c.charCodeAt(0),
);
const notFound = () =>
  new Response(BLANK, {
    status: 200,
    headers: {
      "Content-Type": "image/png",
      "X-Logo": "none",
      "Cache-Control": "public, max-age=3600, s-maxage=86400",
      "X-Content-Type-Options": "nosniff",
    },
  });

/**
 * An organisation's logo. Uploaded logos are redirected to storage; otherwise the icon from the
 * organisation's own website (see lib/logo-fetch.ts), cached at the edge for a month.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  if (slug.length > 80 || !SLUG.test(slug)) return notFound();
  const org = (await getOrgs()).find((o) => o.slug === slug);
  if (!org) return notFound();

  const uploaded = logoUrl(org.logo_path);
  if (uploaded) return Response.redirect(uploaded, 302);

  const icon = await fetchSiteIcon(org.website);
  if (!icon) return notFound();
  return new Response(icon.bytes, {
    headers: {
      "Content-Type": icon.type,
      "Cache-Control": "public, max-age=86400, s-maxage=2592000, stale-while-revalidate=604800",
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'; sandbox",
    },
  });
}
