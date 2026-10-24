// Optional asset-authoring tool; generated PNGs are committed, not built in hosting.
import { mkdir, readFile } from "node:fs/promises";
import { chromium } from "@playwright/test";

const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH,
  headless: true,
});
try {
  const svg = await readFile("frontend/favicon.svg", "utf8");
  await mkdir("frontend/icons", { recursive: true });
  for (const [name, size, inset] of [
    ["icon-192", 192, 0],
    ["icon-512", 512, 0],
    ["apple-touch-icon", 180, 0],
    ["icon-maskable-512", 512, 96],
  ]) {
    const page = await browser.newPage({
      viewport: { width: size, height: size },
      deviceScaleFactor: 1,
    });
    await page.setContent(
      `<body style="margin:0;background:#71508b;padding:${inset}px">${svg.replace("<svg ", `<svg width="${size - 2 * inset}" height="${size - 2 * inset}" `)}</body>`,
    );
    await page.screenshot({ path: `frontend/icons/${name}.png` });
    await page.close();
  }
} finally {
  await browser.close();
}
