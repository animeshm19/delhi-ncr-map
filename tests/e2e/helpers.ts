import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import pg from "pg";
import type { Page } from "@playwright/test";

export type E2EEnv = { dbUrl: string; jwtSecret: string; gateway: string; app: string; INGEST_TOKEN: string; CRON_SECRET: string };

export function env(): E2EEnv {
  return JSON.parse(fs.readFileSync(path.resolve(__dirname, "../../.e2e/env.json"), "utf8"));
}

/** Run SQL as the database owner (to check what really got stored). */
export async function sql<T = Record<string, unknown>>(text: string, params: unknown[] = []): Promise<T[]> {
  const c = new pg.Client({ connectionString: env().dbUrl });
  await c.connect();
  try {
    return (await c.query(text, params)).rows as T[];
  } finally {
    await c.end();
  }
}

export function jwt(payload: Record<string, unknown>) {
  const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString("base64url");
  const h = b64({ alg: "HS256", typ: "JWT" });
  const b = b64(payload);
  return `${h}.${b}.${crypto.createHmac("sha256", env().jwtSecret).update(`${h}.${b}`).digest("base64url")}`;
}

/** Collect console errors and CSP violations while a page is used. */
export function watchConsole(page: Page) {
  const errors: string[] = [];
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text());
  });
  page.on("pageerror", (e) => errors.push(e.message));
  return errors;
}

/** Sign in through the real magic-link flow (the local gateway "sends" the email). */
export async function signIn(page: Page, email: string) {
  await page.goto("/signin");
  await page.getByLabel("Email").fill(email);
  await page.getByRole("button", { name: /send/i }).click();
  await page.getByText(/check your email/i).waitFor();
  const res = await fetch(`${env().gateway}/__e2e/last-link?email=${encodeURIComponent(email)}`);
  const { link } = (await res.json()) as { link: string };
  await page.goto(link);
}

/** Forms refuse submissions faster than a human; wait past the minimum. */
export const humanPause = (page: Page) => page.waitForTimeout(3200);
