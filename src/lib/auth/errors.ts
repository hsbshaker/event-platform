/** Thrown when no authenticated user is present. Map to 401 / sign-in redirect at the edge. */
export class UnauthorizedError extends Error {
  readonly status = 401 as const;
  constructor(message = "Sign in required") {
    super(message);
    this.name = "UnauthorizedError";
  }
}

/** Thrown when the user is authenticated but not allowed. Map to 403 (or 404 to avoid leaking existence). */
export class ForbiddenError extends Error {
  readonly status = 403 as const;
  constructor(message = "Not allowed") {
    super(message);
    this.name = "ForbiddenError";
  }
}

/** Thrown when a rate limit is exceeded. Map to 429. */
export class RateLimitedError extends Error {
  readonly status = 429 as const;
  constructor(
    readonly bucket: string,
    message = "Too many requests",
  ) {
    super(message);
    this.name = "RateLimitedError";
  }
}
