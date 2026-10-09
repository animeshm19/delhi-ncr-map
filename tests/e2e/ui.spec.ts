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

  for (const [width, height] of [[360, 740], [390, 844], [412, 915]]) {
    test(`phones (${width}×${height}) can reach the company list under the map and open a company`, async ({ page }) => {
      await page.setViewportSize({ width, height });
      await page.goto("/");
      await expect(page.locator(".map")).toHaveAttribute("data-intro", "done", { timeout: 20_000 });
      const list = page.locator(".list");
      expect((await list.boundingBox())!.height).toBeGreaterThan(300);
      const first = page.locator(".list .item").first();
      await first.scrollIntoViewIfNeeded();
      await expect(first).toBeInViewport();
      const name = (await first.locator(".item-name").textContent())!.trim();
      await first.click();
      await expect(page.getByTestId("org-panel").getByRole("heading", { name, level: 2 })).toBeVisible();
    });
  }

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

  for (const scheme of ["dark", "light"] as const) {
    test(`dropdowns are dark, not white, with the system in ${scheme} mode`, async ({ page }) => {
      await page.emulateMedia({ colorScheme: scheme });
      for (const path of ["/", "/events/submit"]) {
        await page.goto(path);
        const selects = await page.locator("select").evaluateAll((els) =>
          els.map((el) => {
            const cs = getComputedStyle(el);
            const opt = el.querySelector("option");
            return {
              label: el.getAttribute("aria-label") ?? el.getAttribute("name"),
              bg: cs.backgroundColor,
              appearance: cs.appearance,
              optionBg: opt ? getComputedStyle(opt).backgroundColor : null,
            };
          }),
        );
        expect(selects.length, path).toBeGreaterThan(0);
        // Dark means every colour channel is low; white or transparent fails.
        const dark = (c: string | null) => !!c && /^rgb\((\d+), (\d+), (\d+)\)$/.test(c) && c.match(/\d+/g)!.every((n) => Number(n) < 60);
        for (const s of selects) {
          expect(s.appearance, `${path} ${s.label}`).toBe("none");
          expect(dark(s.bg), `${path} ${s.label} background ${s.bg}`).toBe(true);
          expect(dark(s.optionBg), `${path} ${s.label} options ${s.optionBg}`).toBe(true);
        }
      }
    });
  }
});
