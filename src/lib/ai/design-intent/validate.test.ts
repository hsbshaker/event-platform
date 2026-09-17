/**
 * The application validator is the authority on a DesignIntent response.
 *
 * `docs/model-contracts.md §3`: provider structured-output modes enforce JSON Schema unevenly, so
 * the application always runs the canonical validator. What it decides is whether the object is
 * structurally and semantically **legal** — `docs/phase-4b-plan.md §E` is explicit that whether
 * three siblings are genuinely different creative worlds is not deterministic and that no metric
 * should pretend otherwise, so there is no creative-quality heuristic anywhere in this suite.
 *
 * Acceptance criteria: `spec.md §31 — DesignIntent, composition and compiler`:
 * "Strong model returns `family`, `tonalDirection`, `palette`, `typographyPairing`, `density`,
 * `composition`, `motifs`, plus a `presentation` object (`name`, `description`) that the compiler
 * never reads"; "Duplicate or invalid concept names fall back deterministically and are logged as
 * compiler repairs". Guardrails `spec.md §32 #12`, `#21`. Plan: `docs/phase-4b-plan.md §E`, T18.
 */
import { describe, expect, it } from "vitest";

import { assignmentFor, emptyAvoidList, type SiblingAssignment } from "@/lib/renderer/planner";
import { FAMILIES, TYPOGRAPHY, TYPOGRAPHY_KEYS } from "@/lib/renderer/vocabulary";

import { MOTIF_IDS, UNNARROWED } from "./contract";
import { allowedPairings } from "./narrowing";
import { DISPOSITION, MAX_REPAIR_RETRIES, REPROMPT_CONDITIONS } from "./policy";
import {
  describeIssues,
  parseAndValidateDesignIntentResponse,
  validateDesignIntentResponse,
  validatePresentation,
  type ValidationIssue,
} from "./validate";

const ASSIGNMENT: SiblingAssignment = assignmentFor(3, emptyAvoidList());
const PAIRING = allowedPairings(ASSIGNMENT)[0];

/** A response that satisfies every invariant, for the assignment above. */
function valid(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    family: ASSIGNMENT.family,
    tonalDirection: ASSIGNMENT.tonalDirection,
    palette: { colors: ["#1B2A41", "#C9A227", "#F4F1EA"], dominant: "#1B2A41" },
    typographyPairing: PAIRING,
    density: "balanced",
    composition: {
      asymmetry: "gentle",
      hierarchy: ASSIGNMENT.hierarchy,
      rhythm: "alternating",
      sectionContrast: "moderate",
      ornament: "restrained",
    },
    motifs: ["linen"],
    presentation: { name: "Pressed Garden", description: "A quiet, unhurried invitation." },
    ...overrides,
  };
}

const paths = (issues: readonly ValidationIssue[]) => issues.map((i) => i.path);

describe("a valid response", () => {
  it("is accepted, and splits into design semantics and presentation", () => {
    const outcome = validateDesignIntentResponse(valid(), ASSIGNMENT);
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;

    // The compiler consumes the seven design fields and never the presentation (`§32 #21`).
    expect(Object.keys(outcome.designIntent).sort()).toEqual([
      "composition",
      "density",
      "family",
      "motifs",
      "palette",
      "tonalDirection",
      "typographyPairing",
    ]);
    expect("presentation" in outcome.designIntent).toBe(false);
    expect(outcome.presentation.ok).toBe(true);
  });

  it("accepts an empty motif list", () => {
    // Zero motifs is a legitimate creative answer, not an omission.
    expect(validateDesignIntentResponse(valid({ motifs: [] }), ASSIGNMENT).ok).toBe(true);
  });

  it("parses raw provider text", () => {
    expect(parseAndValidateDesignIntentResponse(JSON.stringify(valid()), ASSIGNMENT).ok).toBe(true);
  });
});

describe("shape", () => {
  it("refuses an unknown key, at the root and inside a nested object", () => {
    for (const bad of [
      valid({ pageSystem: "bordered" }),
      valid({ composition: { ...(valid().composition as object), grid: "12" } }),
      valid({
        palette: { colors: ["#1B2A41", "#C9A227", "#F4F1EA"], dominant: "#1B2A41", css: "" },
      }),
    ]) {
      const outcome = validateDesignIntentResponse(bad, ASSIGNMENT);
      expect(outcome.ok).toBe(false);
    }
  });

  it("refuses a missing design field", () => {
    for (const key of [
      "family",
      "tonalDirection",
      "palette",
      "typographyPairing",
      "density",
      "composition",
      "motifs",
    ]) {
      const body = valid();
      delete body[key];
      expect(validateDesignIntentResponse(body, ASSIGNMENT).ok, key).toBe(false);
    }
  });

  it("refuses free text where an enum belongs", () => {
    expect(validateDesignIntentResponse(valid({ density: "airy and light" }), ASSIGNMENT).ok).toBe(
      false,
    );
  });

  it("refuses a non-object and unparseable JSON", () => {
    expect(validateDesignIntentResponse(null, ASSIGNMENT).ok).toBe(false);
    expect(validateDesignIntentResponse("a design intent", ASSIGNMENT).ok).toBe(false);
    const broken = parseAndValidateDesignIntentResponse("{not json", ASSIGNMENT);
    expect(broken.ok).toBe(false);
    if (!broken.ok) expect(broken.issues[0].path).toBe("(root)");
  });
});

