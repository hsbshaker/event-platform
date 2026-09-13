/** Joins class name fragments, skipping falsy values. Not a styling system of its own. */
export function cx(...values: Array<string | false | null | undefined>): string {
  return values.filter(Boolean).join(" ");
}
