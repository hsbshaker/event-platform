import { describe, expect, it } from "vitest";

import { previewableConcepts, generationInFlight } from "./generation-view";
import {
  projectGenerationView,
  STALE_BATCH_AFTER_MS,
  type ArtifactRow,
  type ConceptRow,
  type GenerationStateRows,
  type SiblingRow,
  type SlotRow,
  type SpecRow,
} from "./generation-state";

/**
 * The projection, over constructed rows.
 *
 * Every case below is a statement about which rows exist, because that is the only thing the view
 * is allowed to be derived from (`spec.md §31 — Prompt, auth, and generation`: "The generation
 * surface shows only artifacts the pipeline produced — no model reasoning, no fabricated progress
 * or completion percentages"). Pure, so the stage rules can be proven without a database; the DB
 * suite proves the same rules against real rows and real triggers.
 */

const PALETTE = {
  // Deliberately in the order Postgres would hand back from `jsonb` — keys sorted by length, then
  // bytes — rather than the order the compiler emitted. The projection must not depend on it.
  text: "#1B1B1B",
  focus: "#7A5C2E",
  error: "#8C1F1F",
  accent: "#7A5C2E",
  border: "#D8CEBC",
  button: "#2F4230",
  errorText: "#FFFFFF",
  textMuted: "#5A5A52",
  accentText: "#FFFFFF",
  buttonText: "#FFFFFF",
  surfaceAlt: "#EFE8DA",
  surfaceBase: "#FAF6EC",
  textOnAccent: "#FFFFFF",
  surfaceAccent: "#7A5C2E",
  textOnContrast: "#F3EDE0",
  surfaceContrast: "#22301F",
};

const SPEC_JSON = {
  version: "resolved_v2",
  state: "verified",
  tokens: { palette: PALETTE, typography: {}, spacing: {} },
};

const DESIGN_INTENT = {
  family: "editorial",
  tonalDirection: "light",
  palette: ["#0A0A0A", "#FFFFFF", "#7A5C2E"],
  typographyPairing: "playfair_source",
  density: "balanced",
  composition: { asymmetry: "gentle", hierarchy: "monumental", ornament: "restrained" },
  motifs: ["botanical_sprig", "hairline_rule"],
};

const PRESENTATION = { name: "Orchard Supper", description: "A long table under strung lights." };

const sibling = (conceptIndex: number, status: SiblingRow["status"]): SiblingRow => ({
  conceptIndex,
  status,
});

const artifact = (conceptIndex: number, over: Partial<ArtifactRow> = {}): ArtifactRow => ({
  conceptIndex,
  presentation: PRESENTATION,
  designIntent: DESIGN_INTENT,
  ...over,
});

const concept = (conceptIndex: number, over: Partial<ConceptRow> = {}): ConceptRow => ({
  conceptIndex,
  conceptId: `concept-${conceptIndex}`,
  activeSpecId: `spec-${conceptIndex}`,
  ...over,
});

const spec = (conceptIndex: number, over: Partial<SpecRow> = {}): SpecRow => ({
  id: `spec-${conceptIndex}`,
  conceptId: `concept-${conceptIndex}`,
  revision: 1,
  verifiedClean: true,
  spec: SPEC_JSON,
  ...over,
});

const slot = (conceptIndex: number, status: SlotRow["status"]): SlotRow => ({
  resolvedSpecId: `spec-${conceptIndex}`,
  status,
});

function rows(over: Partial<GenerationStateRows> = {}): GenerationStateRows {
  return {
    vibe: ["heritage", "heirloom", "polished"],
    hasAuthoritativeIdentity: true,
    batch: null,
    siblings: [],
    artifacts: [],
    concepts: [],
    specs: [],
    slots: [],
    ...over,
  };
}

