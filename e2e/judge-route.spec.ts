import { test, expect } from "@playwright/test";

/** /judge: 200 with no credentials, no cookies, no redirect; the claim sentence; the real reproduce path; no key-shaped bytes. */
const CLAIM = "Type a ticker. Fourteen tokens share the name — Nansen labels decide which one is real.";

test.describe("/judge", () => {
  test("returns 200 with no credentials and no session, no redirect, no cookies set", async ({ request }) => {
    const res = await request.get("/judge", { maxRedirects: 0 });
    expect(res.status()).toBe(200);
    expect(res.headers()["set-cookie"]).toBeUndefined();
    const html = await res.text();
    expect(html).toContain(CLAIM);
    expect(html).not.toMatch(/nsn_[A-Za-z0-9_]{8,}/);
  });

  test("carries the claim, the 30-second path, receipts, the real reproduce command and a separate replay line", async ({ page }) => {
    await page.goto("/judge");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(CLAIM);
    await expect(page.getByRole("heading", { name: "The 30-second path" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Receipts" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Honest limitations" })).toBeVisible();
    const pre = page.locator("pre");
    await expect(pre.first()).toContainText("npm run whichone -- PEPE --explain");
    await expect(pre.first()).not.toContainText("OFFLINE");
    await expect(pre.nth(1)).toContainText("npm run verify");
    await expect(page.getByText("CI / deterministic replay")).toBeVisible();
  });

  test("every live link on the page points at the deployed site or the repo", async ({ page }) => {
    await page.goto("/judge");
    const hrefs = await page.locator("a[href^='http']").evaluateAll((as) => as.map((a) => (a as HTMLAnchorElement).href));
    expect(hrefs.length).toBeGreaterThan(5);
    for (const h of hrefs)
      expect(h).toMatch(
        /^https:\/\/(whichone\.edycu\.dev|github\.com\/edycutjong\/whichone|x\.com\/edycutjong|nansen\.ai\/campaigns|app\.nansen\.ai)/,
      );
  });
});
