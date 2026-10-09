import { expect, test } from "./fixtures";
import { sql, watchConsole } from "./helpers";

const panel = (page: import("@playwright/test").Page) => page.getByTestId("org-panel");

test.describe("side panel", () => {
  test("picking a company flies to its pin and opens the panel, with a link to the full profile", async ({ page }) => {
    const errors = watchConsole(page);
    await page.goto("/");
    await expect(page.locator(".map")).toHaveAttribute("data-zoom", /\d/, { timeout: 15_000 });

    await page.locator(".list .item", { hasText: "Policybazaar" }).click();
    const p = panel(page);
    await expect(p).toBeVisible();
    await expect(p.getByRole("heading", { name: "Policybazaar", level: 2 })).toBeVisible();
    await expect(page).toHaveURL(/[?&]c=policybazaar\b/);
    await expect(page.locator(".list .item[aria-current='true']")).toContainText("Policybazaar");
    // An approximate (sector) pin: the camera flies in to zoom 14 and the pin pulses.
    await expect(page.locator(".map")).toHaveAttribute("data-zoom", "14.0", { timeout: 10_000 });
    await expect(page.locator(".pin-pulse")).toHaveCount(1);
    // What the list knew shows at once; the rest loads in.
    await expect(p.getByText(/Sources \(\d+\)/)).toBeVisible();
    await expect(p.getByRole("link", { name: "Full profile" })).toHaveAttribute("href", "/c/policybazaar");
    await expect(p.getByRole("link", { name: "Suggest an edit" })).toHaveAttribute("href", "/edit/policybazaar");
    await expect(p.getByText("Nearest metro")).toBeVisible();

    await p.getByRole("link", { name: "Full profile" }).click();
    await expect(page).toHaveURL(/\/c\/policybazaar$/);
    await expect(page.getByRole("heading", { name: "Policybazaar", level: 1 })).toBeVisible();
    expect(errors.filter((e) => !/favicon/.test(e))).toEqual([]);
  });

  test("Escape and the close button close the panel and clear the link", async ({ page }) => {
    await page.goto("/?c=spinny");
    await expect(panel(page)).toBeVisible();
    await expect(panel(page).getByRole("heading", { name: "Spinny" })).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(panel(page)).toHaveCount(0);
    await expect(page).not.toHaveURL(/[?&]c=/);
    await expect(page.locator(".pin-pulse")).toHaveCount(0);

    await page.locator(".list .item", { hasText: "Spinny" }).click();
    await expect(panel(page)).toBeVisible();
    await panel(page).getByRole("button", { name: "Close Spinny" }).click();
    await expect(panel(page)).toHaveCount(0);
  });

  test("similar companies open in the same panel", async ({ page }) => {
    await page.goto("/?c=spinny");
    const p = panel(page);
    await expect(p.getByRole("heading", { name: "Similar" })).toBeVisible();
    const first = p.locator(".panel-orgs a").first();
    const name = (await first.locator("b").textContent())!;
    await first.click();
    await expect(p.getByRole("heading", { name, level: 2 })).toBeVisible();
    await expect(page).toHaveURL(/[?&]c=[a-z0-9-]+/);
    await expect(page).not.toHaveURL(/c=spinny/);
  });

  test("a company with no address opens the panel without moving the map", async ({ page }) => {
    const [org] = await sql<{ slug: string; name: string }>(
      "select slug, name from organizations_public where kind = 'company' and lng is null order by slug limit 1",
    );
    await page.goto("/");
    await expect(page.locator(".map")).toHaveAttribute("data-zoom", /\d/, { timeout: 15_000 });
    const before = await page.locator(".map").getAttribute("data-zoom");
    await page.getByRole("searchbox", { name: "Search" }).fill(org.name);
    await page.locator(`.list .item[data-slug='${org.slug}']`).click();
    await expect(panel(page).getByText("City only, not on the map")).toBeVisible();
    await page.waitForTimeout(800);
    expect(await page.locator(".map").getAttribute("data-zoom")).toBe(before);
  });

  test("on a phone the panel is a sheet under the map", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/?c=spinny");
    const box = (await panel(page).boundingBox())!;
    const map = (await page.locator(".map").boundingBox())!;
    expect(box.width).toBeGreaterThan(380);
    expect(box.y).toBeGreaterThanOrEqual(map.y + map.height - 2);
    const scrollW = await page.evaluate(() => document.documentElement.scrollWidth);
    expect(scrollW).toBeLessThanOrEqual(390);
  });

  test("the panel API serves published organisations only, and nothing internal", async ({ request }) => {
    const ok = await request.get("/api/orgs/spinny");
    expect(ok.status()).toBe(200);
    const body = await ok.json();
    expect(body.name).toBe("Spinny");
    expect(body.href).toBe("/c/spinny");
    for (const s of body.sources) expect(s.url).toMatch(/^https?:\/\//);
    // Exactly the public fields the panel needs: nothing from the review queue, no emails, no internals.
    expect(Object.keys(body).sort()).toEqual([
      "acquiredBy", "careersUrl", "connections", "founded", "funding", "hiring", "href", "kindLabel", "location", "logo",
      "name", "nearest", "oneLiner", "openRoles", "sectors", "similar", "slug", "sources", "status", "updated", "verification", "website",
    ]);
    expect(JSON.stringify(body)).not.toMatch(/@[a-z0-9-]+\.[a-z]{2,}|ip_hash|review_queue/i);

    expect((await request.get("/api/orgs/no-such-company")).status()).toBe(404);
    // An unpublished draft is invisible here too.
    await sql("insert into organizations (slug, name, kind, published) values ('e2e-hidden-draft', 'Hidden Draft', 'company', false) on conflict (slug) do nothing");
    try {
      expect((await request.get("/api/orgs/e2e-hidden-draft")).status()).toBe(404);
    } finally {
      await sql("delete from organizations where slug = 'e2e-hidden-draft'");
    }
    expect((await request.get("/api/orgs/%3Cscript%3E")).status()).toBe(404);
    expect((await request.get(`/api/orgs/${"a".repeat(200)}`)).status()).toBe(404);
  });
});
