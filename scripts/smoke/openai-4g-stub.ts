/**
 * An offline stand-in for the whole `openai` package, so `scripts/smoke/phase4g-e2e.smoke.ts` can
 * be rehearsed end to end at zero cost, starting from `MEDITERRANEAN_SHOWER_PROMPT` — a raw host
 * prompt — rather than a frozen `EventIdentity` fixture.
 *
 * `scripts/smoke/openai-full-stub.ts` does the same job for the Phase 4E batch, which starts
 * downstream of interpretation. This file follows its approach and its four-call dispatch table,
 * and adds the one genuinely new call 4G exercises: `src/lib/ai/openai/event-identity.ts` sends
 * `text.format = {type: "json_schema", name: "event_identity_result", strict: true, schema}`,
 * which is the discriminator this file adds to the three the 4E stub already handles
 * (`concept_premise_set`, `design_intent_response`, and bare `{type: "json_object"}` for
 * Composition). `scripts/smoke/vitest.e2e-4g.config.mts` aliases the `openai` package to this
 * module when `VITEST_SMOKE_OPENAI_STUB` points at it.
 *
 * # What a green rehearsal proves, and what it does not
 *
 * The same as `openai-full-stub.ts` says, plus one thing: that the clarification loop in
 * `runEventIdentity` actually terminates against a real boundary answer, because this stub tells
 * a first call from a rerun the same way production distinguishes them — see below — rather than
 * by counting invocations. It proves nothing about interpretive quality: the identity below was
 * written by hand to satisfy `eventIdentitySchema`, not authored by a model reading the prompt.
 *
 * # Telling a first EventIdentity call from a clarification rerun
 *
 * `src/lib/ai/openai/event-identity-input.ts` emits a `clarificationPreamble` block — containing
 * its own `ASKED:` marker — only when `answers` is non-empty; with no answers the assembled
 * message is byte-identical to the no-clarification case. So the presence of that marker in the
 * request's user text is exactly the signal `assembleEventIdentityUserMessage` designed to be
 * load-bearing, and reading it is what lets this stub answer "first call" on one request and
 * "rerun after an answer was recorded" on the next without any invocation counter that could bind
 * an answer to the wrong attempt.
 *
 * # Driving the two clarification branches
 *
 *   SMOKE_4G_CLARIFY=none | creative | boundary   (default: none)
 *
 * - `none` — the identity is returned authoritative on the first call. The harness's
 *   clarification loop never opens.
 * - `creative` — the first call returns one non-gating creative question with a `You decide`
 *   defer option. A creative question never blocks (`spec.md §7.6b`), so
 *   `identity.hasAuthoritativeIdentity` is already true and the harness's loop condition never
 *   opens either — the question is left visible and unanswered, which is the "watching rather
 *   than answering" behaviour the harness's own header documents.
 * - `boundary` — the first call returns exactly one gating boundary question (two options, no
 *   defer — a boundary question offers none, `spec.md §7.6b #4`), which blocks. Once the harness
 *   records an answer and reruns, the request carries `answers` and this stub reads the `ASKED:`
 *   marker as proof of that, and returns an identity with `clarification.needed = false` so the
 *   loop terminates and the identity becomes authoritative.
 *
 * # Driving artwork reachability
 *
 *   SMOKE_4G_ART=0 | 1   (default: 0)
 *
 * The Phase 4E batch produced zero `Artwork` nodes; a 4G rehearsal that also produced none would
 * never exercise the artwork half. With `1`, two of the three directions ask for ornament
 * (`restrained` with a named vocabulary, and `decorative`) exactly as `decideArtwork`
 * (`src/lib/renderer/compile/artwork-decision.ts`) reads those two `DesignIntent` fields, and this
 * stub places `Artwork` leaves into the tree only once the composition request's own capability
 * block says `artwork` is enabled for that sibling — never forced onto a sibling the real
 * optionality logic did not grant it to. With `0` (the default), every direction asks for none, so
 * no sibling is ever granted the capability and no `Artwork` node is ever placed. This is
 * rehearsal-only: the live run reads `OPENAI_API_KEY` and calls the real provider, which decides
 * artwork for itself.
 */
