import { expect, test } from "./fixtures";
import { watchConsole } from "./helpers";

test.describe("public pages", () => {
  test("map loads with pins and a working list, with no console or CSP errors", async ({ page }) => {
    const errors = watchConsole(page);
    await page.goto("/");
    await expect(page.getByRole("heading", { name: "Delhi NCR Map" })).toBeVisible();
    await expect(page.locator(".maplibregl-canvas")).toBeVisible();
    await expect(page.getByText(/43 on the map/)).toBeVisible();
    await page.getByRole("searchbox", { name: "Search" }).fill("spinny");
    await expect(page.locator(".list .item")).toHaveCount(1);
    await expect(page.locator(".list .item").first()).toContainText("Spinny");
    await page.getByRole("searchbox", { name: "Search" }).fill("");
    await page.getByLabel("Sector").selectOption("edtech");
    await expect(page.locator(".list .item")).toHaveCount(25);
    await page.waitForTimeout(1500);
    expect(errors.filter((e) => !/favicon/.test(e))).toEqual([]);
  });

  test("selecting a company from the list opens its popup, second click opens the profile", async ({ page }) => {
    await page.goto("/");
    const item = page.locator(".list .item", { hasText: "Policybazaar" });
    await item.click();
    await expect(page.locator(".maplibregl-popup")).toContainText("Policybazaar");
    await item.click();
    await expect(page).toHaveURL(/\/c\/policybazaar$/);
  });

  test("profile shows sources and request links", async ({ page }) => {
    await page.goto("/c/spinny");
    await expect(page.getByRole("heading", { name: "Spinny", level: 1 })).toBeVisible();
    await expect(page.getByText("Sources (")).toBeVisible();
    await expect(page.getByRole("link", { name: /Suggest an edit/ })).toHaveAttribute("href", "/edit/spinny");
    await expect(page.getByRole("link", { name: /Claim this profile/ })).toHaveAttribute("href", "/claim/spinny");
    await expect(page.getByRole("link", { name: /Request removal/ })).toHaveAttribute("href", "/removal/spinny");
  });

  test("directory, sector and area pages list organisations", async ({ page }) => {
    await page.goto("/directory");
    await expect(page.getByText("130 companies and 7 support organisations")).toBeVisible();
    await page.goto("/sector/fintech");
    await expect(page.locator("table.orgs tbody tr")).toHaveCount(25);
    await page.goto("/area/sector-44");
    await expect(page.locator("table.orgs tbody tr").first()).toBeVisible();
  });

  test("unknown profiles are a 404", async ({ request }) => {
    expect((await request.get("/c/no-such-company")).status()).toBe(404);
    expect((await request.get("/edit/no-such-company")).status()).toBe(404);
  });

  test("open data downloads", async ({ request }) => {
    const csv = await request.get("/data/organizations.csv");
    expect(csv.headers()["content-type"]).toContain("text/csv");
    expect((await csv.text()).split("\n")[0]).toContain("slug,name,kind");
    const geo = await request.get("/data/organizations.geojson");
    expect((await geo.json()).features).toHaveLength(43);
  });
});
