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
 * `20260916000000_phase4b_identity_call_claims.sql` reached its final pre-freeze state through
 * several in-place edits during Phase 4B — the last of them dating a claim from
 * `clock_timestamp()` rather than transaction-start time. That last edit was reverted and
 * reshipped as `20260916190000_phase4b_identity_claim_clock.sql`, and from the freeze onward both
 * files are frozen: the assertions below pin each one's bytes and require every further
 * correction to `claim_identity_call` to arrive as a migration later than both.
 *
 * Deliberately named files, not a checksum manifest over the whole directory. The general problem
 * (every migration frozen after it ships) wants tooling and a stored baseline; these are the two
 * files the freeze record names, and a hash literal a reviewer can read is the whole guard.
 *
 * What this cannot prove, and the packet says instead: the applied function's behaviour. These are
 * text assertions, and text that matches these patterns could still write the wrong column. The
 * proof that the *database* dates a claim from creation is
 * `tests/db/phase4b-t9a.test.ts`, "dates a claim from when it was created, not from when its
 * transaction started", which runs against a real PostgreSQL after applying both files in order.
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

/** The forward correction, which now carries the live body of `claim_identity_call`. */
const CLOCK_MIGRATION = "20260916190000_phase4b_identity_claim_clock.sql";
const CLOCK_MIGRATION_BLOB = "5b3636fc318c17bf39280bf2dcf42c955d65fed1";

function gitBlobId(file: string): string {
  const bytes = readFileSync(path.join(MIGRATIONS, file));
  return createHash("sha1").update(`blob ${bytes.length}\0`).update(bytes).digest("hex");
}

describe("migration history", () => {
  it("leaves the applied identity-claims migration byte-for-byte as it shipped", () => {
    expect(gitBlobId(CLAIMS_MIGRATION)).toBe(CLAIMS_MIGRATION_BLOB);
  });

  it("leaves the claim-clock correction byte-for-byte as it shipped", () => {
    // Pinned for the same reason as the base file, and specifically because it is the one that
    // now holds the live function body: without this, the cheapest way to change
    // `claim_identity_call` would be to edit this file, which is the very move the first
    // assertion exists to prevent one migration earlier.
    expect(gitBlobId(CLOCK_MIGRATION)).toBe(CLOCK_MIGRATION_BLOB);
  });

  it("keeps every claim_identity_call correction later than both frozen files", () => {
    const sql = (name: string) => readFileSync(path.join(MIGRATIONS, name), "utf8");
    const replaces = (text: string) =>
      /create\s+or\s+replace\s+function\s+public\.claim_identity_call\s*\(/i.test(text);

    // Not a count. A later correction is legitimate — it is the only legal way to change this
    // function — and an assertion that there is exactly one would make editing a frozen file the
    // path of least resistance, which is backwards.
    const corrections = readdirSync(MIGRATIONS)
      .filter((name) => name.endsWith(".sql") && replaces(sql(name)))
      .sort();

    expect(corrections[0]).toBe(CLAIMS_MIGRATION);
    expect(corrections[1]).toBe(CLOCK_MIGRATION);
    expect(corrections.length).toBeGreaterThanOrEqual(2);

    // Whichever migration is last wins at apply time, so that is the one the assertions below
    // have to describe.
    const latest = sql(corrections[corrections.length - 1]);

    // The fix itself, and stated so it cannot be satisfied with the fix reverted: `claimed_at`
    // must be written from the wall-clock reading, not merely be present in the column list
    // beside a `now()` in the VALUES row.
    expect(latest).toMatch(/v_created\s*:=\s*pg_catalog\.clock_timestamp\(\)/);
    expect(latest).toMatch(/claimed_at,\s*lease_expires_at/);
    expect(latest).toMatch(
      /v_created,\s*\n\s*v_created\s*\+\s*\(p_lease_seconds\s*\*\s*interval\s*'1 second'\)/,
    );
    // And the lease is derived from that same reading, with no `now()` left in the insert.
    expect(latest).not.toMatch(/pg_catalog\.now\(\)\s*\+\s*\(p_lease_seconds/);
    // Still unreachable from an end-user JWT.
    expect(latest).toMatch(
      /revoke execute on function public\.claim_identity_call\([\s\S]*?\)\s*from public, anon, authenticated;/,
    );
  });
});
