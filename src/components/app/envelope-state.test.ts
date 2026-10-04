import { describe, expect, it } from "vitest";
import {
  INITIAL_ENVELOPE_STATE,
  cardIsMounted,
  envelopeReducer,
  type EnvelopeState,
} from "./envelope-state";

const closed = INITIAL_ENVELOPE_STATE;

describe("envelopeReducer", () => {
  it("never leaves closed without a press", () => {
    for (const type of ["loaded", "failed", "animationDone"] as const) {
      const event = type === "loaded" ? { type, reducedMotion: false } : { type };
      expect(envelopeReducer(closed, event)).toBe(closed);
    }
  });

  it("plays the animation after a synchronous press", () => {
    const s = envelopeReducer(closed, { type: "press", async: false, reducedMotion: false });
    expect(s.phase).toBe("opening");
    expect(envelopeReducer(s, { type: "animationDone" }).phase).toBe("open");
  });

  it("skips the animation entirely under reduced motion", () => {
    expect(
      envelopeReducer(closed, { type: "press", async: false, reducedMotion: true }).phase,
    ).toBe("open");
    const pending = envelopeReducer(closed, { type: "press", async: true, reducedMotion: true });
    expect(pending.phase).toBe("pending");
    expect(envelopeReducer(pending, { type: "loaded", reducedMotion: true }).phase).toBe("open");
  });

  it("waits for an async onOpen, then opens", () => {
    const pending = envelopeReducer(closed, { type: "press", async: true, reducedMotion: false });
    expect(pending.phase).toBe("pending");
    expect(envelopeReducer(pending, { type: "loaded", reducedMotion: false }).phase).toBe(
      "opening",
    );
  });

  it("returns to closed with a failure flag when onOpen rejects, and clears it on retry", () => {
    const pending = envelopeReducer(closed, { type: "press", async: true, reducedMotion: false });
    const failed = envelopeReducer(pending, { type: "failed" });
    expect(failed).toEqual({ phase: "closed", failed: true });
    const retry = envelopeReducer(failed, { type: "press", async: true, reducedMotion: false });
    expect(retry).toEqual({ phase: "pending", failed: false });
  });

  it("ignores repeated presses while pending, opening or open", () => {
    for (const phase of ["pending", "opening", "open"] as const) {
      const s: EnvelopeState = { phase, failed: false };
      expect(envelopeReducer(s, { type: "press", async: false, reducedMotion: false })).toBe(s);
    }
  });
});

describe("cardIsMounted", () => {
  it("is true only once opening begins", () => {
    expect(cardIsMounted("closed")).toBe(false);
    expect(cardIsMounted("pending")).toBe(false);
    expect(cardIsMounted("opening")).toBe(true);
    expect(cardIsMounted("open")).toBe(true);
  });
});
