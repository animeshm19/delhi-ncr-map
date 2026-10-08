import { getOrgs } from "@/lib/data";
import { orgsToGeoJson } from "@/lib/export";

export const revalidate = 3600;

export async function GET() {
  return Response.json(orgsToGeoJson(await getOrgs()), {
    headers: { "content-type": "application/geo+json", "access-control-allow-origin": "*" },
  });
}
