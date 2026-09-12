import chromium from "@sparticuz/chromium";
import { chromium as pw } from "playwright-core";
const t0 = Date.now();
const exe = await chromium.executablePath();
const t1 = Date.now();
const browser = await pw.launch({ executablePath: exe, args: chromium.args, headless: true });
const t2 = Date.now();
const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
await page.setContent(
  "<html><body><h1 id=h style='font:700 48px/1.1 serif'>Hello geometry</h1></body></html>",
);
const r = await page.evaluate(() => document.getElementById("h").getBoundingClientRect().toJSON());
const t3 = Date.now();
console.log(
  JSON.stringify({
    exe,
    inflateMs: t1 - t0,
    launchMs: t2 - t1,
    renderMs: t3 - t2,
    rect: r,
    version: browser.version(),
    mem: process.memoryUsage().rss,
  }),
);
await browser.close();
