import { revalidatePath } from "next/cache";
import { cronAuthorised } from "@/lib/cron";
import { runJobSync } from "@/lib/job-sync";

// Daily job-board sync. Vercel Cron calls this with "Authorization: Bearer $CRON_SECRET".
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(req: Request) {
  if (!cronAuthorised(req.headers.get("authorization"))) {
    return Response.json({ error: "unauthorised" }, { status: 401 });
  }
  try {
    const result = await runJobSync();
    revalidatePath("/", "layout");
    return Response.json(result);
  } catch {
    return Response.json({ error: "sync unavailable" }, { status: 503 });
  }
}