import type { ConceptPremiseSet } from "@/lib/ai/concept-premise/contract";
import {
  ATTRACTIVE_TOKENS,
  repair,
  type AnyNode,
  type Capabilities,
} from "@/lib/renderer/composition";
import type { CompositionTree, Section } from "@/lib/renderer/composition/nodes";
import type { Anchor, ArtworkRole, MotifId } from "@/lib/renderer/composition/tokens";
import { hasTextDescendant } from "@/lib/renderer/composition/walk";
import { A1_SITES, page } from "@/lib/renderer/library";
import { neutralize } from "@/lib/renderer/planner";

import ArtworkStub from "./openai-artwork-stub";

/* ------------------------------------------------------------------ env knobs, read once */

type ClarifyMode = "none" | "creative" | "boundary";

function clarifyMode(): ClarifyMode {
  const raw = process.env.SMOKE_4G_CLARIFY ?? "none";
  if (raw === "none" || raw === "creative" || raw === "boundary") return raw;
  throw new Error(`stub: SMOKE_4G_CLARIFY "${raw}" is not none, creative or boundary`);
}

function artworkRequested(): boolean {
  const raw = process.env.SMOKE_4G_ART ?? "0";
  if (raw === "0" || raw === "1") return raw === "1";
  throw new Error(`stub: SMOKE_4G_ART "${raw}" is not 0 or 1`);
}

/* ------------------------------------------------------------------ the three premises */

/**
 * Three premises for the Mediterranean shower brief, written against
 * `src/lib/ai/concept-premise/validate.ts`: every asserted specific is drawn from
 * `MEDITERRANEAN_SHOWER_PROMPT`'s own vocabulary, nothing mid-sentence is capitalised as a proper
 * noun the brief did not supply, and each `grounding` entry shares at least two content words with
 * the brief. The three registers are genuinely different and the three organizing ideas share
 * almost no content words, which is what the set validator gates on.
 */
const PREMISE_SET: ConceptPremiseSet = {
  premises: [
    {
      title: "Whitewashed Courtyard",
      foregrounds: "The elegant, relaxed register the host asked for, held with real restraint.",
      organizingIdea:
        "Warm ivory carries almost the whole page, with climbing greenery appearing once, well " +
        "placed, the way a courtyard keeps most of its walls bare and lets one vine do the work.",
      experience:
        "Arriving feels like stepping into a quiet whitewashed courtyard in the afternoon: calm, " +
        "uncluttered, with warmth in the light rather than in decoration.",
      distinctFrom:
        "Of the three, this one is the most restrained: no tile pattern, no repeated ornament, " +
        "just ivory, light and one climbing detail.",
      designConsequences: [
        "Type and open space carry the welcome; pattern appears nowhere.",
        "One climbing-greenery motif, used once, never repeated.",
        "Generous space around the first screen's dominant line.",
      ],
      grounding: [
        "The host asked for it elegant and relaxed, not overly formal.",
        "The host named climbing greenery among the garden's features.",
      ],
      register: { pace: "measured", presence: "understated", surfaceRichness: "bare" },
    },
    {
      title: "Tiled and Lemon-Lit",
      foregrounds: "The tiled courtyard and lemons the host named as what she loves.",
      organizingIdea:
        "A tiled pattern and a lemon motif, each placed once and given room, the way a real " +
        "courtyard keeps its patterned tile to the floor and its citrus to a single tree.",
      experience:
        "Arriving feels like standing on old tile under a lemon tree in the warm afternoon light " +
        "faded blue and ivory make together.",
      distinctFrom:
        "Of the three, this one is the only one that names a pattern at all, and it uses exactly " +
        "one, kept to a single surface.",
      designConsequences: [
        "One tile-like pattern motif, confined to a single surface.",
        "One lemon-and-greenery motif elsewhere on the page, never doubled up.",
        "Warm ivory and faded blue balanced rather than either one dominating.",
      ],
      grounding: [
        "The host said she loves old-world Mediterranean gardens, lemons and tiled courtyards.",
        "The host named warm ivory and faded blue as the palette she wants.",
      ],
      register: { pace: "lingering", presence: "poised", surfaceRichness: "considered" },
    },
    {
      title: "Afternoon in the Garden",
      foregrounds: "The gathering itself: an afternoon shower at home for around sixty people.",
      organizingIdea:
        "Layered climbing greenery and tile pattern across more than one surface, reading the way " +
        "a garden full of guests reads before anyone has spoken a word: full, warm, alive.",
      experience:
        "Arriving feels like walking into a garden already filling with an afternoon crowd: " +
        "layered green, warm light, plenty to look at and a clear path through it.",
      distinctFrom:
        "Of the three, this one spends the most on ornament: pattern on more than one surface " +
        "and greenery layered rather than singular.",
      designConsequences: [
        "Pattern on more than one surface, not confined to one.",
        "Climbing greenery layered rather than a single accent.",
        "A fuller, livelier first screen, for an afternoon with sixty guests.",
      ],
      grounding: [
        "The host said they're doing an afternoon shower at home, around sixty people.",
        "The host named climbing greenery and lemons among the garden character she loves.",
      ],
      register: { pace: "propulsive", presence: "commanding", surfaceRichness: "layered" },
    },
  ],
  constrainedAxes: [],
};

