/**
 * `compileConcept` driven through the real Phase 3 compiler and real rendered-geometry
 * verification. No fake compiler, no stubbed browser: every case below either runs the actual
 * `repair` → `canonicalize` → selector → `assemblePreVerificationSpec` → `verifyGeometry` pipeline
 * against headless Chromium, or — for the two paths that return before a browser is ever opened —
 * asserts the same real `repair`/`canonicalize`/selector logic without one.
 *
 * `compile-concept.ts`'s header explains the one place its order departs from
 * `docs/model-contracts.md §6.3`: the selector runs on the canonical tree *before* the browser
 * pass, which is only correct because verification never edits the tree — it produces `overrides`
 * and leaves `composition`/`compositionHash` untouched. That is the property this file is really
 * protecting: if a future change made verification rewrite the tree (say, to bake a demotion in
 * directly instead of recording it as an override), the selector's early read would go stale
 * without anything failing loudly — except the hash-invariant case below, which is written
 * specifically to catch it.
 *
 * # Chromium gating
 *
 * Copied from `src/lib/renderer/verify/geometry.test.ts`: cases that need a real browser are
 * `it.skip`, never a silent pass, when Chromium is unavailable, and `REQUIRE_GEOMETRY_BROWSER=1`
 * turns that into a hard failure for a CI job that is supposed to have one.
 *
 * Acceptance criteria: `spec.md §31 — DesignIntent, composition and compiler`, `§31 — Renderer
 * proof`. Guardrails: `spec.md §32 #14`, `#17`, `#21`, `#22`, `#23`, `#24`.
 *
 * No live provider call. Every tree here is hand-authored or the shared `tests/fixtures` novel
 * fixture; nothing in this file imports an AI provider.
 */

import { describe, expect, it } from "vitest";

import type { EventContent } from "@/components/event-renderer/contract";
import {
  ATTRACTIVE_TOKENS,
  validateStructure,
  type Capabilities,
  type CompositionTree,
} from "@/lib/renderer/composition";
import type { DesignIntent } from "@/lib/renderer/design-intent";
import { tokenViolations } from "@/lib/renderer/planner";
import { chromiumAvailability, VIEWPORTS } from "@/lib/renderer/verify";
import { novelTree } from "../../../tests/fixtures/novel-composition";
import {
  compileConcept,
  COLLISION_THRESHOLD,
  NONE_SPENT,
  type CompileConceptRequest,
} from "./compile-concept";

const TIMEOUT = 180_000;

const availability = await chromiumAvailability();
const required = process.env.REQUIRE_GEOMETRY_BROWSER === "1";
if (!availability.available) {
  const message = `[compile-concept] headless Chromium is unavailable: ${availability.reason}`;
  if (required) throw new Error(`${message} — REQUIRE_GEOMETRY_BROWSER=1 was set`);
  console.warn(`${message}\n[compile-concept] browser-backed cases will be SKIPPED, not passed.`);
}
/** `it` where Chromium runs, `it.skip` where it does not — never a silent pass. */
const browserIt = availability.available ? it : it.skip;

/* ------------------------------------------------------------------------------- fixtures */

const CONTENT: EventContent = {
  eyebrow: "The celebration",
  title: "Marissa and Eren are getting married",
  hosts: "Marissa & Eren",
  description: "An afternoon of good food and warm company, out at the lodge by the water.",
  date: "Saturday, June 14, 2026",
  dayNumeral: "14",
  monthShort: "Jun",
  year: "2026",
  weekday: "Saturday",
  time: "1:00-5:00 PM",
  venue: "Hanson Park",
  location: "Berkeley, CA",
  deadline: "RSVP by December 1",
  initial: "M",
};

const CAPABILITIES: Capabilities = {
  rsvp: true,
  registry: true,
  gifts: true,
  externalRegistry: true,
  cashFund: true,
  hosts: true,
  description: true,
  time: true,
  location: true,
  deadline: true,
};

function intent(overrides: Partial<DesignIntent> = {}): DesignIntent {
  return {
    family: "editorial",
    tonalDirection: "light",
    palette: { colors: ["#AB12EF", "#12FE34", "#5678BC"], dominant: "#AB12EF" },
    typographyPairing: "heritage_caslon_karla",
    density: "balanced",
    composition: {
      asymmetry: "gentle",
      hierarchy: "editorial",
      rhythm: "alternating",
      sectionContrast: "moderate",
      ornament: "decorative",
    },
    motifs: ["plaid", "stripe"],
    ...overrides,
  };
}

function request(overrides: Partial<CompileConceptRequest> = {}): CompileConceptRequest {
  return {
    tree: novelTree(),
    designIntent: intent(),
    capabilities: CAPABILITIES,
    content: CONTENT,
    seed: 7,
    forbiddenTokens: [],
    ...overrides,
  };
}

