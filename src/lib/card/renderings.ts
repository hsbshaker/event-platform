/**
 * The rendering families an art brief chooses from (`artBrief.rendering`, `card_design_schema_v2`;
 * `docs/card-system.md §2.4`, `docs/model-contracts.md §5.1`).
 *
 * A family names how the artwork is made — a photograph, an editorial shoot, a 3D render, vector
 * or flat illustration, paint, line, collage or a design-led pattern. Owner decisions,
 * 2026-10-04, after the Phase 5 corpus came out nearly all watercolour: nine directions, chosen
 * from the host's cues with no watercolour reflex, and actively varied across generations — the
 * orchestration suggests one at random (`suggestRendering`) and the design follows it unless the
 * identity strongly points elsewhere. The design call reads `RENDERING_DESCRIPTION` in its runtime
 * catalog; the art prompt carries `RENDERING_ART_PROMPT` as its `Rendering:` line. Changing a
 * description is a `CARD_DESIGN_PROMPT_VERSION` bump; changing an art-prompt line is a
 * `CARD_ART_PROMPT_VERSION` bump; adding or removing a family is a `CARD_DESIGN_SCHEMA_VERSION`
 * bump.
 *
 * Photographic, editorial, 3D and collage artwork never shows people (owner decision); the
 * artwork inspection's `hasPerson` enforces it (`src/lib/generation/artwork.server.ts`).
 */

export const RENDERINGS = [
  "photographic",
  "editorial",
  "rendered-3d",
  "vector",
  "flat-illustration",
  "painterly",
  "line-art",
  "collage",
  "design-led",
] as const;

export type Rendering = (typeof RENDERINGS)[number];

/** The families whose artwork may not show a person, face, hands or body. */
export const PEOPLE_FREE_RENDERINGS: readonly Rendering[] = [
  "photographic",
  "editorial",
  "rendered-3d",
  "collage",
];

const NEVER_PEOPLE = " Never people.";
const NO_PEOPLE = " No people, faces, hands or bodies.";

const peopleFree = (r: Rendering, text: string, suffix: string) =>
  PEOPLE_FREE_RENDERINGS.includes(r) ? `${text}${suffix}` : text;

const DESCRIPTION: Readonly<Record<Rendering, string>> = {
  photographic:
    "Photographic / realistic: highly realistic imagery that could plausibly be photography — natural materials, realistic environments, believable lighting and real-world textures.",
  editorial:
    "Cinematic / editorial realism: photorealistic but highly art-directed — luxury advertising, fashion and hospitality editorials, magazine photography, sophisticated styled shoots.",
  "rendered-3d":
    "3D / CGI rendered: dimensional rendered imagery with intentional materials, lighting, depth and shadows — from sophisticated product-render aesthetics to playful dimensional characters, depending on the event.",
  vector:
    "Modern vector / graphic: crisp, polished graphic illustration using controlled shapes, geometry, clean edges and sophisticated composition. No painterly texture.",
  "flat-illustration":
    "Flat / playful illustration: clearly illustrated, expressive imagery with a contemporary, characterful or whimsical feel — playful without automatically feeling childish.",
  painterly:
    "Painterly / watercolour: organic hand-painted imagery, translucent colours, soft edges and artistic textures. One valid direction, never the default.",
  "line-art":
    "Line art / sketch / engraved: fine-line illustration, botanical drawing, architectural sketching, etching, engraving or toile-inspired imagery — minimalist-modern to traditional.",
  collage:
    "Collage / mixed media: layered photographic cutouts, illustrations, paper textures, torn edges and overlapping elements in an editorial mixed-media composition.",
  "design-led":
    "Pattern / design-led: repeating patterns, borders, geometry and colour blocking carry the card, and the card's own typography (set by code) is the focus — never letters, initials or monograms in the artwork.",
};

const ART_PROMPT: Readonly<Record<Rendering, string>> = {
  photographic:
    "Photographic realism: it should read as a real photograph — natural materials, a real environment, believable natural light and real-world textures. Not an illustration.",
  editorial:
    "Cinematic editorial realism: photorealistic and highly art-directed, like a luxury advertising campaign or a styled magazine shoot — considered set design, controlled light and rich materials. Not an illustration.",
  "rendered-3d":
    "A polished 3D/CGI render: dimensional forms with intentional materials, lighting, depth and soft shadows.",
  vector:
    "Modern vector graphic illustration: crisp, polished shapes, controlled geometry, clean edges and a sophisticated composition; no painterly or brush texture.",
  "flat-illustration":
    "Flat contemporary illustration: expressive, characterful and clearly drawn, with clean shapes and confident colour; playful but not childish.",
  painterly:
    "Painterly artwork: organic hand-painted watercolour or gouache, translucent colour, soft edges and artistic texture.",
  "line-art":
    "Line art: fine-line drawing, botanical or architectural sketching, etching, engraving or toile, with precise line work, optionally tinted.",
  collage:
    "Collage and mixed media: layered cutouts, illustration, paper textures, torn edges and overlapping elements, composed like an editorial mixed-media piece.",
  "design-led":
    "Design-led artwork: a repeating pattern, border, geometry or colour blocking is the whole picture, with no central scene; no letters, initials or monograms.",
};

/** The rendering catalog the card-design call is given (`src/lib/ai/requests.ts`). */
export const RENDERING_DESCRIPTION: Readonly<Record<Rendering, string>> = Object.fromEntries(
  RENDERINGS.map((r) => [r, peopleFree(r, DESCRIPTION[r], NEVER_PEOPLE)]),
) as Record<Rendering, string>;

/** The art prompt's `Rendering:` line per family (`card_art_v3`, `src/lib/card/art-prompt.ts`). */
export const RENDERING_ART_PROMPT: Readonly<Record<Rendering, string>> = Object.fromEntries(
  RENDERINGS.map((r) => [r, peopleFree(r, ART_PROMPT[r], NO_PEOPLE)]),
) as Record<Rendering, string>;

/**
 * The rendering the orchestration suggests to the card design (owner decision: "actively vary the
 * visual language across generations unless the user's description strongly points toward a
 * particular treatment"): drawn uniformly at random from the families this event's earlier
 * directions have not used, or from all nine once every one has been used. `random` returns a
 * number in [0, 1), like `Math.random`; it is injected so tests are deterministic.
 */
export function suggestRendering(
  random: () => number,
  usedByEarlierDirections: readonly Rendering[] = [],
): Rendering {
  const used = new Set<Rendering>(usedByEarlierDirections);
  const unused = RENDERINGS.filter((r) => !used.has(r));
  const pool = unused.length ? unused : RENDERINGS;
  const draw = random();
  const index = Number.isFinite(draw)
    ? Math.min(pool.length - 1, Math.max(0, Math.floor(draw * pool.length)))
    : 0;
  return pool[index];
}