/* ------------------------------------------------------------------ the three directions */

interface ArtworkSlot {
  readonly section: Section["kind"];
  readonly role: ArtworkRole;
  readonly anchor: Anchor;
}

interface Direction {
  readonly ornament: "none" | "restrained" | "decorative";
  readonly motifs: readonly MotifId[];
  readonly density: "compact" | "balanced" | "spacious";
  readonly asymmetry: "symmetric" | "gentle" | "strong";
  readonly rhythm: "continuous" | "alternating" | "punctuated";
  readonly sectionContrast: "low" | "moderate" | "high";
  /** 3–5 unique uppercase `#RRGGBB`; `dominant` is the first. Rooted in ivory/blue/olive/terracotta. */
  readonly palette: readonly string[];
  /** An `A1_SITES` row id. */
  readonly site: string;
  readonly artwork: readonly ArtworkSlot[];
  readonly cardDescription: string;
}

/**
 * `ornament` and `motifs` here are the two fields `decideArtwork` reads
 * (`src/lib/renderer/compile/artwork-decision.ts`): `ornament: "none"` → 0 slots offered,
 * `restrained` with no motifs → 0 (`no_visual_vocabulary`), `restrained` with motifs → 1
 * (`restrained_with_vocabulary`), `decorative` → 2. With `SMOKE_4G_ART=0` every direction below is
 * `ornament: "none"`, so no sibling is ever offered the primitive and `artwork` never appears in
 * any composition request's enabled-capability line. With `SMOKE_4G_ART=1`, the second and third
 * directions ask for it, and `artwork` in each `Direction` names where the leaf goes once (and
 * only once) the composition request's own capability block confirms it was granted.
 *
 * `site` rows and the `withArtwork` treatment are the same ones `openai-full-stub.ts` uses and
 * validated: `01` is a bare hero with nowhere for a decoration slot until wrapped, `06`'s hero is
 * already an `Overlay`, and `03` gives two sections to carry two slots.
 */
