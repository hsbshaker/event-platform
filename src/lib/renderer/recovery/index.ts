/**
 * The recovery adapter — one of exactly two production modules permitted to reach the legacy
 * fixture library (`docs/event-renderer-system.md §7.1`, `CLAUDE.md §5.1`; the other is
 * `../few-shot`, for the composition prompt's rotated examples).
 *
 * It implements the two recovery roles §7.1 permits and nothing else:
 *
 * 1. the deterministic repair macros §3 specifies, reached only by `repair()` and only for the
 *    coverage defects that cannot be repaired from the tree itself;
 * 2. the terminal fallback, reachable only after the one retry §3 and §5 allow has been spent.
 *
 * This is not a concept-generation path. Nothing here selects a composition for an event, ranks
 * fixtures, or is consulted on a healthy generation. The public surface deliberately does not
 * re-export the library: the library's tables, `page()` and its keys stay behind this boundary,
 * so the two adapters cannot be collapsed into a general-purpose library API.
 */

export { libraryMacros } from "./macros";
export {
  terminalFallback,
  type CollisionAttempt,
  type FallbackRefusal,
  type FallbackTelemetry,
  type SchemaAttempt,
  type TerminalFallbackReason,
  type TerminalFallbackRequest,
  type TerminalFallbackResult,
} from "./fallback";
