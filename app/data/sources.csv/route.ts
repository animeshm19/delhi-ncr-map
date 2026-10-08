import { getOrgs } from "@/lib/data";
import { sourcesToCsv } from "@/lib/export";

export const revalidate = 3600;

export async function GET() {
  return new Response(sourcesToCsv(await getOrgs()), {
    headers: { "content-type": "text/csv; charset=utf-8", "access-control-allow-origin": "*" },
  });
}
