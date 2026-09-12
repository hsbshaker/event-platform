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
 * Requires a signed-in collaborator on `eventId` who may perform `capability`.
 * Non-members receive `ForbiddenError` regardless of whether the event exists.
 */
export async function requireEventAccess(
  eventId: string,
  capability: Capability,
  ctx: PermissionContext = {},
): Promise<EventAccess> {
  const user = await requireUser();
  const supabase = await createClient();
  const role = await getEventRole(supabase, eventId, user.id);
  if (!role || !can(role, capability, ctx)) throw new ForbiddenError();
  return { user, role, eventId };
}
