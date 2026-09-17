/**
 * The authority boundary, asserted rather than described.
 *
 * Two properties matter more than the rest, and both are about what happens when this code is
 * *wrong* rather than when it is right:
 *
 * - it must **fail closed** — an unreadable shape never reads as authoritative;
 * - a provisional brief must be **unable to reach** a downstream signature, which is a type-level
 *   claim and is therefore asserted with `@ts-expect-error` rather than at runtime. Those
 *   assertions are checked by `npm run typecheck`: if the brand ever became satisfiable by an
 *   ordinary object, tsc would report the unused directive and the build would fail.
 *
 * The real `v5` provider outputs are used as fixtures because they are free, already frozen, and
 * contain the two boundary questions ever produced (`SC-06`, `SC2-12`). They are read-only here.
 *
 * Acceptance criteria: `spec.md §31 — Event Identity and diversity`; `§7.6b`, `§7.7`.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { EVENT_IDENTITY_SCHEMA_VERSION } from "@/lib/ai/versions";

import {
  assertAuthoritative,
  identityQuestions,
  isProvisional,
  ProvisionalIdentityError,
  SUPPORTED_IDENTITY_SCHEMA_VERSIONS,
  UnreadableIdentityError,
  type AuthoritativeIdentity,
} from "./lifecycle";

const ROOT = new URL("../../../../", import.meta.url).pathname;
const V5 = EVENT_IDENTITY_SCHEMA_VERSION;

const brief = { copyTone: "warm" };
const creative = (n: number) =>
  Array.from({ length: n }, (_, i) => ({ kind: "creative", question: `q${i}` }));
const boundary = [{ kind: "boundary", question: "whose call is this?" }];
const result = (questions: unknown[]) => ({
  identity: brief,
  suppliedFacts: {},
  clarification: { needed: questions.length > 0, questions },
});

/* ------------------------------------------------------------------ the rule itself */

describe("a boundary question, and only a boundary question, makes a result provisional", () => {
  it("treats zero questions as authoritative", () => {
    expect(isProvisional(result([]), V5)).toBe(false);
  });

  it.each([1, 2, 3])("treats %i creative question(s) as authoritative", (n) => {
    expect(isProvisional(result(creative(n)), V5)).toBe(false);
  });

  it("treats a boundary question as provisional", () => {
    expect(isProvisional(result(boundary), V5)).toBe(true);
  });

  it("does not re-check the per-response rules the contract owns", () => {
    // A response that breaks exclusivity is invalid, and `clarificationDecisionSchema` is what
    // rejects it. If this function also judged it, an invalid response could read authoritative
    // here while failing there — two answers to one question.
    expect(isProvisional(result([...creative(1), ...boundary]), V5)).toBe(true);
  });

  it("ignores any other field, including one that looks like a marker", () => {
    const withDecoy = { ...result([]), isProvisional: true, provisional: true };
    expect(isProvisional(withDecoy, V5)).toBe(false);
  });
});

/* ------------------------------------------------------------------ failing closed */

describe("an unreadable shape is refused, never answered", () => {
  it("refuses a schema version it has no reader for", () => {
    const thrown = () => isProvisional(result([]), "event_identity_schema_v6");
    expect(thrown).toThrow(UnreadableIdentityError);
    expect(thrown).toThrow(/unsupported_schema_version/);
  });

  it.each([
    ["a brief with no envelope around it", brief],
    ["a missing clarification", { identity: brief, suppliedFacts: {} }],
    ["questions as an object", { clarification: { questions: {} } }],
    ["questions as a string", { clarification: { questions: "none" } }],
    ["questions null", { clarification: { questions: null } }],
    ["null", null],
    ["undefined", undefined],
    ["a string", "not a result"],
    // The array is well-formed; its *elements* are not. Every one of these used to answer
    // `false` — "not provisional" about a question this reader cannot read — which is the
    // fail-open the rule exists to prevent. Each shape is one plausible way a buggy writer,
    // a hand-written backfill or a restore under a laxer path produces a boundary question
    // the authority rule would miss.
    ["a question that is json null", { clarification: { questions: [null] } }],
    ["a question that is a bare string", { clarification: { questions: ["boundary"] } }],
    ["a question that is a number", { clarification: { questions: [1] } }],
    ["a question that is an array", { clarification: { questions: [["boundary"]] } }],
    ["a capitalised kind key", { clarification: { questions: [{ Kind: "boundary" }] } }],
    ["a capitalised kind value", { clarification: { questions: [{ kind: "Boundary" }] } }],
    ["kind spelled type", { clarification: { questions: [{ type: "boundary" }] } }],
    ["a question with no kind", { clarification: { questions: [{ question: "x" }] } }],
    ["a question whose kind is null", { clarification: { questions: [{ kind: null }] } }],
    [
      "a readable question beside an unreadable one",
      { clarification: { questions: [{ kind: "creative" }, { kind: "made-up" }] } },
    ],
  ])("refuses %s rather than reading it as authoritative", (_label, value) => {
    const thrown = () => isProvisional(value, V5);
    expect(thrown).toThrow(UnreadableIdentityError);
    // The failure that matters: it must not quietly answer `false`.
    expect(() => expect(isProvisional(value, V5)).toBe(false)).toThrow();
  });

  it("names the supported versions in one place, matching the production constant", () => {
    expect([...SUPPORTED_IDENTITY_SCHEMA_VERSIONS]).toEqual([EVENT_IDENTITY_SCHEMA_VERSION]);
  });
});

