/**
 * The language card text is shaped in (`metrics.ts`) and the card component declares as `lang`
 * (`src/components/card/InvitationCard.tsx`). Set explicitly so `locl` substitutions and case
 * mapping cannot follow a runtime's or browser's locale: the server and every browser shape alike.
 *
 * Its own module, free of the shaper, so the card component can import it without bundling
 * HarfBuzz into every page that shows a card.
 */
export const SHAPING_LANGUAGE = "en";
