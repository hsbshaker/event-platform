/**
 * Pins the v4 leakage-correction round, frozen before either author was contacted.
 *
 * Two kinds of assertion here, and the second matters more. The first pins values — coordinates,
 * counts, denylist, packet digests — so a later edit to any of them is a visible change rather
 * than a quiet one. The second runs the two checkers against **constructed failures**, because a
 * checker that has never rejected anything is not known to reject anything, and this programme has
 * already shipped one guard whose passing condition could not fail.
 *
 * Acceptance criteria: N/A — evidence machinery, no product behaviour change.
 */
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import {
  CLAUDE_AUTHORED_REPLACEMENT_QUOTA,
  checkCorrectionResponse,
  checkSubstitutionApplied,
  TONE_KEYWORD_MAX_LENGTH,
  TONE_KEYWORD_MIN_LENGTH,
  V4_LEAKAGE_CORRECTION_TARGET_COUNT,
  V4_LEAKAGE_CORRECTION_TARGETS,
  V4_LEAKAGE_CORRECTION_VERSION,
  V4_LEAKAGE_CORRECTION_WITHHELD_FROM_AUTHORS,
  type CorrectionResponseEntry,
} from "./design-intent-challenge-v4-leakage-correction";
import { eventIdentitySchema } from "@/lib/ai/event-identity/contract";

const ROOT = new URL("../../../../", import.meta.url).pathname;
const PROV = `${ROOT}docs/model-evals/provenance/design-intent-sealed-challenge-v4/`;
const digest = (rel: string) =>
  createHash("sha256")
    .update(readFileSync(`${PROV}${rel}`))
    .digest("hex");
const read = (rel: string) => JSON.parse(readFileSync(`${PROV}${rel}`, "utf8"));

const HALF_A = "half-a/04-stage-2-eventidentity-cases.json";
const HALF_B = "half-b/03-stage-2-eventidentity-cases.json";

