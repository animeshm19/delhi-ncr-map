import "server-only";
import { supabase } from "@/lib/data";
import { fetchBoard, mapLimit, PROVIDERS, type Provider } from "@/lib/jobs";

export type SyncResult = { boards: number; roles: number; failed: number; results: ({ slug: string; roles: number } | { slug: string; error: string })[] };

/** Read every published company's job board and store its open roles. */
export async function runJobSync(): Promise<SyncResult> {
  const token = process.env.INGEST_TOKEN;
  if (!supabase || !token) throw new Error("not configured");

  const { data, error } = await supabase
    .from("organizations_public")
    .select("slug, job_board")
    .not("job_board", "is", null);
  if (error) throw new Error("could not list boards");

  const boards = (data ?? []).filter(
    (o): o is { slug: string; job_board: { provider: Provider; handle: string } } =>
      PROVIDERS.includes(o.job_board?.provider) && typeof o.job_board?.handle === "string",
  );
  // Only honoured outside Vercel production, for the end-to-end tests' fake boards.
  const testOrigin = process.env.VERCEL_ENV === "production" ? undefined : process.env.E2E_JOB_BOARD_ORIGIN;

  const results: SyncResult["results"] = await mapLimit(boards, 4, async (o): Promise<SyncResult["results"][number]> => {
    try {
      const jobs = await fetchBoard(o.job_board.provider, o.job_board.handle, { testOrigin });
      const { data: kept, error: e } = await supabase!.rpc("ingest_jobs", { p_token: token, p_org_slug: o.slug, p_jobs: jobs });
      if (e) throw new Error("rejected by the database");
      return { slug: o.slug, roles: Number(kept) };
    } catch (e) {
      // A board that's down or renamed leaves the company's hiring flag as it was.
      return { slug: o.slug, error: e instanceof Error ? e.message.slice(0, 80) : "failed" };
    }
  });

  return {
    boards: boards.length,
    roles: results.reduce((n, r) => n + ("roles" in r ? r.roles : 0), 0),
    failed: results.filter((r) => "error" in r).length,
    results,
  };
}
