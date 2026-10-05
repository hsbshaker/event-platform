import { describe, expect, it } from "vitest";

import { COPYRIGHT_STEP_BACK_NOTICE, generationFailure } from "./failure-copy";
import {
  afterStart,
  initialWait,
  nextPollDelay,
  readGenerationBody,
  readWaitGeneration,
  waitStatusLine,
  withHostCopy,
} from "./wait-view";

const IDENTITY = {
  creativeDirection: "A slow garden supper at golden hour.",
  toneKeywords: ["warm", "unhurried"],
  palette: ["olive", "cream"],
  visualMotifs: ["lemon branch", " "],
};
const DESIGN = {
  name: "Lemons & Linen",
  description: "A lemon branch over soft linen.",
  artDirection: {
    subject: "A lemon branch",
    medium: "Watercolour",
    mood: "Calm",
    palette: "Olive and cream",
    texture: "Linen",
  },
};

function running(extra: Record<string, unknown> = {}) {
  return { id: "g1", status: "running", stage: null, artifacts: {}, ...extra };
}

describe("readWaitGeneration", () => {
  it("shows the identity's signals once recorded, dropping blank words", () => {
    const g = readWaitGeneration(running({ stage: "identity", artifacts: { identity: IDENTITY } }));
    expect(g?.identity).toEqual({
      creativeDirection: "A slow garden supper at golden hour.",
      toneKeywords: ["warm", "unhurried"],
      palette: ["olive", "cream"],
      visualMotifs: ["lemon branch"],
    });
    expect(g?.design).toBeNull();
  });

  it("shows the design only when every part of it is there", () => {
    const g = readWaitGeneration(running({ artifacts: { design: DESIGN } }));
    expect(g?.design?.name).toBe("Lemons & Linen");
    const partial = { ...DESIGN, artDirection: { ...DESIGN.artDirection, texture: "" } };
    expect(readWaitGeneration(running({ artifacts: { design: partial } }))?.design).toBeNull();
  });

  it("never carries anything beyond the shown artifacts", () => {
    const g = readWaitGeneration(
      running({
        artifacts: {
          identity: { ...IDENTITY, raw: "model output" },
          facts: { hosts: "Ana", partial: [{ field: "date", text: "soon" }] },
        },
        telemetry: { cost: 3 },
      }),
    );
    expect(JSON.stringify(g)).not.toMatch(/model output|cost|soon/);
  });

  it("carries the facts the prompt states, for the details form to offer", () => {
    const g = readWaitGeneration(
      running({ stage: "identity", artifacts: { facts: { hosts: "Ana", date: "June 6" } } }),
    );
    expect(g?.facts).toEqual({
      hosts: "Ana",
      honoree: null,
      date: "June 6",
      time: null,
      venue: null,
      location: null,
    });
    expect(readWaitGeneration(running())?.facts).toBeNull();
  });

  it("reads a failed generation with its copy, and a bare one as the generic failure", () => {
    const failure = generationFailure("deadline");
    expect(readWaitGeneration({ ...running(), status: "failed", failure })?.failure).toEqual(
      failure,
    );
    expect(readWaitGeneration({ ...running(), status: "failed" })?.failure).toEqual(
      generationFailure(null),
    );
  });

  it("carries the copyright note only while running", () => {
    expect(readWaitGeneration(running({ notice: COPYRIGHT_STEP_BACK_NOTICE }))?.notice).toBe(
      COPYRIGHT_STEP_BACK_NOTICE,
    );
    expect(
      readWaitGeneration({ ...running({ notice: "x" }), status: "succeeded" })?.notice,
    ).toBeNull();
  });

  it("rejects what is not a generation", () => {
    expect(readWaitGeneration(null)).toBeNull();
    expect(readWaitGeneration({ id: "g", status: "weird" })).toBeNull();
    expect(readGenerationBody({ error: "Not found" })).toBeNull();
    expect(readGenerationBody({ generation: null })).toEqual({ generation: null });
    expect(readGenerationBody({ generation: 5 })).toBeNull();
  });
});

