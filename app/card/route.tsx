import { getOrgs } from "@/lib/data";
import { companyCard, viewCard, type CardFormat } from "@/lib/cards";

const SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/;

/**
 * Instagram-ready images. /card?format=post|story and either
 *   &c=<slug>                                   one company, or
 *   &station=<id>&r=<m>&sector=<slug>&city=<name>   a view of the map (any combination, or none).
 * Unknown values are ignored, so a bad link still gets a sensible card.
 */
export async function GET(req: Request) {
  const q = new URL(req.url).searchParams;
  const format: CardFormat = q.get("format") === "story" ? "story" : "post";
  let res: Response;
  const c = q.get("c");
  if (c) {
    if (c.length > 80 || !SLUG.test(c)) return new Response("Not found", { status: 404 });
    const org = (await getOrgs()).find((o) => o.slug === c);
    if (!org) return new Response("Not found", { status: 404 });
    res = await companyCard(org, format);
  } else {
    res = await viewCard(
      {
        station: q.get("station")?.slice(0, 80) ?? null,
        r: Number(q.get("r")) || null,
        sector: q.get("sector")?.slice(0, 60) ?? null,
        city: q.get("city")?.slice(0, 60) ?? null,
      },
      format,
    );
  }
  res.headers.set("Cache-Control", "public, max-age=3600, s-maxage=86400, stale-while-revalidate=604800");
  res.headers.set("X-Content-Type-Options", "nosniff");
  return res;
}