function directions(artOn: boolean): readonly Direction[] {
  return [
    {
      ornament: "none",
      motifs: [],
      density: "spacious",
      asymmetry: "symmetric",
      rhythm: "continuous",
      sectionContrast: "low",
      palette: ["#F4EEDD", "#2F3A2C", "#7C93A6"],
      site: "01",
      artwork: [],
      cardDescription:
        "Warm ivory and open space carry the welcome, with one climbing detail and nothing else " +
        "applied to the surface.",
    },
    {
      ornament: artOn ? "restrained" : "none",
      motifs: artOn ? (["botanical"] as const) : [],
      density: "balanced",
      asymmetry: "gentle",
      rhythm: "alternating",
      sectionContrast: "moderate",
      palette: ["#7C93A6", "#F4EEDD", "#C99A3E", "#5C6B4A"],
      site: "06",
      artwork: artOn ? [{ section: "hero", role: "anchor", anchor: "top-end" }] : [],
      cardDescription:
        "One tiled pattern and one lemon motif, each placed once, against a balanced ivory and " +
        "faded-blue ground.",
    },
    {
      ornament: artOn ? "decorative" : "none",
      motifs: artOn ? (["botanical", "linen"] as const) : [],
      density: "compact",
      asymmetry: "strong",
      rhythm: "punctuated",
      sectionContrast: "high",
      palette: ["#5C6B4A", "#F4EEDD", "#C99A3E", "#7C93A6", "#2F3A2C"],
      site: "03",
      artwork: artOn
        ? [
            { section: "hero", role: "anchor", anchor: "top-end" },
            { section: "details", role: "atmosphere", anchor: "center" },
          ]
        : [],
      cardDescription:
        "Layered greenery and pattern across more than one surface, the way a full afternoon " +
        "garden reads at once.",
    },
  ];
}

/**
 * `asymmetry`, not `ornament`, identifies a sibling in a **composition** request.
 *
 * `ornament` is what `SMOKE_4G_ART` varies, so under `SMOKE_4G_ART=0` all three directions share
 * `ornament: "none"` and it stops being injective. Block 3 of the composition prompt never carries
 * the premise title (`docs/model-contracts.md §6.2` — the composition call is not shown
 * `presentation`), so this reads back a field that is always distinct instead:
 * `symmetric`/`gentle`/`strong` are three different directions' asymmetry choices in every mode.
 */
const ASYMMETRY_BY_DIRECTION = ["symmetric", "gentle", "strong"] as const;

/** Premise title → planned sibling index, for the **DesignIntent** request, which does carry the
 * premise (`docs/model-contracts.md §6.1` block 1 — the brief and this concept's own premise). */
const SIBLING_BY_TITLE = new Map(PREMISE_SET.premises.map((p, index) => [p.title, index]));

/* ------------------------------------------------------------------ reading the request */

type Json = Record<string, unknown>;

function asObject(value: unknown): Json {
  return value && typeof value === "object" ? (value as Json) : {};
}

function enumAt(schema: Json, path: readonly string[]): readonly string[] {
  let node = schema;
  for (const key of path) node = asObject(asObject(node.properties)[key]);
  const values = node.enum ?? asObject(node.items).enum;
  return Array.isArray(values) ? (values as unknown[]).filter((v) => typeof v === "string") : [];
}

function pick(offered: readonly string[], preferred: readonly string[]): string {
  const hit = preferred.find((value) => offered.includes(value));
  if (hit !== undefined) return hit;
  if (offered.length === 0) throw new Error("stub: the schema offered no value to choose from");
  return offered[0];
}

/** The user-authored text of a Responses request, joined. Other roles are ignored. */
function userText(request: Json): string {
  const input = Array.isArray(request.input) ? request.input : [];
  return input
    .map((message) => asObject(message))
    .filter((message) => message.role === "user")
    .map((message) =>
      typeof message.content === "string" ? message.content : JSON.stringify(message.content),
    )
    .join("\n");
}

function siblingOfDesignIntent(request: Json): number {
  const text = userText(request);
  const title = [...SIBLING_BY_TITLE.keys()].find((value) => text.includes(value));
  if (title === undefined) {
    throw new Error("stub: no premise title in the DesignIntent request; premises out of sync");
  }
  return SIBLING_BY_TITLE.get(title)!;
}

function readCompositionRequest(request: Json): { sibling: number; capabilities: Capabilities } {
  const text = userText(request);
  const sibling = ASYMMETRY_BY_DIRECTION.findIndex((value) => text.includes(`asymmetry ${value}`));
  if (sibling < 0) {
    throw new Error(
      "stub: no known asymmetry value in the composition request's DesignIntent block",
    );
  }
  const at = text.indexOf("Enabled for this event:");
  const line = at < 0 ? "" : text.slice(at).split("\n")[0];
  const enabled = new Set(
    line
      .slice(line.indexOf(":") + 1)
      .split(",")
      .map((label) => label.trim()),
  );
  const has = (label: string) => enabled.has(label);
  return {
    sibling,
    capabilities: {
      rsvp: has("RSVP"),
      registry: has("registry"),
      gifts: has("native gifts"),
      externalRegistry: has("external registry links"),
      cashFund: has("cash fund"),
      hosts: has("host names"),
      description: has("description"),
      time: has("time"),
      location: has("location"),
      deadline: has("RSVP deadline"),
      artwork: has("thematic artwork"),
    },
  };
}

