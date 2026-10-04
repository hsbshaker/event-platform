/**
 * The app tokens a link-preview image is drawn with (`docs/design-system.md §6`, §15.7): the
 * house background and the house envelope's colours, radius, shadow and title type. An image
 * cannot read CSS custom properties, so the values are restated here, and
 * `house-style.test.ts` holds them equal to `src/styles/app-tokens.css` — change a token there and
 * the test names what to change here. App chrome only: nothing here comes from a card.
 */

export const HOUSE = {
  /** `--app-bg`: the page background every preview sits on. */
  bg: "#f6f5f1",
  /** `--app-surface-subtle`: the envelope's front fold. */
  surfaceSubtle: "#fbfaf7",
  /** `--app-surface-muted`: the envelope body and flap. */
  surfaceMuted: "#efeee9",
  /** `--app-text`: the title on the envelope. */
  text: "#1d211e",
  /** `--app-border-strong`: the envelope's border and the flap's edge. */
  borderStrong: "#cfccc2",
  /** `--radius-lg`, px. */
  radiusLg: 16,
  /** `--shadow-soft`: `0 8px 24px rgba(20, 28, 24, 0.06)`. */
  shadowSoft: { y: 8, blur: 24, color: "#141c18", opacity: 0.06 },
  /** `--type-heading-md` and `--tracking-heading-md`: the envelope title. */
  headingMd: { weight: 650, size: 20, lineHeight: 26, trackingEm: -0.02 },
  /** `--width-narrow`, px. */
  widthNarrow: 560,
  /** `--space-4`, px: the title's side padding (`px-4`). */
  space4: 16,
  /** `--space-6`, px: the space under the title area (`bottom: var(--space-6)`). */
  space6: 24,
} as const;
