import { expect, test } from "./fixtures";
import { env, sql, watchConsole } from "./helpers";

const n = async (q: string) => Number((await sql<{ n: string }>(q))[0].n);
const PNG = [0x89, 0x50, 0x4e, 0x47];

test.describe("stats, sharing and reuse", () => {
  test("stats page matches the database", async ({ page }) => {
    const errors = watchConsole(page);
    await page.goto("/stats");
    const companies = await n("select count(*) as n from organizations_public where kind = 'company'");
    await expect(page.getByTestId("totals").locator(".stat").first()).toContainText(String(companies));
    const sectors = await n("select count(distinct s) as n from organizations_public, unnest(sectors) s where kind = 'company'");
    const sectorChart = page.locator("figure.chart").first();
    await expect(sectorChart.locator("svg[role=img]")).toBeVisible();
    await sectorChart.getByText("Show the numbers").click();
    await expect(sectorChart.locator("tbody tr")).toHaveCount(sectors);
    expect(errors).toEqual([]);
  });

  test("pages have share images", async ({ page, request }) => {
    for (const path of ["/", "/c/spinny"]) {
      await page.goto(path);
      const og = await page.locator('meta[property="og:image"]').first().getAttribute("content");
      expect(og, path).toBeTruthy();
      const img = await request.get(new URL(og!).pathname + new URL(og!).search);
      expect(img.status(), og!).toBe(200);
      expect(img.headers()["content-type"]).toBe("image/png");
      expect([...(await img.body()).subarray(0, 4)]).toEqual(PNG);
    }
    await page.goto("/c/spinny");
    expect(await page.locator('meta[name="twitter:card"]').getAttribute("content")).toBe("summary_large_image");
  });

  test("the embed can be framed by other sites; the main site can't", async ({ page, request }) => {
    const embed = await request.get("/embed?sector=fintech");
    expect(embed.headers()["content-security-policy"]).toContain("frame-ancestors *");
    expect(embed.headers()["x-frame-options"]).toBeUndefined();
    const home = await request.get("/");
    expect(home.headers()["x-frame-options"]).toBe("DENY");

    const errors = watchConsole(page);
    await page.goto("/embed?sector=fintech");
    const pinned = await n("select count(*) as n from organizations_public where kind = 'company' and 'fintech' = any(sectors) and lng is not null");
    await expect(page.getByTestId("embed-count")).toHaveText(`${pinned} on the map · Fintech`);
    await expect(page.locator(".sidebar")).toHaveCount(0);
    await expect(page.locator(".embed-head a")).toHaveAttribute("target", "_blank");
    expect(errors).toEqual([]);

    // Really inside another site's iframe: the local gateway (another origin) serves a page that frames it.
    await page.goto(`${env().gateway}/__e2e/frame?src=${encodeURIComponent("/embed?station=cyber-city&r=1000")}`);
    const frame = page.frameLocator("iframe");
    await expect(frame.getByTestId("embed-count")).toContainText("of Cyber City");
  });

  test("badges are safe SVGs for known profiles only", async ({ request }) => {
    const res = await request.get("/badge/spinny");
    expect(res.status()).toBe(200);
    expect(res.headers()["content-type"]).toContain("image/svg+xml");
    expect(res.headers()["content-security-policy"]).toContain("sandbox");
    expect(res.headers()["x-content-type-options"]).toBe("nosniff");
    const svg = await res.text();
    expect(svg).toContain("Delhi Tech Map");
    expect(svg).not.toMatch(/<script|href=/i);
    expect((await request.get("/badge/spinny?theme=light")).status()).toBe(200);
    for (const bad of ["/badge/no-such-company", "/badge/%3Cscript%3E", "/badge/..%2F..%2Fetc"]) {
      expect((await request.get(bad)).status(), bad).toBe(404);
    }
  });

  test("the MCP endpoint answers read-only tool calls", async ({ request }) => {
    const rpc = (body: unknown, headers: Record<string, string> = { "content-type": "application/json" }) =>
      request.post("/api/mcp", { data: typeof body === "string" ? body : JSON.stringify(body), headers });

    const init = await rpc({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "e2e", version: "1" } } });
    expect(init.status()).toBe(200);
    expect(init.headers()["access-control-allow-origin"]).toBe("*");
    expect((await init.json()).result.serverInfo.name).toBe("delhincr-map");

    expect((await rpc({ jsonrpc: "2.0", method: "notifications/initialized" })).status()).toBe(202);

    const list = await (await rpc({ jsonrpc: "2.0", id: 2, method: "tools/list" })).json();
    expect(list.result.tools.length).toBeGreaterThanOrEqual(7);

    const search = await (await rpc({ jsonrpc: "2.0", id: 3, method: "tools/call", params: { name: "search_organizations", arguments: { query: "spinny" } } })).json();
    expect(search.result.isError).toBe(false);
    expect(search.result.structuredContent.results[0]).toMatchObject({ slug: "spinny", url: expect.stringMatching(/\/c\/spinny$/) });

    const near = await (await rpc({ jsonrpc: "2.0", id: 4, method: "tools/call", params: { name: "near_metro_station", arguments: { station: "cyber-city", radius_m: 1000 } } })).json();
    expect(near.result.structuredContent.station).toBe("Cyber City");

    // Errors and limits.
    expect((await request.get("/api/mcp")).status()).toBe(405);
    expect((await rpc("hello", { "content-type": "text/plain" })).status()).toBe(415);
    expect((await rpc("{not json")).status()).toBe(400);
    expect((await rpc([])).status()).toBe(400);
    expect((await rpc(JSON.stringify({ jsonrpc: "2.0", id: 5, method: "ping", params: { pad: "x".repeat(70_000) } }))).status()).toBe(413);
    const unknown = await (await rpc({ jsonrpc: "2.0", id: 6, method: "tools/call", params: { name: "delete_everything" } })).json();
    expect(unknown.error.code).toBe(-32602);
  });
});