describe("the frozen correction round", () => {
  it("authors none of it", () => {
    expect(CLAUDE_AUTHORED_REPLACEMENT_QUOTA).toBe(0);
  });

  it("is one round, named", () => {
    expect(V4_LEAKAGE_CORRECTION_VERSION).toBe(
      "design_intent_sealed_challenge_v4_leakage_correction_r1",
    );
  });

  it("covers exactly the sixteen values the frozen scan gated on", () => {
    expect(V4_LEAKAGE_CORRECTION_TARGETS).toHaveLength(V4_LEAKAGE_CORRECTION_TARGET_COUNT);
    expect(V4_LEAKAGE_CORRECTION_TARGETS.filter((t) => t.slot === "A")).toHaveLength(10);
    expect(V4_LEAKAGE_CORRECTION_TARGETS.filter((t) => t.slot === "B")).toHaveLength(6);
    expect(V4_LEAKAGE_CORRECTION_TARGETS.map((t) => t.keyword).sort()).toEqual(
      [
        "accessible",
        "balanced",
        "chosen",
        "delicate",
        "direct",
        "focused",
        "formal",
        "gentle",
        "grounded",
        "grounded",
        "neutral",
        "playful",
        "reflective",
        "reserved",
        "rigorous",
        "tactile",
      ].sort(),
    );
  });

  /** The pin that makes substitution safe: every coordinate must actually hold its value. */
  it("every pinned coordinate resolves in the frozen artifact it belongs to", () => {
    for (const slot of ["A", "B"] as const) {
      const doc = read(slot === "A" ? HALF_A : HALF_B) as {
        cases: { id: string; identity: { toneKeywords: string[] } }[];
      };
      for (const target of V4_LEAKAGE_CORRECTION_TARGETS.filter((t) => t.slot === slot)) {
        const found = doc.cases.find((c) => c.id === target.caseId);
        expect(found, `${target.caseId} must exist in half ${slot}`).toBeDefined();
        expect(found!.identity.toneKeywords[target.index]).toBe(target.keyword);
        // Exactly once in its own array, so index and value can never disagree.
        expect(found!.identity.toneKeywords.filter((k) => k === target.keyword)).toHaveLength(1);
      }
    }
  });

  it("`grounded` is a target in both halves, at different coordinates", () => {
    const grounded = V4_LEAKAGE_CORRECTION_TARGETS.filter((t) => t.keyword === "grounded");
    expect(grounded.map((t) => `${t.slot}:${t.caseId}[${t.index}]`)).toEqual([
      "A:DIC4-P01[0]",
      "B:DIC4-Q05[1]",
    ]);
  });

  it("withholds the reason, not just the surfaces", () => {
    for (const entry of [
      "any model-visible prompt text",
      "the matching surface text",
      "why a particular word collided",
      "the other half's cases, ids, keywords or author",
      "any replacement wording, synonym or example",
    ]) {
      expect(V4_LEAKAGE_CORRECTION_WITHHELD_FROM_AUTHORS).toContain(entry);
    }
  });

  /**
   * Proves the pinned bound **is** the contract's, by probing the contract at the boundary rather
   * than restating a number. A cap invented for this round would be a rule the author was never
   * told about, and this is what makes that visible if anyone ever changes one side.
   */
  it("quotes the production contract's bound rather than inventing one", () => {
    const identity = (read(HALF_A) as { cases: { identity: Record<string, unknown> }[] }).cases[0]
      .identity;
    const withKeyword = (keyword: string) => ({
      ...identity,
      toneKeywords: [keyword, "steady", "warm"],
    });

    expect(eventIdentitySchema.safeParse(identity).success).toBe(true);
    expect(
      eventIdentitySchema.safeParse(withKeyword("x".repeat(TONE_KEYWORD_MAX_LENGTH))).success,
    ).toBe(true);
    expect(
      eventIdentitySchema.safeParse(withKeyword("x".repeat(TONE_KEYWORD_MAX_LENGTH + 1))).success,
    ).toBe(false);
    expect(
      eventIdentitySchema.safeParse(withKeyword("x".repeat(TONE_KEYWORD_MIN_LENGTH))).success,
    ).toBe(true);
    expect(
      eventIdentitySchema.safeParse(withKeyword("x".repeat(TONE_KEYWORD_MIN_LENGTH - 1))).success,
    ).toBe(false);
  });
});

/**
 * The sixteen values from the two excluded operator-supplied outputs.
 *
 * Written down **only** so they can be asserted absent. They were never a response to anything:
 * the correction prompts had not been written, let alone sent, when those files were committed
 * (`leakage/06-EXCLUDED-OUTPUTS.md`). Reusing one because it looks fine would make the operator a
 * co-author of the corpus invisibly, since the result would be indistinguishable from the author's
 * own answer — which is the move v3's closure refused when it declined a half that had passed
 * review.
 */
const EXCLUDED_REPLACEMENT_VALUES = [
  "sensitive",
  "contemplative",
  "rooted",
  "self-determined",
  "tactful",
  "plainspoken",
  "official",
  "exacting",
  "approachable",
  "intent",
  "subdued",
  "muted",
  "haptic",
  "earthy",
  "even",
  "lively",
] as const;

