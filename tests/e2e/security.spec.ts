import { expect, test } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

test.describe("security", () => {
  test("pages send hardening headers and refuse to be framed", async ({ request }) => {
    for (const url of ["/", "/c/spinny", "/submit", "/data/organizations.csv"]) {
      const h = (await request.get(url)).headers();
      expect(h["content-security-policy"], url).toContain("frame-ancestors 'none'");
      expect(h["x-frame-options"], url).toBe("DENY");
      expect(h["x-content-type-options"], url).toBe("nosniff");
      expect(h["x-powered-by"], url).toBeUndefined();
    }
  });

  test("no server secrets end up in browser JavaScript", async () => {
    const env = JSON.parse(fs.readFileSync(path.resolve(__dirname, "../../.e2e/env.json"), "utf8"));
    const dir = path.resolve(__dirname, "../../.next/static");
    const files: string[] = [];
    const walk = (d: string) => fs.readdirSync(d, { withFileTypes: true }).forEach((e) => (e.isDirectory() ? walk(path.join(d, e.name)) : files.push(path.join(d, e.name))));
    walk(dir);
    const bundle = files.filter((f) => f.endsWith(".js")).map((f) => fs.readFileSync(f, "utf8")).join("\n");
    for (const secret of [env.INGEST_TOKEN, env.CRON_SECRET, env.jwtSecret, "service_role"]) {
      expect(bundle.includes(secret), `bundle contains ${secret.slice(0, 6)}…`).toBe(false);
    }
  });
});
