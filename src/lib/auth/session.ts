import "server-only";

import type { User } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { UnauthorizedError } from "./errors";

/** The authenticated Supabase user for this request, or null. Verified server-side. */
export async function getCurrentUser(): Promise<User | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
}

/** Throws `UnauthorizedError` when no user is signed in. */
export async function requireUser(): Promise<User> {
  const user = await getCurrentUser();
  if (!user) throw new UnauthorizedError();
  return user;
}