function forbiddenTokens(request: Json): string[] {
  const text = userText(request);
  return ATTRACTIVE_TOKENS.filter((token) => text.includes(token.doc)).map((token) => token.id);
}

/* ------------------------------------------------------------------ EventIdentity answers */

/**
 * The boundary question this stub asks under `SMOKE_4G_CLARIFY=boundary`.
 *
 * Two options, no defer (`spec.md §7.6b #4` — a boundary question offers none), and the question
 * asks the host to state something the brief cannot legitimately infer on its own: whether the
 * honoree wants the shower itself to be a surprise. Kept genuinely a boundary — a decision that is
 * not the system's to make on someone else's behalf — rather than a creative-question-shaped
 * stand-in.
 */
const BOUNDARY_QUESTION = {
  kind: "boundary" as const,
  question:
    "Should the site treat this shower as a surprise for the mother-to-be, or is she in on the " +
    "planning?",
  whyItMatters:
    "A surprise changes who the site can be shown to and what its copy can assume before the " +
    "day; that is the honoree's own privacy to decide, not something to infer from a description " +
    "of taste.",
  options: [
    { label: "It's a surprise — keep it private until the day", isDefer: false },
    { label: "She knows and is part of planning it", isDefer: false },
  ],
};

const CREATIVE_QUESTION = {
  kind: "creative" as const,
  question: "Should the lemon and tile motifs read as a light accent, or as the page's main event?",
  whyItMatters:
    "An accent keeps the page quiet and lets ivory and open space carry it; a main-event " +
    "treatment would let pattern and citrus dominate the first screen instead — genuinely " +
    "different pages from the same brief.",
  options: [
    { label: "A light accent, used once", isDefer: false },
    { label: "The page's main visual event", isDefer: false },
    { label: "You decide", isDefer: true },
  ],
};

/**
 * The `EventIdentity` for the Mediterranean shower brief.
 *
 * `suppliedFacts` carries only what the prompt actually states — November, an afternoon, at
 * home, roughly sixty guests, a baby boy, and the honoree described as "my sister" — and leaves
 * every other field `null`: no date, no time beyond "afternoon", no address, no RSVP deadline, no
 * name (`spec.md §7.5`). The three exclusions are carried verbatim in `hostConstraints`, which is
 * the field `spec.md §32 #12` reserves for what the host actually said rather than this stub's own
 * taste.
 *
 * `rerun` selects between the pre-answer identity (which asks the configured question) and the
 * post-answer identity (which is authoritative, so the harness's loop can terminate).
 */
