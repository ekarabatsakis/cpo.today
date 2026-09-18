// Captures README screenshots from a running server.
// Usage: BASE_URL=http://127.0.0.1:3000 node scripts/screenshots.mjs
import { chromium } from "playwright";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const out = path.join(here, "..", "docs", "screenshots");
const base = process.env.BASE_URL ?? "http://127.0.0.1:3000";

await mkdir(out, { recursive: true });
const browser = await chromium.launch({ args: ["--no-proxy-server"] });
const page = await browser.newPage({
  viewport: { width: 1280, height: 800 },
  deviceScaleFactor: 1,
});

await page.goto(`${base}/`, { waitUntil: "load" });
await page.waitForTimeout(400);
await page.screenshot({
  path: path.join(out, "landing.png"),
  clip: { x: 0, y: 0, width: 1280, height: 800 },
});

await page.goto(`${base}/evaluate`, { waitUntil: "load" });
await page.getByTestId("load-example").click();
await page.waitForTimeout(400);
await page.screenshot({
  path: path.join(out, "wizard.png"),
  clip: { x: 0, y: 0, width: 1280, height: 800 },
});

// Run a valuation so the screenshot shows a fresh report.
for (let i = 0; i < 5; i++) await page.getByTestId("next-step").click();
await page.getByTestId("run-valuation").click();
await page.waitForURL(/\/report\//, { timeout: 90_000 });
await page.waitForTimeout(1200);
await page.screenshot({ path: path.join(out, "report.png"), fullPage: true });
await page.screenshot({
  path: path.join(out, "report-top.png"),
  clip: { x: 0, y: 0, width: 1280, height: 800 },
});

console.log(`Wrote screenshots to ${out}`);
await browser.close();
