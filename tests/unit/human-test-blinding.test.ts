import { createHash } from "node:crypto";
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { ASSETS, PUBLIC_DIR, check } from "../../scripts/human-test/publish-review.mjs";

/**
 * The Human Test #1 survey is a public URL now, so blinding is something a stranger with a
 * browser could break rather than something an operator remembers not to send.
 *
 * `docs/human-test-1/README.md`: reviewers must never see `proof-b/human-test-key.txt` (which
 * screen is model-authored and which is from the hand-authored library) or
 * `proof-b/human-test-items.json` (where each screen came from). The guarantee these tests
 * enforce is the one that matters at a public URL: *a reviewer holding only the link, with
 * normal developer tools, cannot tell which screens are model-authored.* So they read what is
 * actually served — every byte under `public/human-test-1/` — rather than what the publish
 * script intended to serve.
 *
 * They are deliberately two checks, not one. Drift asks whether the published survey is still
 * the canonical questionnaire; blinding asks whether anything published leaks the answer. A
 * single "it matches the source" test would pass happily if someone put the key in the source.
 */

const ROOT = path.resolve(import.meta.dirname, "../..");
const DOCS_DIR = path.join(ROOT, "docs/human-test-1");

function publishedFiles(dir: string, prefix = ""): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
    return entry.isDirectory() ? publishedFiles(path.join(dir, entry.name), rel) : [rel];
  });
}

const sha256 = (buffer: Buffer) => createHash("sha256").update(buffer).digest("hex");

describe("published survey stays in sync with the canonical source", () => {
  it("publishes exactly the three reviewer-facing files and nothing else", () => {
    expect(publishedFiles(PUBLIC_DIR).sort()).toEqual([
      "review.html",
      "sheets/human-test-1280-gray-unlabeled.png",
      "sheets/human-test-390-gray-unlabeled.png",
    ]);
  });

  it("is byte-identical to docs/human-test-1 (run publish-review.mjs after editing either)", () => {
    expect(check()).toEqual([]);
  });

  it("serves the frozen sheets themselves, not a resized or regenerated copy", () => {
    // The sheets are the thing being judged (`proof/phase-b` b74ccab). Mobile ergonomics are a
    // CSS concern; touching these bytes would change the experiment, so compare them directly
    // rather than trusting that nothing in the publish path transforms an image.
    for (const name of [
      "sheets/human-test-1280-gray-unlabeled.png",
      "sheets/human-test-390-gray-unlabeled.png",
    ]) {
      const canonical = readFileSync(path.join(DOCS_DIR, name));
      const published = readFileSync(path.join(PUBLIC_DIR, name));
      expect(sha256(published)).toBe(sha256(canonical));
      expect(statSync(path.join(PUBLIC_DIR, name)).size).toBe(canonical.length);
    }
  });

  it("keeps one questionnaire: the publish list names review.html as its only page", () => {
    const pages = (ASSETS as [string, string][]).filter(([, to]) => to.endsWith(".html"));
    expect(pages).toEqual([["review.html", "review.html"]]);
  });
});

/**
 * Anything that would let a reviewer work out the classification. Matched case-insensitively
 * against every published text file.
 *
 * The brief asks for sense about generic words, so this does not ban "model" outright — the
 * page could legitimately say something unrelated. It bans the things that only ever appear
 * when the answer is leaking: the two `proof-b` artifacts by name, any `proof-b/` path, the
 * vocabulary that distinguishes the two sources, and the pass bar.
 */
const FORBIDDEN: readonly (readonly [RegExp, string])[] = [
  [/human-test-key/i, "names the answer key"],
  [/human-test-items/i, "names the per-screen item manifest"],
  [/proof-b(?!\/human-test-form\.md)/i, "references the proof directory, which holds the key"],
  [/proof-a1/i, "references a proof directory"],
  [/model-authored/i, "names the model-authored classification"],
  [/hand-authored/i, "names the hand-authored classification"],
  [/\bsilhouette/i, "names a library silhouette"],
  [/\blibrary\b/i, "names the library the control screens came from"],
  [/\bAI\b/, "tells the reviewer AI output is being tested"],
  [/\bcontrol group\b/i, "tells the reviewer there is a control group"],
  [/\bcalibration\b/i, "describes the run's purpose"],
  [/\bpass bar\b|\bthreshold\b/i, "names the pass threshold"],
  [/\b70\s*%/, "names the pass threshold"],
  [/medianModelDesignedRate|modelDesignedRate|maxModelGroup/i, "names a scoring output"],
  [/score\.json|results\.json|score-human/i, "names a scoring artifact"],
];