describe("palette", () => {
  it("refuses fewer than three and more than five colors", () => {
    for (const colors of [
      ["#1B2A41", "#C9A227"],
      ["#1B2A41", "#C9A227", "#F4F1EA", "#7A8B99", "#2E4057", "#B04A3A"],
    ])
      expect(
        validateDesignIntentResponse(
          valid({ palette: { colors, dominant: colors[0] } }),
          ASSIGNMENT,
        ).ok,
        `${colors.length} colors`,
      ).toBe(false);
  });

  it("refuses anything that is not an uppercase #RRGGBB", () => {
    for (const bad of ["#1b2a41", "1B2A41", "#1B2A4", "navy", "rgb(27,42,65)", "#1B2A41FF"])
      expect(
        validateDesignIntentResponse(
          valid({ palette: { colors: [bad, "#C9A227", "#F4F1EA"], dominant: "#C9A227" } }),
          ASSIGNMENT,
        ).ok,
        bad,
      ).toBe(false);
  });

  it("refuses a duplicate color", () => {
    const outcome = validateDesignIntentResponse(
      valid({ palette: { colors: ["#1B2A41", "#1B2A41", "#F4F1EA"], dominant: "#1B2A41" } }),
      ASSIGNMENT,
    );
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) expect(paths(outcome.issues)).toContain("palette.colors");
  });

  it("refuses a dominant that is not one of the colors", () => {
    // `§5.1` and `spec.md §7.8`: "dominant ∈ colors". A well-formed but inconsistent response is a
    // compatibility problem — `docs/model-contracts.md §8` gives those deterministic repair, and
    // never a re-prompt.
    const outcome = validateDesignIntentResponse(
      valid({ palette: { colors: ["#1B2A41", "#C9A227", "#F4F1EA"], dominant: "#B04A3A" } }),
      ASSIGNMENT,
    );
    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(paths(outcome.issues)).toEqual(["palette.dominant"]);
    expect(outcome.issues[0].class).toBe("compatibility");
    expect(outcome.issues[0].disposition).toBe("deterministic_repair");
  });
});

