// Generates public/favicon.ico (32×32) and public/og-image.png (1200×630)
// from the inline mark, using the Chromium bundled with Playwright.
// Usage: node scripts/generate-assets.mjs
import { chromium } from "playwright";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.join(here, "..", "public");

const MARK = (size) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 32 32"><rect width="32" height="32" rx="8" fill="#0f172a"/><path d="M8 8 L16 25 L24 8" stroke="#ffffff" stroke-width="4.5" stroke-linecap="round" stroke-linejoin="round" fill="none"/></svg>`;

const FONT =
  'ui-sans-serif, system-ui, sans-serif, "Apple Color Emoji", "Segoe UI Emoji", "Segoe UI Symbol", "Noto Color Emoji"';

function pngToIco(png) {
  // ICO container with a single PNG-encoded 32×32 entry (supported by all modern browsers).
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0); // reserved
  header.writeUInt16LE(1, 2); // type: icon
  header.writeUInt16LE(1, 4); // count
  const entry = Buffer.alloc(16);
  entry.writeUInt8(32, 0); // width
  entry.writeUInt8(32, 1); // height
  entry.writeUInt8(0, 2); // palette
  entry.writeUInt8(0, 3); // reserved
  entry.writeUInt16LE(1, 4); // planes
  entry.writeUInt16LE(32, 6); // bpp
  entry.writeUInt32LE(png.length, 8);
  entry.writeUInt32LE(6 + 16, 12);
  return Buffer.concat([header, entry, png]);
}

const browser = await chromium.launch();
try {
  await mkdir(publicDir, { recursive: true });

  // favicon.ico
  const favPage = await browser.newPage({
    viewport: { width: 32, height: 32 },
    deviceScaleFactor: 1,
  });
  await favPage.setContent(
    `<html><body style="margin:0;background:transparent">${MARK(32)}</body></html>`,
  );
  const favPng = await favPage.screenshot({ type: "png", omitBackground: true });
  await writeFile(path.join(publicDir, "favicon.ico"), pngToIco(favPng));

  // og-image.png
  const og = await browser.newPage({
    viewport: { width: 1200, height: 630 },
    deviceScaleFactor: 1,
  });
  await og.setContent(`<html><body style="margin:0">
    <div style="width:1200px;height:630px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:36px;background:linear-gradient(135deg,#f1f5f9 0%,#ffffff 55%,#f1f5f9 100%);font-family:${FONT};color:#020817">
      <div style="display:flex;align-items:center;gap:28px">
        <span style="font-size:112px;font-weight:700;letter-spacing:-0.03em;line-height:1">Hectocorn</span>
        ${MARK(120)}
      </div>
      <div style="font-size:40px;color:#64748b">AI startup valuation</div>
    </div></body></html>`);
  await writeFile(path.join(publicDir, "og-image.png"), await og.screenshot({ type: "png" }));
  console.log("Wrote public/favicon.ico and public/og-image.png");
} finally {
  await browser.close();
}
