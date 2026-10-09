import { getOrgs } from "@/lib/data";
import { logoUrl, websiteHost } from "@/lib/logos";

const SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const MAX_BYTES = 200_000;
const MIN_SIZE = 32; // smaller icons (16 px, the "no icon" globe) look blurry as logos: show initials instead

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
 * organisation's own website is fetched through Google's public favicon service (a fixed host, so
 * this can't be pointed at anything else), checked, and cached at the edge for a month.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  if (slug.length > 80 || !SLUG.test(slug)) return notFound();
  const org = (await getOrgs()).find((o) => o.slug === slug);
  if (!org) return notFound();

  const uploaded = logoUrl(org.logo_path);
  if (uploaded) return Response.redirect(uploaded, 302);

  const host = websiteHost(org.website);
  if (!host) return notFound();

  try {
    const res = await fetch(`https://www.google.com/s2/favicons?domain=${encodeURIComponent(host)}&sz=128`, {
      redirect: "follow",
      signal: AbortSignal.timeout(5000),
      next: { revalidate: 2_592_000 },
    });
    if (!res.ok) return notFound();
    const type = res.headers.get("content-type") ?? "";
    if (!/^image\/(png|x-icon|vnd\.microsoft\.icon|jpeg|webp|gif)/.test(type)) return notFound();
    const buf = new Uint8Array(await res.arrayBuffer());
    if (buf.length === 0 || buf.length > MAX_BYTES) return notFound();
    const size = imageSize(buf);
    if (size && size < MIN_SIZE) return notFound();
    return new Response(buf, {
      headers: {
        "Content-Type": type.split(";")[0],
        "Cache-Control": "public, max-age=86400, s-maxage=2592000, stale-while-revalidate=604800",
        "X-Content-Type-Options": "nosniff",
        "Content-Security-Policy": "default-src 'none'; sandbox",
      },
    });
  } catch {
    return notFound();
  }
}

/** Width of a PNG, or the largest entry of an ICO; null if unknown. */
function imageSize(b: Uint8Array): number | null {
  if (b.length > 24 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) {
    return (b[16] << 24) | (b[17] << 16) | (b[18] << 8) | b[19];
  }
  if (b.length > 6 && b[0] === 0 && b[1] === 0 && b[2] === 1 && b[3] === 0) {
    const n = b[4] | (b[5] << 8);
    let max = 0;
    for (let i = 0; i < n && 6 + i * 16 < b.length; i++) max = Math.max(max, b[6 + i * 16] || 256);
    return max;
  }
  return null;
}