describe("the assignment is the contract, not a suggestion", () => {
  it("makes an out-of-assignment family unrepresentable in the narrowed schema", () => {
    const other = (["editorial", "invitation", "statement"] as const).find(
      (f) => f !== ASSIGNMENT.family,
    )!;
    const outcome = validateDesignIntentResponse(valid({ family: other }), ASSIGNMENT);
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) expect(paths(outcome.issues)).toContain("family");
  });

  it("makes an out-of-assignment tone unrepresentable in the narrowed schema", () => {
    const other = (["light", "mid", "dark"] as const).find((t) => t !== ASSIGNMENT.tonalDirection)!;
    expect(validateDesignIntentResponse(valid({ tonalDirection: other }), ASSIGNMENT).ok).toBe(
      false,
    );
  });

  it("makes a pairing outside the assigned category unrepresentable", () => {
    const outside = TYPOGRAPHY_KEYS.find(
      (k) => TYPOGRAPHY[k].category !== ASSIGNMENT.typographyCategory,
    )!;
    expect(validateDesignIntentResponse(valid({ typographyPairing: outside }), ASSIGNMENT).ok).toBe(
      false,
    );
  });

  it("still catches all three when narrowing is not applied — the validator is the authority", () => {
    // `UNNARROWED` stands in for a provider that ignored the narrowed enum. §3 says the
    // application validator decides, so the semantic checks cannot depend on narrowing having
    // happened; otherwise the only thing enforcing the assignment is the thing being trusted.
    const other = (["editorial", "invitation", "statement"] as const).find(
      (f) => f !== ASSIGNMENT.family,
    )!;
    const outside = TYPOGRAPHY_KEYS.find(
      (k) => TYPOGRAPHY[k].category !== ASSIGNMENT.typographyCategory,
    )!;
    const outcome = validateDesignIntentResponse(
      valid({ family: other, typographyPairing: outside }),
      ASSIGNMENT,
      UNNARROWED,
    );
    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(paths(outcome.issues)).toEqual(["family", "typographyPairing"]);
    for (const i of outcome.issues) {
      expect(i.class).toBe("assignment");
      // Never repaired into agreement: that would report a diversity plan that did not happen.
      expect(i.disposition).toBe("fail_visibly");
    }
  });

  it("refuses a hierarchy the family does not admit", () => {
    const outcome = validateDesignIntentResponse(
      valid({
        family: "invitation",
        tonalDirection: ASSIGNMENT.tonalDirection,
        composition: { ...(valid().composition as object), hierarchy: "monumental" },
      }),
      { ...ASSIGNMENT, family: "invitation" },
      UNNARROWED,
    );
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) expect(paths(outcome.issues)).toContain("composition.hierarchy");
  });

  it("makes a hierarchy other than the assigned one unrepresentable in the narrowed schema", () => {
    // Hierarchy is a hard assignment field like family and tonalDirection: narrowing offers only
    // the assigned value, so another one cannot arrive at all.
    const other = FAMILIES[ASSIGNMENT.family].hierarchies.find((h) => h !== ASSIGNMENT.hierarchy);
    expect(other, "pick an assignment whose family admits more than one hierarchy").toBeDefined();
    const outcome = validateDesignIntentResponse(
      valid({ composition: { ...(valid().composition as object), hierarchy: other } }),
      ASSIGNMENT,
    );
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) expect(paths(outcome.issues)).toContain("composition.hierarchy");
  });

  it("rejects hierarchy drift independently, when narrowing is deliberately bypassed", () => {
    // `§3`: the validator is the authority. An assignment check that only runs when someone
    // remembers to narrow is not one — and hierarchy is checked the same way family and tone are,
    // with the same disposition: fail visibly, never repaired into agreement.
    const other = FAMILIES[ASSIGNMENT.family].hierarchies.find((h) => h !== ASSIGNMENT.hierarchy)!;
    const outcome = validateDesignIntentResponse(
      valid({ composition: { ...(valid().composition as object), hierarchy: other } }),
      ASSIGNMENT,
      UNNARROWED,
    );
    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(paths(outcome.issues)).toContain("composition.hierarchy");
    const drift = outcome.issues.find((i) => i.path === "composition.hierarchy")!;
    expect(drift.class).toBe("assignment");
    expect(drift.disposition).toBe("fail_visibly");
  });

  it("reports the pairing incompatibility that hierarchy drift creates, beside the drift", () => {
    // `docs/event-renderer-system.md §8`: the two oldstyle pairings do not hold at monumental. A
    // drifted hierarchy the chosen pairing cannot carry is a second, genuinely different defect,
    // and the two classes travel together so the boundary's precedence rule has a real case.
    const oldstyle: SiblingAssignment = {
      family: "editorial",
      tonalDirection: "mid",
      typographyCategory: "oldstyle",
      hierarchy: "editorial",
      typographyPairings: ["oldstyle_garamond_worksans", "oldstyle_cormorant_figtree"],
    };
    const outcome = validateDesignIntentResponse(
      valid({
        family: "editorial",
        tonalDirection: "mid",
        typographyPairing: "oldstyle_garamond_worksans",
        composition: { ...(valid().composition as object), hierarchy: "monumental" },
      }),
      oldstyle,
      UNNARROWED,
    );
    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(paths(outcome.issues)).toEqual(["composition.hierarchy", "typographyPairing"]);
    expect(outcome.issues.map((i) => i.class)).toEqual(["assignment", "compatibility"]);
  });
});

describe("motifs", () => {
  it("refuses an id outside the seven curated ones, including the retired v3 catalog", () => {
    for (const bad of ["plaid_restrained", "botanical_line", "deco_border", "ribbon_line", "toile"])
      expect(validateDesignIntentResponse(valid({ motifs: [bad] }), ASSIGNMENT).ok, bad).toBe(
        false,
      );
  });

  it("accepts every curated id", () => {
    for (const id of MOTIF_IDS)
      expect(validateDesignIntentResponse(valid({ motifs: [id] }), ASSIGNMENT).ok, id).toBe(true);
  });

  it("refuses more than three, and a duplicate", () => {
    expect(
      validateDesignIntentResponse(
        valid({ motifs: ["plaid", "stripe", "linen", "botanical"] }),
        ASSIGNMENT,
      ).ok,
    ).toBe(false);
    const dup = validateDesignIntentResponse(valid({ motifs: ["plaid", "plaid"] }), ASSIGNMENT);
    expect(dup.ok).toBe(false);
    if (!dup.ok) expect(paths(dup.issues)).toContain("motifs");
  });
});