/**
 * `novelTree()` plus one extra `Venue` in the details section's `Cluster` — a real,
 * model-plausible mistake (`coverage.duplicate`, `docs/event-renderer-system.md §3`), fixed by
 * `repair()` rather than re-prompted (`spec.md §32 #21`). Cloned fresh so mutation by `repair`
 * (which edits the tree it is given) never leaks between cases.
 */
function treeWithDuplicateVenue(): CompositionTree {
  const tree = novelTree();
  const detailsRoot = tree.sections[1].root as {
    child: { children: { t: string }[] };
  };
  const cluster = detailsRoot.child.children.find((c) => "children" in c) as unknown as {
    children: { t: string }[];
  };
  cluster.children.push({ t: "Venue" });
  return tree;
}

/**
 * A tree with far more independent `nesting.cluster` defects — a `Stack` (not an
 * `INLINE_LEAVES` type) sitting inside a `Cluster` — than `repair()`'s documented 40-iteration
 * cap can clear. `repair.ts` fixes exactly one violation per iteration (the loop breaks out on
 * the first successful fix and re-validates), so 48 independent instances of the same rule,
 * spread so no single fix collapses more than one at once, genuinely exhausts the budget and
 * proves `remaining` is honoured rather than only theoretical (`repair.ts`: "whatever is left is
 * returned as `remaining` rather than silently ignored").
 */
function badCluster() {
  return {
    t: "Cluster",
    children: [
      { t: "Stack", children: [{ t: "Venue" }] },
      { t: "Rule", weight: "hairline", orientation: "v" },
    ],
  };
}

function unrepairableTree(): CompositionTree {
  return {
    version: "composition_v1",
    sections: [
      {
        kind: "hero",
        surface: "base",
        root: {
          t: "Stack",
          children: [
            { t: "EventTitle", emphasis: "display" },
            { t: "Date", form: "full" },
            ...Array.from({ length: 12 }, () => badCluster()),
          ],
        },
      },
      {
        kind: "details",
        surface: "alt",
        root: { t: "Stack", children: Array.from({ length: 12 }, () => badCluster()) },
      },
      {
        kind: "rsvp",
        surface: "base",
        root: {
          t: "Stack",
          children: [{ t: "RSVP" }, ...Array.from({ length: 12 }, () => badCluster())],
        },
      },
      {
        kind: "registry",
        surface: "alt",
        root: {
          t: "Stack",
          children: [{ t: "Registry" }, ...Array.from({ length: 12 }, () => badCluster())],
        },
      },
      { kind: "band", surface: "contrast", root: { t: "MotifBand", height: "medium" } },
    ],
  } as unknown as CompositionTree;
}

/* --------------------------------------------------------------- a valid tree compiles clean */

describe("a valid novel tree", () => {
  browserIt(
    "compiles to a verified spec, clean at both authoritative widths, with no sibling to collide against",
    async () => {
      const out = await compileConcept(request());
      if (out.state !== "verified") throw new Error(`expected verified, got ${out.state}`);

      // property 1: `state` and `verified.clean` both say the same thing (`spec.md §32 #24`).
      expect(out.spec.state).toBe("verified");
      expect(out.spec.verified.clean).toBe(true);
      expect(out.spec.verified.authoritative).toBe("rendered-geometry");

      // property 2: BOTH authoritative widths were actually measured, not just claimed clean —
      // and residual overflow is zero at each (`docs/event-renderer-system.md §3.1`, §6).
      expect(out.spec.verified.desktop.viewport).toEqual(VIEWPORTS.desktop);
      expect(out.spec.verified.mobile.viewport).toEqual(VIEWPORTS.mobile);
      for (const bp of ["desktop", "mobile"] as const) {
        const s = out.spec.verified[bp];
        expect(s.pageOverflow).toBe(false);
        expect(s.overflowingElements).toBe(0);
        expect(s.textOverflow).toBe(0);
      }

      // property 10: nothing to collide against, so the nearest sibling is 0 — not undefined, not
      // skipped, the literal floor `similarity` can return.
      expect(out.nearestSibling).toBe(0);
    },
    TIMEOUT,
  );
});

/* --------------------------------------------------------- raw vs. canonical, and hash stability */

