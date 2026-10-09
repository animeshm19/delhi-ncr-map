import { readFile } from "node:fs/promises";
import { expect, test } from "./fixtures";
import { watchConsole } from "./helpers";

const ready = async (page: import("@playwright/test").Page) =>
  expect(page.locator(".map")).toHaveAttribute("data-intro", "done", { timeout: 20_000 });

test.describe("saved companies", () => {
  test("save from the list, keep it after a reload, and filter the map to it", async ({ page }) => {
    const errors = watchConsole(page);
    await page.goto("/");
    await ready(page);

    const row = page.locator(".list > li", { hasText: "Policybazaar" });
    await row.hover();
    await row.getByRole("button", { name: "Save Policybazaar" }).click();
    await expect(row.getByRole("button", { name: "Remove Policybazaar from saved" })).toHaveAttribute("aria-pressed", "true");
    // Saving doesn't open the company.
    await expect(page.getByTestId("org-panel")).toHaveCount(0);
    await expect(page.getByRole("button", { name: /^Saved \(1\)$/ })).toBeVisible();

    await page.reload();
    await ready(page);
    await page.getByRole("button", { name: /^Saved \(1\)$/ }).click();
    await expect(page.locator(".list .item")).toHaveCount(1);
    await expect(page.locator(".list .item")).toContainText("Policybazaar");
    expect(errors.filter((e) => !/favicon/.test(e))).toEqual([]);
  });

  test("the panel and profile have a Save button that stays in sync", async ({ page }) => {
    await page.goto("/?c=spinny");
    const p = page.getByTestId("org-panel");
    await expect(p.getByRole("heading", { name: "Spinny" })).toBeVisible();
    await p.getByRole("button", { name: "Save", exact: true }).click();
    await expect(p.getByRole("button", { name: "Saved", exact: true })).toHaveAttribute("aria-pressed", "true");
    await expect(page.locator(".list > li", { hasText: "Spinny" }).locator(".save-btn.on")).toHaveCount(1);

    await page.goto("/c/spinny");
    const btn = page.getByRole("button", { name: "Saved", exact: true });
    await expect(btn).toHaveAttribute("aria-pressed", "true");
    await btn.click();
    await expect(page.getByRole("button", { name: "Save", exact: true })).toHaveAttribute("aria-pressed", "false");
  });

  test("/saved lists them, shares them, downloads a CSV and clears them", async ({ page, context }) => {
    await page.goto("/saved");
    await expect(page.getByRole("heading", { name: "Saved companies", level: 1 })).toBeVisible();
    await expect(page.getByText(/Nothing saved yet/)).toBeVisible();

    await page.evaluate(() => localStorage.setItem("dncr:saved", JSON.stringify(["spinny", "policybazaar", "<script>"])));
    await page.reload();
    const items = page.locator(".saved-list > li");
    await expect(items).toHaveCount(2); // the bad slug is ignored
    await expect(items.first()).toContainText("Spinny");

    await context.grantPermissions(["clipboard-read", "clipboard-write"]);
    await page.getByRole("button", { name: "Share this list" }).click();
    const link = await page.evaluate(() => navigator.clipboard.readText());
    expect(link).toMatch(/\/saved\?ids=spinny,policybazaar$/);

    const [download] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "Download CSV" }).click()]);
    expect(download.suggestedFilename()).toBe("delhincr-map-saved.csv");
    const csv = await readFile((await download.path())!, "utf8");
    expect(csv.split("\r\n")[0]).toBe(`"Name","Sectors","Place","Founded","Status","Profile"`);
    expect(csv).toContain("Spinny");

    await page.getByRole("button", { name: "Remove Policybazaar" }).click();
    await expect(items).toHaveCount(1);
    await page.getByRole("button", { name: "Clear all" }).click();
    await page.getByRole("button", { name: "Yes, clear all" }).click();
    await expect(items).toHaveCount(0);
    expect(await page.evaluate(() => localStorage.getItem("dncr:saved"))).toBe("[]");
  });

  test("a shared list opens read-only and can be added to my list", async ({ page }) => {
    await page.goto("/saved?ids=spinny,policybazaar");
    await expect(page.getByRole("heading", { name: "A shared list", level: 1 })).toBeVisible();
    await expect(page.locator(".saved-list > li")).toHaveCount(2);
    await page.getByRole("button", { name: "Save all to my list" }).click();
    await expect(page.getByRole("link", { name: "My saved (2)" })).toBeVisible();
  });
});
