import { describe, expect, it } from "vitest";

import { generationFailure } from "./failure-copy";
import { afterStart, pollStep, readWaitGeneration, withHostCopy } from "./wait-view";

function running(extra: Record<string, unknown> = {}) {
  return { id: "g1", status: "running", stage: null, artifacts: {}, ...extra };
}

describe("direction wait: what the generation read says", () => {
  it("reads the design a succeeded generation made, and only then", () => {
    const done = readWaitGeneration(running({ status: "succeeded", cardDesignId: "d2" }));
    expect(done?.cardDesignId).toBe("d2");
    expect(readWaitGeneration(running({ cardDesignId: "d2" }))?.cardDesignId).toBeNull();
    expect(readWaitGeneration(running({ status: "succeeded" }))?.cardDesignId).toBeNull();
  });

  it("carries the design id through the host copy the page and the route share", () => {
    const body = withHostCopy({
      id: "g1",
      status: "succeeded",
      stage: "done",
      artifacts: {},
      errorCode: null,
      cardDesignId: "d2",
    });
    expect(readWaitGeneration(body)?.cardDesignId).toBe("d2");
  });
});

describe("afterStart for the direction start's outcomes", () => {
  it("started, existing and in-flight wait", () => {
    for (const outcome of ["started", "existing", "in_flight"]) {
      expect(afterStart(outcome)).toEqual({ kind: "poll" });
    }
  });

  it("everything else is plain copy from the failure table", () => {
    for (const outcome of ["published", "no_design", "event_cap", "host_cap", "disabled"]) {
      expect(afterStart(outcome)).toEqual({ kind: "failed", failure: generationFailure(outcome) });
    }
  });

  it("a start refused because there is no card yet offers no retry", () => {
    expect(generationFailure("no_design").retry).toBe(false);
  });

  it("an outcome it does not know reads as the generic failure", () => {
    expect(afterStart("surprise")).toEqual({ kind: "failed", failure: generationFailure(null) });
  });
});

describe("pollStep", () => {
  const body = (generation: unknown) => ({ generation });

  it("stops on 401, 403 and 404: a lost-access answer, never polled again", () => {
    for (const status of [401, 403, 404]) {
      expect(pollStep(status, {})).toEqual({ kind: "lost" });
    }
  });

  it("retries other failures and unreadable bodies", () => {
    expect(pollStep(500, {})).toEqual({ kind: "retry" });
    expect(pollStep(200, undefined)).toEqual({ kind: "retry" });
    expect(pollStep(200, { nope: true })).toEqual({ kind: "retry" });
  });

  it("reads running, succeeded and failed", () => {
    expect(pollStep(200, body(null))).toEqual({ kind: "running", generation: null });
    expect(pollStep(200, body(running())).kind).toBe("running");
    expect(pollStep(200, body(running({ status: "succeeded", cardDesignId: "d2" }))).kind).toBe(
      "succeeded",
    );
    const failed = pollStep(200, body(running({ status: "failed", failure: null })));
    expect(failed.kind === "failed" && failed.failure.code).toBe("internal");
  });

  it("waiting for one generation, another's result is still a wait", () => {
    const earlier = body(running({ id: "g0", status: "succeeded", cardDesignId: "d1" }));
    expect(pollStep(200, earlier, "g1")).toEqual({ kind: "running", generation: null });
    const own = body(running({ id: "g1", status: "succeeded", cardDesignId: "d2" }));
    expect(pollStep(200, own, "g1").kind).toBe("succeeded");
    // Without an expected id (the first card) the latest generation is the one.
    expect(pollStep(200, earlier).kind).toBe("succeeded");
  });
});