describe("raw, canonical and the composition hash", () => {
  browserIt(
    "raw is exactly what was passed in; canonical is what repair actually produced",
    async () => {
      const tree = treeWithDuplicateVenue();
      const out = await compileConcept(request({ tree }));
      if (out.state !== "verified") throw new Error(`expected verified, got ${out.state}`);

      // `raw` is `design_concepts.composition_raw`: the model's tree, untouched, defect and all.
      expect(out.raw).toBe(tree);
      // `novelTree()` already carries one Venue in the hero and one in the details section; this
      // fixture adds a second Venue to the details section's Cluster, so raw carries three.
      const rawVenueCount = JSON.stringify(out.raw).split('"t":"Venue"').length - 1;
      expect(rawVenueCount).toBe(3);

      // `canonical` is `design_concepts.composition`: post-repair, the duplicate is gone, back
      // down to the two Venues `novelTree()` was authored with.
      const canonVenueCount = JSON.stringify(out.canonical).split('"t":"Venue"').length - 1;
      expect(canonVenueCount).toBe(2);
      expect(out.canonical).not.toBe(out.raw);
    },
    TIMEOUT,
  );

  browserIt(
    "compiling the same tree twice yields the same compositionHash",
    async () => {
      const first = await compileConcept(request());
      const second = await compileConcept(request());
      if (first.state !== "verified" || second.state !== "verified") {
        throw new Error(`expected both verified, got ${first.state} / ${second.state}`);
      }
      expect(second.compositionHash).toBe(first.compositionHash);
      expect(second.compositionHash).toBeTruthy();
    },
    TIMEOUT,
  );
});

/* ------------------------------------------------- the invariant that licenses the reordering */

describe("the hash invariant that licenses running the selector before the browser pass", () => {
  browserIt(
    "verification changes nothing about the composition: the verified spec's tree and hash equal the canonical tree and hash that went in",
    async () => {
      const out = await compileConcept(request());
      if (out.state !== "verified") throw new Error(`expected verified, got ${out.state}`);

      // This is exactly what `compile-concept.ts`'s header says makes the reordering safe:
      // verification only ever produces `overrides`, so the tree the selector already compared
      // is byte-identical to the tree the final spec carries. If verification ever started
      // rewriting the tree (e.g. to bake a fit demotion in directly), this is what would catch it
      // — the selector's early read would otherwise go silently stale.
      expect(out.spec.composition).toEqual(out.canonical);
      expect(out.spec.compositionHash).toBe(out.compositionHash);
    },
    TIMEOUT,
  );
});

/* -------------------------------------------------------------- repairable structural defects */

describe("a repairable structural defect", () => {
  browserIt(
    "is repaired deterministically, logged by kind, and never re-prompted",
    async () => {
      const out = await compileConcept(request({ tree: treeWithDuplicateVenue() }));

      // `spec.md §32 #21`: structural/coverage defects are never re-prompted.
      expect(out.state).not.toBe("reprompt");
      if (out.state !== "verified") throw new Error(`expected verified, got ${out.state}`);

      expect(out.spec.state).toBe("verified");
      const duplicateRepair = out.repairs.find((r) => r.rule === "coverage.duplicate");
      expect(duplicateRepair).toBeTruthy();
      expect(duplicateRepair?.kind).toBe("coverage");
    },
    TIMEOUT,
  );
});

describe("an unrepairable structural defect", () => {
  // No browser needed: `repair()`'s 40-iteration cap is exhausted before geometry verification
  // is ever reached, so this is real production logic run without Chromium in the loop.
  it("fails with the surviving violations reported, and is never re-prompted for it", async () => {
    const out = await compileConcept(request({ tree: unrepairableTree() }));

    // `spec.md §32 #21`: even a defect repair could not clear is never handed back to the model.
    expect(out.state).not.toBe("reprompt");
    if (out.state !== "failed") throw new Error(`expected failed, got ${out.state}`);

    expect(out.kind).toBe("structure");
    expect(out.remaining.length).toBeGreaterThan(0);
    // `repair()` fixes exactly one violation per iteration and caps at 40 — the tree above has
    // enough independent `nesting.cluster` defects (each a `Stack` sitting inside a `Cluster`)
    // that some are still outstanding when the cap is hit.
    expect(out.remaining.some((v) => v.rule === "nesting.cluster")).toBe(true);
    expect(out.repairs.length).toBe(40);
    expect(out.detail).toContain("structural violation");
  });
});

/* ------------------------------------------------------------------------ attractive-token caps */

