/**
 * The one place a personal invitation link's path is built (`spec.md §12.5`). The guest route
 * that resolves it is a later slice. Kept apart from `personal-link.ts` (which holds the keyed
 * derivation) so browser code can build a path without the crypto.
 */
export function personalLinkPath(token: string): string {
  return `/g/${token}`;
}
