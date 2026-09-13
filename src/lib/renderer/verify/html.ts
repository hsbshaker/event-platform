/**
 * The measurable document: the production renderer, the production stylesheet, the production
 * fonts.
 *
 * `docs/event-renderer-system.md §3.1`: geometry verification "runs in a headless browser against
 * the production renderer". That is meant literally here. This module renders `EventPage` — the
 * same component tree a guest is served, through the same dispatcher, with the same semantic
 * palette, typography, motifs and opaque shells — with `renderToStaticMarkup`, and wraps it in a
 * document carrying `src/styles/event-tokens.css` verbatim.
 *
 * There is no second renderer here, no hand-authored markup, no `proof-b` HTML and no JSDOM
 * substitute. A verifier that measured a copy of the renderer would be measuring the copy's bugs,
 * and §3.1 would then be verifying nothing.
 *
 * # Audience
 *
 * Always `guest`. The published page is the artifact the fit is a promise about, and the
 * collaborator anchors are additive chrome (`.ev-collaborator-slot` is width-constrained to the
 * same gutter as `.ev-inner`, so it cannot widen a page) that a guest never receives at all. Not an
 * option: a caller must not be able to verify one audience and serve the other.
 *
 * # Fonts
 *
 * The page is loaded with `page.setContent`, which gives the document no origin, so
 * `url("/fonts/event/...")` in the stylesheet would resolve against nothing and every face would
 * fail. The faces for the two families this concept's pairing resolved to are therefore rewritten
 * to `data:` URIs from `public/fonts/event/`. The other 18 families' faces are dropped: nothing in
 * the stylesheet references them (only `--ev-font-display` and `--ev-font-body` name a family),
 * so the browser would never have fetched them, and inlining ~2 MB of base64 into every render of
 * every round would cost real time for no measurable difference.
 *
 * Everything else in the stylesheet is passed through byte for byte.
 */

import { readFileSync } from "node:fs";
import path from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import type { PreVerificationDesignSpec } from "../compile/spec";
import type { VerificationOverrides } from "../compile/verification";
import { EventPage } from "@/components/event-renderer/page";
import type { EventContent } from "@/components/event-renderer/contract";
import { GeometryInfrastructureError } from "./result";

/**
 * Where the assets live, relative to the process working directory.
 *
 * `process.cwd()` rather than `import.meta.url`: server code is bundled, so a module URL points at
 * a chunk rather than at `src/`, while the working directory is the function root on Vercel and the
 * repository root locally. This is the same resolution the Phase 0 spike used, and it is why
 * `next.config.ts` traces these two paths into the function explicitly.
 */
export interface AssetPaths {
  readonly stylesheet: string;
  readonly fontDir: string;
}

export const DEFAULT_ASSETS: AssetPaths = {
  stylesheet: path.join(process.cwd(), "src/styles/event-tokens.css"),
  fontDir: path.join(process.cwd(), "public/fonts/event"),
};

const stylesheetCache = new Map<string, string>();
const fontCache = new Map<string, string>();

function readStylesheet(file: string): string {
  const cached = stylesheetCache.get(file);
  if (cached !== undefined) return cached;
  let css: string;
  try {
    css = readFileSync(file, "utf8");
  } catch (cause) {
    throw new GeometryInfrastructureError(
      `event renderer stylesheet is not readable at ${file}; geometry cannot be measured without it`,
      { cause },
    );
  }
  stylesheetCache.set(file, css);
  return css;
}

function readFontBase64(fontDir: string, fileName: string): string {
  const file = path.join(fontDir, fileName);
  const cached = fontCache.get(file);
  if (cached !== undefined) return cached;
  let encoded: string;
  try {
    encoded = readFileSync(file).toString("base64");
  } catch (cause) {
    throw new GeometryInfrastructureError(
      `font asset ${fileName} is missing from ${fontDir}; measuring would fall back to system typography`,
      { cause },
    );
  }
  fontCache.set(file, encoded);
  return encoded;
}

/** The families a spec's resolved pairing asks for: display first, then body, de-duplicated. */
export function requiredFamilies(spec: PreVerificationDesignSpec): readonly string[] {
  const { display, body } = spec.tokens.typography;
  return display === body ? [display] : [display, body];
}

const FONT_FACE_RE = /@font-face\s*\{[^}]*\}/g;
const FAMILY_RE = /font-family:\s*["']?([^"';]+?)["']?\s*;/;
const URL_RE = /url\(\s*["']?([^"')]+)["']?\s*\)/;

/**
 * Keep the `@font-face` rules for `families`, rewrite their `url()` to a `data:` URI, and drop the
 * rest. Throws if a required family has no rule, or if a rule names a file that is not on disk:
 * both would mean measuring fallback metrics, which is a wrong answer rather than a slow one.
 */
export function inlineFontFaces(
  css: string,
  families: readonly string[],
  fontDir: string,
): { readonly css: string; readonly inlined: readonly string[] } {
  const wanted = new Set(families);
  const seen = new Set<string>();

  const out = css.replace(FONT_FACE_RE, (rule) => {
    const family = FAMILY_RE.exec(rule)?.[1];
    if (!family || !wanted.has(family)) return "";
    const url = URL_RE.exec(rule)?.[1];
    if (!url) {
      throw new GeometryInfrastructureError(
        `the @font-face rule for ${family} in the event stylesheet declares no src url`,
      );
    }
    seen.add(family);
    const fileName = path.basename(url);
    const encoded = readFontBase64(fontDir, fileName);
    return rule.replace(URL_RE, `url(data:font/woff2;base64,${encoded})`);
  });

  const absent = families.filter((family) => !seen.has(family));
  if (absent.length > 0) {
    throw new GeometryInfrastructureError(
      `the event stylesheet declares no @font-face for ${absent.join(", ")}; ` +
        "geometry would be measured against fallback typography",
    );
  }
  return { css: out, inlined: [...seen] };
}

export interface DocumentInput {
  readonly spec: PreVerificationDesignSpec;
  readonly content: EventContent;
  readonly overrides: VerificationOverrides;
}

export interface MeasurableDocument {
  readonly html: string;
  readonly families: readonly string[];
}

/**
 * The minimal host document.
 *
 * Only one rule of its own: zeroing the user-agent body margin, which the guest route's own layout
 * supplies in production. Everything visual comes from `event-tokens.css`; nothing here sets a
 * width, a font or a color, because anything this document decided would be a difference between
 * what was verified and what is served.
 */
export function buildMeasurableDocument(
  input: DocumentInput,
  assets: AssetPaths = DEFAULT_ASSETS,
): MeasurableDocument {
  const families = requiredFamilies(input.spec);
  const { css } = inlineFontFaces(readStylesheet(assets.stylesheet), families, assets.fontDir);

  const markup = renderToStaticMarkup(
    createElement(EventPage, {
      spec: input.spec,
      content: input.content,
      audience: "guest",
      overrides: input.overrides,
    }),
  );

  const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>geometry verification</title>
<style>html,body{margin:0;padding:0;}</style>
<style>${css}</style>
</head><body>${markup}</body></html>`;

  return { html, families };
}
