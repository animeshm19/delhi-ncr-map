import { expect, test } from "./fixtures";
import { sql, watchConsole } from "./helpers";

const count = async (q: string) => Number((await sql<{ n: string }>(q))[0].n);
const PINNED = "select count(*) as n from organizations_public where kind = 'company' and lng is not null";

test.describe("public pages", () => {
  test("map loads with pins and a working list, with no console or CSP errors", async ({ page }) => {
    const errors = watchConsole(page);
    await page.goto("/");
    await expect(page.getByRole("heading", { name: "delhincr-map" })).toBeVisible();
    await expect(page.locator(".maplibregl-canvas")).toBeVisible();
    await expect(page.getByText(`${await count(PINNED)} on the map`)).toBeVisible();
    await page.getByRole("searchbox", { name: "Search" }).fill("spinny");
    await expect(page.locator(".list .item")).toHaveCount(1);
    await expect(page.locator(".list .item").first()).toContainText("Spinny");
    await page.getByRole("searchbox", { name: "Search" }).fill("");
    await page.getByLabel("Sector").selectOption("edtech");
    await expect(page.locator(".list .item")).toHaveCount(await count("select count(*) as n from organizations_public where kind = 'company' and 'edtech' = any(sectors)"));
    await page.waitForTimeout(1500);
    expect(errors.filter((e) => !/favicon/.test(e))).toEqual([]);
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
    const companies = await count("select count(*) as n from organizations_public where kind = 'company'");
    await expect(page.getByText(`${companies} companies and 7 support organisations`)).toBeVisible();
    await page.goto("/sector/fintech");
    await expect(page.locator("table.orgs tbody tr")).toHaveCount(await count("select count(*) as n from organizations_public where 'fintech' = any(sectors)"));
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
    expect((await geo.json()).features).toHaveLength(await count("select count(*) as n from organizations_public where lng is not null"));
  });

  test("each live city filters the list to its companies", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator(".list .item").first()).toBeVisible();
    for (const city of ["Gurugram", "Noida", "Greater Noida"]) {
      await page.getByRole("button", { name: city, exact: true }).click();
      const total = await count(`select count(*) as n from organizations_public where kind = 'company' and municipality = '${city}'`);
      const pinned = await count(`select count(*) as n from organizations_public where kind = 'company' and municipality = '${city}' and lng is not null`);
      expect(total, city).toBeGreaterThan(0);
      await expect(page.locator(".list .item")).toHaveCount(total);
      await expect(page.locator(".listmeta span").first()).toContainText(`${pinned} on the map`);
    }
    // Delhi isn't live yet.
    await expect(page.getByRole("button", { name: "Delhi", exact: true })).toHaveCount(0);
    await expect(page.getByText("soon")).toBeVisible();
  });
});
