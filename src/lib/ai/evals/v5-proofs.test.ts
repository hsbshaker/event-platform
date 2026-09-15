/**
 * The v5 remediation, asserted rather than described.
 *
 * Phase 4A's first sealed challenge returned zero questions on all twelve cases, and a human
 * reviewer found one where proceeding required the system to settle a matter it had no authority
 * to settle. The cause was structural: **every** model-visible instruction scoped clarification
 * to taste, so the correct behaviour was unreachable no matter how the model reasoned. Two of
 * those instructions lived in the wire schema, where a prompt-only fix would never have reached
 * them.
 *
 * So the guards here are mostly about *text that ships to the model*, and they are deliberately
 * per-site rather than one blanket scan: the failure mode this phase keeps reproducing is
 * changing a rule in one place and leaving it contradicted in another.
 *
 * Every assertion below should fail if the guard it protects is weakened. The mutations that
 * must turn each one red are listed in `docs/development-plan.md` and were exercised by hand
 * before this file was committed.
 *
 * Acceptance criteria: `spec.md §31 — Prompt, auth, and generation` (adaptive clarification
 * bullets) and `§32` guardrail 9. `docs/model-contracts.md §4`.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import {
  clarificationDecisionSchema,
  clarificationQuestionSchema,
  CLARIFICATION_CEILING,
} from "@/lib/ai/event-identity/contract";
import { EVENT_IDENTITY_PROMPT_VERSION, EVENT_IDENTITY_SCHEMA_VERSION } from "@/lib/ai/versions";

const ROOT = new URL("../../../../", import.meta.url).pathname;
const read = (rel: string) => readFileSync(`${ROOT}${rel}`, "utf8");

/** Prose wraps; guards should assert content, not line breaks. */
const flat = (text: string) => text.replace(/\s+/g, " ");

const PROMPT = read("docs/model-prompts/event-identity.system.md");
const PROMPT_FLAT = flat(PROMPT);
const SPEC = read("spec.md");
const SPEC_FLAT = flat(SPEC);
const CONTRACTS = read("docs/model-contracts.md");
const PLAN = read("docs/development-plan.md");
const DOCTRINE = read("docs/product-doctrine.md");
const DOCTRINE_FLAT = flat(DOCTRINE);
const WIRE = JSON.parse(read("docs/model-schemas/event-identity-result.wire.schema.json"));

/** Every description the wire schema ships, addressed by path. */
function wireDescriptions(): Record<string, string> {
  const out: Record<string, string> = {};
  const walk = (node: unknown, path: string) => {
    if (!node || typeof node !== "object") return;
    const record = node as Record<string, unknown>;
    if (typeof record.description === "string") out[path] = record.description;
    for (const key of Object.keys(record)) walk(record[key], `${path}/${key}`);
  };
  walk(WIRE, "");
  return out;
}
const WIRE_DESC = wireDescriptions();

const Q = "/properties/clarification/properties/questions/items/properties";

const option = (isDefer: boolean, label = isDefer ? "You decide" : "One") => ({ label, isDefer });

const creative = (question = "Should this lean one way or the other?") => ({
  kind: "creative" as const,
  question,
  whyItMatters: "the answers lead somewhere materially different",
  options: [option(false), option(false, "Two"), option(true)],
});

const boundary = (question = "What has been settled about sharing this?") => ({
  kind: "boundary" as const,
  question,
  whyItMatters: "the brief would otherwise take a position that is not ours to take",
  options: [option(false, "Say it plainly"), option(false, "Leave it out")],
});

const decide = (questions: unknown[]) =>
  clarificationDecisionSchema.safeParse({ needed: questions.length > 0, questions });

/* ------------------------------------------------------------------ routes exist, separately */

