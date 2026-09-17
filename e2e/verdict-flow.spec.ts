import { test, expect } from "@playwright/test";

/**
 * The core flow, as far as it goes with no key: type → submit → the server answers honestly (no NANSEN_API_KEY) and
 * the page shows the error banner instead of a spinner. The 400 path is exercised over the wire, before any Nansen call.
 */
test.describe("verdict flow without a key", () => {
  test("typing a ticker and submitting shows the honest 'no key' banner, not a stuck spinner", async ({ page }) => {
    await page.goto("/");
    const input = page.getByPlaceholder(/type a ticker/i);
    await input.fill("PEPE");
    await page.getByRole("button", { name: "Check" }).click();
    const banner = page.locator(".banner.err");
    await expect(banner).toBeVisible({ timeout: 15_000 });
    await expect(banner).toContainText("NANSEN_API_KEY");
    await expect(page.getByRole("button", { name: "Check" })).toBeEnabled();
    await expect(page).toHaveURL(/\?q=PEPE/);
  });

  test("an example chip fills the input and runs", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: "WLFI" }).click();
    await expect(page.getByPlaceholder(/type a ticker/i)).toHaveValue("WLFI");
    await expect(page.locator(".banner.err")).toBeVisible({ timeout: 15_000 });
  });

  test("/api/verdict rejects a malformed query with 400 before touching the key or the network", async ({ request }) => {
    for (const q of ["<script>", "A".repeat(45), "%00", ""]) {
      const res = await request.get(`/api/verdict?q=${encodeURIComponent(q)}`);
      expect(res.status(), q).toBe(400);
      expect((await res.json()).error).toMatch(/1–44/);
    }
    const stream = await request.get("/api/verdict?q=%3Cb%3E&stream=1");
    expect(stream.status()).toBe(400);
  });

  test("/api/verdict with a valid query and no server key is a 500 that names the missing variable", async ({ request }) => {
    const res = await request.get("/api/verdict?q=PEPE");
    expect(res.status()).toBe(500);
    expect((await res.json()).error).toContain("NANSEN_API_KEY");
  });

  test("the /q permalink renders the shell with the query filled in when the server-side verdict is unavailable", async ({ page }) => {
    const res = await page.goto("/q/PEPE");
    expect(res?.status()).toBe(200);
    await expect(page.getByPlaceholder(/type a ticker/i)).toHaveValue("PEPE");
    await expect(page).toHaveTitle(/Which PEPE is real/);
  });

  test("/q/%25 (a bare percent) does not 500", async ({ page }) => {
    const res = await page.goto("/q/%25");
    expect(res?.status()).toBe(200);
  });
});
