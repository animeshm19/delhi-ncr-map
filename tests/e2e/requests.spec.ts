import { expect, test } from "./fixtures";
import { humanPause, sql } from "./helpers";

test.describe("request forms", () => {
  test("an edit suggestion lands in the review queue", async ({ page }) => {
    await page.goto("/edit/spinny");
    await page.getByLabel(/What should change/).selectOption("website");
    await page.getByLabel(/What it should say/).fill("The website moved to https://www.spinny.com/new");
    await page.getByLabel(/Where can we check this/).fill("https://www.spinny.com/about");
    await page.getByLabel(/Your email/).fill("E2E.Editor@Example.com");
    await humanPause(page);
    await page.getByRole("button", { name: "Send the correction" }).click();
    await expect(page.getByText("Thanks, it's in the review queue.")).toBeVisible();
    const rows = await sql<{ type: string; org_slug: string; contact: string; payload: Record<string, string> }>(
      "select type, org_slug, contact, payload from review_queue where contact = 'e2e.editor@example.com'",
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ type: "edit", org_slug: "spinny" });
    expect(rows[0].payload.field).toBe("website");
  });

  test("a new-company submission lands in the queue without an organisation", async ({ page }) => {
    await page.goto("/submit");
    await page.getByLabel(/Organisation name/).fill("E2E Robotics");
    await page.getByLabel(/^Website/).fill("https://e2e-robotics.example");
    await page.getByLabel(/^City/).selectOption("Noida");
    await page.getByLabel(/What it does/).fill("Builds test robots.");
    await page.getByLabel(/Your email/).fill("founder@e2e-robotics.example");
    await humanPause(page);
    await page.getByRole("button", { name: "Submit for review" }).click();
    await expect(page.getByText("Thanks, it's in the review queue.")).toBeVisible();
    const [row] = await sql<{ org_slug: string | null; payload: Record<string, string> }>(
      "select org_slug, payload from review_queue where contact = 'founder@e2e-robotics.example'",
    );
    expect(row.org_slug).toBeNull();
    expect(row.payload.company_name).toBe("E2E Robotics");
  });

  test("the API rejects junk and never stores bot submissions", async ({ request }) => {
    const ok = { type: "edit", slug: "spinny", contact: "api@example.com", fields: { field: "other" }, started_at: Date.now() - 10_000 };
    const post = (data: unknown, headers: Record<string, string> = {}) =>
      request.post("/api/requests", { data: typeof data === "string" ? data : JSON.stringify(data), headers: { "content-type": "application/json", ...headers } });

    expect((await post(ok, { "content-type": "text/plain" })).status()).toBe(415);
    expect((await post("{not json")).status()).toBe(400);
    expect((await post({ ...ok, fields: { x: "a".repeat(20_000) } })).status()).toBe(413);
    expect((await post({ ...ok, slug: "no-such-org" })).status()).toBe(400);
    expect((await post({ ...ok, fields: { source: "javascript:alert(1)" } })).status()).toBe(400);
    expect((await post({ ...ok, started_at: Date.now() })).status()).toBe(400);
    expect((await request.get("/api/requests")).status()).toBe(405);

    const bot = await post({ ...ok, contact: "bot@example.com", company_website_confirm: "http://spam" });
    expect(bot.status()).toBe(200);
    expect(await sql("select 1 from review_queue where contact = 'bot@example.com'")).toHaveLength(0);
  });

  test("errors from the database are shown without internals", async ({ request }) => {
    const res = await request.post("/api/requests", {
      data: JSON.stringify({ type: "edit", slug: "spinny", contact: "flood@example.com", fields: {}, started_at: Date.now() - 10_000 }),
      headers: { "content-type": "application/json" },
    });
    expect(res.status()).toBe(200);
    for (let i = 0; i < 5; i++) {
      await request.post("/api/requests", {
        data: JSON.stringify({ type: "edit", slug: "spinny", contact: "flood@example.com", fields: {}, started_at: Date.now() - 10_000 }),
        headers: { "content-type": "application/json" },
      });
    }
    const limited = await request.post("/api/requests", {
      data: JSON.stringify({ type: "edit", slug: "spinny", contact: "flood@example.com", fields: {}, started_at: Date.now() - 10_000 }),
      headers: { "content-type": "application/json" },
    });
    expect(limited.status()).toBe(400);
    expect((await limited.json()).error).toBe("Too many requests, try again later.");
  });
});