describe("the generation projection", () => {
  it("reports not_started, and offers the action, when an identity exists and no batch does", () => {
    const view = projectGenerationView(rows());

    expect(view).toEqual({
      stage: "not_started",
      vibe: ["heritage", "heirloom", "polished"],
      concepts: [],
      canStart: true,
    });
    expect(generationInFlight(view)).toBe(false);
  });

  it("withholds the action, and the vibe, when there is no authoritative identity", () => {
    // Not a refusal to render: `startConceptGeneration` would decline, so offering the action
    // would be offering a refusal. The vibe is the identity's output and there is no identity.
    const view = projectGenerationView(rows({ vibe: null, hasAuthoritativeIdentity: false }));

    expect(view.canStart).toBe(false);
    expect(view.vibe).toBeUndefined();
    expect(view.stage).toBe("not_started");
  });

  it("reports exploring while the one premise call runs, with nothing per-concept to show", () => {
    const view = projectGenerationView(
      rows({
        batch: { round: 1, status: "running" },
        siblings: [sibling(0, "pending"), sibling(1, "pending"), sibling(2, "pending")],
      }),
    );

    expect(view.stage).toBe("exploring");
    expect(generationInFlight(view)).toBe(true);
    expect(view.canStart).toBe(false);
    expect(view.concepts).toEqual([
      { index: 0, stage: "planned", previewable: false, settled: false },
      { index: 1, stage: "planned", previewable: false, settled: false },
      { index: 2, stage: "planned", previewable: false, settled: false },
    ]);
    // Nothing invented for a concept that has produced nothing: no name, no palette, no counter.
    for (const entry of view.concepts)
      expect(Object.keys(entry).sort()).toEqual(["index", "previewable", "settled", "stage"]);
  });

  it("walks one concept through designing and composing while its siblings wait", () => {
    const view = projectGenerationView(
      rows({
        batch: { round: 1, status: "running" },
        siblings: [sibling(0, "pending"), sibling(1, "pending"), sibling(2, "pending")],
        artifacts: [artifact(0), artifact(1)],
        concepts: [concept(0, { activeSpecId: null })],
      }),
    );

    expect(view.stage).toBe("designing");
    expect(view.concepts.map((c) => c.stage)).toEqual(["composing", "designing", "planned"]);
    // A name exists as soon as the artifact carrying it does, and not before.
    expect(view.concepts[0].name).toBe("Orchard Supper");
    expect(view.concepts[2].name).toBeUndefined();
    // The creative world is the DesignIntent's, and arrives with it — before any spec.
    expect(view.concepts[1].vocabulary).toEqual(["botanical_sprig", "hairline_rule"]);
    expect(view.concepts[1].typography).toBe("playfair_source");
    expect(view.concepts[1].palette).toBeUndefined();
  });

  it("makes one concept previewable while two siblings are still running", () => {
    // `spec.md §31`: "Each concept becomes available as soon as its resolved spec exists; no
    // concept waits on its siblings (§7.10)."
    const view = projectGenerationView(
      rows({
        batch: { round: 1, status: "running" },
        siblings: [sibling(0, "succeeded"), sibling(1, "pending"), sibling(2, "pending")],
        artifacts: [artifact(0), artifact(1), artifact(2)],
        concepts: [concept(0)],
        specs: [spec(0)],
      }),
    );

    expect(view.stage).toBe("designing");
    expect(view.concepts.map((c) => c.previewable)).toEqual([true, false, false]);
    expect(previewableConcepts(view).map((c) => c.index)).toEqual([0]);
    // Ready and settled, with its siblings still in flight: nothing further is coming for it.
    expect(view.concepts[0]).toMatchObject({ stage: "ready", settled: true });
    expect(view.concepts[1].settled).toBe(false);
  });

  it("flattens the compiled semantic palette in a stable order, deduped", () => {
    const view = projectGenerationView(
      rows({
        batch: { round: 1, status: "completed" },
        siblings: [sibling(0, "succeeded")],
        artifacts: [artifact(0)],
        concepts: [concept(0)],
        specs: [spec(0)],
      }),
    );

    // Surfaces first, then ink, then the interactive and state roles — the compiler's own order,
    // not `jsonb`'s key order, and each hex once however many roles resolved to it.
    expect(view.concepts[0].palette).toEqual([
      "#FAF6EC",
      "#EFE8DA",
      "#7A5C2E",
      "#22301F",
      "#1B1B1B",
      "#5A5A52",
      "#F3EDE0",
      "#FFFFFF",
      "#2F4230",
      "#D8CEBC",
      "#8C1F1F",
    ]);
  });

  it("never reads the raw creative palette, and never leaks the DesignIntent itself", () => {
    const view = projectGenerationView(
      rows({
        batch: { round: 1, status: "completed" },
        siblings: [sibling(0, "succeeded")],
        artifacts: [artifact(0)],
        concepts: [concept(0)],
        specs: [spec(0)],
      }),
    );

    // `spec.md §32 #26`: raw creative colours are never semantic roles, so showing them as "the
    // palette" would advertise colours the page does not contain.
    expect(view.concepts[0].palette).not.toContain("#0A0A0A");
    const payload = JSON.stringify(view);
    for (const forbidden of ["family", "editorial", "tonalDirection", "asymmetry", "resolved_v2"]) {
      expect(payload).not.toContain(forbidden);
    }
  });

  it("reports partial when one sibling failed and two are ready", () => {
    const view = projectGenerationView(
      rows({
        batch: { round: 1, status: "completed" },
        siblings: [sibling(0, "succeeded"), sibling(1, "failed"), sibling(2, "succeeded")],
        artifacts: [artifact(0), artifact(2)],
        concepts: [concept(0), concept(2)],
        specs: [spec(0), spec(2)],
      }),
    );

    expect(view.stage).toBe("partial");
    expect(view.concepts.map((c) => c.stage)).toEqual(["ready", "failed", "ready"]);
    expect(previewableConcepts(view).map((c) => c.index)).toEqual([0, 2]);
    // A failed sibling is settled: nothing further is coming for it, and it says so.
    expect(view.concepts[1].settled).toBe(true);
    expect(view.canStart).toBe(true);
    expect(generationInFlight(view)).toBe(false);
  });

  it("reports ready when every sibling produced a verified spec", () => {
    const view = projectGenerationView(
      rows({
        batch: { round: 1, status: "completed" },
        siblings: [sibling(0, "succeeded"), sibling(1, "succeeded"), sibling(2, "succeeded")],
        artifacts: [artifact(0), artifact(1), artifact(2)],
        concepts: [concept(0), concept(1), concept(2)],
        specs: [spec(0), spec(1), spec(2)],
      }),
    );

    expect(view.stage).toBe("ready");
    expect(view.concepts.every((c) => c.previewable && c.settled)).toBe(true);
  });

  it("reports failed when a settled batch produced nothing", () => {
    const view = projectGenerationView(
      rows({
        batch: { round: 1, status: "failed" },
        siblings: [sibling(0, "failed"), sibling(1, "failed"), sibling(2, "failed")],
      }),
    );

    expect(view.stage).toBe("failed");
    expect(previewableConcepts(view)).toEqual([]);
    expect(view.canStart).toBe(true);
  });

  it("fails a concept a settled batch left mid-flight rather than reporting it for ever", () => {
    // What a recovered crash looks like: the sibling row was failed by the recovery RPC and the
    // batch settled, but the artifact it had already written is still there. Reporting `designing`
    // would be fabricated progress on work that stopped.
    const view = projectGenerationView(
      rows({
        batch: { round: 1, status: "failed" },
        siblings: [sibling(0, "failed"), sibling(1, "failed"), sibling(2, "failed")],
        artifacts: [artifact(0)],
        concepts: [concept(1, { activeSpecId: null })],
      }),
    );

    expect(view.concepts.map((c) => c.stage)).toEqual(["failed", "failed", "failed"]);
    expect(view.concepts.every((c) => c.settled)).toBe(true);
  });

  it("ignores a spec that is not verified clean", () => {
    // `spec.md §32 #24`. A concept row with no verified spec behind it is not previewable, whatever
    // its sibling says.
    const view = projectGenerationView(
      rows({
        batch: { round: 1, status: "running" },
        siblings: [sibling(0, "pending")],
        artifacts: [artifact(0)],
        concepts: [concept(0)],
        specs: [spec(0, { verifiedClean: false })],
      }),
    );

    expect(view.concepts[0]).toMatchObject({ stage: "composing", previewable: false });
    expect(view.concepts[0].palette).toBeUndefined();
  });

  it("falls back to the highest verified revision when the active pointer has not landed", () => {
    const view = projectGenerationView(
      rows({
        batch: { round: 1, status: "completed" },
        siblings: [sibling(0, "succeeded")],
        artifacts: [artifact(0)],
        concepts: [concept(0, { activeSpecId: null })],
        specs: [
          spec(0, { id: "spec-0-r1", revision: 1, spec: { tokens: { palette: {} } } }),
          spec(0, { id: "spec-0-r2", revision: 2 }),
        ],
      }),
    );

    expect(view.concepts[0].previewable).toBe(true);
    expect(view.concepts[0].palette?.[0]).toBe("#FAF6EC");
  });
});

