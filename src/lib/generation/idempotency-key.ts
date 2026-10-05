/**
 * The idempotency key of one user action that starts a generation (browser only): a fresh UUID per
 * action, kept in `sessionStorage` under `scope` so a reload during the call finds the same
 * generation rather than starting another (`spec.md §32 #21`, #46). `Try again` takes a fresh one.
 * Storage may be unavailable (private windows, blocked site data): then every call is fresh.
 */
export function idempotencyKey(scope: string, fresh: boolean): string {
  try {
    if (!fresh) {
      const stored = window.sessionStorage.getItem(scope);
      if (stored) return stored;
    }
    const key = crypto.randomUUID();
    window.sessionStorage.setItem(scope, key);
    return key;
  } catch {
    return crypto.randomUUID();
  }
}

/** Forgets the key once the start call has answered, so the next action begins afresh. */
export function forgetIdempotencyKey(scope: string): void {
  try {
    window.sessionStorage.removeItem(scope);
  } catch {
    // Best effort only.
  }
}
