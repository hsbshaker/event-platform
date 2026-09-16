import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Applied migrations are frozen; corrections go forward.
 *
 * A migration id that a persistent environment has already recorded in
 * `supabase_migrations.schema_migrations` will never be re-run there. Editing that file in place
 * therefore changes nothing in the environment it was supposed to fix, while quietly making the
 * repository and the database disagree about what that id means — the repository says the fix
 * shipped, the database is still running the old function, and nothing anywhere objects.
 *
 * `20260916000000_phase4b_identity_call_claims.sql` was edited in place once, to date a claim from
 * `clock_timestamp()` rather than transaction-start time. That edit was reverted and reshipped as
 * `20260916190000_phase4b_identity_claim_clock.sql`. These two assertions keep it that way:
 * the base file stays byte-for-byte what was applied, and the correction stays a later migration.
 *
 * Deliberately two named files, not a checksum manifest over the whole directory. The general
 * problem (every migration frozen after it ships) wants tooling and a stored baseline; this is one
 * known file that one known commit disturbed, and a hash literal a reviewer can read is the whole
 * guard.
 */

const MIGRATIONS = path.resolve(import.meta.dirname, "../../supabase/migrations");

/** The base migration as applied, at `b2b8c268fc0c97715de0078f80b20b0430884d82`. */
const CLAIMS_MIGRATION = "20260916000000_phase4b_identity_call_claims.sql";

/**
 * Git's blob id for that file: `sha1("blob " + bytes.length + "\0" + bytes)`. Spelled as the blob
 * id rather than a bare content hash so it can be checked straight from a shell —
 * `git hash-object supabase/migrations/20260916000000_phase4b_identity_call_claims.sql` — without
 * running the suite or trusting this file's own arithmetic.
 */
const CLAIMS_MIGRATION_BLOB = "d37a95f679341c49f3b9a46eb6977f3707a2459f";

function gitBlobId(file: string): string {
  const bytes = readFileSync(path.join(MIGRATIONS, file));
  return createHash("sha1").update(`blob ${bytes.length}\0`).update(bytes).digest("hex");
}

describe("migration history", () => {
  it("leaves the applied identity-claims migration byte-for-byte as it shipped", () => {
    expect(gitBlobId(CLAIMS_MIGRATION)).toBe(CLAIMS_MIGRATION_BLOB);
  });

  it("carries the claim-timestamp correction in a migration after it", () => {
    const later = readdirSync(MIGRATIONS)
      .filter((name) => name.endsWith(".sql") && name > CLAIMS_MIGRATION)
      .map((name) => ({ name, sql: readFileSync(path.join(MIGRATIONS, name), "utf8") }));

    const corrections = later.filter(({ sql }) =>
      /create\s+or\s+replace\s+function\s+public\.claim_identity_call\s*\(/i.test(sql),
    );

    expect(corrections.map(({ name }) => name)).toHaveLength(1);

    const [correction] = corrections;
    // The fix itself, not merely a replacement of the function: one wall-clock reading, used for
    // both the row's own timestamp and the lease derived from it.
    expect(correction.sql).toMatch(/v_created\s*:=\s*pg_catalog\.clock_timestamp\(\)/);
    expect(correction.sql).toMatch(/claimed_at,\s*lease_expires_at/);
    expect(correction.sql).toMatch(
      /v_created\s*\+\s*\(p_lease_seconds\s*\*\s*interval\s*'1 second'\)/,
    );
    // And still unreachable from an end-user JWT.
    expect(correction.sql).toMatch(
      /revoke execute on function public\.claim_identity_call\([\s\S]*?\)\s*from public, anon, authenticated;/,
    );
  });
});
