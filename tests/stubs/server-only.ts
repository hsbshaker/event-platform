/**
 * Vitest stands in for the `server-only` package, which throws by design when it is imported
 * outside a React Server Component. Unit tests exercise those modules directly in Node, where
 * the guard has nothing to protect; the real package still guards the application build.
 */
export {};
