/**
 * Permission matrix — spec.md §25, §6. Pure and side-effect free so it can be
 * unit-tested against the table and reused by RLS-adjacent server code.
 *
 * Roles: `owner` created the event; `cohost` was invited; `guest` is anyone else
 * (guests never have accounts — spec.md §32 #35). Co-host has near-parity except
 * billing, co-host management and deletion (spec.md §32 #43).
 */
export type EventRole = "owner" | "cohost";
export type ActorRole = EventRole | "guest";

export const CAPABILITIES = [
  "view_event",
  "edit_event_content",
  "manage_privacy",
  "manage_guests",
  "manage_rsvp_questions",
  "view_rsvp_responses",
  "manage_registry",
  "manage_native_item_purchase_state",
  "send_messages",
  "use_design_controls",
  "add_redesign_inspiration",
  "enter_redesign_feedback",
  "generate_redesign_concepts",
  "browse_select_concepts",
  "preview",
  "publish",
  "manage_billing",
  "manage_cohosts",
  "delete_event",
  "transfer_ownership",
] as const;

export type Capability = (typeof CAPABILITIES)[number];

export interface PermissionContext {
  /** `Event.paidAt` is set (spec.md §28); required for `publish`. */
  paymentSatisfied?: boolean;
  /** Event is PUBLISHED: AI redesign and concept switching are disabled (spec.md §8.2, §25). */
  published?: boolean;
}

const OWNER_ONLY: ReadonlySet<Capability> = new Set([
  "manage_billing",
  "manage_cohosts",
  "delete_event",
]);

const PRE_PUBLISH_ONLY: ReadonlySet<Capability> = new Set([
  "generate_redesign_concepts",
  "browse_select_concepts",
]);

const GUEST_ALLOWED: ReadonlySet<Capability> = new Set(["view_event", "preview"]);

/** Returns whether `role` may perform `capability` under `ctx`. */
export function can(role: ActorRole, capability: Capability, ctx: PermissionContext = {}): boolean {
  if (capability === "transfer_ownership") return false; // not in MVP (spec.md §25)
  if (role === "guest") return GUEST_ALLOWED.has(capability);
  if (OWNER_ONLY.has(capability)) return role === "owner";
  if (capability === "publish") return ctx.paymentSatisfied === true;
  if (PRE_PUBLISH_ONLY.has(capability)) return ctx.published !== true;
  return true;
}

export function isCollaborator(role: ActorRole): role is EventRole {
  return role === "owner" || role === "cohost";
}