describe("Route A survives intact as the creative gate", () => {
  it("keeps all five conditions verbatim", () => {
    for (const condition of [
      "materially different creative worlds",
      "The host has not delegated the choice",
      "substantially alter the experience",
      "The distinction is creative**, never logistical",
      "Asking beats betting",
    ]) {
      expect(PROMPT).toContain(condition);
    }
    expect(PROMPT).toContain("all five");
  });

  it("keeps prefer-zero, the ceiling and the low-level design ban", () => {
    expect(PROMPT).toContain("The preferred number of questions is zero.");
    expect(PROMPT).toContain("Hard ceiling: **three**");
    expect(PROMPT).toContain("not fonts, grids, hero side, heading treatment, spacing or");
    expect(CLARIFICATION_CEILING).toBe(3);
  });

  it("keeps the delegation doctrine and its concrete-bet requirement", () => {
    expect(PROMPT).toContain("specific organizing idea a designer could draw");
    expect(PROMPT).toContain("Commit to something they could disagree with.");
  });
});

describe("Route B exists as its own gate and cannot be read as Route A", () => {
  it("states all four conditions in a block separate from the five", () => {
    expect(PROMPT).toContain("all four");
    expect(PROMPT).toMatch(/Capability is not authority/);
    for (const condition of [
      "consequential position on behalf of a real person that the host never settled",
      "not a matter of taste",
      "cannot do its job while declining to take the position",
      "One focused question resolves it",
    ]) {
      expect(PROMPT_FLAT).toContain(condition);
    }
    // The two blocks are distinct passages, not one merged list.
    expect(PROMPT.indexOf("all five")).toBeLessThan(PROMPT.indexOf("all four"));
  });

  it("names every anti-trigger as a de-trigger, never as a domain that warrants asking", () => {
    expect(PROMPT_FLAT).toContain("sensitive, emotional, cultural, familial, personal, medical");
    expect(PROMPT).toContain("A missing logistical fact is never a trigger");
    expect(PROMPT).toContain("A missing aesthetic preference is");
    expect(PROMPT).toContain("Creative delegation does not reach this");
  });

  it("does not equate the host's preference with another person's permission", () => {
    expect(PROMPT).toContain("legitimately affirm as settled");
    expect(PROMPT_FLAT).toContain("not what the host would prefer");
    expect(PROMPT).toContain("not running a consent process");
  });

  it("records no lifetime cap anywhere", () => {
    for (const text of [PROMPT, SPEC, CONTRACTS]) {
      expect(text).not.toMatch(/at most one boundary question ever/i);
      expect(text).not.toMatch(/one boundary question (?:in total|for the lifetime)/i);
    }
    expect(SPEC).toContain("no lifetime cap");
    expect(flat(CONTRACTS)).toContain("no lifetime cap");
  });
});

/* ------------------------------------------------------------------ validation behaviour */

describe("kind is required and closed", () => {
  it("rejects a question with no kind", () => {
    const withoutKind: Record<string, unknown> = { ...creative() };
    delete withoutKind.kind;
    expect(clarificationQuestionSchema.safeParse(withoutKind).success).toBe(false);
  });

  it("rejects a kind outside the two routes", () => {
    expect(
      clarificationQuestionSchema.safeParse({ ...creative(), kind: "logistics" }).success,
    ).toBe(false);
  });

  it("ships the enum in the wire schema, so the model must choose", () => {
    const node = WIRE.properties.clarification.properties.questions.items;
    expect(node.properties.kind.enum).toEqual(["creative", "boundary"]);
    expect(node.required).toContain("kind");
  });
});

describe("defer semantics follow the route", () => {
  it("accepts a creative question with exactly one defer", () => {
    expect(clarificationQuestionSchema.safeParse(creative()).success).toBe(true);
  });

  it("rejects a creative question with no defer", () => {
    const q = { ...creative(), options: [option(false), option(false, "Two")] };
    expect(clarificationQuestionSchema.safeParse(q).success).toBe(false);
  });

  it("rejects a creative question with two defers", () => {
    const q = {
      ...creative(),
      options: [option(false), option(true), option(true, "Surprise me")],
    };
    expect(clarificationQuestionSchema.safeParse(q).success).toBe(false);
  });

  it("accepts a boundary question with zero defers", () => {
    expect(clarificationQuestionSchema.safeParse(boundary()).success).toBe(true);
  });

  it("rejects a boundary question offering to decide", () => {
    // The whole reason for asking is that the decision is not the system's to make.
    const q = { ...boundary(), options: [option(false, "Say it plainly"), option(true)] };
    expect(clarificationQuestionSchema.safeParse(q).success).toBe(false);
  });
});

