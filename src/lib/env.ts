import { z } from "zod";

/**
 * Environment contract. Server-only values are validated lazily on first use so
 * builds and unit tests do not require live credentials; public values are
 * inlined by Next.js at build time and validated the same way.
 *
 * Secrets are read only through `serverEnv()` from server code
 * (docs/technology-decisions.md §3: server-only access to secrets).
 */
const publicSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.url(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1),
  NEXT_PUBLIC_APP_URL: z.url().default("http://localhost:3000"),
});

const serverSchema = z.object({
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
  /** 32-byte key, base64, for encrypting private event codes and hashing draft tokens. */
  APP_ENCRYPTION_KEY: z.string().min(32),
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
});

export type PublicEnv = z.infer<typeof publicSchema>;
export type ServerEnv = z.infer<typeof serverSchema> & PublicEnv;

let cachedPublic: PublicEnv | undefined;
let cachedServer: ServerEnv | undefined;

function fail(scope: string, error: z.ZodError): never {
  const missing = error.issues.map((i) => i.path.join(".")).join(", ");
  throw new Error(`Invalid ${scope} environment: ${missing}. See .env.example.`);
}

export function publicEnv(): PublicEnv {
  if (cachedPublic) return cachedPublic;
  const parsed = publicSchema.safeParse({
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
  });
  if (!parsed.success) fail("public", parsed.error);
  cachedPublic = parsed.data;
  return cachedPublic;
}

export function serverEnv(): ServerEnv {
  if (typeof window !== "undefined") {
    throw new Error("serverEnv() must not be called from client code.");
  }
  if (cachedServer) return cachedServer;
  const parsed = serverSchema.safeParse(process.env);
  if (!parsed.success) fail("server", parsed.error);
  cachedServer = { ...publicEnv(), ...parsed.data };
  return cachedServer;
}

/** Test seam: clear cached values after mutating process.env. */
export function resetEnvCache(): void {
  cachedPublic = undefined;
  cachedServer = undefined;
}
