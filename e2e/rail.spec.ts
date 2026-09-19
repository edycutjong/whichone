import { test, expect } from "@playwright/test";

/**
 * The Nansen call rail: on load the recorded example's calls already fill it (replayed · 0 cr), it is a landmark with
 * a live region, the counters agree with the example, `clear` empties it to the empty state, and below 1280 px it is a
 * bottom bar that opens with a tap and with Enter. No key, no network, 0 credits.
 */
test.describe("Nansen call rail", () => {
  test("is a landmark that already lists the example's replayed calls with 0 credits", async ({ page }) => {
    await page.goto("/");
    const rail = page.getByRole("complementary", { name: "Nansen API calls" });
    await expect(rail).toHaveAttribute("aria-live", "polite");
    const rows = rail.locator(".rail-row");
    await expect(rows).toHaveCount(17); // fixtures/PEPE.json: 17 recorded calls
    await expect(rows.first()).toContainText("search/general");
    await expect(rail.locator(".rail-cr").first()).toHaveText("replayed · 0 cr");
    await expect(rail.locator(".rail-counters dd").nth(0)).toHaveText("17");
    await expect(rail.locator(".rail-counters dd").nth(1)).toHaveText("0");
    await expect(rail.locator(".rail-counters dd").nth(2)).toHaveText("replayed");
    await expect(rail.locator(".rail-foot")).toContainText("session · 17 calls · 0 credits");
    // never a key-shaped string, never a full request body
    expect(await rail.innerText()).not.toMatch(/nsn_[A-Za-z0-9_]{8,}/);
    expect(await rail.innerText()).not.toContain("token_address");
  });

  test("clear empties it to the empty state, which points at the live example", async ({ page, isMobile }) => {
    await page.goto("/");
    if (isMobile) await page.getByRole("button", { name: /Nansen calls/ }).click();
    await page.getByRole("button", { name: "clear" }).click();
    const rail = page.getByRole("complementary", { name: "Nansen API calls" });
    await expect(rail.locator(".rail-row")).toHaveCount(0);
    await expect(rail.locator(".rail-empty")).toContainText("No calls yet");
    await expect(rail.getByRole("button", { name: "run the example live" })).toBeVisible();
  });

  test("a live run streams rows: pending first, then the honest failure lands as a red row (no key)", async ({ page, isMobile }) => {
    await page.goto("/");
    await page.getByLabel("ticker").fill("PEPE");
    await page.getByRole("button", { name: "Check" }).click();
    await expect(page.locator(".banner.err")).toBeVisible({ timeout: 15_000 });
    // without a key the route answers 500 before any Nansen call, so the rail must show NO new rows and no stuck pending row
    const rail = page.getByRole("complementary", { name: "Nansen API calls" });
    if (isMobile) await page.getByRole("button", { name: /Nansen calls/ }).click();
    await expect(rail.locator(".rail-row.pending")).toHaveCount(0);
    await expect(rail.locator(".rail-row")).toHaveCount(17);
  });

  test("layout: fixed right rail at ≥ 1280 px, a bottom bar below it that opens by tap and by Enter", async ({ page, isMobile }) => {
    await page.goto("/");
    const rail = page.getByRole("complementary", { name: "Nansen API calls" });
    const bar = page.getByRole("button", { name: /Nansen calls/ });
    if (isMobile) {
      await expect(bar).toBeVisible();
      const box = await bar.boundingBox();
      expect(box!.height).toBeGreaterThanOrEqual(44);
      await expect(rail.locator(".rail-list")).toBeHidden();
      await bar.click();
      await expect(bar).toHaveAttribute("aria-expanded", "true");
      await expect(rail.locator(".rail-list")).toBeVisible();
      await bar.focus();
      await page.keyboard.press("Enter");
      await expect(bar).toHaveAttribute("aria-expanded", "false");
      await expect(rail.locator(".rail-list")).toBeHidden();
      // the bar never hides the input the user is typing into
      const input = await page.getByLabel("ticker").boundingBox();
      expect(input!.y + input!.height).toBeLessThan(box!.y);
    } else {
      await page.setViewportSize({ width: 1920, height: 1080 });
      await expect(bar).toBeHidden();
      const box = await rail.boundingBox();
      expect(box!.width).toBe(360);
      // measured from the layout viewport's inner edge: a classic (non-overlay) scrollbar on Linux CI eats ~15 px
      const clientWidth = await page.evaluate(() => document.documentElement.clientWidth);
      expect(box!.x + box!.width).toBe(clientWidth - 24);
      expect(box!.y).toBe(84);
      // the content column does not run under the rail
      const main = await page.locator("main.wrap").boundingBox();
      expect(main!.x + main!.width).toBeLessThanOrEqual(box!.x);
      // rows are output, not focusable; the clear control is
      expect(await rail.locator(".rail-row [tabindex], .rail-row button, .rail-row a").count()).toBe(0);
      await page.getByRole("button", { name: "clear" }).focus();
      await expect(page.getByRole("button", { name: "clear" })).toBeFocused();
    }
  });
});
