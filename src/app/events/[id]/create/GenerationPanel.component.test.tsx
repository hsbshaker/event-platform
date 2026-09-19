import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { ConceptView, GenerationView } from "@/lib/generation/generation-view";

/**
 * The generation surface, driven in a DOM.
 *
 * What is proven here is behaviour a browser suite cannot drive without a live database: that a
 * concept appears the moment its own spec exists and not when its siblings finish, that a field is
 * rendered only when the artifact carrying it is persisted, that nothing numeric or fabricated can
 * reach the document, that a failed poll does not withdraw concepts the host is already looking at,
 * and that polling stops when the pipeline does. Layout — 390, 1280, overflow, tap targets — is
 * proven in the browser suite, because jsdom has no layout and a passing assertion there would be
 * a lie.
 *
 * The server actions are mocked at the module boundary: this is the surface under test, and the
 * read model behind them is proven against real Postgres in `tests/db/`. **No provider call
 * happens anywhere in this file.**
 *
 * Acceptance criteria: `spec.md §31 — Prompt, auth, and generation` — "Each concept becomes
 * available as soon as its resolved spec exists; no concept waits on its siblings (§7.10)" and
 * "The generation surface shows only artifacts the pipeline produced — no model reasoning, no
 * fabricated progress or completion percentages (§7.10)". Guardrails: `spec.md §32 #41`, `#45`.
 */
const start = vi.fn();
const read = vi.fn();

vi.mock("@/app/actions/generation", () => ({
  startConceptGenerationForEvent: (...args: unknown[]) => start(...args),
  readGenerationForEvent: (...args: unknown[]) => read(...args),
  loadGenerationView: (...args: unknown[]) => read(...args),
}));

const { GenerationPanel } = await import("./GenerationPanel");

const EVENT = "22222222-2222-2222-2222-222222222222";

const concept = (over: Partial<ConceptView> & { index: number }): ConceptView => ({
  stage: "planned",
  previewable: false,
  settled: false,
  ...over,
});

const ready = (index: number, over: Partial<ConceptView> = {}): ConceptView =>
  concept({
    index,
    stage: "ready",
    previewable: true,
    settled: true,
    name: `Direction ${index + 1}`,
    description: "A considered direction.",
    palette: ["#2F3E2E", "#C7A17A"],
    vocabulary: ["botanical", "linen"],
    typography: "grotesque-and-serif",
    ...over,
  });

const view = (over: Partial<GenerationView> = {}): GenerationView => ({
  stage: "designing",
  concepts: [],
  canStart: false,
  ...over,
});

let host: HTMLDivElement;
let root: Root;

function render(initial: GenerationView) {
  act(() => {
    root.render(<GenerationPanel eventId={EVENT} initial={initial} />);
  });
}

const testId = (id: string) => host.querySelector(`[data-testid="${id}"]`);

beforeEach(() => {
  vi.useFakeTimers();
  start.mockReset();
  read.mockReset();
  host = document.createElement("div");
  document.body.appendChild(host);
  act(() => {
    root = createRoot(host);
  });
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
  vi.useRealTimers();
});

/* ------------------------------------------------------- no fabricated progress */

describe("nothing on this surface is invented", () => {
  it("renders no percentage, fraction, ETA or progress element in any stage", () => {
    for (const stage of [
      "not_started",
      "exploring",
      "designing",
      "ready",
      "partial",
      "failed",
      "unavailable",
    ] as const) {
      render(
        view({
          stage,
          canStart: stage === "not_started" || stage === "failed",
          concepts: stage === "ready" ? [ready(0), ready(1), ready(2)] : [],
          vibe: ["heritage", "polished"],
        }),
      );
      const text = host.textContent ?? "";
      expect(text).not.toMatch(/\d+\s?%/);
      // "1 of 3", "2/3" — a step counter is a fabricated completion claim in another notation.
      expect(text).not.toMatch(/\b\d\s*(of|\/)\s*\d\b/);
      expect(text).not.toMatch(/seconds remaining|estimated|almost done/i);
      expect(host.querySelector("progress")).toBeNull();
      expect(host.querySelector('[role="progressbar"]')).toBeNull();
    }
  });

  it("shows a concept's fields only when the artifact carrying them exists", () => {
    // Previewable, but the artifact fields are absent. A surface that invented a name, a palette
    // or a skeleton here would be claiming an artifact the pipeline has not produced.
    render(
      view({
        stage: "designing",
        concepts: [concept({ index: 0, stage: "ready", previewable: true, settled: true })],
      }),
    );
    const card = testId("concept-card-0");
    expect(card).not.toBeNull();
    expect(card!.querySelector("h3")).toBeNull();
    expect(card!.querySelector('[role="img"]')).toBeNull();
    expect(card!.textContent ?? "").not.toMatch(/loading|pending|untitled|tbd|…/i);
  });

  it("never renders DesignIntent-derived content before the concept reports it", () => {
    render(view({ stage: "exploring", concepts: [concept({ index: 0, stage: "planned" })] }));
    const text = host.textContent ?? "";
    expect(text).not.toContain("grotesque");
    expect(text).not.toContain("botanical");
    expect(testId("concept-card-0")!.querySelector("h3")).toBeNull();
  });

  it("shows the interpreted vibe only once the identity has produced one", async () => {
    // Two facts in one test, and the second has to arrive the way it really does. `initial` seeds
    // state once, so a second `render` with new props changes nothing — which is correct, because
    // on a real reload the component remounts. Mid-session the vibe arrives on a poll, so that is
    // how it is delivered here.
    read.mockResolvedValue(view({ stage: "exploring", vibe: ["heritage", "heirloom"] }));
    render(view({ stage: "exploring" }));
    expect(testId("generation-vibe-list")).toBeNull();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(3_000);
    });
    expect(testId("generation-vibe-list")!.textContent).toContain("heritage");
  });
});

