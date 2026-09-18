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
import {
  V4_OPERATOR_AUTHORED_VALUE_COUNT,
  V4_OPERATOR_AUTHORED_VALUES,
} from "./design-intent-challenge-v4-operator-exception";
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

/**
 * Round 1 of the controlled correction: applied, proved, and then **gated** by the frozen scan on
 * one residual collision (`leakage/14-RESIDUAL-COLLISION.md`).
 *
 * The candidates are pinned here precisely because they were not adopted. An artifact that failed
 * a gate is evidence, and the way a programme loses the ability to say what a gate cost is by
 * deleting the thing it stopped.
 */
describe("controlled correction round 1", () => {
  const L = `${PROV}leakage/`;
  const officialA = (): CorrectionResponseEntry[] => {
    const out: CorrectionResponseEntry[] = [];
    let cur = "";
    for (const line of readFileSync(
      `${L}10-half-a-controlled-correction-response.txt`,
      "utf8",
    ).split("\n")) {
      const t = line.trim();
      if (/^DIC4-P\d\d$/.test(t)) {
        cur = t;
        continue;
      }
      const m = t.match(/^(.+?)\s*→\s*(.+)$/);
      if (m) out.push({ caseId: cur, keyword: m[1].trim(), replacement: m[2].trim() });
    }
    return out;
  };
  const officialB = (): CorrectionResponseEntry[] =>
    (
      JSON.parse(readFileSync(`${L}11-half-b-controlled-correction-response.json`, "utf8")) as {
        replacements: { id: string; old: string; new: string }[];
      }
    ).replacements.map((r) => ({ caseId: r.id, keyword: r.old, replacement: r.new }));

  it("pins the two official responses", () => {
    expect(digest("leakage/10-half-a-controlled-correction-response.txt")).toBe(
      "5fa85c09550fd2e851430685081f3361d571003cf822def55d7c6a321b01c34a",
    );
    expect(digest("leakage/11-half-b-controlled-correction-response.json")).toBe(
      "cbb35c18f13e72592434d757776182a897dc5b4e5960166e0242534a233ca7aa",
    );
  });

  it("both official responses validate against the pinned targets", () => {
    expect(checkCorrectionResponse("A", officialA())).toEqual([]);
    expect(checkCorrectionResponse("B", officialB())).toEqual([]);
  });

  it("pins the two gated candidates", () => {
    expect(digest("leakage/12-half-a-corrected-candidate-r1.json")).toBe(
      "9da421a9cde036b79f09f975a5957b48c7f18a24568810b5c20b4b56b5d0630d",
    );
    expect(digest("leakage/13-half-b-corrected-candidate-r1.json")).toBe(
      "8094022603a97d8b4e3d414cd208df8c5593c70e92186aa5a05ccd1addfcf7fa",
    );
  });

  it("each candidate is its canonical artifact plus only the authorized substitutions", () => {
    expect(
      checkSubstitutionApplied(
        "A",
        read(HALF_A),
        read("leakage/12-half-a-corrected-candidate-r1.json"),
        officialA(),
      ),
    ).toEqual([]);
    expect(
      checkSubstitutionApplied(
        "B",
        read(HALF_B),
        read("leakage/13-half-b-corrected-candidate-r1.json"),
        officialB(),
      ),
    ).toEqual([]);
  });

  /** The gate held: neither candidate replaced the canonical artifact. */
  it("the canonical Stage-2 artifacts are untouched", () => {
    expect(digest(HALF_A)).toBe("824706333d94ce70fc50edc685a4b5e92f4d8bb64cae506e1fb553964a7a94fa");
    expect(digest(HALF_B)).toBe("62cff57645b9ee65c0a444270c677a3a2bb794993e212da814b83504b2099c2e");
  });

  it("records the residual collision rather than only the clean half", () => {
    const record = readFileSync(`${L}14-RESIDUAL-COLLISION.md`, "utf8");
    expect(record).toContain("DIC4-Q01");
    expect(record).toContain("restrained");
    expect(record).toContain("design intent wire schema");
  });
});

/**
 * The adopted Stage-2 artifacts, frozen after a clean scan.
 *
 * Pinned against the **canonical** artifacts rather than against correction candidate r1, so the
 * whole chain — author response, operator exception, adoption — is provable from the two frozen
 * originals in one step and does not depend on an intermediate file surviving.
 */
