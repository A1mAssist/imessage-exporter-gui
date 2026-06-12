import { existsSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { chromium } from "playwright-core";

const root = fileURLToPath(new URL("..", import.meta.url));
const previewUrl = pathToFileURL(join(root, "preview", "index.html")).toString();
const browserPath = process.env.BROWSER_PATH || findBrowser();

await render("preview-desktop.png", { width: 1440, height: 1000 });
await render("preview-compact.png", { width: 1100, height: 850 });

console.log("Preview screenshots updated.");

async function render(fileName, viewport) {
  const browser = await chromium.launch({
    headless: true,
    executablePath: browserPath,
  });
  try {
    const page = await browser.newPage({ viewport, deviceScaleFactor: 1 });
    await page.goto(previewUrl, { waitUntil: "networkidle" });
    await page.screenshot({ path: join(root, "preview", fileName), fullPage: true });
    console.log(`${fileName}: ${viewport.width}x${viewport.height}`);
  } finally {
    await browser.close();
  }
}

function findBrowser() {
  const candidates = [
    "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
    "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
  ];
  const browser = candidates.find(existsSync);
  if (!browser) throw new Error("Chrome or Edge was not found.");
  return browser;
}