describe("withHostCopy", () => {
  it("adds the failure copy for a failed generation and the notice for a running one", () => {
    const failed = readWaitGeneration(
      withHostCopy({ id: "g", status: "failed", stage: null, artifacts: {}, errorCode: "stopped" }),
    );
    expect(failed?.failure).toEqual(generationFailure("stopped"));
    const step = readWaitGeneration(
      withHostCopy({
        id: "g",
        status: "running",
        stage: null,
        artifacts: { notice: "provider_refusal" },
        errorCode: null,
      }),
    );
    expect(step?.notice).toBe(COPYRIGHT_STEP_BACK_NOTICE);
  });
});

describe("waitStatusLine", () => {
  it("follows the stage the pipeline resolved", () => {
    expect(waitStatusLine(null)).toBe("Understanding your event");
    expect(waitStatusLine(readWaitGeneration(running()))).toBe("Understanding your event");
    expect(waitStatusLine(readWaitGeneration(running({ stage: "identity" })))).toBe(
      "Designing your card",
    );
    expect(
      waitStatusLine(
        readWaitGeneration(running({ stage: "design", artifacts: { design: DESIGN } })),
      ),
    ).toBe("Painting the artwork");
    // The copyright step-back clears the refused design while its replacement is drafted.
    expect(
      waitStatusLine(readWaitGeneration(running({ stage: "design", artifacts: { design: null } }))),
    ).toBe("Designing your card");
  });

  it("uses no number, percentage or technical term", () => {
    for (const stage of [null, "identity", "design"]) {
      expect(waitStatusLine(readWaitGeneration(running({ stage })))).not.toMatch(
        /\d|%|identity|layout|ink|panel|model/i,
      );
    }
  });
});

describe("initialWait", () => {
  const run = readWaitGeneration(running())!;
  const failed = readWaitGeneration({ ...running(), status: "failed" })!;
  const done = readWaitGeneration({ ...running(), status: "succeeded" })!;

  it("goes to the reveal when the event has a card, whatever the latest generation did", () => {
    expect(initialWait(true, null)).toEqual({ kind: "reveal" });
    expect(initialWait(true, failed)).toEqual({ kind: "reveal" });
  });

  it("starts once when there is no generation, polls a running one, shows a failed one", () => {
    expect(initialWait(false, null)).toEqual({ kind: "start" });
    expect(initialWait(false, run)).toEqual({ kind: "poll", generation: run });
    expect(initialWait(false, failed)).toMatchObject({ kind: "failed" });
    expect(initialWait(false, done)).toEqual({ kind: "reveal" });
  });
});

describe("afterStart", () => {
  it("polls for started, existing and in-flight; reveals a designed event", () => {
    for (const o of ["started", "existing", "in_flight"])
      expect(afterStart(o)).toEqual({ kind: "poll" });
    expect(afterStart("designed")).toEqual({ kind: "reveal" });
  });

  it("gives plain copy for the refused starts, with no retry", () => {
    // `disabled`: generation switched off (the action's answer to the kill switch).
    for (const o of ["event_cap", "host_cap", "published", "disabled"] as const) {
      const next = afterStart(o);
      expect(next).toEqual({ kind: "failed", failure: generationFailure(o) });
      expect(generationFailure(o).retry).toBe(false);
    }
  });

  it("says another card is being made, with a retry, for a busy start", () => {
    expect(afterStart("busy")).toEqual({ kind: "failed", failure: generationFailure("busy") });
    expect(generationFailure("busy").retry).toBe(true);
  });

  it("reads an unknown outcome as the generic failure", () => {
    expect(afterStart("whatever")).toEqual({ kind: "failed", failure: generationFailure(null) });
  });
});

describe("nextPollDelay", () => {
  it("polls every 2 s and backs off to a ceiling after failed reads", () => {
    expect(nextPollDelay(0)).toBe(2000);
    expect(nextPollDelay(1)).toBe(4000);
    expect(nextPollDelay(2)).toBe(8000);
    expect(nextPollDelay(3)).toBe(15_000);
    expect(nextPollDelay(30)).toBe(15_000);
  });
});
