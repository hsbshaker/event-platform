/**
 * No evaluation case may appear in the production prompt.
 *
 * This exists because leakage has now been introduced **four separate times**, twice while
 * actively removing a previous leak, and three of the four were caught by an independent
 * reviewer rather than by the author. The fourth — HO-11's prompt *and* its gating answer,
 * written into the worked example for the honoree rule — reached the wire schema, so the model
 * would have been shown the answer twice to the only mechanical assertion of that field's
 * central behaviour.
 *
 * It also exists because `process-notes.md` claimed a scan like this was already running when
 * no such file was in the tree. A control asserted in immutable evidence and absent from the
 * repository is worse than no control, because it stops anyone looking.
 *
 * **Necessary and not sufficient.** This catches literal reuse. It cannot catch a
 * near-paraphrase, and it cannot catch a case-specific instruction dressed as a general
 * principle — both of which have also occurred. The independent engineering review reads the
 * prompt for those, and that requirement is recorded in `docs/model-contracts.md §4.5`.
 *
 * Acceptance criteria: N/A — benchmark integrity. `docs/model-contracts.md §4.5`.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const ROOT = new URL("../../../../", import.meta.url).pathname;

const PROMPT = readFileSync(`${ROOT}docs/model-prompts/event-identity.system.md`, "utf8");
/** The wire schema carries every `.describe()` string to the model, so it leaks too. */
const WIRE = readFileSync(
  `${ROOT}docs/model-schemas/event-identity-result.wire.schema.json`,
  "utf8",
);
const SURFACES = { prompt: PROMPT, "wire schema": WIRE };

interface EvalCase {
  id: string;
  prompt: string;
  mustAvoid?: string[];
  mustNotBeClaimedAsHostConstraint?: string[];
  hostPhrases?: { phrase: string }[];
  expectedFacts?: Record<string, string | null>;
  facts?: Record<string, string>;
  notes?: string;
  rationale?: string;
}

const CORPORA = ["creative-understanding.json", "creative-understanding-holdout.json"].map(
  (file) => ({
    file,
    cases: (
      JSON.parse(readFileSync(`${ROOT}docs/model-evals/${file}`, "utf8")) as { cases: EvalCase[] }
    ).cases,
  }),
);

const fold = (v: string) => v.normalize("NFC").replace(/\s+/g, " ").trim().toLowerCase();

/** Content spans of a case prompt, long enough that a shared span is reuse rather than English. */
function spans(prompt: string, size = 3): string[] {
  const words = fold(prompt)
    .replace(/[.,—–;:!?]/g, " ")
    .split(/\s+/)
    .filter(Boolean);
  const out: string[] = [];
  for (let i = 0; i + size <= words.length; i += 1) {
    const span = words.slice(i, i + size).join(" ");
    if (span.length >= 14) out.push(span);
  }
  return out;
}

describe.each(Object.entries(SURFACES))("%s is clean of both corpora", (_name, surfaceRaw) => {
  const surface = fold(surfaceRaw);

  for (const { file, cases } of CORPORA) {
    describe(file, () => {
      it("contains no case prompt", () => {
        const leaked = cases.filter((c) => surface.includes(fold(c.prompt))).map((c) => c.id);
        expect(leaked).toEqual([]);
      });

      it("contains no distinctive span of a case prompt", () => {
        const leaked = cases.flatMap((c) =>
          spans(c.prompt)
            .filter((s) => surface.includes(s))
            .map((s) => `${c.id}: "${s}"`),
        );
        expect(leaked).toEqual([]);
      });

      it("contains no expected answer, probe, host phrase or case note", () => {
        const leaked = cases.flatMap((c) => {
          const claims = [
            ...(c.mustAvoid ?? []),
            ...(c.mustNotBeClaimedAsHostConstraint ?? []),
            ...(c.hostPhrases ?? []).map((p) => p.phrase),
            // The gating answers themselves: showing the model these is the worst form.
            ...Object.values(c.expectedFacts ?? {}).filter(
              (v): v is string => typeof v === "string",
            ),
            ...Object.values(c.facts ?? {}),
            c.notes ?? "",
            c.rationale ?? "",
          ].filter((v) => v.length >= 6);
          return claims.filter((v) => surface.includes(fold(v))).map((v) => `${c.id}: "${v}"`);
        });
        expect(leaked).toEqual([]);
      });
    });
  }
});
