/**
 * The app tokens a link-preview image is drawn with (`docs/design-system.md §6`, §10.20, §15.7;
 * Revision 5, Lantern): the house background a card sits on, and the house envelope on its dusk
 * field — its lit paper, light pool, seal, radius and title type. An image cannot read CSS custom
 * properties, so the values are restated here, and `house-style.test.ts` holds them equal to
 * `src/styles/app-tokens.css` — change a token there and the test names what to change here. App
 * chrome only: nothing here comes from a card.
 */

export const HOUSE = {
  /** `--app-bg`: the page background a card preview sits on. */
  bg: "#eef0f8",
  /** `--dusk`: the field the envelope sits on (§5.3). */
  dusk: "#1f2a55",
  /** `--app-lit`: the envelope's lit inside and the flap's shadow line. */
  lit: "#fdebcb",
  /**
   * `--app-surface-lit-gradient`: lit paper, the envelope's pocket and flap. A CSS radial gradient
   * `rx` × `ry` of its box (an ellipse, as fractions of its width and height) centred at the top
   * middle, with these stops.
   */
  litGradient: {
    rx: 1.2,
    ry: 0.85,
    stops: [
      { color: "#fffdf9", at: 0 },
      { color: "#fff8ec", at: 0.58 },
      { color: "#fdf0da", at: 1 },
    ],
  },
  /**
   * `--dusk-pool`: the light pool under the envelope (§6.5), `closest-side` from `rgb` at
   * `opacity` to transparent.
   */
  duskPool: { rgb: [255, 196, 112], opacity: 0.24 },
  /** `--app-action`: the seal's fill (`BrandSeal`). */
  action: "#f4a43a",
  /** `--app-action-text`: the seal's "R". */
  actionText: "#1b1c2b",
  /** `--app-text`: the title on the envelope. */
  text: "#1b1c2b",
  /** `--radius-sm`, px: the envelope's corners (`rounded-sm`). */
  radiusSm: 8,
  /** `--shadow-soft`: the seal's lift (`BrandSeal`), `0 8px 24px rgba(15, 18, 45, 0.07)`. */
  shadowSoft: { y: 8, blur: 24, color: "#0f122d", opacity: 0.07 },
  /** `--type-heading-md` and `--tracking-heading-md`: the envelope title. */
  headingMd: { weight: 500, size: 21, lineHeight: 28, trackingEm: 0 },
  /**
   * `--type-heading-lg` and `--tracking-heading-lg`: the seal's "R" (`BrandSeal` size `lg`), set
   * bold (`font-bold`), so drawn at 700.
   */
  headingLg: { weight: 500, size: 26, lineHeight: 32, trackingEm: -0.005 },
  /** The seal's "R", px: `BrandSeal` `lg` is `h-12 w-12` (Tailwind's 3rem, 48px) and bold. */
  seal: { diameter: 48, weight: 700 },
  /** `--width-narrow`, px. */
  widthNarrow: 560,
  /** `--space-4`, px: the title's side padding (`px-4`) and the space under the title area. */
  space4: 16,
  /** `--space-8`, px: from the flap's point to the title area (`calc(40% + var(--space-8))`). */
  space8: 32,
} as const;