describe("the excluded operator-supplied outputs", () => {
  const A_RAW = readFileSync(`${PROV}half-a/05-leakage-correction-original-raw.txt`, "utf8");
  const B_RAW = readFileSync(`${PROV}half-b/04-leakage-correction-original-raw.json`, "utf8");

  it("are preserved byte for byte, not deleted or rewritten", () => {
    expect(digest("half-a/05-leakage-correction-original-raw.txt")).toBe(
      "2c70dc974e7f121ff6a2f0b6561fbdd11f03ee102054a6e608ea44b6826fe4a2",
    );
    expect(digest("half-b/04-leakage-correction-original-raw.json")).toBe(
      "4ca31b6d118fdac973bfe4ca868bd360c7efef8529afcbd682204bdd1eb2d379",
    );
  });

  it("are recorded as excluded, with their digests, where a reader will look", () => {
    const record = readFileSync(`${PROV}leakage/06-EXCLUDED-OUTPUTS.md`, "utf8");
    expect(record).toContain("2c70dc974e7f121ff6a2f0b6561fbdd11f03ee102054a6e608ea44b6826fe4a2");
    expect(record).toContain("4ca31b6d118fdac973bfe4ca868bd360c7efef8529afcbd682204bdd1eb2d379");
  });

  /** The denylist is only meaningful if it really is what those files contain. */
  it("contain exactly the values the denylist names", () => {
    for (const value of EXCLUDED_REPLACEMENT_VALUES) {
      expect(`${A_RAW}\n${B_RAW}`).toMatch(new RegExp(`\\b${value}\\b`));
    }
  });

  /**
   * Scoped to the **pinned coordinates**, deliberately, and this is not a weakening.
   *
   * The first version of this test asserted the excluded values were absent from every
   * `toneKeywords` array in both halves. It failed — on `rooted`, which half B's author wrote into
   * `DIC4-Q02` themselves, long before any of this, and which half A's excluded output happens to
   * propose for `grounded`. A check that convicts an author's own untouched word because an
   * operator later typed the same adjective is a metric punishing correct behaviour, which is the
   * defect this programme has caught itself building eight times; the ninth is not going to be one
   * it wrote into the guard against the eighth.
   *
   * What actually needs proving is that no excluded value sits **where a substitution would have
   * put it**, and that every original is still in place. Both are checked here, and neither can be
   * satisfied by coincidence.
   */
  it("have not been applied at any target coordinate", () => {
    for (const target of V4_LEAKAGE_CORRECTION_TARGETS) {
      const doc = read(target.slot === "A" ? HALF_A : HALF_B) as {
        cases: { id: string; identity: { toneKeywords: string[] } }[];
      };
      const actual = doc.cases.find((c) => c.id === target.caseId)!.identity.toneKeywords[
        target.index
      ];
      expect(actual, `${target.caseId}[${target.index}] must still hold the original`).toBe(
        target.keyword,
      );
      expect(EXCLUDED_REPLACEMENT_VALUES as readonly string[]).not.toContain(actual);
    }
  });
});

describe("the two correction requests, frozen before any author was contacted", () => {
  const A_REQ = readFileSync(`${PROV}leakage/07-half-a-correction-request.txt`, "utf8");
  const B_REQ = readFileSync(`${PROV}leakage/08-half-b-correction-request.txt`, "utf8");

  it("are pinned by digest", () => {
    expect(digest("leakage/07-half-a-correction-request.txt")).toBe(
      "d5c2e0c20543fb6c02aa5b20b0854ea51a09046239a474316fd8890d3a97d756",
    );
    expect(digest("leakage/08-half-b-correction-request.txt")).toBe(
      "42ea94dfc9893655d3faf27702a731fa8aa5cafead26c02ccf6f8df55a9a0bec",
    );
  });

  /** Item 6 of the ruling, checked rather than asserted. */
  it("carry no replacement wording from the excluded outputs", () => {
    for (const [name, request] of [
      ["A", A_REQ],
      ["B", B_REQ],
    ] as const) {
      for (const value of EXCLUDED_REPLACEMENT_VALUES) {
        expect(request, `request ${name} must not contain the excluded value ${value}`).not.toMatch(
          new RegExp(`\\b${value}\\b`, "i"),
        );
      }
    }
  });

  it("name every one of their own targets, and none of the other half's", () => {
    for (const target of V4_LEAKAGE_CORRECTION_TARGETS) {
      const [mine, theirs] = target.slot === "A" ? [A_REQ, B_REQ] : [B_REQ, A_REQ];
      expect(mine).toContain(target.caseId);
      expect(mine).toContain(target.keyword);
      expect(theirs).not.toContain(target.caseId);
    }
    expect(A_REQ).not.toMatch(/DIC4-Q/);
    expect(B_REQ).not.toMatch(/DIC4-P/);
  });

  it("disclose neither the check nor what any value matched", () => {
    for (const request of [A_REQ, B_REQ]) {
      for (const forbidden of [
        /leak/i,
        /scanner/i,
        /collid/i,
        /collision/i,
        /substring/i,
        /mistral/i,
        /\bhalf [ab]\b/i,
        /preserved/i,
        /system\.md/i,
        /wire schema/i,
        /prompt/i,
      ]) {
        expect(request, `request must not match ${forbidden}`).not.toMatch(forbidden);
      }
    }
  });

  it("is valid JSON once the half B skeleton is completed", () => {
    const skeleton = B_REQ.slice(B_REQ.indexOf("{"), B_REQ.lastIndexOf("}") + 1);
    expect(() => JSON.parse(skeleton.replace("…", "x"))).not.toThrow();
  });
});

