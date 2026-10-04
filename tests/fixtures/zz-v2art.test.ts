import { readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { it } from "vitest";
import { InvitationCard } from "@/components/card/InvitationCard";
import { generatedTextLayer } from "@/lib/card/card-text.server";
import { formatCardDate, formatCardRsvpBy, formatCardTime } from "@/lib/card/facts";
import { paletteFromPixels, resolveInk, sampleZoneLuminance } from "@/lib/card/ink";
import { panelFor, zoneFor } from "@/lib/card/layouts";
import { insideOutline, proportionOf } from "@/lib/card/shapes";
import { launchChromium } from "./browser";
import { startStaticServer } from "./static-server";

const sharp = createRequire(import.meta.url)("sharp");
const DIR = process.env.V2_DIR!;
const cases = JSON.parse(readFileSync(`${DIR}/prompts.json`, "utf8"));
const BABY = new Set(["O-02", "CU-01"]);
it("composes", async () => {
  const server = await startStaticServer();
  const browser = await launchChromium();
  const page = await browser.newPage({ viewport: { width: 700, height: 1100 }, deviceScaleFactor: 2 });
  const report: unknown[] = [];
  for (const c of cases) {
    const png = readFileSync(`${DIR}/${c.id}.png`);
    const { data, info } = await sharp(png).removeAlpha().raw().toBuffer({ resolveWithObject: true });
    const palette = paletteFromPixels(data, info.width, info.height);
    const zone = zoneFor(c.layout, c.shape);
    const lum = sampleZoneLuminance(data, info.width, info.height, zone, (x: number, y: number) => insideOutline(c.shape, x, y));
    const ink = resolveInk({ luminances: lum, palette });
    const content = { title: c.wording.title, invitationLine: c.wording.invitationLine,
      babyName: BABY.has(c.from) ? "Theodore James" : null, hosts: "Hosted by Maya & Tom",
      date: formatCardDate("2026-06-06"), time: formatCardTime("13:00", "16:00"), venue: "The Willow House",
      rsvpBy: formatCardRsvpBy("2026-05-30T12:00:00Z", "America/Chicago") };
    const boxes = await generatedTextLayer({ layout: c.layout, shape: c.shape, pairing: c.pairing, content, ink: ink.ink });
    const panels = ink.panel ? [{ ...panelFor(c.layout, c.shape), color: ink.panel.color }] : [];
    const jpeg = await sharp(png).jpeg({ quality: 88 }).toBuffer();
    const card = renderToStaticMarkup(createElement(InvitationCard, { shape: c.shape,
      artwork: { src: `data:image/jpeg;base64,${jpeg.toString("base64")}`, proportion: proportionOf(c.shape) }, panels, boxes }));
    server.put(`/${c.id}.html`, `<!doctype html><html lang="en"><head><meta charset="utf-8"><link rel="stylesheet" href="/card-fonts.css"><style>html,body{margin:0;background:#F4F1EA}#c{width:600px;margin:20px}</style></head><body><div id="c">${card}</div></body></html>`, "text/html");
    await page.goto(`${server.origin}/${c.id}.html`);
    await page.evaluate(() => document.fonts.ready);
    await page.locator("#c").screenshot({ path: `${DIR}/card-${c.id}.png` });
    report.push({ id: c.id, ink: ink.ink, contrast: Number(ink.contrast.toFixed(2)), panel: ink.panel?.color ?? null });
  }
  writeFileSync(`${DIR}/compose.json`, JSON.stringify(report, null, 2));
  await browser.close(); await server.close();
}, 600_000);
