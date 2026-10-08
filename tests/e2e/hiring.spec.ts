import { expect, test } from "./fixtures";
import { env, signIn, sql } from "./helpers";

/** Make the local gateway answer as a provider's job-board API. */
async function setBoard(provider: string, handle: string, body: unknown, status = 200) {
  const res = await fetch(`${env().gateway}/__e2e/boards`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ provider, handle, body, status }),
  });
  expect(res.ok).toBe(true);
}

const lever = (n: number, extra: object[] = []) => [
  ...Array.from({ length: n }, (_, i) => ({
    text: `Backend Engineer ${i + 1}`,
    hostedUrl: `https://jobs.lever.co/spinny-e2e/${i + 1}`,
    categories: { team: "Engineering", location: "Gurugram" },
    createdAt: Date.parse("2026-10-01"),
  })),
  ...extra,
];

test.describe.serial("hiring board", () => {
  test("the cron endpoint refuses callers without the secret", async ({ request }) => {
    expect((await request.get("/api/cron/jobs")).status()).toBe(401);
    expect((await request.get("/api/cron/jobs", { headers: { authorization: "Bearer wrong" } })).status()).toBe(401);
    expect((await request.get("/api/cron/jobs", { headers: { authorization: env().CRON_SECRET } })).status()).toBe(401);
    // Nothing reached the database.
    expect(await sql("select 1 from jobs")).toHaveLength(0);
  });

  test("admin connects a board, roles are read, and planted links are dropped", async ({ page }) => {
    let dialog = false;
    page.on("dialog", (d) => ((dialog = true), d.dismiss()));
    await setBoard(
      "lever",
      "spinny-e2e",
      lever(2, [
        { text: "<img src=x onerror=alert(1)>", hostedUrl: "https://jobs.lever.co/spinny-e2e/xss" },
        { text: "Phishing role", hostedUrl: "https://evil.example/apply" },
        { text: "Script role", hostedUrl: "javascript:alert(1)" },
      ]),
    );

    await signIn(page, "admin@e2e.test");
    await page.goto("/admin#hiring");
    const form = page.getByTestId("admin-hiring");
    await form.getByLabel("Company").selectOption("spinny");
    await form.getByLabel("Job board").selectOption("lever");
    await form.getByLabel("Board handle").fill("spinny-e2e");
    await form.getByRole("button", { name: "Save hiring details" }).click();
    await expect(page.getByText("Hiring details saved.")).toBeVisible();

    await page.getByRole("button", { name: "Read all job boards now" }).click();
    await expect(page.getByText(/Read 1 job boards: 3 open roles\./)).toBeVisible();

    const stored = await sql<{ url: string }>("select url from jobs where org_slug = 'spinny' order by url");
    expect(stored.map((r) => r.url)).toEqual([
      "https://jobs.lever.co/spinny-e2e/1",
      "https://jobs.lever.co/spinny-e2e/2",
      "https://jobs.lever.co/spinny-e2e/xss",
    ]);

    await page.goto("/hiring");
    await expect(page.getByText("3 open roles at 1 companies")).toBeVisible();
    await expect(page.getByRole("link", { name: "Backend Engineer 1" })).toHaveAttribute("href", "https://jobs.lever.co/spinny-e2e/1");
    // Hostile titles render as text.
    await expect(page.getByText("<img src=x onerror=alert(1)>")).toBeVisible();
    await expect(page.locator("a[href^='javascript:'], a[href*='evil.example']")).toHaveCount(0);
    expect(dialog).toBe(false);

    // Filtering.
    await page.getByRole("searchbox", { name: "Search roles" }).fill("engineer 2");
    await expect(page.locator(".role")).toHaveCount(1);
    await expect(page.getByText("1 of 3 roles")).toBeVisible();

    // The profile shows the roles and a Hiring badge.
    await page.goto("/c/spinny");
    await expect(page.getByRole("heading", { name: "Open roles (3)" })).toBeVisible();
    await expect(page.locator(".details .badge.hiring")).toHaveText("Hiring");
  });

  test("the daily cron re-reads boards, closes filled roles, and survives a board outage", async ({ request, page }) => {
    await setBoard("lever", "spinny-e2e", lever(1));
    const auth = { authorization: `Bearer ${env().CRON_SECRET}` };
    const run = await request.get("/api/cron/jobs", { headers: auth });
    expect(run.status()).toBe(200);
    expect(await run.json()).toMatchObject({ boards: 1, roles: 1, failed: 0 });
    expect(await sql("select 1 from jobs where org_slug = 'spinny'")).toHaveLength(1);

    await page.goto("/hiring");
    await expect(page.getByText("1 open roles at 1 companies")).toBeVisible();

    // Board down: nothing is deleted and the company stays marked as hiring.
    await setBoard("lever", "spinny-e2e", { error: "down" }, 500);
    const down = await request.get("/api/cron/jobs", { headers: auth });
    expect(await down.json()).toMatchObject({ boards: 1, roles: 0, failed: 1 });
    expect(await sql("select 1 from jobs where org_slug = 'spinny'")).toHaveLength(1);
    expect((await sql<{ hiring: boolean }>("select hiring from organizations where slug = 'spinny'"))[0].hiring).toBe(true);

    // The token-guarded function can't be called with the public key alone.
    const anonKey = (env() as unknown as { SUPABASE_ANON_KEY: string }).SUPABASE_ANON_KEY;
    const direct = await fetch(`${env().gateway}/rest/v1/rpc/ingest_jobs`, {
      method: "POST",
      headers: { apikey: anonKey, authorization: `Bearer ${anonKey}`, "content-type": "application/json" },
      body: JSON.stringify({ p_token: "guess", p_org_slug: "spinny", p_jobs: [] }),
    });
    expect(direct.status).toBeGreaterThanOrEqual(400);
    expect(await sql("select 1 from jobs where org_slug = 'spinny'")).toHaveLength(1);
  });

  test("companies hiring elsewhere get a careers link, and unsafe links are refused", async ({ page }) => {
    await signIn(page, "admin@e2e.test");
    await page.goto("/admin#hiring");
    const form = page.getByTestId("admin-hiring");
    await form.getByLabel("Company").selectOption("cars24");
    await form.getByLabel("Hiring").selectOption("yes");
    await form.getByLabel("Careers page").fill("https://www.cars24.com/careers");
    await form.getByRole("button", { name: "Save hiring details" }).click();
    await expect(page.getByText("Hiring details saved.")).toBeVisible();

    await page.goto("/hiring");
    const also = page.locator(".also-hiring li", { hasText: "CARS24" });
    await expect(also.getByRole("link", { name: "Careers page" })).toHaveAttribute("href", "https://www.cars24.com/careers");

    // The browser's own URL check is bypassed here to test the server.
    await page.goto("/admin#hiring");
    await form.getByLabel("Company").selectOption("cars24");
    await form.getByLabel("Careers page").evaluate((el: HTMLInputElement) => (el.type = "text"));
    await form.getByLabel("Careers page").fill("javascript:alert(1)");
    await form.getByRole("button", { name: "Save hiring details" }).click();
    await expect(page.locator("p.error[role=alert]")).toHaveText("invalid url");
    expect((await sql<{ careers_url: string }>("select careers_url from organizations where slug = 'cars24'"))[0].careers_url).toBe(
      "https://www.cars24.com/careers",
    );
  });
});
