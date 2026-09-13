/**
 * spec.md §11.4 layer 1 ("Capabilities"):
 *
 * > `Capabilities` — what the event is allowed to contain: `{ rsvp, registry, gifts,
 * > externalRegistry, cashFund, hosts, description, time, location, deadline }`,
 * > derived from the event's enabled features, never from whether content has been
 * > entered. For a baby shower at first generation this is the full set, so every
 * > first composition has a designed place for RSVP and registry. ... Features
 * > cannot be disabled before generation; disabling one later is render-time
 * > suppression (layer 3), never a recompile.
 *
 * Capabilities derive from which features are *enabled*, never from whether content
 * currently exists (that is layer 2, `ContentProfile`) or from guest-visible state
 * (layer 3, `FeaturePresentationState`). This layer never triggers recomposition —
 * disabling a feature after generation is render-time suppression, handled elsewhere.
 *
 * Pure, dependency-free.
 */

export interface Capabilities {
  rsvp: boolean;
  registry: boolean;
  gifts: boolean;
  externalRegistry: boolean;
  cashFund: boolean;
  hosts: boolean;
  description: boolean;
  time: boolean;
  location: boolean;
  deadline: boolean;
}

export interface CapabilitiesSourceEvent {
  eventType?: "baby_shower" | string;
}

const FULL_CAPABILITIES: Capabilities = {
  rsvp: true,
  registry: true,
  gifts: true,
  externalRegistry: true,
  cashFund: true,
  hosts: true,
  description: true,
  time: true,
  location: true,
  deadline: true,
};

/**
 * spec.md §11.4: "For a baby shower at first generation this is the full set."
 * Baby shower is the only event type in MVP scope, so the full set always applies.
 */
export function capabilitiesForEvent(event: CapabilitiesSourceEvent): Capabilities {
  // Intentionally unused: capabilities never depend on the event's fields (only on
  // "baby shower at first generation", which is the only case in MVP scope).
  void event;
  return { ...FULL_CAPABILITIES };
}
