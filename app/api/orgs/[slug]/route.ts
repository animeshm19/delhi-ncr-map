import { buildPanel } from "@/lib/panel";

// Built on first request and cached for an hour, like the pages.
export const revalidate = 3600;

const SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/;

/** Public, read-only details for the map's side panel. Only published organisations exist here. */
export async function GET(_req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  if (slug.length > 80 || !SLUG.test(slug)) return Response.json({ error: "Not found." }, { status: 404 });
  const panel = await buildPanel(slug);
  if (!panel) return Response.json({ error: "Not found." }, { status: 404 });
  return Response.json(panel, {
    headers: { "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400" },
  });
}