describe("nothing at the public URL reveals the hidden classification", () => {
  const textFiles = publishedFiles(PUBLIC_DIR).filter((f) =>
    /\.(html|css|js|json|txt|md)$/i.test(f),
  );

  it("has text assets to check (a silent empty scan would prove nothing)", () => {
    expect(textFiles.length).toBeGreaterThan(0);
  });

  it.each(textFiles)("public/human-test-1/%s says nothing about the answer", (file) => {
    const contents = readFileSync(path.join(PUBLIC_DIR, file), "utf8");
    const leaks = FORBIDDEN.filter(([pattern]) => pattern.test(contents)).map(
      ([pattern, why]) => `${pattern} — ${why}`,
    );
    expect(leaks).toEqual([]);
  });

  /**
   * The one `proof-b` string the page is allowed to contain, pinned so it can never quietly
   * become several.
   *
   * `review.html` stamps `protocol: "proof-b/human-test-form.md"` onto every response and has
   * since the questionnaire was written; it is part of the response contract, which this change
   * was explicitly not allowed to alter. It is a document identifier, not evidence: the file it
   * names is the two-question methodology, `proof-b/` is not served from anywhere (only
   * `public/fonts` and `public/human-test-1` exist), and neither the frozen scorer nor its
   * wrapper reads the field. So it costs a reviewer nothing — it cannot tell them which screens
   * are model-authored, which is the guarantee that matters — while removing it would change
   * what a stored response is.
   */
  it("contains exactly one proof-b reference, the frozen protocol stamp", () => {
    const html = readFileSync(path.join(PUBLIC_DIR, "review.html"), "utf8");
    const mentions = [...html.matchAll(/proof-[ab][\w/.-]*/gi)].map((m) => m[0]);
    expect(mentions).toEqual(["proof-b/human-test-form.md"]);
    // Pinned to the stamp itself: an added reference cannot pass as "the frozen one".
    expect(html).toContain('protocol: "proof-b/human-test-form.md"');
  });

  it("references no asset outside the published survey", () => {
    // A `src`/`href` pointing anywhere else would either break for a reviewer or fetch
    // something we did not mean to publish. Both are defects; the second is a leak.
    const html = readFileSync(path.join(PUBLIC_DIR, "review.html"), "utf8");
    const refs = [...html.matchAll(/(?:src|href)\s*=\s*"([^"]+)"/g)].map((m) => m[1]!);
    expect(refs).toEqual([
      "sheets/human-test-1280-gray-unlabeled.png",
      "sheets/human-test-390-gray-unlabeled.png",
    ]);
  });

  it("talks to exactly one endpoint, which never returns a classification", () => {
    const html = readFileSync(path.join(PUBLIC_DIR, "review.html"), "utf8");
    const endpoints = [...html.matchAll(/fetch\(\s*([A-Za-z_$][\w$]*|"[^"]*")/g)].map((m) => m[1]!);
    expect(endpoints).toEqual(["ENDPOINT"]);
    expect(html).toContain('const ENDPOINT = "/api/human-test-1/submit";');
  });

  it("never reads a key or a manifest from the server module that answers it", () => {
    // The route is the only server code a reviewer's browser can reach. If it never imports
    // the evidence, no response it can produce — success, validation failure or 500 — can
    // carry it.
    const route = readFileSync(path.join(ROOT, "src/app/api/human-test-1/submit/route.ts"), "utf8");
    const imports = [...route.matchAll(/from\s+"([^"]+)"/g)].map((m) => m[1]!);
    expect(
      imports.some((specifier) => /proof-b|human-test-key|human-test-items/i.test(specifier)),
    ).toBe(false);
    expect(route).not.toMatch(/readFileSync|readFile\(/);
  });
});
