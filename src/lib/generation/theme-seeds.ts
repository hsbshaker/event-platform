/**
 * Theme seeds: a random starting point for an identity whose host left the look to us
 * (`event_identity_v6`, `event_identity_v7`; `docs/model-contracts.md §4.1`; owner decisions,
 * 2026-10-05 and 2026-10-06).
 *
 * Told "surprise me", the identity committed to a clear theme but chose the same one four times out
 * of four, because the call has no source of variety of its own. So, as with the suggested
 * rendering (`suggestRendering`), code draws one seed per new identity and the identity builds a
 * theme from its world, interpreted to suit the event. Only the identity reads the prompt, so the
 * seed is drawn before it and offered with every new identity; the identity uses it only when it
 * judges that the host left the look to us (`hostConcept: "open"`, decided first) and ignores it
 * whenever the host gave any creative cue.
 *
 * The seeds are everyday worlds, not designs: a word or two the model turns into a theme, never a
 * template, artwork or layout (`spec.md §32 #21`). The list stays broad and event-neutral, and
 * leaves out anything that naturally carries writing (a map, a book, a label, a sign, and boats,
 * balloons or fairground rides, which image models letter), a brand, a person, or a culture's or
 * religion's own symbols. Changing the list changes the identity call's
 * input, so it is an `EVENT_IDENTITY_PROMPT_VERSION` bump.
 */

export const THEME_SEEDS = [
  "an orchard in blossom",
  "a beehive",
  "an observatory",
  "a rose arbour",
  "kites on a windy hill",
  "a greenhouse",
  "a wildflower meadow",
  "a lighthouse",
  "a pottery studio",
  "an alpine lake",
  "tide pools",
  "a lily pond",
  "a vineyard",
  "warm loaves of bread",
  "seed heads and meadow grasses",
  "a moonlit garden",
  "a picnic blanket",
  "a desert in bloom",
  "the northern lights",
  "snowy pines",
  "an autumn wood",
  "a koi pond",
  "a butterfly garden",
  "seashells",
  "a coral reef",
  "a mountain cabin",
  "autumn leaves",
  "dragonflies",
  "origami birds",
  "mosaic tiles",
  "a herb garden",
  "a sunflower field",
  "lavender rows",
  "cherry blossoms",
  "a bamboo grove",
  "a crescent moon",
  "constellations",
  "a rainbow after rain",
  "umbrellas in the rain",
  "songbirds",
  "hummingbirds",
  "swans on a lake",
  "a fox in the woods",
  "rabbits in clover",
  "a hedgehog",
  "owls at dusk",
  "a deer in a glade",
  "whales",
  "jellyfish",
  "starfish",
  "sea glass",
  "river pebbles",
  "sand dunes",
  "a canyon at golden hour",
  "a waterfall",
  "fresh snowfall",
  "bicycles",
  "roller skates",
  "pastel macarons",
  "ice cream cones",
  "candy floss",
  "a chandelier",
  "knitted wool",
  "a patchwork quilt",
  "porcelain",
  "a terrarium",
  "a cactus garden",
  "mushrooms in moss",
  "acorns and oak leaves",
  "pears",
  "figs",
  "pomegranates",
  "strawberries",
  "cherries",
  "peaches",
  "blueberries",
  "watermelon",
  "a wheat field",
  "poppies",
  "peonies",
  "tulips",
  "magnolias",
  "wisteria",
  "ferns",
  "palm fronds",
  "peacock feathers",
  "goldfish",
  "ducklings",
  "lambs in spring",
  "morning dew on clover",
  "fireflies",
  "a treehouse",
  "an ice rink",
  "a garden gate",
  "a bird's nest",
  "dandelion seeds",
  "a still lake at dawn",
] as const;

export type ThemeSeed = (typeof THEME_SEEDS)[number];

/**
 * One seed drawn uniformly at random. `random` returns a number in [0, 1), like `Math.random`; it
 * is injected so tests are deterministic.
 */
export function drawThemeSeed(random: () => number): ThemeSeed {
  const draw = random();
  const index = Number.isFinite(draw)
    ? Math.min(THEME_SEEDS.length - 1, Math.max(0, Math.floor(draw * THEME_SEEDS.length)))
    : 0;
  return THEME_SEEDS[index];
}
