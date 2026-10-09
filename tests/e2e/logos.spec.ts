import { expect, test } from "./fixtures";
import { sql, watchConsole } from "./helpers";

const pinnedCount = async () =>
  Number((await sql<{ n: string }>("select count(*) as n from organizations_public where kind = 'company' and lng is not null"))[0].n);

/** A group pin in the open part of the map (not under the 2D/3D/Metro buttons or the zoom control). */
async function clearGroup(page: import("@playwright/test").Page) {
  const slug = await page.locator(".pin.group").evaluateAll((els) => {
    const map = document.querySelector(".map")!.getBoundingClientRect();
    const ok = els.filter((el) => {
      const r = el.getBoundingClientRect();
      return r.top > map.top + 70 && r.bottom < map.bottom - 120 && r.left > map.left + 20 && r.right < map.right - 60;
    });
    return (ok[0] as HTMLElement | undefined)?.dataset.slug ?? null;
  });
  if (!slug) throw new Error("no group pin in the open part of the map");
  return page.locator(`.pin.group[data-slug='${slug}']`);
}

test.describe("logos and logo pins", () => {
  test("every organisation shows a logo tile or its initials, in the list and the panel", async ({ page }) => {
    const [withSite] = await sql<{ slug: string; name: string }>(
      "select slug, name from organizations_public where kind = 'company' and website is not null order by slug limit 1",
    );
    const [noSite] = await sql<{ slug: string; name: string }>(
      "select slug, name from organizations_public where kind = 'company' and website is null order by slug limit 1",
    );
    await page.goto("/");
    await page.getByRole("searchbox", { name: "Search" }).fill(withSite.name);
    const item = page.locator(`.list .item[data-slug='${withSite.slug}']`);
    // The tile asks our logo route; with no logo (offline tests) it falls back to initials, never a broken image.
    await expect(item.locator(".org-logo")).toHaveCount(1);
    await page.getByRole("searchbox", { name: "Search" }).fill(noSite.name);
    await expect(page.locator(`.list .item[data-slug='${noSite.slug}'] .org-logo.initials`)).toHaveCount(1);
    await page.locator(`.list .item[data-slug='${noSite.slug}']`).click();
    await expect(page.getByTestId("org-panel").locator(".panel-head .org-logo")).toHaveCount(1);
  });

  test("the logo route only serves known organisations with a website", async ({ request }) => {
    const [noSite] = await sql<{ slug: string }>("select slug from organizations_public where website is null limit 1");
    // "No logo" is a 1-pixel PNG marked X-Logo: none (so pages log no errors).
    for (const path of [`/logo/${noSite.slug}`, "/logo/no-such-company", "/logo/%3Cscript%3E", "/logo/..%2F..%2Fetc%2Fpasswd"]) {
      const res = await request.get(path);
      expect(res.status(), path).toBe(200);
      expect(res.headers()["x-logo"], path).toBe("none");
      expect(res.headers()["content-type"], path).toBe("image/png");
      expect((await res.body()).length, path).toBeLessThan(100);
    }
  });

  test("pins are logo tiles; nearby ones group into one with a +N badge that zooms in", async ({ page }) => {
    const errors = watchConsole(page);
    await page.goto("/");
    await expect(page.locator(".map")).toHaveAttribute("data-zoom", /\d/, { timeout: 15_000 });
    await expect(page.locator(".pin").first()).toBeVisible();

    // Every pinned company is accounted for: each pin is one company, or a group of 1 + N.
    const counts = await page.locator(".pin").evaluateAll((els) =>
      els.map((el) => 1 + Number(el.querySelector(".pin-count")?.textContent?.replace("+", "") ?? 0)),
    );
    expect(counts.reduce((a, b) => a + b, 0)).toBe(await pinnedCount());
    const group = await clearGroup(page);
    await expect(group).toBeVisible();
    await expect(group.locator(".pin-count")).toHaveText(/^\+\d+$/);

    const before = Number(await page.locator(".map").getAttribute("data-zoom"));
    await group.click();
    await expect.poll(async () => Number(await page.locator(".map").getAttribute("data-zoom")), { timeout: 5000 }).toBeGreaterThan(before);
    expect(errors.filter((e) => !/favicon|\/logo\//.test(e))).toEqual([]);
  });

  test("clicking a single pin opens the panel, and the chosen pin is never hidden in a group", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator(".map")).toHaveAttribute("data-zoom", /\d/, { timeout: 15_000 });
    // Zoom into a group until single pins appear.
    for (let i = 0; i < 6 && (await page.locator(".pin:not(.group)").count()) === 0; i++) {
      await (await clearGroup(page)).click();
      await page.waitForTimeout(900);
    }
    const single = page.locator(".pin:not(.group)").first();
    const slug = await single.getAttribute("data-slug");
    await single.click();
    await expect(page.getByTestId("org-panel")).toBeVisible();
    await expect(page).toHaveURL(new RegExp(`[?&]c=${slug}\\b`));
    await expect(page.locator(`.pin.selected[data-slug='${slug}']`)).toHaveCount(1);
    await expect(page.locator(".pin.selected .pin-pulse")).toHaveCount(1);
  });

  test("the metro toggle on the map hides the lines and is remembered", async ({ page }) => {
    await page.goto("/");
    const metro = page.getByRole("button", { name: "Metro", exact: true });
    await expect(metro).toHaveAttribute("aria-pressed", "true");
    await metro.click();
    await expect(metro).toHaveAttribute("aria-pressed", "false");
    await page.reload();
    await expect(page.getByRole("button", { name: "Metro", exact: true })).toHaveAttribute("aria-pressed", "false");
    // Picking a station brings the metro back.
    await page.getByLabel("Near metro station").selectOption("cyber-city");
    await expect(page.getByRole("button", { name: "Metro", exact: true })).toHaveAttribute("aria-pressed", "true");
  });
});
