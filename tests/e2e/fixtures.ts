import { test as base, expect } from "@playwright/test";

/**
 * Every test gets an offline basemap: requests to the tile server are answered
 * with a tiny style, so tests don't depend on a third-party server being up
 * (and work in sandboxes with no internet). Pins, popups and filters are ours.
 */
export const test = base.extend({
  page: async ({ page }, use) => {
    await page.route("https://tiles.openfreemap.org/**", (route) =>
      route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({
          version: 8,
          sources: {},
          layers: [{ id: "bg", type: "background", paint: { "background-color": "#0a0b0d" } }],
        }),
      }),
    );
    await use(page);
  },
});
export { expect };
