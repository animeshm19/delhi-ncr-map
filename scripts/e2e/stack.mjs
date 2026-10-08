// Brings up the whole end-to-end stack and keeps it running:
//   fresh Postgres DB (shim + migrations + seed) → PostgREST → gateway (:54321) → Next.js (:3100)
// Playwright starts this as its webServer. Writes .e2e/env.json for tests to read.
//
//   E2E_DATABASE_ADMIN_URL   postgres URL with rights to create databases (default local :54322)
//   E2E_SKIP_BUILD=1         reuse an existing .next build

import { spawn, execFileSync } from "node:child_process";
import fs from "node:fs";
import net from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";
import { signJwt, startGateway } from "./gateway.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const ADMIN_URL = process.env.E2E_DATABASE_ADMIN_URL ?? "postgresql://postgres@localhost:54322/postgres";
if (/supabase\.(co|com)/.test(ADMIN_URL)) throw new Error("Refusing to run the e2e stack against hosted Supabase.");
const DB = "dncr_e2e";
const DB_URL = ADMIN_URL.replace(/\/[^/]*$/, `/${DB}`);
const JWT_SECRET = "e2e-only-jwt-secret-that-is-at-least-32-characters";
const INGEST_TOKEN = "e2e-ingest-token-0123456789abcdef";
const PORTS = { postgrest: 54330, gateway: 54321, app: 3100 };
const children = [];

const log = (...a) => console.log("[e2e]", ...a);
const waitForPort = (port, ms = 60_000) =>
  new Promise((resolve, reject) => {
    const until = Date.now() + ms;
    const tryOnce = () => {
      const s = net.connect(port, "127.0.0.1");
      s.on("connect", () => (s.destroy(), resolve()));
      s.on("error", () => (Date.now() > until ? reject(new Error(`port ${port} never opened`)) : setTimeout(tryOnce, 250)));
    };
    tryOnce();
  });

async function buildDatabase() {
  const admin = new pg.Client({ connectionString: ADMIN_URL });
  await admin.connect();
  await admin.query(`select pg_terminate_backend(pid) from pg_stat_activity where datname = '${DB}' and pid <> pg_backend_pid()`);
  await admin.query(`drop database if exists ${DB}`);
  await admin.query(`create database ${DB}`);
  await admin.end();
  execFileSync("bash", [path.join(ROOT, "scripts/db-build.sh"), DB_URL], { stdio: "inherit" });
  const db = new pg.Client({ connectionString: DB_URL });
  await db.connect();
  await db.query(`do $$ begin
    if not exists (select 1 from pg_roles where rolname = 'authenticator') then
      create role authenticator login password 'authenticator' noinherit;
    end if;
  end $$`);
  await db.query("grant anon, authenticated, service_role to authenticator");
  // Test fixtures: an admin account (the real one is added the same way in production).
  if ((await db.query("select to_regclass('private.admins') as t")).rows[0].t) {
    await db.query("insert into private.admins (email) values ('admin@e2e.test') on conflict do nothing");
  }
  // The job sync's token, stored hashed exactly as in production.
  if ((await db.query("select to_regclass('private.settings') as t")).rows[0].t) {
    await db.query(
      "insert into private.settings values ('ingest_token_sha256', encode(sha256(convert_to($1, 'UTF8')), 'hex')) on conflict (key) do update set value = excluded.value",
      [INGEST_TOKEN],
    );
  }
  await db.end();
}

function run(cmd, args, env, name) {
  const child = spawn(cmd, args, { cwd: ROOT, env: { ...process.env, ...env }, stdio: ["ignore", "pipe", "pipe"] });
  child.stdout.on("data", (d) => process.env.E2E_VERBOSE && process.stdout.write(`[${name}] ${d}`));
  child.stderr.on("data", (d) => process.stderr.write(`[${name}] ${d}`));
  children.push(child);
  return child;
}

async function main() {
  log("building database", DB_URL.replace(/:[^:@/]+@/, ":***@"));
  await buildDatabase();

  const bin = execFileSync("bash", [path.join(ROOT, "scripts/e2e/get-postgrest.sh")]).toString().trim();
  const dbHost = new URL(DB_URL).hostname || "localhost";
  const dbPort = new URL(DB_URL).port || "5432";
  run(bin, [], {
    PGRST_DB_URI: `postgres://authenticator:authenticator@${dbHost}:${dbPort}/${DB}`,
    PGRST_DB_SCHEMAS: "public",
    PGRST_DB_ANON_ROLE: "anon",
    PGRST_JWT_SECRET: JWT_SECRET,
    PGRST_SERVER_PORT: String(PORTS.postgrest),
    PGRST_DB_POOL: "5",
  }, "postgrest");
  await waitForPort(PORTS.postgrest);

  await startGateway({
    port: PORTS.gateway,
    postgrestUrl: `http://127.0.0.1:${PORTS.postgrest}`,
    databaseUrl: DB_URL,
    jwtSecret: JWT_SECRET,
    storageDir: path.join(ROOT, ".e2e/storage"),
  });
  log("gateway on", PORTS.gateway);

  const anonKey = signJwt({ role: "anon", iss: "e2e", iat: 0, exp: 4102444800 }, JWT_SECRET);
  const appEnv = {
    SUPABASE_URL: `http://localhost:${PORTS.gateway}`,
    SUPABASE_ANON_KEY: anonKey,
    NEXT_PUBLIC_SUPABASE_URL: `http://localhost:${PORTS.gateway}`,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: anonKey,
    NEXT_PUBLIC_SITE_URL: `http://localhost:${PORTS.app}`,
    INGEST_TOKEN,
    E2E_JOB_BOARD_ORIGIN: `http://localhost:${PORTS.gateway}/__boards`,
    CRON_SECRET: "e2e-cron-secret-0123456789",
    NEXT_TELEMETRY_DISABLED: "1",
  };
  fs.mkdirSync(path.join(ROOT, ".e2e"), { recursive: true });
  fs.writeFileSync(
    path.join(ROOT, ".e2e/env.json"),
    JSON.stringify({ dbUrl: DB_URL, jwtSecret: JWT_SECRET, gateway: appEnv.SUPABASE_URL, app: appEnv.NEXT_PUBLIC_SITE_URL, ...appEnv }, null, 2),
  );

  if (!process.env.E2E_SKIP_BUILD) {
    log("building the app");
    // Must not block: the gateway in this process serves the build's data requests.
    await new Promise((resolve, reject) => {
      const b = spawn("npm", ["run", "build"], { cwd: ROOT, env: { ...process.env, ...appEnv }, stdio: ["ignore", "ignore", "inherit"] });
      b.on("exit", (code) => (code === 0 ? resolve() : reject(new Error(`next build exited ${code}`))));
    });
  }
  run("npx", ["next", "start", "-p", String(PORTS.app)], appEnv, "next");
  await waitForPort(PORTS.app, 120_000);
  log("app on", PORTS.app);
}

const stop = () => {
  for (const c of children) c.kill("SIGTERM");
  process.exit(0);
};
process.on("SIGTERM", stop);
process.on("SIGINT", stop);
main().catch((e) => {
  console.error(e);
  stop();
  process.exit(1);
});
