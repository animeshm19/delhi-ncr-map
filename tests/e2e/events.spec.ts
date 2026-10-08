import { expect, test } from "./fixtures";
import { humanPause, signIn, sql, watchConsole } from "./helpers";

// A datetime-local value N days from now, in IST.
const istLocal = (days: number, hour = 18) => {
  const d = new Date(Date.now() + days * 86_400_000);
  const day = d.toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
  return `${day}T${String(hour).padStart(2, "0")}:30`;
};

const TITLE = `<img src=x onerror=alert(1)> AI Night; Gurugram, edition 1`;

test.describe.serial("events", () => {
  let eventId = 0;

  test("anyone can suggest an event; it waits for review", async ({ page }) => {
    await page.goto("/events/submit");
    const form = page.getByTestId("form-event");
    await form.getByLabel("Event name").fill(TITLE);
    await form.getByLabel("Starts (India time)").fill(istLocal(3));
    await form.getByLabel("Ends (optional)").fill(istLocal(3, 21));
    await form.getByLabel("City").selectOption("Gurugram");
    await form.getByLabel("Venue").fill("Cyber Hub");
    await form.getByLabel("Event page").fill("https://lu.ma/e2e-ai-night");
    await form.getByLabel("Organised by").fill("E2E Club");
    await form.getByLabel("What it's about").fill("Demos,\nthen dinner.");
    await form.getByLabel(/email/i).fill("host@e2e.test");
    await humanPause(page);
    await form.getByRole("button", { name: "Suggest the event" }).click();
    await expect(page.getByText("Thanks, it's in the review queue.")).toBeVisible();

    const [row] = await sql<{ type: string; org_slug: string | null }>(
      "select type, org_slug from review_queue where payload->>'title' = $1",
      [TITLE],
    );
    expect(row).toEqual({ type: "event", org_slug: null });

    // Not public until reviewed.
    await page.goto("/events");
    await expect(page.getByText("AI Night")).toHaveCount(0);
  });

  test("the API refuses bad event suggestions", async ({ request }) => {
    const post = (fields: Record<string, string>) =>
      request.post("/api/requests", {
        data: JSON.stringify({ type: "event", contact: "x@e2e.test", started_at: Date.now() - 10_000, fields }),
        headers: { "content-type": "application/json" },
      });
    expect((await post({ title: "x", starts_at: istLocal(3), url: "javascript:alert(1)" })).status()).toBe(400);
    expect((await post({ title: "x", starts_at: "2001-01-01T10:00", url: "https://x.example" })).status()).toBe(400);
    expect((await post({ title: "", starts_at: istLocal(3), url: "https://x.example" })).status()).toBe(400);
  });

  test("a reviewer publishes it to the calendar, feeds and this week", async ({ page, request }) => {
    let dialog = false;
    page.on("dialog", (d) => ((dialog = true), d.dismiss()));
    await signIn(page, "admin@e2e.test");
    const errors = watchConsole(page);
    await page.goto("/admin");
    const card = page.locator("section.review", { hasText: "AI Night" });
    await expect(card.locator("input[name=title]")).toHaveValue(TITLE);
    await card.getByRole("button", { name: "Publish event" }).click();
    await expect(page.getByText(/Published “/)).toBeVisible();
    expect(errors, "the review page renders without hydration errors").toEqual([]);
    eventId = (await sql<{ id: number }>("select id from events where title = $1", [TITLE]))[0].id;

    await page.goto("/events");
    const item = page.getByTestId(`event-${eventId}`);
    await expect(item.getByRole("link", { name: TITLE, exact: true })).toHaveAttribute("href", "https://lu.ma/e2e-ai-night");
    await expect(item).toContainText("6:30");
    await expect(item).toContainText("Cyber Hub, Gurugram");
    expect(dialog).toBe(false);

    // One event as .ics, with the title escaped so it can't add properties.
    const one = await request.get(`/events/${eventId}/ics`);
    expect(one.headers()["content-type"]).toContain("text/calendar");
    const ics = await one.text();
    expect(ics).toContain(`UID:event-${eventId}@delhi-ncr-map`);
    expect(ics).toContain("SUMMARY:<img src=x onerror=alert(1)> AI Night\\; Gurugram\\, edition 1");
    expect(ics).toContain("URL:https://lu.ma/e2e-ai-night");

    // The subscribable feed has it too.
    const feed = await (await request.get("/events.ics")).text();
    expect(feed).toContain(`UID:event-${eventId}@delhi-ncr-map`);
    expect(feed.split("\r\n").filter((l) => l === "BEGIN:VEVENT").length).toBeGreaterThanOrEqual(1);

    // RSS is well-formed XML with the title escaped.
    const rss = await request.get("/feed.xml");
    expect(rss.headers()["content-type"]).toContain("application/rss+xml");
    const xml = await rss.text();
    expect(xml).not.toContain("<img");
    const parsed = await page.evaluate((x) => {
      const doc = new DOMParser().parseFromString(x, "application/xml");
      return { error: !!doc.querySelector("parsererror"), titles: [...doc.querySelectorAll("item > title")].map((t) => t.textContent) };
    }, xml);
    expect(parsed.error).toBe(false);
    expect(parsed.titles).toContain(`Event: ${TITLE}`);

    // This week.
    await page.goto("/this-week");
    await expect(page.getByTestId(`event-${eventId}`)).toBeVisible();
  });

  test("a reviewer can take an event down", async ({ page, request }) => {
    await signIn(page, "admin@e2e.test");
    await page.goto("/admin#events");
    await page.getByTestId("admin-events").locator("li", { hasText: "AI Night" }).getByRole("button", { name: "Take down" }).click();
    await expect(page.getByText("Event taken down.")).toBeVisible();
    await page.goto("/events");
    await expect(page.getByTestId(`event-${eventId}`)).toHaveCount(0);
    expect((await request.get(`/events/${eventId}/ics`)).status()).toBe(404);
    expect((await request.get("/events/not-a-number/ics")).status()).toBe(404);
  });
});
