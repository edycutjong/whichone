import { test, expect } from "@playwright/test";

/** Smoke: the app loads with no NANSEN_API_KEY, no error overlay, correct metadata, no key-shaped bytes anywhere. */
const KEY_SHAPE = /nsn_[A-Za-z0-9_]{8,}/;

test.describe("demo mode (no API key)", () => {
  test("home page renders the hero, the input and the example chips", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    const res = await page.goto("/");
    expect(res?.status()).toBe(200);
    await expect(page.getByRole("heading", { level: 1 })).toContainText("real");
    await expect(page.getByPlaceholder(/type a ticker/i)).toBeVisible();
    await expect(page.getByRole("button", { name: "PEPE" })).toBeVisible();
    await expect(page.locator("nextjs-portal")).toHaveCount(0);
    expect(errors).toEqual([]);
  });

  test("metadata: title, description, Open Graph image, Twitter card", async ({ page }) => {
    await page.goto("/");
    await expect(page).toHaveTitle(/Which One's Real/);
    await expect(page.locator('meta[name="description"]')).toHaveAttribute("content", /ticker/i);
    await expect(page.locator('meta[property="og:image"]')).toHaveAttribute("content", /\/api\/og/);
    await expect(page.locator('meta[name="twitter:card"]')).toHaveAttribute("content", "summary_large_image");
  });

  test("the page HTML, the JSON API and the NDJSON stream never contain a key-shaped string", async ({ page, request }) => {
    const html = await (await page.goto("/?q=PEPE"))!.text();
    expect(html).not.toMatch(KEY_SHAPE);
    const json = await request.get("/api/verdict?q=PEPE");
    expect(await json.text()).not.toMatch(KEY_SHAPE);
    const ndjson = await request.get("/api/verdict?q=PEPE&stream=1");
    expect(await ndjson.text()).not.toMatch(KEY_SHAPE);
    const og = await request.get("/api/og?q=PEPE");
    expect(og.status()).toBe(200);
    expect(og.headers()["content-type"]).toContain("image/png");
  });
});
