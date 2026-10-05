import { DISPLAY_NAME_MAX } from "./limits";

/**
 * The name on a party's invitation when the host leaves it blank (`spec.md §12.3`: "RSVP UX makes
 * it obvious who is included"). Pure and deterministic, shared by the party editor (which shows
 * the name it will use), the CSV import and the server.
 *
 * - one guest: their name;
 * - two: `Ana & Luis Garcia` when their names end in the same word, else `Ana Garcia & Luis Diaz`;
 * - three or more: `The Garcia family` when every adult's name ends in the main contact's last
 *   word, else `<main contact> & guests`.
 *
 * Names are compared on their last word, ignoring case; a one-word name has no family name to
 * share. A result longer than the invitation-name limit falls back to `<main contact> & guests`
 * (a guest's name is at most 80 characters, so that always fits).
 */

export interface NamedGuest {
  name: string;
  type: "adult" | "child";
}

/** A name as stored: trimmed, inner runs of whitespace made one space. */
export function cleanName(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}

function words(name: string): string[] {
  return cleanName(name).split(" ").filter(Boolean);
}

/** The family name a name ends in, or null for a one-word name. */
function familyName(name: string): string | null {
  const w = words(name);
  return w.length >= 2 ? w[w.length - 1] : null;
}

function sameWord(a: string | null, b: string | null): boolean {
  return a !== null && b !== null && a.toLocaleLowerCase("en-US") === b.toLocaleLowerCase("en-US");
}

export function deriveDisplayName(guests: readonly NamedGuest[]): string {
  const named = guests.map((g) => ({ ...g, name: cleanName(g.name) })).filter((g) => g.name);
  if (named.length === 0) return "";
  const main = named[0].name;
  const fallback = `${main} & guests`;

  let derived: string;
  if (named.length === 1) {
    derived = main;
  } else if (named.length === 2) {
    const [a, b] = named.map((g) => g.name);
    const family = familyName(a);
    if (sameWord(family, familyName(b))) {
      const given = (name: string) => words(name).slice(0, -1).join(" ");
      derived = `${given(a)} & ${given(b)} ${words(b).at(-1)}`;
    } else {
      derived = `${a} & ${b}`;
    }
  } else {
    const family = familyName(main);
    const adults = named.filter((g) => g.type === "adult");
    derived =
      family !== null && adults.every((g) => sameWord(familyName(g.name), family))
        ? `The ${family} family`
        : fallback;
  }
  return derived.length <= DISPLAY_NAME_MAX ? derived : fallback;
}
