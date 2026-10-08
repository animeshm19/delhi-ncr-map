/**
 * Triggers the job-board sync on a deployment (the same thing Vercel Cron does each morning).
 *
 *   SITE=https://delhi-ncr-map.vercel.app CRON_SECRET=… npm run sync:jobs
 *
 * The sync itself lives in lib/job-sync.ts and runs on the server, where INGEST_TOKEN is.
 */
const site = process.env.SITE ?? "http://localhost:3000";
const secret = process.env.CRON_SECRET;
if (!secret) {
  console.error("Set CRON_SECRET (the same value as in Vercel).");
  process.exit(1);
}
const res = await fetch(new URL("/api/cron/jobs", site), { headers: { authorization: `Bearer ${secret}` } });
console.log(res.status, JSON.stringify(await res.json(), null, 2));
if (!res.ok) process.exit(1);