function eventIdentityJson(rerun: boolean): string {
  const mode = clarifyMode();
  const identity = {
    creativeDirection:
      "An old-world Mediterranean garden translated for an afternoon baby shower: whitewashed " +
      "warmth, tiled courtyards and climbing greenery held with elegant restraint rather than " +
      "reproduced as a literal seaside or coastal scene.",
    toneKeywords: ["elegant", "relaxed", "warm", "garden-lit", "understated"],
    colorsExplicitlyConstrained: true,
    paletteIntent: {
      requiredColors: ["warm ivory", "faded blue"],
      preferredColors: ["olive green", "sun-worn terracotta"],
      avoidColors: [],
      dominanceNotes: "Warm ivory should dominate, with faded blue as the secondary ground.",
    },
    tonalIntent:
      "Light and warm, like afternoon sun on whitewashed plaster — never dark or moody, and never " +
      "bright or saturated the way a nautical palette would read.",
    toneExplicitlyConstrained: false,
    compatibleTonalDirections: ["light", "mid"] as const,
    compatibleFamilies: ["editorial", "invitation"] as const,
    compatibleTypographyCategories: ["oldstyle", "heritage", "transitional"] as const,
    visualMotifs: [
      "lemons on the branch",
      "climbing greenery and vines",
      "tiled courtyard pattern",
      "whitewashed garden wall",
    ],
    textureDirection:
      "Sun-warmed plaster and glazed tile, soft rather than glossy, with a hand-finished quality " +
      "rather than a polished studio look.",
    typographyDirection:
      "A relaxed, elegant hand — warm oldstyle or heritage serif character, never a stiff formal " +
      "display face and never a playful, cartoonish one.",
    copyTone: "Warm and easy, like an invitation from someone close, never formal or stiff.",
    hostConstraints: ["Not nautical", "Not cartoonish", "Not overly formal"],
    creativeGuidance: [
      "Keep ornament restrained enough that the garden reads as elegant rather than themed.",
    ],
    inspirationSummary: "No visual inspiration supplied.",
  };

  const suppliedFacts = {
    hostNames: null,
    honoreeName: null,
    honoreeDescriptionText: "my sister",
    eventType: "baby shower",
    dateText: "November",
    timeText: "afternoon",
    venueText: "at home",
    addressText: null,
    localityText: null,
    rsvpDeadlineText: null,
  };

  if (mode === "none") {
    return JSON.stringify({
      identity,
      suppliedFacts,
      clarification: { needed: false, questions: [] },
    });
  }

  if (mode === "creative") {
    // A creative question never blocks, so this is returned on every call including the first —
    // there is no rerun to distinguish for this mode.
    return JSON.stringify({
      identity,
      suppliedFacts,
      clarification: { needed: true, questions: [CREATIVE_QUESTION] },
    });
  }

  // mode === "boundary": the first call asks; the rerun (once the answer is on record) is clean.
  if (rerun) {
    return JSON.stringify({
      identity,
      suppliedFacts,
      clarification: { needed: false, questions: [] },
    });
  }
  return JSON.stringify({
    identity,
    suppliedFacts,
    clarification: { needed: true, questions: [BOUNDARY_QUESTION] },
  });
}

/**
 * A first EventIdentity call from a clarification rerun, told apart the way production tells
 * them apart: `assembleEventIdentityUserMessage` only emits its `clarificationPreamble` block —
 * and with it the `ASKED:` marker — once `answers` is non-empty. See the module header.
 */
function isClarificationRerun(request: Json): boolean {
  return userText(request).includes("ASKED:");
}

/* ------------------------------------------------------------------ the design-intent answer */

function designIntentJson(request: Json): string {
  const sibling = siblingOfDesignIntent(request);
  const direction = directions(artworkRequested())[sibling];
  const premise = PREMISE_SET.premises[sibling];
  const schema = asObject(asObject(asObject(request.text).format).schema);
  const at = (path: readonly string[], preferred: readonly string[]) =>
    pick(enumAt(schema, path), preferred);

  return JSON.stringify({
    family: at(["family"], []),
    tonalDirection: at(["tonalDirection"], []),
    palette: { colors: direction.palette, dominant: direction.palette[0] },
    typographyPairing: at(["typographyPairing"], []),
    density: at(["density"], [direction.density]),
    composition: {
      asymmetry: at(["composition", "asymmetry"], [direction.asymmetry]),
      hierarchy: at(["composition", "hierarchy"], []),
      rhythm: at(["composition", "rhythm"], [direction.rhythm]),
      sectionContrast: at(["composition", "sectionContrast"], [direction.sectionContrast]),
      ornament: at(["composition", "ornament"], [direction.ornament]),
    },
    motifs: direction.motifs.filter((id) => enumAt(schema, ["motifs"]).includes(id)),
    presentation: { name: premise.title, description: direction.cardDescription },
  });
}

/* ------------------------------------------------------------------ the composition answer */

