import "server-only";

import { createClient } from "@/lib/supabase/server";

/**
 * Whether an access code is stored for the event (`spec.md §23.1`, "encrypted access code when
 * private"): a boolean only. The encrypted value is read through the member's own session
 * (RLS) so the question is answered for an owner or co-host, and never leaves this function.
 * Nothing sets a code yet (Creation Mode slice 3), so today this is false for every event.
 */
export async function accessCodeIsSet(eventId: string): Promise<boolean> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("events")
    .select("access_code_encrypted")
    .eq("id", eventId)
    .maybeSingle();
  if (error) throw error;
  return data?.access_code_encrypted != null;
}
