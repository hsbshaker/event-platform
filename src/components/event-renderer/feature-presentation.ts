/**
 * `FeaturePresentationState` — the third layer of `docs/event-renderer-system.md §2.3`, and until
 * now the only one that was documented without being built.
 *
 * Canon defines three, and keeps them apart on purpose:
 *
 * - **`Capabilities`** — enabled features. Sent to the model, derived from features and never from
 *   whether content exists, so a first generation always has a designed place for RSVP and
 *   registry.
 * - **`ContentProfile`** — present content, as measurements. Sent to the model for fit.
 * - **`FeaturePresentationState`** — *"guest visibility; never sent to the model"*, and the rule it
 *   carries is quoted verbatim here because this file is where it finally becomes real:
 *
 *   > registry is visible once it has an external registry, native gift or cash fund; RSVP once it
 *   > is configured and at least one party is invited; empty optional leaves collapse for guests
 *   > while their collaborator affordance stays anchored. **Content and operational state change
 *   > visibility, never composition.**
 *
 * # What went wrong without it
 *
 * The Phase 4D live smoke rendered concepts whose registry and RSVP sections were thousands of
 * pixels of empty skeleton — 6,253px and 4,893px of desktop page, most of it placeholder frames for
 * gifts that do not exist and form rows for an RSVP nobody has configured. That was not a
 * provisional-data artifact and not a stylesheet problem. `EventPage` rendered every section in the
 * tree unconditionally because nothing had ever computed this state, so the opaque `RSVP` and
 * `Registry` components drew their full shells for an event with no operational data at all. The
 * tree was right; the missing thing was the layer canon had already named.
 *
 * # Why this changes visibility and nothing else
 *
 * The composition is untouched. `spec.md §32 #16` is explicit that guest visibility is *"a
 * render-time flag, never a recomposition"*, and `§32 #20` keeps generated design data immutable.
 * A concept whose registry is not set up is the same concept the moment it is; only what a guest
 * sees changes, and when real content arrives the deterministic re-fit produces the next
 * resolved-spec revision (`spec.md §4.10`).
 */

/** A section whose feature exists but has nothing behind it yet. */
export type SectionPresentation = "setup" | "visible";

/** An optional leaf: whether the event actually carries this piece of content. */
export type LeafPresentation = "empty" | "present";

export interface FeaturePresentationState {
  readonly sections: {
    readonly rsvp: SectionPresentation;
    readonly registry: SectionPresentation;
  };
  readonly leaves: {
    readonly hosts: LeafPresentation;
    readonly description: LeafPresentation;
    readonly time: LeafPresentation;
    readonly location: LeafPresentation;
    readonly deadline: LeafPresentation;
  };
}

/**
 * The state of an event that has been generated but not yet set up.
 *
 * Used when a caller has no operational data to offer — which today is **every** caller, and the
 * reason is worth stating plainly rather than leaving for someone to discover: there are no
 * registry, gift, cash-fund, guest or RSVP-party tables in `supabase/migrations` yet. Registry and
 * RSVP therefore cannot be anything but `setup`, and a derivation that pretended otherwise would be
 * inventing operational facts. When those tables land, `deriveFeaturePresentationState` is the one
 * place that changes.
 */
export const NOTHING_CONFIGURED: FeaturePresentationState = {
  sections: { rsvp: "setup", registry: "setup" },
  leaves: {
    hosts: "empty",
    description: "empty",
    time: "empty",
    location: "empty",
    deadline: "empty",
  },
};

/**
 * An event whose features are set up, for callers that need the whole page.
 *
 * Exported for the renderer's own tests and for the verifier when a re-fit measures a page whose
 * registry or RSVP has since become visible. Never a default: defaulting to "configured" would
 * reintroduce the empty shells this state exists to remove.
 */
export const FULLY_CONFIGURED: FeaturePresentationState = {
  sections: { rsvp: "visible", registry: "visible" },
  leaves: {
    hosts: "present",
    description: "present",
    time: "present",
    location: "present",
    deadline: "present",
  },
};
