import { getOrgs } from "@/lib/data";
import { orgsToCsv } from "@/lib/export";

export const revalidate = 3600;

export async function GET() {
  return new Response(orgsToCsv(await getOrgs()), {
    headers: { "content-type": "text/csv; charset=utf-8", "access-control-allow-origin": "*" },
  });
}
