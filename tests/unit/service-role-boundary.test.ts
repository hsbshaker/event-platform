import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { SERVICE_ROLE_CALLERS } from "../../eslint.config.mjs";

/**
 * Who may reach the service-role client, and why.
 *
 * `AGENTS.md`, "Supabase clients": `admin.ts` bypasses RLS and is used "only after the caller has
 * been authorized ... and only for server-managed tables". The lint rule in `eslint.config.mjs`
 * enforces that, but a lint allowlist is only as good as its accuracy — someone can add a module
 * to it in the same commit that adds the import, and nothing would object.
 *
 * So this asserts the allowlist against reality from the other direction: the set of modules that
 * actually import `admin.ts` must equal the set the allowlist names. Adding a caller means
 * editing this file, which means saying out loud, in a diff a reviewer reads, that a new path now
 * holds database authority that bypasses RLS.
 */

const ROOT = path.resolve(import.meta.dirname, "../..");

/**
 * Every non-test module under `src/` that imports the service-role client.
 *
 * Matched on `supabase/admin` rather than `lib/supabase/admin`, so the relative spellings the
 * lint rule lists (`./admin`, `../supabase/admin`, …) are caught here too — otherwise this test
 * would measure something narrower than the invariant its docstring claims.
 */
function actualCallers(): string[] {
  const out = execFileSync(
    "grep",
    ["-rl", "--include=*.ts", "--include=*.tsx", "supabase/admin", "src"],
    { cwd: ROOT, encoding: "utf8" },
  );
  return out
    .split("\n")
    .filter(Boolean)
    .filter((file) => !/\.test\.tsx?$/.test(file) && file !== "src/lib/supabase/admin.ts")
    .sort();
}

/** True when `file` is covered by an allowlist entry, exact or `dir/**`. */
function allowedBy(file: string, entries: readonly string[]): boolean {
  return entries.some((entry) =>
    entry.endsWith("/**") ? file.startsWith(entry.slice(0, -2)) : file === entry,
  );
}

describe("the service-role client stays where it was authorized", () => {
  const allowlist = SERVICE_ROLE_CALLERS as string[];

  it("finds the callers at all (an empty scan would prove nothing)", () => {
    expect(actualCallers().length).toBeGreaterThan(0);
  });

  it("is imported by no module the lint allowlist does not name", () => {
    expect(actualCallers().filter((file) => !allowedBy(file, allowlist))).toEqual([]);
  });

  it("names no module that has stopped using it", () => {
    const actual = actualCallers();
    expect(allowlist.filter((entry) => !actual.some((file) => allowedBy(file, [entry])))).toEqual(
      [],
    );
  });

  it("keeps the public survey's own use behind the capability check", () => {
    // `store.ts` is on the allowlist, so the boundary it relies on has to be real: the route must
    // resolve a server-issued capability before it can call in, and the store must not be
    // reachable from the route with a caller-supplied key.
    const route = readFileSync(path.join(ROOT, "src/app/api/human-test-1/submit/route.ts"), "utf8");
    expect(route).toContain("resolveCapability(");
    expect(route).toContain("capability.submissionKey");
    // The row identifier must come from the resolved capability, never from the request body.
    expect(route).not.toMatch(/parsed\.value\.submissionKey/);
    // And the capability must be resolved before the write, not after it.
    expect(route.indexOf("resolveCapability(")).toBeLessThan(route.indexOf("recordSubmission("));
  });

  it("does not let the survey route import the service-role client directly", () => {
    for (const file of [
      "src/app/api/human-test-1/submit/route.ts",
      "src/app/api/human-test-1/session/route.ts",
    ]) {
      expect(readFileSync(path.join(ROOT, file), "utf8")).not.toContain("supabase/admin");
    }
  });
});
