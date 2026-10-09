import { expect, test } from "./fixtures";

test.describe("layout and keyboard", () => {
  test("phones get the whole page without sideways scrolling", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    for (const path of ["/", "/c/spinny", "/hiring", "/events", "/metro", "/stats", "/data"]) {
      await page.goto(path);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(overflow, path).toBeLessThanOrEqual(0);
    }
  });

  test("keyboard users see where they are", async ({ page }) => {
    await page.goto("/");
    await page.locator(".list .item").first().waitFor();
    const ring = async () => page.evaluate(() => getComputedStyle(document.activeElement!).boxShadow);
    await page.getByRole("button", { name: "Support" }).focus();
    await page.keyboard.press("Tab"); // move on with the keyboard so :focus-visible applies
    await page.keyboard.press("Shift+Tab");
    expect(await ring()).not.toBe("none");
    await page.locator(".list .item").first().focus();
    await page.keyboard.press("Tab");
    await page.keyboard.press("Shift+Tab");
    expect(await ring()).not.toBe("none");
  });

  test("list rows carry their sector colour, shown as a bar on the selected row", async ({ page }) => {
    // Near a station, every row has a pin, so the first click selects it on the map.
    await page.goto("/?station=cyber-city&r=1000");
    const first = page.locator(".list .item").first();
    await expect(first.locator(".dist")).toBeVisible();
    expect(await first.evaluate((el) => getComputedStyle(el).getPropertyValue("--c").trim())).toMatch(/^#[0-9a-f]{6}$/i);
    await first.click();
    await expect(first).toHaveAttribute("data-selected", "true");
    expect(await first.evaluate((el) => getComputedStyle(el, "::before").opacity)).toBe("1");
  });
});
