/**
 * The entry check for card text the host types (`spec.md §31`, "Card design, artwork and
 * compiler": "slot limits are enforced at entry"; owner decision 2 in `docs/CHANGELOG-v7.md`,
 * "Phase 4 — fitting every detail on every card"; `docs/card-system.md §2.5`).
 *
 * `validateCardText(slot, value)` refuses, with a plain message for beside the field
 * (`docs/design-system.md §11.2`):
 * 1. characters a curated face for the slot cannot draw (an emoji, an alphabet the card fonts do
 *    not cover) — the title is set in the pairings' display faces, the facts in their body faces;
 * 2. text over the slot's limit (`WORDING_LIMITS.title`, `FACT_ENTRY_LIMITS`);
 * 3. a word too wide for one line of the narrowest zone of the layout set at the slot's minimum
 *    size, in any curated pairing. A word may break after a hyphen between letters
 *    (`text/line-break.ts`), so each piece between such hyphens is what must fit.
 *
 * Pure and isomorphic: the same check runs in the details form and in its server action, which
 * is the authority. It knows the fonts through `entry-glyphs.json` (per role: the characters every
 * face can draw, and each face's advances at the minimum size), generated from the font files and
 * checked against them by `entry-glyphs.test.ts`, so the browser never loads a font shaper.
 * Accepted text within these bounds fits every layout × shape × pairing (the layout fixtures).
 */

import { CARD_LAYOUT_IDS, CARD_LAYOUTS, zoneFor } from "./layouts";
import ENTRY_GLYPHS from "./entry-glyphs.json";
import { breakWidth } from "./fit";
import { FACT_ENTRY_LIMITS, WORDING_LIMITS } from "./slots";
import { BREAK_CHARACTER, BREAK_RUN, wordPieces } from "./text/line-break";

/** The card slots a host types into: a host-supplied title, and the free-text facts. */
export const CARD_ENTRY_SLOTS = ["title", "babyName", "hosts", "venue"] as const;
export type CardEntrySlot = (typeof CARD_ENTRY_SLOTS)[number];

/** Most characters each entry slot takes. */
export const CARD_ENTRY_LIMITS: Readonly<Record<CardEntrySlot, number>> = {
  title: WORDING_LIMITS.title.max,
  ...FACT_ENTRY_LIMITS,
};

type Role = "display" | "body";

const ROLE_OF: Readonly<Record<CardEntrySlot, Role>> = {
  title: "display",
  babyName: "body",
  hosts: "body",
  venue: "body",
};

interface FaceGlyphs {
  /** Each character's advance at the role's minimum size, card units × 100, rounded up. */
  advances: number[];
  /** The most any character after it kerns beyond both advances, card units × 100, rounded up. */
  kernAfter: number[];
}

interface RoleGlyphs {
  /** Every character each face of the role can draw, in code-point order. */
  chars: string;
  faces: Record<string, FaceGlyphs>;
}

interface RoleIndex {
  index: Map<string, number>;
  faces: [string, FaceGlyphs][];
}

function indexRoles(): Readonly<Record<Role, RoleIndex>> {
  const roles = (ENTRY_GLYPHS as unknown as { roles: Partial<Record<Role, RoleGlyphs>> }).roles;
  const build = (role: Role): RoleIndex => {
    const glyphs = roles[role];
    if (!glyphs) throw new Error(`entry-glyphs.json has no ${role} role`);
    const chars = [...glyphs.chars];
    const faces = Object.entries(glyphs.faces);
    if (
      faces.length === 0 ||
      faces.some(
        ([, f]) => f.advances.length !== chars.length || f.kernAfter.length !== chars.length,
      )
    ) {
      throw new Error(`entry-glyphs.json: the ${role} faces do not match its characters`);
    }
    return { index: new Map(chars.map((ch, i) => [ch, i])), faces };
  };
  return { display: build("display"), body: build("body") };
}

let roleIndex: Readonly<Record<Role, RoleIndex>> | null = null;
function roles(): Readonly<Record<Role, RoleIndex>> {
  roleIndex ??= indexRoles();
  return roleIndex;
}