describe("attractive-token caps", () => {
  // `novelTree()`'s hero titles with `layout: "cascade"`, which the `staggerTitle` attractive
  // token detects (`ATTRACTIVE_TOKENS` — `attractive-tokens.ts`). Confirmed real, not assumed:
  // the sibling this token belongs to is exactly the one the assertion below checks for.
  it("has staggerTitle in novelTree(), so the fixture actually exercises the cap", () => {
    expect(ATTRACTIVE_TOKENS.some((t) => t.id === "staggerTitle")).toBe(true);
    expect(tokenViolations(novelTree(), ["staggerTitle"])).toEqual(["staggerTitle"]);
  });

  it("a first violation, with the re-prompt unspent, is reported rather than repaired", async () => {
    const out = await compileConcept(request({ forbiddenTokens: ["staggerTitle"] }));
    if (out.state !== "reprompt") throw new Error(`expected reprompt, got ${out.state}`);
    expect(out.kind).toBe("token_cap");
    expect(out.feedback.some((f) => f.includes("staggerTitle"))).toBe(true);
  });

  browserIt(
    "a second violation, with the re-prompt already spent, neutralizes deterministically instead of re-prompting again",
    async () => {
      const out = await compileConcept(
        request({
          forbiddenTokens: ["staggerTitle"],
          spent: { tokenCap: true, collision: false },
        }),
      );

      // `docs/model-contracts.md §6.3`: the *second* token-cap violation neutralizes
      // deterministically, with one counter — never a second re-prompt.
      expect(out.state).not.toBe("reprompt");
      if (out.state !== "verified") throw new Error(`expected verified, got ${out.state}`);

      const neutralized = out.repairs.find((r) => r.rule === "planner.attractiveToken");
      expect(neutralized).toBeTruthy();
      expect(neutralized?.kind).toBe("planner");
      expect(neutralized?.after).toBe("block");

      // The tree no longer uses the token it was forbidden.
      expect(tokenViolations(out.canonical, ["staggerTitle"])).toEqual([]);
    },
    TIMEOUT,
  );
});

/* --------------------------------------------------------------------------------- collisions */

describe("the selector", () => {
  it("a first collision, with the re-prompt unspent, is reported with the colliding skeleton", async () => {
    const tree = novelTree();
    // Against itself: same hero, same surfaces, same rsvp/registry shape — a skeleton match at
    // exactly 1.0 on both breakpoints, comfortably over `COLLISION_THRESHOLD`.
    const out = await compileConcept(request({ tree, against: [{ tree: novelTree() }] }));
    if (out.state !== "reprompt") throw new Error(`expected reprompt, got ${out.state}`);
    expect(out.kind).toBe("collision");
    expect(out.feedback.length).toBeGreaterThan(0);
    // Feedback names the colliding skeleton, per `describeCollision` — not just "it collided".
    expect(out.feedback[0]).toMatch(/hero skeleton at \d\.\d\d:/);
  });

  browserIt(
    "a second collision, with the re-prompt already spent, proceeds instead of re-prompting again",
    async () => {
      const out = await compileConcept(
        request({
          against: [{ tree: novelTree() }],
          spent: { tokenCap: false, collision: true },
        }),
      );
      // `docs/model-contracts.md §6.3` step 5: the second collision is the caller's to resolve
      // with the library fallback, never this module's second re-prompt.
      expect(out.state).not.toBe("reprompt");
      if (out.state === "verified") {
        // Above threshold against itself, so nearestSibling is reported for the caller to act on.
        expect(out.nearestSibling).toBeGreaterThanOrEqual(COLLISION_THRESHOLD);
      }
    },
    TIMEOUT,
  );
});

/* -------------------------------------------------------------------------- reduced capabilities */

describe("a capability the host has not enabled", () => {
  browserIt(
    "a reference to a disabled capability is removed, logged as a capability repair, and the spec still verifies",
    async () => {
      // `novelTree()` has a real registry section; disable registry and require it to be gone,
      // not just tolerated (`spec.md §32 #16`, `docs/model-contracts.md §6.4` CO-03).
      const caps: Capabilities = { ...CAPABILITIES, registry: false };
      const out = await compileConcept(request({ capabilities: caps }));
      if (out.state !== "verified") throw new Error(`expected verified, got ${out.state}`);

      const capabilityRepair = out.repairs.find((r) => r.kind === "capability");
      expect(capabilityRepair).toBeTruthy();
      expect(capabilityRepair?.rule).toBe("capability.registrySection");

      // The disabled capability's node is genuinely gone from what will render, not merely
      // hidden by a flag the renderer is trusted to respect.
      expect(JSON.stringify(out.canonical)).not.toContain('"t":"Registry"');

      // And the coverage rules never turn back around and require the thing that was just
      // disabled: with registry off, nothing downstream should be asking for a registry section.
      const stillWanted = validateStructure(out.canonical, caps).filter(
        (v) => v.rule === "coverage.registrySection",
      );
      expect(stillWanted).toEqual([]);
    },
    TIMEOUT,
  );
});

/* ------------------------------------------------------------------------------- sanity ------ */

describe("the defaults a caller who supplies nothing gets", () => {
  it("NONE_SPENT means neither re-prompt has been used yet", () => {
    expect(NONE_SPENT).toEqual({ tokenCap: false, collision: false });
  });
});