describe("artwork, as counts of rows", () => {
  const ready = (slots: readonly SlotRow[]): GenerationStateRows =>
    rows({
      batch: { round: 1, status: "completed" },
      siblings: [sibling(0, "succeeded")],
      artifacts: [artifact(0)],
      concepts: [concept(0)],
      specs: [spec(0)],
      slots,
    });

  it("omits the field entirely when the spec reserved no slot", () => {
    const view = projectGenerationView(ready([]));
    expect(view.concepts[0].artwork).toBeUndefined();
    expect(view.concepts[0].settled).toBe(true);
  });

  it("holds a concept unsettled while its own artwork is genuinely in flight", () => {
    // `runArtworkStage` is awaited *before* `settleSibling`, so artwork that is really being made
    // always sits beneath a sibling that has not settled. That is what unsettled means.
    const view = projectGenerationView(
      rows({
        batch: { round: 1, status: "running" },
        siblings: [sibling(0, "running")],
        artifacts: [artifact(0)],
        concepts: [concept(0)],
        specs: [spec(0)],
        slots: [slot(0, "reserved"), slot(0, "requested")],
      }),
    );

    expect(view.concepts[0].artwork).toEqual({ pending: 2, delivered: 0, failed: 0 });
    // Previewable regardless: the spec was verified and frozen before any image existed
    // (`spec.md §7.6a #1`), so a concept never waits on its artwork to be shown.
    expect(view.concepts[0].previewable).toBe(true);
    expect(view.concepts[0].settled).toBe(false);
  });

  it("settles a concept whose reservations were never acted on", () => {
    // The ordinary shape of every batch that runs with no artwork provider: the compiler reserves
    // a slot for any direction whose ornament admits one, nothing requests it, and the sibling
    // settles anyway. Reading those rows as pending made the surface say *Artwork is still being
    // made for this one* for ever, about work that had already stopped — which is the fabricated
    // progress `spec.md §31` forbids.
    const view = projectGenerationView(ready([slot(0, "reserved"), slot(0, "reserved")]));

    expect(view.concepts[0].settled).toBe(true);
    // The counts stay raw row facts. They are not massaged to agree with `settled`; the rows do
    // say two slots were reserved and never filled, and that is worth being able to read.
    expect(view.concepts[0].artwork).toEqual({ pending: 2, delivered: 0, failed: 0 });
  });

  it("settles once every slot has delivered or failed", () => {
    const view = projectGenerationView(ready([slot(0, "delivered"), slot(0, "failed")]));

    expect(view.concepts[0].artwork).toEqual({ pending: 0, delivered: 1, failed: 1 });
    expect(view.concepts[0].settled).toBe(true);
    // A failed slot is not an error to show: the page is finished either way.
    expect(view.concepts[0].previewable).toBe(true);
  });

  it("attributes a slot to its own concept's spec and to no other", () => {
    const view = projectGenerationView(
      rows({
        batch: { round: 1, status: "completed" },
        siblings: [sibling(0, "succeeded"), sibling(1, "succeeded")],
        artifacts: [artifact(0), artifact(1)],
        concepts: [concept(0), concept(1)],
        specs: [spec(0), spec(1)],
        slots: [slot(1, "delivered")],
      }),
    );

    expect(view.concepts[0].artwork).toBeUndefined();
    expect(view.concepts[1].artwork).toEqual({ pending: 0, delivered: 1, failed: 0 });
  });
});

describe("the stale-batch bound", () => {
  it("sits far above the longest a batch process could still be alive", () => {
    // A full live batch measured ~87s wall; the platform's hardest function ceiling is 800s. A
    // bound below that could reach into a batch that is still running, which is the one failure
    // this recovery must never cause.
    expect(STALE_BATCH_AFTER_MS).toBeGreaterThan(800_000);
    // And not so long that a crashed event is unusable for an hour.
    expect(STALE_BATCH_AFTER_MS).toBeLessThanOrEqual(30 * 60_000);
    // The RPC takes whole seconds and refuses anything under a minute.
    expect(STALE_BATCH_AFTER_MS % 1000).toBe(0);
  });
});