function withArtwork(section: Section, slot: ArtworkSlot): Section {
  const leaf = { t: "Artwork", role: slot.role } as unknown as AnyNode;
  const root = section.root as AnyNode;
  if (root.t === "Overlay") {
    return { ...section, root: { ...root, decoration: leaf } as Section["root"] };
  }
  if (["Stack", "Frame", "Split"].includes(root.t) && hasTextDescendant(root)) {
    return {
      ...section,
      root: {
        t: "Overlay",
        content: root,
        decoration: leaf,
        anchor: slot.anchor,
        extent: "third",
        mobile: "stack",
      } as unknown as Section["root"],
    };
  }
  throw new Error(`stub: ${section.kind} root ${root.t} has nowhere legal to put an Artwork leaf`);
}

function compositionJson(request: Json): string {
  const { sibling, capabilities } = readCompositionRequest(request);
  const direction = directions(artworkRequested())[sibling];
  const row = A1_SITES.find((site) => site.id === direction.site);
  if (!row) throw new Error(`stub: no A1 site ${direction.site}`);

  let tree: CompositionTree = page(
    row.hero,
    row.details,
    row.rsvp,
    row.registry,
    row.plan,
    row.align,
  );

  // Only when the request's own capability block says artwork was granted to this sibling — never
  // forced onto one the real optionality logic (`decideArtwork`) did not offer it to.
  if (capabilities.artwork) {
    for (const slot of direction.artwork) {
      const index = tree.sections.findIndex((section) => section.kind === slot.section);
      if (index < 0) throw new Error(`stub: site ${row.id} has no ${slot.section} section`);
      const sections = [...tree.sections];
      sections[index] = withArtwork(sections[index], slot);
      tree = { ...tree, sections };
    }
  }

  tree = JSON.parse(JSON.stringify(tree)) as CompositionTree;
  neutralize(tree, forbiddenTokens(request));

  const repaired = repair(tree, capabilities);
  if (repaired.remaining.length > 0) {
    throw new Error(
      `stub: fixture page ${row.id} is not legal under these capabilities: ` +
        repaired.remaining.map((v) => `${v.rule}@${v.path}`).join(", "),
    );
  }
  return JSON.stringify(repaired.tree);
}

/* ------------------------------------------------------------------ the image answers */

/** Delegated to `openai-artwork-stub.ts`, whole — see `openai-full-stub.ts`'s header for why. */
const artworkBytes = new ArtworkStub();

/* ------------------------------------------------------------------ the package surface */

let responseCounter = 0;

function responseEnvelope(request: Json, text: string): Json {
  responseCounter += 1;
  return {
    id: `resp_rehearsal_${responseCounter}`,
    model: typeof request.model === "string" ? request.model : "rehearsal-offline",
    output_text: text,
    service_tier: typeof request.service_tier === "string" ? request.service_tier : "default",
    usage: {
      input_tokens: 3_200 + text.length,
      input_tokens_details: { cached_tokens: 0, cache_write_tokens: 0 },
      output_tokens: Math.ceil(text.length / 3),
      output_tokens_details: { reasoning_tokens: 640 },
    },
  };
}

export default class OpenAI {
  constructor(_options?: unknown) {}

  readonly responses = {
    create: async (request: Json): Promise<Json> => {
      const format = asObject(asObject(request.text).format);
      if (format.name === "event_identity_result") {
        return responseEnvelope(request, eventIdentityJson(isClarificationRerun(request)));
      }
      if (format.name === "concept_premise_set") {
        return responseEnvelope(request, JSON.stringify(PREMISE_SET));
      }
      if (format.name === "design_intent_response") {
        return responseEnvelope(request, designIntentJson(request));
      }
      // The Composition call sends `{type: "json_object"}` and no schema name at all
      // (`src/lib/ai/openai/composition.ts` says why), so the format type is the last resort.
      if (format.type === "json_object") {
        return responseEnvelope(request, compositionJson(request));
      }
      throw new Error(
        `stub: no answer for text.format ${JSON.stringify(format.name ?? format.type ?? null)}`,
      );
    },
  };

  readonly images = {
    generate: async (
      body: { size?: string; prompt?: string },
      options?: unknown,
    ): Promise<Json> => {
      return artworkBytes.images.generate(body, options);
    },
  };
}