describe("a boundary question is asked alone", () => {
  it("accepts one boundary question by itself", () => {
    expect(decide([boundary()]).success).toBe(true);
  });

  it("rejects a boundary question alongside a creative one", () => {
    expect(decide([boundary(), creative()]).success).toBe(false);
    expect(decide([creative(), boundary()]).success).toBe(false);
  });

  it("rejects two boundary questions", () => {
    expect(
      decide([boundary("What was settled here?"), boundary("What else was settled?")]).success,
    ).toBe(false);
  });

  it("still accepts up to three creative questions, and no more", () => {
    expect(
      decide([
        creative("Which direction here?"),
        creative("Which register here?"),
        creative("Which material here?"),
      ]).success,
    ).toBe(true);
    expect(
      decide([
        creative("Which direction here?"),
        creative("Which register here?"),
        creative("Which material here?"),
        creative("Which palette here?"),
      ]).success,
    ).toBe(false);
  });

  it("keeps the needed/questions agreement", () => {
    expect(clarificationDecisionSchema.safeParse({ needed: true, questions: [] }).success).toBe(
      false,
    );
    expect(
      clarificationDecisionSchema.safeParse({ needed: false, questions: [creative()] }).success,
    ).toBe(false);
    expect(clarificationDecisionSchema.safeParse({ needed: false, questions: [] }).success).toBe(
      true,
    );
  });
});

/* ------------------------------------------------------------------ model-visible text */

describe("every model-visible clarification instruction supports both routes", () => {
  it("no longer scopes the decision object to creative questions", () => {
    expect(WIRE_DESC["/properties/clarification"]).not.toMatch(/creative question/i);
    expect(WIRE_DESC["/properties/clarification"]).toMatch(/zero is the/i);
  });

  it("names both routes on the questions array, and states exclusivity", () => {
    const d = WIRE_DESC["/properties/clarification/properties/questions"];
    expect(d).toContain("creative");
    expect(d).toContain("boundary");
    expect(d).toMatch(/exactly one boundary question/i);
  });

  it("gives the question field per-route guidance and keeps the logistics ban", () => {
    const d = WIRE_DESC[`${Q}/question`];
    expect(d).not.toMatch(/about taste only/i);
    expect(d).toContain("legitimately affirm as settled");
    expect(d).toMatch(/never logistics/i);
    expect(d).toMatch(/low-level design choice/i);
  });

  it("gives whyItMatters per-route guidance", () => {
    const d = WIRE_DESC[`${Q}/whyItMatters`];
    expect(d).toContain("creative");
    expect(d).toContain("boundary");
    expect(d).not.toMatch(/^How the answers would diverge creatively/);
  });

  it("makes the options and isDefer descriptions route-aware", () => {
    expect(WIRE_DESC[`${Q}/options`]).toMatch(/boundary question/i);
    expect(WIRE_DESC[`${Q}/options/items/properties/isDefer`]).toMatch(/creative question/i);
    expect(WIRE_DESC[`${Q}/options/items/properties/isDefer`]).toMatch(/boundary question/i);
  });

  it("leaves no unconditional every-question-offers-defer wording anywhere model-visible", () => {
    for (const d of Object.values(WIRE_DESC)) {
      expect(d).not.toMatch(/every question must offer/i);
      expect(d).not.toMatch(/exactly one must have isDefer/i);
    }
    expect(PROMPT).not.toMatch(/Every question must offer a genuine/);
    expect(PROMPT).toContain("Every **creative** question must offer a genuine");
  });

  it("updates the prompt's own definition, opening and final self-check", () => {
    expect(PROMPT).toContain(
      "| `clarification` | whether a question must be put to the host before designing",
    );
    expect(PROMPT).toContain("There are two, and only two, reasons to ask.");
    expect(PROMPT).toContain("every question declares its `kind`");
    expect(PROMPT).not.toMatch(
      /every question you are asking would change the creative identity, and offers a defer option/,
    );
  });
});

