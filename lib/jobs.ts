/**
 * Reads open roles from public job boards. Pure parsing so it can be unit-tested;
 * the database re-checks every link before storing it (see ingest_jobs()).
 *
 * Public, documented, unauthenticated endpoints only:
 *   Greenhouse  https://boards-api.greenhouse.io/v1/boards/{handle}/jobs
 *   Lever       https://api.lever.co/v0/postings/{handle}?mode=json
 *   Ashby       https://api.ashbyhq.com/posting-api/job-board/{handle}
 */

export type Provider = "greenhouse" | "lever" | "ashby";
export const PROVIDERS: Provider[] = ["greenhouse", "lever", "ashby"];

export type BoardJob = {
  title: string;
  team: string | null;
  location: string | null;
  url: string;
  posted: string | null;
};

export const HANDLE_RE = /^[A-Za-z0-9_.-]{1,80}$/;
export const MAX_JOBS = 500;

const ORIGINS: Record<Provider, string> = {
  greenhouse: "https://boards-api.greenhouse.io",
  lever: "https://api.lever.co",
  ashby: "https://api.ashbyhq.com",
};

/**
 * API URL for a board. `testOrigin` replaces the real hosts in end-to-end tests,
 * where a local server plays the three providers.
 */
export function boardApiUrl(provider: Provider, handle: string, testOrigin?: string): string {
  if (!PROVIDERS.includes(provider)) throw new Error("unknown job board");
  if (!HANDLE_RE.test(handle) || handle.includes("..")) throw new Error("invalid job board handle");
  const h = encodeURIComponent(handle);
  const base = testOrigin ? `${testOrigin.replace(/\/$/, "")}/${provider}` : ORIGINS[provider];
  if (provider === "greenhouse") return `${base}/v1/boards/${h}/jobs`;
  if (provider === "lever") return `${base}/v0/postings/${h}?mode=json`;
  return `${base}/posting-api/job-board/${h}`;
}

function text(v: unknown, max: number): string | null {
  if (typeof v !== "string") return null;
  const s = v.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim();
  return s ? s.slice(0, max) : null;
}

function httpsUrl(v: unknown): string | null {
  if (typeof v !== "string" || v.length > 500) return null;
  try {
    const u = new URL(v);
    if (u.protocol !== "https:" || u.username || u.password) return null;
    return u.toString();
  } catch {
    return null;
  }
}

function isoDate(v: unknown): string | null {
  const d = typeof v === "number" ? new Date(v) : typeof v === "string" ? new Date(v) : null;
  if (!d || Number.isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
}

/** Normalise one provider's response into roles. Anything malformed is skipped. */
export function parseBoard(provider: Provider, body: unknown): BoardJob[] {
  let raw: unknown[] = [];
  if (provider === "greenhouse" || provider === "ashby") {
    const jobs = (body as { jobs?: unknown } | null)?.jobs;
    raw = Array.isArray(jobs) ? jobs : [];
  } else {
    raw = Array.isArray(body) ? body : [];
  }

  const out: BoardJob[] = [];
  const seen = new Set<string>();
  for (const r of raw) {
    if (!r || typeof r !== "object") continue;
    const j = r as Record<string, any>;
    let job: BoardJob | null = null;
    if (provider === "greenhouse") {
      job = {
        title: text(j.title, 200) ?? "",
        team: text(j.departments?.[0]?.name, 100),
        location: text(j.location?.name, 120),
        url: httpsUrl(j.absolute_url) ?? "",
        posted: isoDate(j.first_published ?? j.updated_at),
      };
    } else if (provider === "lever") {
      job = {
        title: text(j.text, 200) ?? "",
        team: text(j.categories?.team, 100),
        location: text(j.categories?.location, 120),
        url: httpsUrl(j.hostedUrl) ?? "",
        posted: isoDate(j.createdAt),
      };
    } else {
      if (j.isListed === false) continue;
      job = {
        title: text(j.title, 200) ?? "",
        team: text(j.department ?? j.team, 100),
        location: text(j.location, 120),
        url: httpsUrl(j.jobUrl) ?? "",
        posted: isoDate(j.publishedAt),
      };
    }
    if (!job.title || !job.url || seen.has(job.url)) continue;
    seen.add(job.url);
    out.push(job);
    if (out.length >= MAX_JOBS) break;
  }
  return out;
}

/** Fetch and parse one board, with a timeout and a response-size cap. */
export async function fetchBoard(
  provider: Provider,
  handle: string,
  opts: { fetchImpl?: typeof fetch; testOrigin?: string; timeoutMs?: number } = {},
): Promise<BoardJob[]> {
  const url = boardApiUrl(provider, handle, opts.testOrigin);
  const res = await (opts.fetchImpl ?? fetch)(url, {
    headers: { accept: "application/json", "user-agent": "delhincr-map/1.0 (+https://delhincr-map.vercel.app/about)" },
    signal: AbortSignal.timeout(opts.timeoutMs ?? 10_000),
    redirect: "error",
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const body = await res.text();
  if (body.length > 5_000_000) throw new Error("response too large");
  return parseBoard(provider, JSON.parse(body));
}

/** Run `fn` over items with at most `limit` in flight. */
export async function mapLimit<T, R>(items: T[], limit: number, fn: (t: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i]);
    }
  });
  await Promise.all(workers);
  return out;
}