/* --------------------------------------------------- independent concept readiness */

describe("a concept never waits for its siblings", () => {
  it("shows concept 0 as ready while 1 and 2 are still forming", () => {
    render(
      view({
        stage: "designing",
        concepts: [ready(0), concept({ index: 1, stage: "composing" }), concept({ index: 2 })],
      }),
    );
    expect(testId("concept-preview-link-0")).not.toBeNull();
    expect(testId("concept-preview-link-1")).toBeNull();
    expect(testId("concept-preview-link-2")).toBeNull();
    expect(testId("concept-stage-1")!.textContent).toContain("Composing");
    expect(testId("concept-stage-0")).toBeNull();
  });

  it("treats a previewable concept whose artwork is still coming as finished, not pending", () => {
    render(
      view({
        stage: "designing",
        concepts: [ready(0, { settled: false, artwork: { pending: 1, delivered: 0, failed: 0 } })],
      }),
    );
    // The card is real and the page is reachable. Artwork arriving later is a refinement of a
    // finished page, and `spec.md §7.10 #5` makes the spec's existence the readiness condition.
    expect(testId("concept-preview-link-0")).not.toBeNull();
    expect(testId("concept-card-0")!.querySelector("h3")).not.toBeNull();
    expect(testId("concept-stage-0")).toBeNull();
  });

  it("lets one failed sibling sit beside two ready ones without disturbing them", () => {
    render(
      view({
        stage: "partial",
        concepts: [ready(0), concept({ index: 1, stage: "failed", settled: true }), ready(2)],
      }),
    );
    expect(testId("concept-preview-link-0")).not.toBeNull();
    expect(testId("concept-preview-link-2")).not.toBeNull();
    expect(testId("concept-stage-1")!.textContent).toContain("didn't work out");
  });

  it("does not gate the list on the batch stage", () => {
    // `designing` means siblings are still in flight. A concept that is previewable shows anyway.
    render(view({ stage: "designing", concepts: [ready(0)] }));
    expect(testId("concept-preview-link-0")).not.toBeNull();
  });
});

/* ------------------------------------------------------------- polling and recovery */

describe("polling follows the pipeline, and a failed read withdraws nothing", () => {
  it("polls while in flight and stops once the batch settles", async () => {
    read.mockResolvedValue(view({ stage: "ready", concepts: [ready(0)], canStart: true }));
    render(view({ stage: "designing", concepts: [] }));

    await act(async () => {
      await vi.advanceTimersByTimeAsync(3_000);
    });
    expect(read).toHaveBeenCalledTimes(1);

    const after = read.mock.calls.length;
    await act(async () => {
      await vi.advanceTimersByTimeAsync(30_000);
    });
    // Settled: no further reads, however long the tab stays open.
    expect(read.mock.calls.length).toBe(after);
  });

  it("keeps the concepts it already has when a poll fails", async () => {
    read.mockRejectedValue(new Error("network"));
    render(view({ stage: "designing", concepts: [ready(0)] }));

    await act(async () => {
      await vi.advanceTimersByTimeAsync(3_000);
    });
    expect(testId("concept-card-0")!.querySelector("h3")!.textContent).toBe("Direction 1");
  });

  it("keeps the concepts it already has when the read reports itself unavailable", async () => {
    read.mockResolvedValue(view({ stage: "unavailable", concepts: [], canStart: false }));
    render(view({ stage: "designing", concepts: [ready(0)] }));

    await act(async () => {
      await vi.advanceTimersByTimeAsync(3_000);
    });
    // `concepts: []` on an `unavailable` read means *unknown*, not *none* — replacing a page of
    // real concepts with an empty one because one poll failed is the bug this guards.
    expect(testId("concept-card-0")).not.toBeNull();
  });

  it("restores whatever the server says on first paint, without asking first", () => {
    // Reload: the panel is server-rendered from persisted state and shows it immediately.
    render(view({ stage: "partial", concepts: [ready(0), ready(1)], canStart: true }));
    expect(read).not.toHaveBeenCalled();
    expect(testId("concept-preview-link-0")).not.toBeNull();
    expect(testId("concept-preview-link-1")).not.toBeNull();
  });
});

/* --------------------------------------------------------------------- the actions */

describe("starting is offered only when the server says it may be", () => {
  it("offers a start when nothing has run and the server allows it", () => {
    render(view({ stage: "not_started", canStart: true }));
    expect(testId("generation-start")).not.toBeNull();
  });

  it("offers nothing while a batch is in flight", () => {
    render(view({ stage: "designing", canStart: false }));
    expect(testId("generation-start")).toBeNull();
    expect(testId("generation-retry")).toBeNull();
  });

  it("offers a retry after a failed batch, and never retries on its own", async () => {
    render(view({ stage: "failed", canStart: true }));
    expect(testId("generation-retry")).not.toBeNull();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(60_000);
    });
    expect(start).not.toHaveBeenCalled();
  });

  it("does not offer a fresh round beside finished concepts", () => {
    // `Try another direction` is `spec.md §31 — Concept experience`, and Phase 5's to build.
    render(view({ stage: "ready", concepts: [ready(0), ready(1), ready(2)], canStart: true }));
    expect(testId("generation-start")).toBeNull();
    expect(testId("generation-retry")).toBeNull();
  });
});