/* ------------------------------------------------------------------ blocking and lifecycle */

describe("blocking is Route B's alone, and its identity is provisional", () => {
  it("qualifies the never-gates rule to Route A in both canonical places", () => {
    const acceptance = SPEC.split("\n").filter((l) => l.includes("never gates concepts"));
    expect(acceptance).toHaveLength(1);
    for (const line of acceptance) expect(line).toMatch(/Route A/);
    // Guarded on count too: deleting the phrase outright would otherwise pass an empty loop.
    const guardrail = SPEC.split("\n").filter((l) => l.includes("never a gate on concepts"));
    expect(guardrail).toHaveLength(1);
    for (const line of guardrail) expect(line).toMatch(/Route A/);
  });

  it("leaves no unconditional defer rule anywhere in the canonical spec", () => {
    // The review found one surviving in §31 after three adjacent bullets were fixed — the exact
    // failure this remediation exists to eliminate, so `spec.md` gets its own scan.
    for (const line of SPEC.split("\n")) {
      if (!/You decide/.test(line)) continue;
      if (/every one offers|always offers|must offer/i.test(line)) {
        // The qualifier must attach to the subject. A bare /creative/i would have passed the
        // defective bullet this guard exists for — §31 lines mention "creative" routinely.
        expect(line).toMatch(/every creative|a creative question|creative clarification/i);
      }
    }
    expect(SPEC_FLAT).toContain("Every creative clarification offered");
  });

  it("scopes §7.6b's per-question test by route", () => {
    expect(SPEC_FLAT).toContain("which test depends on its route");
    expect(SPEC_FLAT).not.toContain(
      "**Every question must pass:** *would different answers produce meaningfully different creative identities?*",
    );
  });

  it("states the provisional rule in spec, contracts and the acceptance criteria", () => {
    expect(SPEC).toContain("**Provisional identity.**");
    expect(SPEC_FLAT).toContain("**must not be consumed**");
    expect(CONTRACTS).toContain("**Provisional identity.**");
    expect(SPEC).toMatch(/the identity returned beside it is provisional/i);
  });

  it("closes the downstream consumption gate at the sibling planner", () => {
    expect(SPEC).toContain("Once Event Identity is valid **and not provisional**");
    expect(SPEC).toMatch(/no `kind: "boundary"` question/);
  });

  it("records the Phase 4B obligation: answer, rerun, re-check before concepts", () => {
    expect(PLAN).toContain("Event Identity must run again");
    expect(PLAN).toMatch(/only a result carrying no boundary question/i);
    expect(PLAN).toMatch(/provisional/);
  });

  it("records clarification-answer provenance as a Phase 4B obligation", () => {
    expect(PLAN).toContain("clarification-answer input provenance");
    expect(PLAN).toMatch(/preserved separately from the original event description/i);
    expect(PLAN).toMatch(/never overloaded into `redesignFeedback`/i);
  });

  it("permits a later boundary round rather than capping the lifetime", () => {
    expect(SPEC_FLAT).toContain("a later Event Identity call may return a new boundary question");
    expect(PLAN).toMatch(/no lifetime cap/i);
  });

  it("drops the plan's old unconditional clarification summary", () => {
    expect(PLAN).not.toMatch(/taste-only, never logistics, never a gate on concepts appearing/);
  });
});

/* ------------------------------------------------------------------ facts and specificity */

