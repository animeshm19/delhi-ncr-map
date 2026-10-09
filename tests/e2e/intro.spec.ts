import { expect, test } from "./fixtures";
import { watchConsole } from "./helpers";

test.describe("opening animation", () => {
  test("the map opens flat, then glides into 3D once loaded", async ({ page }) => {
    const errors = watchConsole(page);
    await page.goto("/");
    const map = page.locator(".map");
    // It starts top-down (2D) and waits for the map to load before flying.
    await expect(map).toHaveAttribute("data-intro", /waiting|flying|done/, { timeout: 15_000 });
    await expect(map).toHaveAttribute("data-intro", "done", { timeout: 20_000 });
    expect(Number(await map.getAttribute("data-pitch"))).toBeGreaterThan(45);
    await expect(page.getByRole("button", { name: "3D", exact: true })).toHaveAttribute("aria-pressed", "true");
    // 2D still works afterwards.
    await page.getByRole("button", { name: "2D", exact: true }).click();
    await expect.poll(async () => Number(await map.getAttribute("data-pitch")), { timeout: 5000 }).toBe(0);
    expect(errors.filter((e) => !/favicon|\/logo\//.test(e))).toEqual([]);
  });

  test("links that open a company or station skip it and go straight there", async ({ page }) => {
    await page.goto("/?station=cyber-city&r=1000");
    const map = page.locator(".map");
    await expect(map).toHaveAttribute("data-intro", "done", { timeout: 15_000 });
    await expect(map).toHaveAttribute("data-zoom", "14.0", { timeout: 10_000 });
    await expect(page.getByRole("button", { name: "2D", exact: true })).toHaveAttribute("aria-pressed", "true");
  });

  test("people who prefer reduced motion get the 3D view without the flight", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/");
    const map = page.locator(".map");
    await expect(map).toHaveAttribute("data-intro", "done", { timeout: 15_000 });
    await expect(page.getByRole("button", { name: "3D", exact: true })).toHaveAttribute("aria-pressed", "true");
  });
});