/** The width a word may take: one line of the layout set's narrowest zone, at break width. */
export const NARROWEST_ZONE_WIDTH = Math.min(
  ...CARD_LAYOUT_IDS.flatMap((layout) =>
    CARD_LAYOUTS[layout].shapes.map((shape) => zoneFor(layout, shape).width),
  ),
);

/**
 * An upper bound on a word's width in each face of the role at the minimum size, in card units:
 * its characters' advances, plus after each but the last the most any character kerns away from
 * it (`entry-glyphs.test.ts` proves it against shaping). Null when the role cannot draw one of its
 * characters.
 */
export function entryWordWidths(role: Role, word: string): Record<string, number> | null {
  const { index, faces } = roles()[role];
  const at: number[] = [];
  for (const ch of word) {
    const i = index.get(ch);
    if (i === undefined) return null;
    at.push(i);
  }
  return Object.fromEntries(
    faces.map(([family, { advances, kernAfter }]) => {
      let sum = 0;
      at.forEach((i, k) => {
        sum += advances[i] + (k < at.length - 1 ? kernAfter[i] : 0);
      });
      return [family, sum / 100];
    }),
  );
}

export type CardTextRefusal = "unsupported-characters" | "too-long" | "word-too-wide";

export type CardTextCheck =
  | { ok: true }
  | {
      ok: false;
      reason: CardTextRefusal;
      /** Plain words for beside the field. */
      message: string;
      /** The characters the card cannot draw, as the host sees them (`unsupported-characters`). */
      characters?: string[];
      /** The piece of a word that is too wide (`word-too-wide`). */
      word?: string;
    };

const graphemes = new Intl.Segmenter("en", { granularity: "grapheme" });

function list(items: readonly string[]): string {
  if (items.length === 1) return items[0];
  return `${items.slice(0, -1).join(", ")} or ${items[items.length - 1]}`;
}

/** Check one entry for the card (see the module comment). Empty text is accepted. */
export function validateCardText(slot: CardEntrySlot, value: string): CardTextCheck {
  const text = value.trim();
  if (text === "") return { ok: true };
  const role = ROLE_OF[slot];
  const { index } = roles()[role];

  // 1. Characters, as the host sees them: a grapheme is refused if any part of it is.
  const unsupported: string[] = [];
  for (const { segment } of graphemes.segment(text)) {
    // Only break characters are skipped: other whitespace (a no-break space) is drawn, so a face
    // must have it like any other character.
    if ([...segment].every((ch) => BREAK_CHARACTER.test(ch))) continue;
    const drawable = [...segment].every((ch) => BREAK_CHARACTER.test(ch) || index.has(ch));
    if (!drawable && !unsupported.includes(segment)) unsupported.push(segment);
  }
  if (unsupported.length > 0) {
    const shown = unsupported.slice(0, 3);
    const more = unsupported.length > shown.length ? " and some other characters" : "";
    return {
      ok: false,
      reason: "unsupported-characters",
      characters: unsupported,
      message: `The card can't show ${list(shown)}${more} — please remove ${unsupported.length === 1 ? "it" : "them"}.`,
    };
  }

  // 2. Length.
  const limit = CARD_ENTRY_LIMITS[slot];
  if (text.length > limit) {
    return {
      ok: false,
      reason: "too-long",
      message: `The card has room for ${limit} characters here — please shorten this to fit.`,
    };
  }

  // 3. Every unbreakable piece fits one line of the narrowest zone, in every face.
  const room = breakWidth(NARROWEST_ZONE_WIDTH);
  for (const word of text.split(BREAK_RUN)) {
    for (const piece of wordPieces(word)) {
      const widths = entryWordWidths(role, piece);
      if (widths === null) continue; // unreachable: every character of a piece was checked above
      if (Object.values(widths).some((w) => w > room)) {
        return {
          ok: false,
          reason: "word-too-wide",
          word: piece,
          message: `“${piece}” is too long for one line of the card — please shorten it, or add a space or a hyphen.`,
        };
      }
    }
  }
  return { ok: true };
}