describe("honoree names distinguish a name-in-use from an attached label", () => {
  const rule = `${PROMPT}\n${WIRE_DESC["/properties/suppliedFacts/properties/honoreeName"]}`;

  it("admits the personal name someone goes by", () => {
    expect(PROMPT).toContain("the name they go by");
    expect(WIRE_DESC["/properties/suppliedFacts/properties/honoreeName"]).toContain(
      "the personal name they actually go by",
    );
  });

  it("excludes a term presented as a label attached to the person", () => {
    expect(flat(rule)).toContain("*attached* to the person rather than the name they go by");
    expect(PROMPT_FLAT).toContain("something they are called besides their name");
  });

  it("refuses to let the lexical category or name-likeness decide", () => {
    expect(PROMPT).toContain("the role the host gives the term");
    expect(PROMPT_FLAT).toContain('use the word "nickname" settles nothing');
    expect(PROMPT).toContain("Do not judge by whether a word looks");
    expect(WIRE_DESC["/properties/suppliedFacts/properties/honoreeName"]).toMatch(
      /lexical category of the term decides nothing/,
    );
  });

  it("keeps the relationship rule", () => {
    expect(PROMPT).toContain("A relationship is not a name");
  });
});

describe("the specificity rule demands material, never restraint", () => {
  // From §9.1 to the end of the file: deliberately wider than the new rule, so restraint
  // vocabulary cannot be smuggled into the closing self-check either.
  const section = PROMPT.slice(PROMPT.indexOf("### 9.1"));

  it("states the rule", () => {
    expect(section).toContain("Do not claim personal specificity you do not possess");
    expect(section).toContain("Being recognised by particular people is different");
  });

  it("routes a genuine ambiguity to Route A rather than inventing a culture trigger", () => {
    expect(section).toContain("ask a creative question");
    expect(section).not.toMatch(/culture|cultural/i);
  });

  it("carries no restraint vocabulary", () => {
    // The v4 gains depend on the opposite instinct; this rule must never read as "do less".
    for (const word of [
      "subtle",
      "subtlety",
      "minimal",
      "restrained",
      "understated",
      "tasteful",
      "tone down",
      "keep it simple",
    ]) {
      expect(section.toLowerCase()).not.toContain(word);
    }
  });

  it("leaves the v4 execution doctrine untouched", () => {
    expect(PROMPT).toContain("Sophistication is a property of execution");
    expect(PROMPT).toContain("A literal pear, a bicycle, a swallow");
    expect(PROMPT).toContain("Affection, sentiment, playfulness, exuberance and ornament");
  });
});

/* ------------------------------------------------------------------ versioning */

describe("the version says the model is seeing different text", () => {
  it("declares the same version in the prompt the model actually reads", () => {
    // The whole file is the system prompt, so a stale header tells the model it is running a
    // version that no longer exists — and the evidence would cite one artifact for another.
    expect(PROMPT.split("\n")[1]).toContain(`\`${EVENT_IDENTITY_PROMPT_VERSION}\``);
  });

  it("preserves the superseded prompt and schema that produced the sealed evidence", () => {
    // `run.json` for the spent sealed challenge cites v4 on every case; that artifact must
    // remain readable (`CLAUDE.md §12`).
    expect(() => read("docs/model-prompts/history/event-identity.system.v4.md")).not.toThrow();
    expect(() =>
      read("docs/model-schemas/history/event-identity-result.schema.v4.json"),
    ).not.toThrow();
    expect(read("docs/model-prompts/history/event-identity.system.v4.md")).toContain(
      "`event_identity_v4`",
    );
  });

  it("records that both sealed corpora are spent, in every place that claims otherwise", () => {
    expect(flat(CONTRACTS)).toContain("Never generalization evidence again");
    expect(flat(PLAN)).toContain("new independently authored sealed corpus");
    // Several independent sites assert it — the evidence-class paragraph and the 4A status block
    // in each document — and a guard that accepted any one alone would survive deleting the rest.
    expect(flat(PLAN)).toContain("**`sealed_challenge_v1` is spent.**");
    expect(flat(PLAN)).toContain("`sealed_challenge_v1` was already spent at `v4`");
    // `v2` spent itself by being run. Canon must not leave it looking available.
    expect(flat(PLAN)).toContain("`sealed_challenge_v2` is spent by the run that carried the GO");
    expect(flat(CONTRACTS)).toContain("A new corpus and a new slot must be authored");
    expect(flat(CONTRACTS)).not.toContain("not yet authored");
  });

  it("bumps both prompt and schema versions together", () => {
    expect(EVENT_IDENTITY_PROMPT_VERSION).toBe("event_identity_v5");
    expect(EVENT_IDENTITY_SCHEMA_VERSION).toBe("event_identity_schema_v5");
  });

  it("adds kind to the wire schema and nothing else structural", () => {
    // Structure only: descriptions are stripped, so a wording change cannot mask a shape change.
    const strip = (node: unknown): unknown => {
      if (Array.isArray(node)) return node.map(strip);
      if (!node || typeof node !== "object") return node;
      const out: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(node as Record<string, unknown>)) {
        if (k !== "description") out[k] = strip(v);
      }
      return out;
    };
    const items = strip(WIRE.properties.clarification.properties.questions.items) as {
      properties: Record<string, unknown>;
      required: string[];
    };
    expect(Object.keys(items.properties).sort()).toEqual([
      "kind",
      "options",
      "question",
      "whyItMatters",
    ]);
    expect([...items.required].sort()).toEqual(["kind", "options", "question", "whyItMatters"]);
    // The wire schema carries no length keywords at all — counts are runtime-only, which is
    // why the descriptions have to state them.
    expect(JSON.stringify(WIRE)).not.toMatch(/maxItems|minItems|maxLength|minLength/);
  });
});