describe("presentation, validated separately", () => {
  it("does not condemn the design semantics beside it", () => {
    // `spec.md §7.8`: a missing, invalid or duplicate concept name gets a deterministic fallback.
    // A fatal parse would pre-empt that, throwing away a good design over a bad name.
    for (const bad of [
      undefined,
      null,
      {},
      { name: "Ok", description: "short" },
      "Pressed Garden",
    ]) {
      const outcome = validateDesignIntentResponse(valid({ presentation: bad }), ASSIGNMENT);
      expect(outcome.ok, JSON.stringify(bad)).toBe(true);
      if (!outcome.ok) continue;
      expect(outcome.presentation.ok).toBe(false);
    }
  });

  it("enforces its own bounds", () => {
    expect(validatePresentation({ name: "Ab", description: "x".repeat(40) }).ok).toBe(false);
    expect(validatePresentation({ name: "A".repeat(41), description: "x".repeat(40) }).ok).toBe(
      false,
    );
    expect(validatePresentation({ name: "Pressed Garden", description: "too short" }).ok).toBe(
      false,
    );
    expect(validatePresentation({ name: "Pressed Garden", description: "x".repeat(141) }).ok).toBe(
      false,
    );
    // Not an enum id, not a formula: the pattern rejects underscores and digits outright.
    expect(validatePresentation({ name: "editorial_v2", description: "x".repeat(40) }).ok).toBe(
      false,
    );
    expect(validatePresentation({ name: "Pressed Garden", description: "x".repeat(40) }).ok).toBe(
      true,
    );
  });

  it("refuses an unknown key", () => {
    expect(
      validatePresentation({ name: "Pressed Garden", description: "x".repeat(40), tagline: "t" })
        .ok,
    ).toBe(false);
  });

  describe("the concept name accepts the names hosts actually see", () => {
    // Why this matters more than it looks: the wire schema carries no pattern, so a name this
    // rule rejects is discarded into `spec.md §7.8`'s deterministic fallback *after* the model has
    // answered — silently, and the thing thrown away is the graded concept card.
    const description = "x".repeat(40);
    const name = (value: string) => validatePresentation({ name: value, description }).ok;

    it("accepts precomposed accented Latin", () => {
      expect(name("Café Lumière")).toBe(true);
      expect(name("Jardín Cálido")).toBe(true);
    });

    it("accepts the same name decomposed, because it is the same name", () => {
      const precomposed = "Café Lumière";
      const decomposed = precomposed.normalize("NFD");
      expect(decomposed).not.toBe(precomposed);
      expect(name(precomposed)).toBe(true);
      expect(name(decomposed)).toBe(true);
    });

    it("accepts a non-ASCII name, including in a script with no case", () => {
      expect(name("Зимний Сад")).toBe(true);
      expect(name("雪の庭園")).toBe(true);
      expect(name("Πρωινό Φως")).toBe(true);
    });

    it("accepts ordinary apostrophes and dashes, straight and typographic", () => {
      expect(name("Winter's Edge")).toBe(true);
      expect(name("Winter’s Edge")).toBe(true);
      expect(name("Half-Light Terrace")).toBe(true);
      expect(name("Half–Light Terrace")).toBe(true);
    });

    it("still refuses an identifier, a number and stray punctuation", () => {
      for (const bad of [
        "editorial_v2",
        "Concept 2",
        "Direction #1",
        "Winter Estate!",
        "Winter/Estate",
        "Winter.Estate",
        "'Winter Estate",
        "Winter Estate-",
        "Ab",
        "A".repeat(41),
        "",
      ])
        expect(name(bad), JSON.stringify(bad)).toBe(false);
    });
  });
});

describe("repair policy is encoded, not invoked", () => {
  it("re-prompts for exactly one condition, once", () => {
    // `docs/model-contracts.md §8` and `spec.md §32 #21`. The token-cap and selector-collision
    // clauses of #21 belong to the composition call: a DesignIntent response carries no tree.
    expect([...REPROMPT_CONDITIONS]).toEqual(["schema_invalid"]);
    expect(MAX_REPAIR_RETRIES).toBe(1);
    expect(DISPOSITION.schema).toBe("repair_retry_once");
    expect(DISPOSITION.compatibility).toBe("deterministic_repair");
    expect(DISPOSITION.assignment).toBe("fail_visibly");
  });

  it("describes issues compactly enough to quote back", () => {
    const outcome = validateDesignIntentResponse(valid({ density: "airy" }), ASSIGNMENT);
    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(describeIssues(outcome.issues)).toMatch(/^- density: /);
  });
});
