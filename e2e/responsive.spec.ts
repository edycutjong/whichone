import { test, expect } from "@playwright/test";

/** Layout at phone / tablet / desktop widths: no horizontal overflow, tappable controls, header fits. */
const widths = [
  { name: "mobile", width: 375, height: 812 },
  { name: "tablet", width: 768, height: 1024 },
  { name: "desktop", width: 1440, height: 900 },
];

for (const vp of widths) {
  test.describe(`${vp.name} ${vp.width}px`, () => {
    test.use({ viewport: { width: vp.width, height: vp.height } });

    test("home: no horizontal scroll, input and button are tappable", async ({ page }) => {
      await page.goto("/");
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(overflow).toBeLessThanOrEqual(0);
      const input = page.getByPlaceholder(/type a ticker/i);
      const btn = page.getByRole("button", { name: "Check" });
      for (const el of [input, btn]) {
        const box = await el.boundingBox();
        expect(box, "control has a box").not.toBeNull();
        expect(box!.height).toBeGreaterThanOrEqual(36);
        expect(box!.x + box!.width).toBeLessThanOrEqual(vp.width);
      }
      const h1 = await page.getByRole("heading", { level: 1 }).boundingBox();
      expect(h1!.width).toBeLessThanOrEqual(vp.width);
    });

    test("judge page: no horizontal scroll, the receipt table and code blocks stay inside the viewport", async ({ page }) => {
      await page.goto("/judge");
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(overflow).toBeLessThanOrEqual(0);
      for (const pre of await page.locator("pre").all()) {
        const box = await pre.boundingBox();
        expect(box!.x + box!.width).toBeLessThanOrEqual(vp.width + 1);
      }
    });
  });
}
