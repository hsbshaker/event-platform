/**
 * Envelope state machine (docs/design-system.md §8.3, §10.20), kept pure so it is unit-tested.
 *
 * `closed` waits for the guest. `pending` is the wait for the caller's `onOpen` (a personal
 * link loads the card only on this action). `opening` plays the animation; `open` is settled.
 * The sealed state is not here: it is a prop (the access gate decides when to unseal).
 */
export type EnvelopePhase = "closed" | "pending" | "opening" | "open";

export interface EnvelopeState {
  phase: EnvelopePhase;
  /** The last `onOpen` rejected; cleared by the next press. */
  failed: boolean;
}

export type EnvelopeEvent =
  | { type: "press"; async: boolean; reducedMotion: boolean }
  | { type: "loaded"; reducedMotion: boolean }
  | { type: "failed" }
  | { type: "animationDone" };

export const INITIAL_ENVELOPE_STATE: EnvelopeState = { phase: "closed", failed: false };

export function envelopeReducer(state: EnvelopeState, event: EnvelopeEvent): EnvelopeState {
  switch (event.type) {
    case "press":
      if (state.phase !== "closed") return state;
      if (event.async) return { phase: "pending", failed: false };
      return { phase: event.reducedMotion ? "open" : "opening", failed: false };
    case "loaded":
      if (state.phase !== "pending") return state;
      return { phase: event.reducedMotion ? "open" : "opening", failed: false };
    case "failed":
      if (state.phase !== "pending") return state;
      return { phase: "closed", failed: true };
    case "animationDone":
      if (state.phase !== "opening") return state;
      return { ...state, phase: "open" };
  }
}

/** The card exists in the DOM only once the guest has opened the envelope. */
export function cardIsMounted(phase: EnvelopePhase): boolean {
  return phase === "opening" || phase === "open";
}