describe("the two author packets, drafted earlier and never sent", () => {
  const A = readFileSync(`${PROV}leakage/03-half-a-correction-packet.md`, "utf8");
  const B = readFileSync(`${PROV}leakage/04-half-b-correction-packet.md`, "utf8");

  it("are pinned by digest", () => {
    expect(digest("leakage/03-half-a-correction-packet.md")).toMatchInlineSnapshot(
      `"f331b84dc65b2d07fd697ee3ac4ad891d4b3d61f47bc80366eab51a76d45c77b"`,
    );
    expect(digest("leakage/04-half-b-correction-packet.md")).toMatchInlineSnapshot(
      `"cac00f0667be5ee77b59de4476df6757ab5973ccf7734aec67fa5596b22db6af"`,
    );
  });

  it("share a byte-identical contract below the flagged-value table", () => {
    const body = (text: string) => text.slice(text.indexOf("## What is being asked"));
    expect(body(A)).toBe(body(B));
    expect(body(A).length).toBeGreaterThan(500);
  });

  it("names only its own half's cases and values", () => {
    expect(A).not.toMatch(/DIC4-Q/);
    expect(B).not.toMatch(/DIC4-P/);
    for (const target of V4_LEAKAGE_CORRECTION_TARGETS) {
      const [mine, theirs] = target.slot === "A" ? [A, B] : [B, A];
      expect(mine).toContain(target.caseId);
      expect(theirs).not.toContain(target.caseId);
    }
  });

  /**
   * The disclosure check. Written as a denylist over the packet text because the packets are the
   * only artifact in this round that leaves the repository, and the one failure that cannot be
   * taken back is a packet that explains what a word matched.
   */
  it("discloses neither the check nor what any value matched", () => {
    for (const packet of [A, B]) {
      for (const forbidden of [
        /leak/i,
        /scanner/i,
        /collid/i,
        /collision/i,
        /substring/i,
        /mistral/i,
        /\bhalf [ab]\b/i,
        /preserved/i,
        /system\.md/i,
        /wire schema/i,
      ]) {
        expect(packet, `packet must not match ${forbidden}`).not.toMatch(forbidden);
      }
    }
  });

  it("supplies no replacement wording", () => {
    for (const packet of [A, B]) {
      // Whitespace-folded: prettier reflows the packet, and the phrase wraps across lines.
      expect(packet.replace(/\s+/g, " ")).toContain("semantically equivalent short tone keyword");
      expect(packet).not.toMatch(/for example[,:]? [`"]/i);
      expect(packet).not.toMatch(/such as [`"]/i);
    }
  });
});

/** A well-formed response, used as the baseline the failure cases each break in one way. */
const goodA: CorrectionResponseEntry[] = V4_LEAKAGE_CORRECTION_TARGETS.filter(
  (t) => t.slot === "A",
).map((t) => ({ caseId: t.caseId, keyword: t.keyword, replacement: `${t.keyword}-x` }));

describe("checkCorrectionResponse rejects what it exists to reject", () => {
  it("accepts a complete, well-formed response", () => {
    expect(checkCorrectionResponse("A", goodA)).toEqual([]);
  });

  it("catches a missing replacement", () => {
    expect(checkCorrectionResponse("A", goodA.slice(1))).toEqual(
      expect.arrayContaining([
        expect.stringContaining("missing replacement for (DIC4-P01, grounded)"),
      ]),
    );
  });

  it("catches a value replaced with itself", () => {
    const same = goodA.map((e, i) => (i === 0 ? { ...e, replacement: e.keyword } : e));
    expect(checkCorrectionResponse("A", same)).toEqual(
      expect.arrayContaining([expect.stringContaining("was replaced with itself")]),
    );
  });

  it("catches a case the author was never given", () => {
    const foreign = [...goodA, { caseId: "DIC4-Q01", keyword: "reserved", replacement: "quiet" }];
    expect(checkCorrectionResponse("A", foreign)).toEqual(
      expect.arrayContaining([expect.stringContaining("is not one of this half's targets")]),
    );
  });

  it("catches a replacement outside the existing contract bound", () => {
    const long = goodA.map((e, i) => (i === 0 ? { ...e, replacement: "x".repeat(49) } : e));
    expect(checkCorrectionResponse("A", long)).toEqual(
      expect.arrayContaining([expect.stringContaining("the existing contract admits 2–48")]),
    );
  });

  it("does not judge whether a replacement is good, short, or equivalent", () => {
    const odd = goodA.map((e, i) =>
      i === 0 ? { ...e, replacement: "a tone entirely unlike the original" } : e,
    );
    expect(checkCorrectionResponse("A", odd)).toEqual([]);
  });
});

describe("checkSubstitutionApplied proves nothing else moved", () => {
  const before = read(HALF_A);
  const apply = (response: CorrectionResponseEntry[]) => {
    const next = structuredClone(before) as {
      cases: { id: string; identity: { toneKeywords: string[] } }[];
    };
    for (const target of V4_LEAKAGE_CORRECTION_TARGETS.filter((t) => t.slot === "A")) {
      const entry = response.find(
        (r) => r.caseId === target.caseId && r.keyword === target.keyword,
      )!;
      next.cases.find((c) => c.id === target.caseId)!.identity.toneKeywords[target.index] =
        entry.replacement;
    }
    return next;
  };

  it("passes when exactly the pinned substitutions were applied", () => {
    expect(checkSubstitutionApplied("A", before, apply(goodA), goodA)).toEqual([]);
  });

  it("catches an edit to an untargeted toneKeyword in the same array", () => {
    const after = apply(goodA);
    after.cases[0].identity.toneKeywords[2] = "tampered";
    expect(checkSubstitutionApplied("A", before, after, goodA)).toEqual(
      expect.arrayContaining([
        expect.stringContaining("something outside the target values changed"),
      ]),
    );
  });

  it("catches an edit to a field nobody thought to list", () => {
    const after = apply(goodA) as unknown as { cases: { identity: Record<string, unknown> }[] };
    after.cases[3].identity.copyTone = "quietly rewritten";
    expect(checkSubstitutionApplied("A", before, after as unknown, goodA)).toEqual(
      expect.arrayContaining([
        expect.stringContaining("something outside the target values changed"),
      ]),
    );
  });

  it("catches a substitution applied at the wrong index", () => {
    const after = structuredClone(before) as {
      cases: { id: string; identity: { toneKeywords: string[] } }[];
    };
    for (const target of V4_LEAKAGE_CORRECTION_TARGETS.filter((t) => t.slot === "A")) {
      const kws = after.cases.find((c) => c.id === target.caseId)!.identity.toneKeywords;
      kws[target.index === 0 ? 1 : 0] = `${target.keyword}-x`;
    }
    expect(checkSubstitutionApplied("A", before, after, goodA).length).toBeGreaterThan(0);
  });

  it("does not mutate the frozen artifact it was handed", () => {
    const snapshot = JSON.stringify(before);
    checkSubstitutionApplied("A", before, apply(goodA), goodA);
    expect(JSON.stringify(before)).toBe(snapshot);
  });
});
