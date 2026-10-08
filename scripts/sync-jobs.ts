/**
 * Reads each organisation's PUBLIC job board and records open roles.
 * Same idea as the Edmonton map ("read daily from its public job board").
 *
 *   npm run sync:jobs                # writes data/jobs.json and updates hiring in data/seed.json
 *   SUPABASE_URL=… SUPABASE_SERVICE_ROLE_KEY=… npm run sync:jobs   # writes to Supabase instead
 *
 * Public, documented, unauthenticated endpoints only:
 *   Greenhouse  https://boards-api.greenhouse.io/v1/boards/{handle}/jobs
 *   Lever       https://api.lever.co/v0/postings/{handle}?mode=json
 *   Ashby       https://api.ashbyhq.com/posting-api/job-board/{handle}
 *
 * Many Indian startups use Keka, Darwinbox, Zoho Recruit or Freshteam instead. Those
 * need per-site handling; check robots.txt and terms first, or set hiring by hand.
 */
import { readFile, writeFile } from "node:fs/promises";

type Org = {
  slug: string;
  hiring?: boolean | null;
  job_board?: { provider: "greenhouse" | "lever" | "ashby"; handle: string } | null;
};
type Job = { org: string; title: string; team?: string; location: string; url: string; posted?: string | null };

const UA = `GurugramStartupMap/0.1 (+${process.env.CRAWLER_CONTACT ?? "https://example.com/about"})`;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function getJson(url: string) {
  const res = await fetch(url, { headers: { "user-agent": UA, accept: "application/json" } });
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  return res.json();
}

async function fetchJobs(org: Org): Promise<Job[]> {
  const b = org.job_board!;
  if (b.provider === "greenhouse") {
    const d = await getJson(`https://boards-api.greenhouse.io/v1/boards/${b.handle}/jobs`);
    return d.jobs.map((j: any) => ({
      org: org.slug, title: j.title, location: j.location?.name ?? "", url: j.absolute_url,
      posted: j.updated_at?.slice(0, 10) ?? null,
    }));
  }
  if (b.provider === "lever") {
    const d = await getJson(`https://api.lever.co/v0/postings/${b.handle}?mode=json`);
    return d.map((j: any) => ({
      org: org.slug, title: j.text, team: j.categories?.team, location: j.categories?.location ?? "",
      url: j.hostedUrl, posted: j.createdAt ? new Date(j.createdAt).toISOString().slice(0, 10) : null,
    }));
  }
  const d = await getJson(`https://api.ashbyhq.com/posting-api/job-board/${b.handle}`);
  return d.jobs.map((j: any) => ({
    org: org.slug, title: j.title, team: j.department, location: j.location ?? "", url: j.jobUrl,
    posted: j.publishedAt?.slice(0, 10) ?? null,
  }));
}

async function main() {
  const seedPath = new URL("../data/seed.json", import.meta.url);
  const orgs: Org[] = JSON.parse(await readFile(seedPath, "utf8"));
  const all: Job[] = [];

  for (const org of orgs.filter((o) => o.job_board)) {
    try {
      const jobs = await fetchJobs(org);
      org.hiring = jobs.length > 0;
      all.push(...jobs);
      console.log(`${org.slug}: ${jobs.length} open roles`);
    } catch (e) {
      console.warn(`${org.slug}: ${(e as Error).message} (hiring left unchanged)`);
    }
    await sleep(1500); // be polite
  }

  if (process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY) {
    const { createClient } = await import("@supabase/supabase-js");
    const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
    for (const org of orgs.filter((o) => o.job_board)) {
      await db.from("organizations").update({ hiring: org.hiring }).eq("slug", org.slug);
    }
    const rows = all.map((j) => ({ org_slug: j.org, title: j.title, team: j.team, location: j.location, url: j.url, posted: j.posted }));
    if (rows.length) await db.from("jobs").upsert(rows, { onConflict: "url" });
    console.log(`Supabase: ${rows.length} roles upserted`);
  } else {
    await writeFile(new URL("../data/jobs.json", import.meta.url), JSON.stringify(all, null, 2) + "\n");
    await writeFile(seedPath, JSON.stringify(orgs, null, 2) + "\n");
    console.log(`Wrote ${all.length} roles to data/jobs.json`);
  }
}

main();
