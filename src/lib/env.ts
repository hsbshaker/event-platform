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
  /**
   * Base64 secret of at least 32 bytes. It is the HMAC key for draft tokens and
   * rate-limit keys (domain-separated by prefix); per-purpose subkeys are derived
   * from it (HKDF) when access-code encryption lands. Never used raw as a cipher key.
   */
  APP_ENCRYPTION_KEY: z
    .string()
    .regex(/^[A-Za-z0-9+/]+={0,2}$/, "must be base64")
    .refine((v) => Buffer.from(v, "base64").length >= 32, "must decode to at least 32 bytes"),
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

/**
 * Cleanup-job credential (optional, server-only). It is the sole credential protecting a
 * service-role endpoint, so it is validated here like every other secret rather than read
 * raw from `process.env`: a one-character value would otherwise be accepted. Optional because
 * the route is fail-closed without it — an unset secret disables the endpoint, it does not
 * open it (docs/technology-decisions.md §3: server-only access to secrets).
 */
const cronSchema = z.string().min(32).optional();

export function cronSecret(): string | undefined {
  if (typeof window !== "undefined") {
    throw new Error("cronSecret() must not be called from client code.");
  }
  const parsed = cronSchema.safeParse(process.env.CRON_SECRET || undefined);
  if (!parsed.success) fail("CRON_SECRET", parsed.error);
  return parsed.data;
}

/**
 * Supabase management credential (optional, operator-only): used by
 * `scripts/db/push-migrations.mjs` to apply migrations to the hosted databases, never by the app.
 * A personal access token (`sbp_` and 40 hex characters) can change production, so it is
 * validated here like every other secret rather than read raw from `process.env`.
 */
const supabaseAccessTokenSchema = z.string().regex(/^sbp_[0-9a-f]{40}$/, {
  message: "expected a Supabase personal access token (sbp_ and 40 hex characters)",
});

export function supabaseAccessToken(): string {
  if (typeof window !== "undefined") {
    throw new Error("supabaseAccessToken() must not be called from client code.");
  }
  const parsed = supabaseAccessTokenSchema.safeParse(process.env.SUPABASE_ACCESS_TOKEN);
  if (!parsed.success) fail("SUPABASE_ACCESS_TOKEN", parsed.error);
  return parsed.data;
}

/**
 * Generation configuration (server-only): the kill switch, the model provider's key, and the spend
 * limits (`spec.md §10`; owner decision, `docs/technology-decisions.md §8.1`: $20/day across all
 * generation, 30 generations per event per day, 60 per acting host per day).
 *
 * Its own accessor rather than part of `serverEnv()`, so a generation misconfiguration fails
 * generation only, never sign-in or the rest of the app. Fail-closed:
 *
 * - generation is off unless `GENERATION_ENABLED` is exactly `"true"`; any value other than
 *   `"true"`, `"false"` or unset is an error rather than a guess;
 * - when it is on, `OPENAI_API_KEY` is required, so "enabled" never means "enabled but broken";
 * - a limit that is not a positive number, or is implausibly large (a typo such as an extra zero
 *   on the ceiling), is an error, never a fallback to the default.
 *
 * Read on every call (not cached): it is cheap, and the kill switch takes effect on the next
 * call wherever the deployment's environment changes.
 */
const generationSchema = z
  .object({
    GENERATION_ENABLED: z.enum(["true", "false"]).default("false"),
    OPENAI_API_KEY: z
      .string()
      .regex(/^sk-[A-Za-z0-9_-]{20,}$/, "must be an OpenAI API key (sk-…)")
      .optional(),
    GENERATION_DAILY_CEILING_USD: z.coerce.number().positive().max(1000).default(20),
    GENERATION_EVENT_DAILY_CAP: z.coerce.number().int().positive().max(1000).default(30),
    GENERATION_HOST_DAILY_CAP: z.coerce.number().int().positive().max(1000).default(60),
  })
  .refine((v) => v.GENERATION_ENABLED !== "true" || v.OPENAI_API_KEY !== undefined, {
    message: "is required when GENERATION_ENABLED is true",
    path: ["OPENAI_API_KEY"],
  });

export interface GenerationEnv {
  enabled: boolean;
  /** Present whenever `enabled` is true. */
  openAiApiKey: string | undefined;
  dailyCeilingUsd: number;
  eventDailyCap: number;
  hostDailyCap: number;
}

export function generationEnv(): GenerationEnv {
  if (typeof window !== "undefined") {
    throw new Error("generationEnv() must not be called from client code.");
  }
  // An empty assignment in a .env file means unset.
  const read = (name: string) => process.env[name] || undefined;
  const parsed = generationSchema.safeParse({
    GENERATION_ENABLED: read("GENERATION_ENABLED"),
    OPENAI_API_KEY: read("OPENAI_API_KEY"),
    GENERATION_DAILY_CEILING_USD: read("GENERATION_DAILY_CEILING_USD"),
    GENERATION_EVENT_DAILY_CAP: read("GENERATION_EVENT_DAILY_CAP"),
    GENERATION_HOST_DAILY_CAP: read("GENERATION_HOST_DAILY_CAP"),
  });
  if (!parsed.success) fail("generation", parsed.error);
  const v = parsed.data;
  return {
    enabled: v.GENERATION_ENABLED === "true",
    openAiApiKey: v.OPENAI_API_KEY,
    dailyCeilingUsd: v.GENERATION_DAILY_CEILING_USD,
    eventDailyCap: v.GENERATION_EVENT_DAILY_CAP,
    hostDailyCap: v.GENERATION_HOST_DAILY_CAP,
  };
}

/** Test seam: clear cached values after mutating process.env. */
export function resetEnvCache(): void {
  cachedPublic = undefined;
  cachedServer = undefined;
}
