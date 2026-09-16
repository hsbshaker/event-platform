import { describe, expect, it } from "vitest";

import { DEFAULT_LEASE_SECONDS, LEASE_FLOOR_SECONDS } from "./identity-spend";
import { IDENTITY_USER_DEADLINE_MS } from "./identity-orchestrator";

/**
 * The user-facing deadline and the financial lease are different concepts, and this is where that
 * stops being a comment.
 *
 * The lease bounds how long one paid call may be believed to be in flight before its outcome is
 * treated as unknown; it is derived from the provider boundary's worst case and is measured in
 * minutes. Using it as a spinner duration would leave a host watching a progress indicator for a
 * quarter of an hour, which is what `docs/phase-4b-plan.md §J` and the T10 brief both refuse.
 *
 * So the deadline must stay well inside the lease — and it is pinned to it, because the failure
 * this guards against is somebody raising the lease for a sound financial reason and silently
 * lengthening the wait a host is shown.
 *
 * Acceptance criteria: N/A — test-only. `docs/phase-4b-plan.md §A.5`, `§J`.
 */
describe("the product deadline is not the financial lease", () => {
  it("resolves the host's wait long before the lease that protects the spend", () => {
    expect(IDENTITY_USER_DEADLINE_MS).toBeLessThan(LEASE_FLOOR_SECONDS * 1000);
    expect(IDENTITY_USER_DEADLINE_MS).toBeLessThan(DEFAULT_LEASE_SECONDS * 1000);
    // Comfortably inside, not marginally: the lease is over seven times the deadline today, and a
    // change that brought them close together would mean one of the two had lost its meaning.
    expect(DEFAULT_LEASE_SECONDS * 1000).toBeGreaterThan(IDENTITY_USER_DEADLINE_MS * 5);
  });

  it("gives a waiting host a destination state at roughly the ninety-second scale", () => {
    // `§J` puts the median call near thirty seconds. The deadline is a product decision about how
    // long "still working" stays an honest thing to say, not a timeout: crossing it abandons no
    // call and buys no second one.
    expect(IDENTITY_USER_DEADLINE_MS).toBeGreaterThanOrEqual(60_000);
    expect(IDENTITY_USER_DEADLINE_MS).toBeLessThanOrEqual(120_000);
  });
});
