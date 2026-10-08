import { expect, test } from "./fixtures";
import { signIn, sql } from "./helpers";

const fileFrom = (bytes: number[] | Buffer, name: string, mimeType: string) => ({
  name,
  mimeType,
  buffer: Buffer.isBuffer(bytes) ? bytes : Buffer.from(bytes),
});
// A real 1×1 PNG.
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==", "base64");

async function fileRequest(request: import("@playwright/test").APIRequestContext, body: Record<string, unknown>) {
  const res = await request.post("/api/requests", {
    data: JSON.stringify({ started_at: Date.now() - 10_000, ...body }),
    headers: { "content-type": "application/json" },
  });
  expect(res.status()).toBe(200);
  return (await res.json()).id as number;
}

test.describe("accounts", () => {
  test("signed-in pages require signing in", async ({ page }) => {
    await page.goto("/admin");
    await expect(page).toHaveURL(/\/signin\?next=%2Fadmin$/);
    await page.goto("/account");
    await expect(page).toHaveURL(/\/signin\?next=%2Faccount$/);
  });

  test("a signed-in stranger can't open the review queue", async ({ page }) => {
    await signIn(page, "stranger@e2e.test");
    await expect(page).toHaveURL(/\/account$/);
    await page.goto("/admin");
    await expect(page).toHaveURL(/\/account\?denied=1$/);
    await expect(page.getByText("That page is for reviewers only.")).toBeVisible();
  });

  test("admin publishes a submission, and hostile text stays text", async ({ page, request }) => {
    let dialog = false;
    page.on("dialog", (d) => ((dialog = true), d.dismiss()));
    const id = await fileRequest(request, {
      type: "submit",
      contact: "founder@quantumchai.example",
      fields: {
        company_name: '<img src=x onerror="alert(1)">Quantum Chai',
        website: "https://quantumchai.example",
        city: "Gurugram",
        sector: "ai-ml",
        description: "<script>alert('xss')</script>Brews tea with qubits.",
      },
    });
    await signIn(page, "admin@e2e.test");
    await page.goto("/admin");
    const card = page.getByTestId(`request-${id}`);
    await expect(card).toBeVisible();
    await card.getByLabel("Slug").fill("quantum-chai");
    await card.getByLabel(/^Area/).selectOption("sector-44");
    await card.getByRole("button", { name: "Publish" }).click();
    await expect(page.getByRole("status")).toContainText("Published");

    await page.goto("/c/quantum-chai");
    await expect(page.getByRole("heading", { level: 1 })).toContainText('<img src=x onerror="alert(1)">Quantum Chai');
    await expect(page.getByText("<script>alert('xss')</script>Brews tea with qubits.")).toBeVisible();
    await expect(page.getByText("Sector 44")).toBeVisible();
    expect(dialog).toBe(false);
    const [row] = await sql<{ verification: string }>("select verification from organizations where slug = 'quantum-chai'");
    expect(row.verification).toBe("community_verified");
    expect(await sql("select 1 from private.audit_log where action = 'approve_submission' and target = 'quantum-chai'")).toHaveLength(1);
  });

  test("claim → approval → the owner edits their own profile and logo, and nobody else's", async ({ page, request }) => {
    const id = await fileRequest(request, { type: "claim", slug: "spinny", contact: "owner@spinny.com", fields: { name: "Asha", role: "CTO" } });

    await signIn(page, "admin@e2e.test");
    await page.goto("/admin");
    const card = page.getByTestId(`request-${id}`);
    await expect(card.getByText("email matches the company's domain")).toBeVisible();
    await card.getByRole("button", { name: "Approve claim" }).click();
    await expect(page.getByRole("status")).toContainText("Claim approved");
    await page.context().clearCookies();

    await signIn(page, "owner@spinny.com");
    await page.getByRole("link", { name: "Spinny" }).click();
    await expect(page).toHaveURL(/\/account\/spinny$/);
    const details = page.getByTestId("owner-details");
    await details.getByLabel("One-line description").fill("Inspected used cars, delivered home.");
    await details.getByLabel("We're hiring").check();
    await details.getByRole("button", { name: "Save details" }).click();
    await expect(details.getByRole("status")).toContainText("Saved");

    const logo = page.getByTestId("owner-logo");
    await logo.getByLabel("Upload a logo").setInputFiles(fileFrom(Buffer.from('<svg onload="alert(1)"/>'), "logo.png", "image/png"));
    await logo.getByRole("button", { name: "Upload logo" }).click();
    await expect(logo.getByRole("alert")).toContainText("PNG, JPEG or WebP");
    await logo.getByLabel("Upload a logo").setInputFiles(fileFrom(PNG, "logo.png", "image/png"));
    await logo.getByRole("button", { name: "Upload logo" }).click();
    await expect(logo.getByRole("status")).toContainText("Logo updated");

    await page.goto("/c/spinny");
    await expect(page.getByText("Inspected used cars, delivered home.")).toBeVisible();
    await expect(page.locator(".profile-head img")).toHaveAttribute("src", /\/storage\/v1\/object\/public\/logos\/spinny\/logo\.png\?v=\d+$/);
    await expect(page.getByText("Claimed")).toBeVisible();

    expect((await page.goto("/account/cars24"))?.status()).toBe(404);
    await page.goto("/admin");
    await expect(page).toHaveURL(/denied=1/);
  });

  test("sign-in links can't redirect off-site", async ({ page, request }) => {
    const bad = await request.get("/auth/callback?code=nope&next=https://evil.example", { maxRedirects: 0 });
    expect(bad.status()).toBe(307);
    expect(new URL(bad.headers()["location"]).pathname).toBe("/signin");
    expect(new URL(bad.headers()["location"]).host).toBe("localhost:3100");

    await page.goto("/signin?next=//evil.example/steal");
    await page.getByLabel("Email").fill("redirect@e2e.test");
    await page.getByRole("button", { name: /send/i }).click();
    await page.getByText(/check your email/i).waitFor();
    const { link } = await (await fetch(`http://localhost:54321/__e2e/last-link?email=redirect@e2e.test`)).json();
    await page.goto(link);
    await expect(page).toHaveURL("http://localhost:3100/account");
  });

  test("sign-out only works as a POST from the site", async ({ request }) => {
    expect((await request.get("/signout")).status()).toBe(405);
  });
});
