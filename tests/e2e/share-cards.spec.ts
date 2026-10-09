import { expect, test } from "./fixtures";
import { watchConsole } from "./helpers";

const pngSize = (b: Buffer) => ({ w: b.readUInt32BE(16), h: b.readUInt32BE(20) });

test.describe("Instagram-ready share cards", () => {
  test("the card route draws posts and stories for views and companies", async ({ request }) => {
    for (const [q, w, h] of [
      ["station=cyber-city&r=1000", 1080, 1350],
      ["station=cyber-city&r=1000&format=story", 1080, 1920],
      ["sector=fintech&city=Gurugram", 1080, 1350],
      ["", 1080, 1350],
      ["c=spinny", 1080, 1350],
      ["c=spinny&format=story", 1080, 1920],
      // Junk filters are ignored rather than failing.
      ["station=%3Cscript%3E&r=99999&sector=nope&city=Atlantis", 1080, 1350],
    ] as const) {
      const res = await request.get(`/card?${q}`);
      expect(res.status(), q).toBe(200);
      expect(res.headers()["content-type"], q).toBe("image/png");
      expect(pngSize(await res.body()), q).toEqual({ w, h });
    }
    expect((await request.get("/card?c=no-such-company")).status()).toBe(404);
    expect((await request.get("/card?c=%3Cscript%3E")).status()).toBe(404);
  });

  test("share this view: preview, story format, download and a caption with the count and link", async ({ page }) => {
    const errors = watchConsole(page);
    await page.goto("/?station=cyber-city&r=1000");
    await expect(page.locator(".listmeta span").first()).toContainText("within 1.0 km of Cyber City");
    await page.getByRole("button", { name: "Share this view" }).click();
    const dialog = page.getByRole("dialog", { name: "Share as an image" });
    await expect(dialog).toBeVisible();
    const preview = dialog.getByTestId("share-preview");
    await expect(preview).toHaveAttribute("src", /\/card\?station=cyber-city&r=1000&format=post$/);
    await expect.poll(() => preview.evaluate((i: HTMLImageElement) => i.naturalWidth), { timeout: 20_000 }).toBe(1080);

    await dialog.getByRole("button", { name: "Story 9:16" }).click();
    await expect(preview).toHaveAttribute("src", /format=story$/);
    await expect.poll(() => preview.evaluate((i: HTMLImageElement) => i.naturalHeight), { timeout: 20_000 }).toBe(1920);

    const caption = await dialog.getByRole("textbox").inputValue();
    expect(caption).toMatch(/^\d+ startups? within 1\.0 km of Cyber City metro/);
    expect(caption).toContain("/?station=cyber-city&r=1000");

    const [download] = await Promise.all([page.waitForEvent("download"), dialog.getByRole("button", { name: "Download image" }).click()]);
    expect(download.suggestedFilename()).toBe("delhi-ncr-map-cyber-city-story.png");

    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
    expect(errors.filter((e) => !/favicon|\/logo\//.test(e))).toEqual([]);
  });

  test("share a company from its panel; Esc closes the share window, not the panel", async ({ page }) => {
    await page.goto("/?c=spinny");
    const panel = page.getByTestId("org-panel");
    await panel.getByRole("button", { name: "Share Spinny as an image" }).click();
    const dialog = page.getByRole("dialog", { name: "Share as an image" });
    await expect(dialog.getByTestId("share-preview")).toHaveAttribute("src", "/card?c=spinny&format=post");
    expect(await dialog.getByRole("textbox").inputValue()).toContain("Spinny is on the Delhi NCR Map");
    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
    await expect(panel).toBeVisible();
  });

  test("profiles have a share-as-image button", async ({ page }) => {
    await page.goto("/c/spinny");
    await page.getByRole("button", { name: "Share as an image" }).click();
    await expect(page.getByRole("dialog", { name: "Share as an image" }).getByTestId("share-preview")).toHaveAttribute("src", "/card?c=spinny&format=post");
  });
});