describe("the frozen corrected Stage-2 artifacts", () => {
  const FINAL_A = "half-a/06-stage-2-eventidentity-cases-corrected.json";
  const FINAL_B = "half-b/05-stage-2-eventidentity-cases-corrected.json";

  it("are pinned by digest", () => {
    expect(digest(FINAL_A)).toBe(
      "9da421a9cde036b79f09f975a5957b48c7f18a24568810b5c20b4b56b5d0630d",
    );
    expect(digest(FINAL_B)).toBe(
      "ee5a9b8040d90d1f5ac8ee94e20ceb0c8dc94817c2055f799a75176e2f8f8b51",
    );
  });

  it("leave the canonical pre-correction artifacts untouched", () => {
    expect(digest(HALF_A)).toBe("824706333d94ce70fc50edc685a4b5e92f4d8bb64cae506e1fb553964a7a94fa");
    expect(digest(HALF_B)).toBe("62cff57645b9ee65c0a444270c677a3a2bb794993e212da814b83504b2099c2e");
  });

  it("each is its canonical artifact plus exactly the pinned substitutions", () => {
    const netA: CorrectionResponseEntry[] = V4_LEAKAGE_CORRECTION_TARGETS.filter(
      (t) => t.slot === "A",
    ).map((t) => {
      const doc = read(FINAL_A) as {
        cases: { id: string; identity: { toneKeywords: string[] } }[];
      };
      return {
        caseId: t.caseId,
        keyword: t.keyword,
        replacement: doc.cases.find((c) => c.id === t.caseId)!.identity.toneKeywords[t.index],
      };
    });
    const netB: CorrectionResponseEntry[] = V4_LEAKAGE_CORRECTION_TARGETS.filter(
      (t) => t.slot === "B",
    ).map((t) => {
      const doc = read(FINAL_B) as {
        cases: { id: string; identity: { toneKeywords: string[] } }[];
      };
      return {
        caseId: t.caseId,
        keyword: t.keyword,
        replacement: doc.cases.find((c) => c.id === t.caseId)!.identity.toneKeywords[t.index],
      };
    });
    expect(checkSubstitutionApplied("A", read(HALF_A), read(FINAL_A), netA)).toEqual([]);
    expect(checkSubstitutionApplied("B", read(HALF_B), read(FINAL_B), netB)).toEqual([]);
  });

  it("half A is the clean candidate adopted byte for byte", () => {
    expect(digest(FINAL_A)).toBe(digest("leakage/12-half-a-corrected-candidate-r1.json"));
  });

  it("carry every author-supplied replacement verbatim", () => {
    const a = read(FINAL_A) as { cases: { id: string; identity: { toneKeywords: string[] } }[] };
    const b = read(FINAL_B) as { cases: { id: string; identity: { toneKeywords: string[] } }[] };
    const at = (doc: typeof a, id: string, i: number) =>
      doc.cases.find((c) => c.id === id)!.identity.toneKeywords[i];

    // Half A: all ten are the human author's.
    for (const [id, i, value] of [
      ["DIC4-P01", 0, "anchored"],
      ["DIC4-P01", 1, "contemplative"],
      ["DIC4-P01", 3, "tender"],
      ["DIC4-P02", 2, "considerate"],
      ["DIC4-P02", 4, "self-selected"],
      ["DIC4-P03", 4, "forthright"],
      ["DIC4-P04", 1, "exacting"],
      ["DIC4-P04", 3, "official"],
      ["DIC4-P05", 2, "approachable"],
      ["DIC4-P06", 5, "purposeful"],
    ] as const) {
      expect(at(a, id, i)).toBe(value);
    }
    // Half B: five are Mistral's; index 1 of Q01 is the operator's and is asserted below.
    for (const [id, i, value] of [
      ["DIC4-Q03", 1, "muted"],
      ["DIC4-Q04", 2, "haptic"],
      ["DIC4-Q05", 1, "anchored"],
      ["DIC4-Q06", 2, "harmonized"],
      ["DIC4-Q06", 3, "whimsical"],
    ] as const) {
      expect(at(b, id, i)).toBe(value);
    }
  });

  /**
   * The authorship claim, asserted rather than narrated. `restrained` was Mistral's word and must
   * not survive anywhere; `quietly understated` is the operator's and must appear exactly once, at
   * the one recorded coordinate.
   */
  it("carries exactly one operator-authored value, at the recorded coordinate", () => {
    expect(V4_OPERATOR_AUTHORED_VALUES).toHaveLength(V4_OPERATOR_AUTHORED_VALUE_COUNT);
    const [exception] = V4_OPERATOR_AUTHORED_VALUES;
    expect(exception.authoredBy).toBe("operator");
    expect(exception.replacedAuthorValue).toBe("restrained");

    const b = read(FINAL_B) as { cases: { id: string; identity: { toneKeywords: string[] } }[] };
    expect(
      b.cases.find((c) => c.id === exception.caseId)!.identity.toneKeywords[exception.index],
    ).toBe(exception.value);

    const everyString = (doc: unknown): string[] =>
      typeof doc === "string"
        ? [doc]
        : doc && typeof doc === "object"
          ? Object.values(doc as Record<string, unknown>).flatMap(everyString)
          : [];
    for (const final of [FINAL_A, FINAL_B]) {
      expect(everyString(read(final)).filter((s) => s === exception.value)).toHaveLength(
        final === FINAL_B ? 1 : 0,
      );
      expect(everyString(read(final))).not.toContain(exception.replacedAuthorValue);
    }
  });

  it("the preserved final scan is clean on every declared surface", () => {
    const scan = JSON.parse(
      readFileSync(`${PROV}leakage/18-final-clean-leakage-scan.json`, "utf8"),
    ) as {
      surfacesScanned: unknown[];
      surfacesAbsent: unknown[];
      halves: Record<string, { hits: unknown[] }>;
    };
    expect(scan.surfacesScanned).toHaveLength(8);
    expect(scan.surfacesAbsent).toEqual([]);
    for (const half of Object.values(scan.halves)) expect(half.hits).toEqual([]);
  });
});
