import { expect, test } from "./fixtures";
import { sql, watchConsole } from "./helpers";

const parseMeters = (t: string) => {
  const m = /([\d.]+) (m|km) from/.exec(t);
  return m ? Number(m[1]) * (m[2] === "km" ? 1000 : 1) : NaN;
};

test.describe("metro", () => {
  test("filter companies near a station, nearest first, with a shareable link", async ({ page }) => {
    const errors = watchConsole(page);
    await page.goto("/");
    await expect(page.locator(".list .item").first()).toBeVisible();

    await page.getByLabel("Near metro station").selectOption("cyber-city");
    await expect(page).toHaveURL(/[?&]station=cyber-city&r=1000/);
    const meta = page.locator(".listmeta span").first();
    await expect(meta).toContainText("within 1.0 km of Cyber City");
    const n1 = Number(/^(\d+)/.exec((await meta.textContent())!)![1]);
    expect(n1).toBeGreaterThan(0);

    const dists = (await page.locator(".list .item .dist").allTextContents()).map(parseMeters);
    expect(dists).toHaveLength(n1);
    expect(dists.every((d) => d <= 1000)).toBe(true);
    expect([...dists].sort((a, b) => a - b)).toEqual(dists);

    // Tighter radius: never more results.
    await page.getByRole("button", { name: "500 m" }).click();
    await expect(page).toHaveURL(/r=500/);
    const n05 = Number(/^(\d+)/.exec((await meta.textContent())!)![1]);
    expect(n05).toBeLessThanOrEqual(n1);

    // Clearing goes back to everything.
    await page.getByRole("button", { name: "Clear station" }).click();
    await expect(meta).toContainText("on the map");
    await expect(page).not.toHaveURL(/station=/);

    // Metro layer toggles without errors (including when the basemap has no fonts).
    const metro = page.getByRole("button", { name: "Metro", exact: true });
    await expect(metro).toHaveAttribute("aria-pressed", "true");
    await metro.click();
    await expect(metro).toHaveAttribute("aria-pressed", "false");
    expect(errors).toEqual([]);
  });

  test("a shared link restores the station and radius, and ignores junk", async ({ page }) => {
    await page.goto("/?station=sikanderpur&r=2000");
    await expect(page.getByLabel("Near metro station")).toHaveValue("sikanderpur");
    await expect(page.getByRole("button", { name: "2.0 km" })).toHaveAttribute("aria-pressed", "true");

    await page.goto("/?station=%3Cscript%3E&r=99999");
    await expect(page.locator(".list .item").first()).toBeVisible();
    await expect(page.getByLabel("Near metro station")).toHaveValue("");
    await expect(page.locator(".listmeta span").first()).toContainText("on the map");
  });

  test("the station page agrees with the map", async ({ page }) => {
    await page.goto("/metro");
    await expect(page.getByRole("heading", { name: /Rapid Metro/ })).toBeVisible();
    const row = page.locator("tr[data-station='cyber-city']").first();
    const listed = Number(await row.locator("td").nth(1).textContent());
    await row.getByRole("link", { name: "Cyber City" }).click();
    await expect(page).toHaveURL(/station=cyber-city&r=1000/);
    await expect(page.locator(".listmeta span").first()).toContainText(`${listed} within 1.0 km of Cyber City`);
  });

  test("profiles show the nearest stations", async ({ page }) => {
    const [org] = await sql<{ slug: string }>(
      "select slug from organizations_public where kind = 'company' and area = 'dlf-cyber-city' order by slug limit 1",
    );
    await page.goto(`/c/${org.slug}`);
    const near = page.getByTestId("nearest-metro");
    await expect(near).toContainText(/min walk/);
    await expect(near.getByRole("link").first()).toHaveAttribute("href", /^\/\?station=[a-z0-9-]+&r=1000$/);
    await expect(near).toContainText("centre of the sector");
  });
});