/* ------------------------------------------------------------------ doctrine */

describe("product doctrine describes v5, not v4", () => {
  it("no longer says all clarification is taste-only", () => {
    // Doctrine is read first by every agent, so a stale §6 tells the next one the opposite of
    // the shipped contract.
    expect(DOCTRINE_FLAT).not.toContain("actually present in this prompt, about taste only");
    expect(DOCTRINE).toContain("## 6. Adaptive clarification");
    expect(DOCTRINE).toContain("### Creative clarification");
    expect(DOCTRINE).toContain("### Boundary clarification");
  });

  it("scopes the defer promise to creative questions", () => {
    expect(DOCTRINE_FLAT).not.toMatch(/Every such question always offers/);
    expect(DOCTRINE_FLAT).toContain("Every **creative** question always offers");
    expect(DOCTRINE_FLAT).toContain('It offers **no** "You decide"');
  });

  it("says a boundary question may hold concepts, and that its identity is provisional", () => {
    expect(DOCTRINE_FLAT).toContain("It is the one thing that may hold concepts");
    expect(DOCTRINE_FLAT).toMatch(/identity returned beside it is \*provisional\*/);
    expect(DOCTRINE_FLAT).toContain("`EventIdentity` runs again");
  });

  it("keeps the durable principle and the logistics and design-decision bans", () => {
    expect(DOCTRINE).toContain("Understand aggressively. Infer creatively. Ask selectively.");
    expect(DOCTRINE).toContain("**Logistics — never a gate on design.**");
    expect(DOCTRINE).toContain("AI should remove decisions, not create more decisions.");
    expect(DOCTRINE_FLAT).toContain("never a way to ask for a fact or a design decision");
  });

  it("records the v5 resolution in the §14 conflict register as an audit trail", () => {
    expect(DOCTRINE_FLAT).toContain("Resolved by decision, then expanded by a second");
    expect(DOCTRINE_FLAT).toContain("*Original (v4):*");
    expect(DOCTRINE_FLAT).toContain("*Expanded (v5, approved after the first sealed challenge):*");
    expect(DOCTRINE_FLAT).toContain(
      'So "bounded to taste" and "never a gate" now describe Route A',
    );
  });

  it("leaves the plan's deviation resolved rather than masquerading as open", () => {
    expect(flat(PLAN)).not.toContain("pending doctrine approval");
    expect(flat(PLAN)).toContain("was reconciled to `v5`, by explicit approval");
    expect(flat(PLAN)).toContain("Resolved, not open.");
  });
});
