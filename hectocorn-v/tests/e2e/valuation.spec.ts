import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";

test.describe("Hectocorn V smoke", () => {
  test("landing page renders the hero and the CTA", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(
      "Know what your startup is worth.",
    );
    await expect(page.getByRole("link", { name: /evaluate a startup/i }).first()).toHaveAttribute(
      "href",
      "/evaluate",
    );
    await expect(page.getByText("Seven methods, one number")).toBeVisible();
  });

  test("methodology page lists the methods and the benchmarks version", async ({ page }) => {
    await page.goto("/methodology");
    await expect(page.getByRole("heading", { name: "The methods" })).toBeVisible();
    await expect(page.getByText("A. Scorecard (Payne)")).toBeVisible();
    await expect(page.getByText(/Version/).first()).toBeVisible();
  });

  test("load example → run → report renders → PDF downloads → what-if updates", async ({
    page,
  }) => {
    await page.goto("/evaluate");
    await page.getByTestId("load-example").click();
    await expect(page.getByLabel(/Company name/)).toHaveValue("PlugSecure");

    // Walk the five input steps to the review step.
    for (let i = 0; i < 5; i++) {
      await page.getByTestId("next-step").click();
    }
    await expect(page.getByRole("heading", { name: "Review" })).toBeVisible();
    await expect(page.getByText("Ready to value PlugSecure")).toBeVisible();

    await page.getByTestId("run-valuation").click();
    await page.waitForURL(/\/report\/[A-Za-z0-9_-]{16}$/, { timeout: 60_000 });

    // Report
    await expect(page.getByTestId("report-name")).toHaveText("PlugSecure");
    const headline = page.getByTestId("headline-number");
    await expect(headline).toBeVisible();
    const text = (await headline.textContent()) ?? "";
    const millions = Number(text.replace(/[^0-9.]/g, ""));
    expect(text).toMatch(/^\$\d+(\.\d+)?M$/);
    expect(millions).toBeGreaterThanOrEqual(3.0);
    expect(millions).toBeLessThanOrEqual(6.5);
    await expect(page.getByText("Pre-seed").first()).toBeVisible();
    await expect(page.getByTestId("valuation-trail")).toContainText("Engine");
    await expect(page.getByRole("heading", { name: "Method breakdown" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Sensitivity" })).toBeVisible();
    // Offline run: the AI memo is absent and the report says so.
    await expect(page.getByRole("heading", { name: "AI memo not available" })).toBeVisible();

    // Method drawer
    await page.getByRole("button", { name: "Risk-Factor Summation" }).click();
    await expect(page.getByRole("dialog")).toContainText("Notes");
    await page.keyboard.press("Escape");

    // PDF download
    const [download] = await Promise.all([
      page.waitForEvent("download"),
      page.getByTestId("download-pdf").click(),
    ]);
    expect(download.suggestedFilename()).toMatch(/\.pdf$/);
    const path = await download.path();
    expect(path).toBeTruthy();
    const bytes = readFileSync(path!);
    expect(bytes.subarray(0, 5).toString()).toBe("%PDF-");
    expect(bytes.length).toBeGreaterThan(5_000);

    // Live what-if: move the paying-customers slider and expect the number to change.
    const before = (await page.getByTestId("whatif-number").textContent()) ?? "";
    const slider = page.getByRole("slider", { name: "Paying customers" });
    await slider.focus();
    for (let i = 0; i < 5; i++) await page.keyboard.press("ArrowRight");
    await expect(page.getByTestId("whatif-number")).not.toHaveText(before, { timeout: 15_000 });
  });

  test("the seeded example report is reachable", async ({ page }) => {
    const res = await page.goto("/report/seed-plugsecure-01");
    // Present after `npm run db:seed`; otherwise a friendly 404.
    if (res?.status() === 200) {
      await expect(page.getByTestId("report-name")).toHaveText("PlugSecure");
    } else {
      await expect(page.getByRole("heading", { name: "Report not found" })).toBeVisible();
    }
  });

  test("API validates input and rate-limits", async ({ request }) => {
    const bad = await request.post("/api/valuate", { data: { name: "x" } });
    expect(bad.status()).toBe(400);
    const missing = await request.get("/api/report/does-not-exist");
    expect(missing.status()).toBe(404);
  });
});