/* ------------------------------------------------------------------ the branded handoff */

describe("assertAuthoritative hands downstream the brief, or nothing", () => {
  it("returns the identity sibling, not the envelope", () => {
    const authoritative = assertAuthoritative(result([]), V5);
    expect(authoritative).toEqual(brief);
    expect(authoritative).not.toHaveProperty("suppliedFacts");
    expect(authoritative).not.toHaveProperty("clarification");
  });

  it("refuses a provisional result", () => {
    expect(() => assertAuthoritative(result(boundary), V5)).toThrow(ProvisionalIdentityError);
  });

  it("refuses an unreadable result", () => {
    expect(() => assertAuthoritative({ clarification: {} }, V5)).toThrow(UnreadableIdentityError);
  });

  it("refuses a result whose identity sibling is missing", () => {
    expect(() => assertAuthoritative(result([]), V5)).not.toThrow();
    expect(() => assertAuthoritative({ clarification: { questions: [] } }, V5)).toThrow(
      UnreadableIdentityError,
    );
  });
});

describe("the brand cannot be satisfied except by assertAuthoritative", () => {
  // A stand-in for the signatures the planner and the DesignIntent call will carry.
  const downstream = (_identity: AuthoritativeIdentity) => true;

  it("accepts what assertAuthoritative returns", () => {
    expect(downstream(assertAuthoritative(result([]), V5))).toBe(true);
  });

  it("rejects everything else at compile time", () => {
    // Each of these is a type error. `npm run typecheck` fails if any stops being one, because
    // an unused `@ts-expect-error` is itself an error — so this guard cannot rot into a no-op.
    // @ts-expect-error a bare object is not an authoritative identity
    expect(() => downstream(brief)).not.toThrow();
    // @ts-expect-error the envelope is not the brief
    expect(() => downstream(result([]))).not.toThrow();
    // @ts-expect-error the brief off a provisional result carries no brand
    expect(() => downstream(result(boundary).identity)).not.toThrow();
    // @ts-expect-error null is not an identity
    expect(() => downstream(null)).not.toThrow();
  });
});

/* ------------------------------------------------------------------ the real outputs */

const JOURNALS = [
  "creative-understanding-v1-regression",
  "creative-understanding-sealed-challenge-v1-v5-regression",
  "creative-understanding-holdout-v1",
  "creative-understanding-sealed-challenge-v2",
];

interface JournalEntry {
  caseId: string;
  status: string;
  payload: { output?: unknown; telemetry: { schemaVersion: string } };
}

function journalEntries(): { dir: string; entry: JournalEntry }[] {
  return JOURNALS.flatMap((dir) =>
    readFileSync(`${ROOT}docs/model-evals/results/${dir}/raw-responses.jsonl`, "utf8")
      .split("\n")
      .filter((line) => line.trim().length > 0)
      .map((line) => ({ dir, entry: JSON.parse(line) as JournalEntry })),
  );
}

describe("every v5 response we have ever paid for classifies, and classifies correctly", () => {
  const entries = journalEntries();

  it("reads all 50 of them", () => {
    expect(entries).toHaveLength(50);
    expect(entries.every((e) => e.entry.status === "response")).toBe(true);
    expect([...new Set(entries.map((e) => e.entry.payload.telemetry.schemaVersion))]).toEqual([V5]);
  });

  it("finds exactly the two boundary questions the evidence recorded", () => {
    const provisional = entries
      .filter(({ entry }) =>
        isProvisional(entry.payload.output, entry.payload.telemetry.schemaVersion),
      )
      .map(({ entry }) => entry.caseId)
      .sort();
    expect(provisional).toEqual(["SC-06", "SC2-12"]);
  });

  it("hands every authoritative one a brief, and refuses the two", () => {
    for (const { entry } of entries) {
      const version = entry.payload.telemetry.schemaVersion;
      if (isProvisional(entry.payload.output, version)) {
        expect(() => assertAuthoritative(entry.payload.output, version)).toThrow(
          ProvisionalIdentityError,
        );
      } else {
        expect(assertAuthoritative(entry.payload.output, version)).toBeTypeOf("object");
      }
    }
  });

  it("reads a questions array out of every one, without throwing", () => {
    for (const { entry } of entries) {
      expect(
        Array.isArray(
          identityQuestions(entry.payload.output, entry.payload.telemetry.schemaVersion),
        ),
      ).toBe(true);
    }
  });
});
