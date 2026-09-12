import "server-only";

import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { publicEnv } from "@/lib/env";
import type { Database } from "./database.types";

/**
 * Per-request server client for Server Components, Server Actions and Route
 * Handlers. Never share it across requests. Cookie writes from Server
 * Components are ignored (session refresh is handled in src/proxy.ts).
 */
export async function createClient() {
  const env = publicEnv();
  const cookieStore = await cookies();
  return createServerClient<Database>(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            for (const { name, value, options } of cookiesToSet) {
              cookieStore.set(name, value, options);
            }
          } catch {
            // Called from a Server Component: the proxy refreshes sessions instead.
          }
        },
      },
    },
  );
}
