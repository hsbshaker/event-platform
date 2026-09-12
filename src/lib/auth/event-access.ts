import "server-only";

import type { SupabaseClient, User } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/lib/supabase/database.types";
import { ForbiddenError } from "./errors";
import { can, type Capability, type EventRole, type PermissionContext } from "./permissions";
import { requireUser } from "./session";

export interface EventAccess {
  user: User;
  role: EventRole;
  eventId: string;
  /** Derived from the persisted event row, never from the caller. */
  context: Required<PermissionContext>;
}

/**
 * The caller's membership role on an event, read through RLS (the row is only
 * visible to members). Returns null for non-members and for unknown events so
 * existence is not leaked.
 */
export async function getEventRole(
  supabase: SupabaseClient<Database>,
  eventId: string,
  userId: string,
): Promise<EventRole | null> {
  const { data, error } = await supabase
    .from("event_members")
    .select("role")
    .eq("event_id", eventId)
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw error;
  return data?.role ?? null;
}

/**
 * Permission context from the persisted event (spec.md §25, §28): payment is
 * satisfied when `paid_at` is set; AI redesign and concept switching end at
 * PUBLISHED. Read through RLS so it is only available to members.
 */
export async function getPermissionContext(
  supabase: SupabaseClient<Database>,
  eventId: string,
): Promise<Required<PermissionContext> | null> {
  const { data, error } = await supabase
    .from("events")
    .select("paid_at, status")
    .eq("id", eventId)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return {
    paymentSatisfied: data.paid_at !== null,
    published: data.status === "PUBLISHED" || data.status === "PASSED",
  };
}

/**
 * Requires a signed-in collaborator on `eventId` who may perform `capability`
 * given the event's persisted state. Non-members receive `ForbiddenError`
 * regardless of whether the event exists.
 */
export async function requireEventAccess(
  eventId: string,
  capability: Capability,
): Promise<EventAccess> {
  const user = await requireUser();
  const supabase = await createClient();
  const [role, context] = await Promise.all([
    getEventRole(supabase, eventId, user.id),
    getPermissionContext(supabase, eventId),
  ]);
  if (!role || !context || !can(role, capability, context)) throw new ForbiddenError();
  return { user, role, eventId, context };
}
