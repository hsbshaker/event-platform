/**
 * An offline stand-in for the whole `openai` package, so `scripts/smoke/phase4e-full-smoke.smoke.ts`
 * can be rehearsed end to end at zero cost.
 *
 * `scripts/smoke/openai-artwork-stub.ts` does this for the single image call of the 4E capability
 * spike. This file does it for a **batch**: one premise-set call, three DesignIntent calls, three
 * Composition calls, and every image call the artwork stage then makes.
 * `scripts/smoke/vitest.full-smoke.config.mts` aliases the `openai` package to this module when
 * `VITEST_SMOKE_OPENAI_STUB` points at it, so everything below the provider boundary — validation,
 * per-sibling narrowing conformance, deterministic repair, the planner's caps, the sibling
 * selector, the compiler, geometry verification, the artwork optionality gate, raster inspection,
 * metrics, spend arithmetic, persistence and the evidence writer — runs exactly as it will on the
 * paid batch.
 *
 * # What a green rehearsal proves, and what it does not
 *
 * It proves the **plumbing**: that the four request shapes are the ones this repository builds,
 * that a conformant answer to each survives every gate between the provider and a verified spec,
 * that three siblings can carry 0, 1 and 2 artwork slots through the real optionality logic, that
 * a rejected asset degrades instead of failing the run, and that the harness writes what it claims
 * to write.
 *
 * It proves **nothing about quality, distinctness or creative fidelity**. The premises here were
 * written by hand to satisfy a validator, not by a model asked to think; the compositions are
 * legacy fixture pages, which `docs/event-renderer-system.md §7.1` admits as regression material
 * and forbids as a creative space; and the images are blobs with a known shape.
 * **These are not artwork, and no screenshot of one is evidence about anything.** A green
 * rehearsal means the run is worth paying for, and that is the whole of what it means.
 *
 * # Why the answers are read out of the request rather than hard-coded
 *
 * `src/lib/ai/openai/design-intent.ts` narrows the JSON Schema per sibling before it sends it —
 * `family`, `tonalDirection`, `typographyPairing` and `composition.hierarchy` are each cut to that
 * sibling's planner assignment — and a value outside them is an `assignment` failure that opens no
 * repair pass at all. So this stub picks every one of those out of `request.text.format.schema`,
 * which makes it correct for whatever the planner emits rather than for the one plan it was
 * written beside.
 *
 * `composition.ornament` and `motifs` are deliberately **not** narrowed — `SemanticsNarrowing` in
 * `src/lib/ai/design-intent/contract.ts` carries four fields and neither of these is one — which is
 * what lets this file choose them freely. Choosing them is the point: `decideArtwork` reads exactly
 * those two, and `concept-batch.ts` turns its answer into `capabilities.artwork`.
 *
 * # Driving the branches
 *
 * Every run exercises all three optionality outcomes at once, one per sibling: `ornament_none` → 0
 * slots, `restrained_with_vocabulary` → 1, `decorative` → 2. The failure branch is the only one
 * that is a choice, and it is made from the environment so a rehearsal does not vary run to run:
 *
 *   SMOKE_STUB_IMAGE_FAIL=<role>[:<mode>][,<role>[:<mode>]...]
 *
 * `role` is one of the four `ARTWORK_ROLES`; this batch briefs `anchor` (sibling 1 and sibling 2)
 * and `atmosphere` (sibling 2 only), so `atmosphere` targets exactly one slot and `anchor` targets
 * two. `mode` is `reject` (the default) or `malformed`:
 *
 * | mode | what comes back | what the production path does with it |
 * | --- | --- | --- |
 * | `reject` | a valid but 64×64 PNG | `rejectAsset` refuses "implausible dimensions"; the slot is recorded `failed` / `asset_rejected` and the page renders without it |
 * | `malformed` | a payload with no image bytes | the provider boundary raises `malformed_output`, which is retryable, so the one permitted retry is spent before the slot fails |
 *
 * Unset means every slot delivers.
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

/* ------------------------------------------------------------------ the three premises */

/**
 * Three premises for the `locally-grown` identity fixture, written against the validator.
 *
 * `src/lib/ai/concept-premise/validate.ts` refuses a premise that asserts a specific the brief does
 * not carry — a number, or a proper noun used mid-sentence — and refuses a `grounding` entry that
 * shares fewer than two content words with the brief. So every sentence below is drawn from
 * `scripts/smoke/locally-grown-identity.ts`'s own vocabulary and capitalises nothing mid-sentence.
 * The three registers are three registers and the three organizing ideas share almost no content
 * words, which is what the set rules gate on.
 *
 * The array order is the binding order: premise `k` goes to planned sibling `k`, and each one's
 * surface richness is what the DesignIntent below turns into an ornament.
 */
const PREMISE_SET: ConceptPremiseSet = {
  premises: [
    {
      title: "Plain Harvest",
      foregrounds: "The restraint in the brief: composed rather than busy, elevated not rustic.",
      organizingIdea:
        "One plain voice, well set. The growing idea carries the welcome through words and " +
        "open space, never through anything applied to a surface.",
      experience:
        "Arriving feels like reading a well-set card: the welcome lands first, and nothing on " +
        "the page competes with it.",
      distinctFrom:
        "Of the three, this one hands the host the least decorated page and asks its typography " +
        "to carry the whole welcome.",
      designConsequences: [
        "Type does the work; no pattern anywhere on the page.",
        "Generous open space where the other two put surface.",
        "One dominant line on the first screen, and little else.",
      ],
      grounding: [
        "The brief asks for an elevated result rather than rustic pastiche.",
        "It asks that the result read composed rather than busy.",
      ],
      register: { pace: "measured", presence: "understated", surfaceRichness: "bare" },
    },
    {
      title: "Tended Beds",
      foregrounds: "The garden and kitchen-garden character the brief lists among its motifs.",
      organizingIdea:
        "A single cultivated detail, placed once and placed well. The page is ordered like a " +
        "kitchen garden: even rows, one thing in flower, restraint elsewhere.",
      experience:
        "Arriving feels like stepping into a tended plot in late afternoon: warm, slow, with one " +
        "detail worth looking at.",
      distinctFrom:
        "Of the three, this one keeps exactly one cultivated detail, where the first takes " +
        "everything off the surface and the last fills it.",
      designConsequences: [
        "One motif, used once and never repeated.",
        "Even rows with a single thing in flower.",
        "Calm surfaces, so that one detail reads.",
      ],
      grounding: [
        "The brief names garden and kitchen-garden character among its motif ideas.",
        "It asks for surfaces handled with restraint.",
      ],
      register: { pace: "lingering", presence: "poised", surfaceRichness: "considered" },
    },
    {
      title: "Abundant Market",
      foregrounds: "Harvest and abundance, and the generosity the brief says composition can hold.",
      organizingIdea:
        "Abundance as the argument itself: pattern, produce and layered grounds fill the whole " +
        "screen the way a full stall reads before you have taken in a word of it.",
      experience:
        "Arriving feels like a bright morning stall: plenty in every direction, and a clear way " +
        "through it all the same.",
      distinctFrom:
        "Of the three, this one spends its generosity on pattern and layered grounds instead of " +
        "on emptiness.",
      designConsequences: [
        "Pattern on more than one surface, and a fuller screen.",
        "Layered grounds beneath the reading, handled so words stay legible.",
        "Plenty in every direction rather than one dominant object.",
      ],
      grounding: [
        "The brief names harvest and abundance, and the character of a good local market.",
        "It says abundance can be expressed through composition and generosity of space.",
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
  /** The overlay anchor, which is what `planTreatment` reads to give a zone its side. */
  readonly anchor: Anchor;
}

interface Direction {
  /** Drives `decideArtwork`: `none` → 0 slots, `restrained` + motifs → 1, `decorative` → 2. */
  readonly ornament: "none" | "restrained" | "decorative";
  readonly motifs: readonly MotifId[];
  readonly density: "compact" | "balanced" | "spacious";
  readonly asymmetry: "symmetric" | "gentle" | "strong";
  readonly rhythm: "continuous" | "alternating" | "punctuated";
  readonly sectionContrast: "low" | "moderate" | "high";
  /** 3–5 unique uppercase `#RRGGBB`; `dominant` is the first. Produce-rooted, per the brief. */
  readonly palette: readonly string[];
  /** An `A1_SITES` row id. */
  readonly site: string;
  /** Where the `Artwork` leaves go when the capability is on. Empty for the bare direction. */
  readonly artwork: readonly ArtworkSlot[];
  readonly cardDescription: string;
}

/**
 * What each sibling's DesignIntent says in the fields the planner does **not** assign.
 *
 * `ornament` and `motifs` are the two `decideArtwork` reads, and they are chosen here so one batch
 * exercises all three of its outcomes — which is the behaviour this rehearsal exists to make
 * visible. Everything else answers to the premise's register, because a stub whose answers
 * contradicted its own premises would pass validation while rehearsing a batch nobody would ship.
 *
 * `site` is the legacy fixture page this sibling composes. Three different rows, so the three
 * heroes are structurally unlike each other and the sibling selector has nothing to collide on
 * (`src/lib/generation/sibling-signatures.ts`, threshold 0.70; these three sit at 0.28–0.34 on the
 * tree-only reading, which is the conservative one).
 */
const DIRECTIONS: readonly Direction[] = [
  {
    ornament: "none",
    motifs: [],
    density: "spacious",
    asymmetry: "symmetric",
    rhythm: "continuous",
    sectionContrast: "low",
    palette: ["#2F3A27", "#F3EFE4", "#8A9A5B"],
    site: "01",
    artwork: [],
    cardDescription:
      "Typography alone carries the welcome, with open space where another concept would " +
      "put pattern.",
  },
  {
    ornament: "restrained",
    motifs: ["botanical"],
    density: "balanced",
    asymmetry: "gentle",
    rhythm: "alternating",
    sectionContrast: "moderate",
    palette: ["#3C5148", "#EFE7D6", "#C4703A", "#8A9A5B"],
    site: "06",
    // One leaf, in the hero's overlay decoration slot. An `anchor` role with a corner anchor
    // resolves to a `side-anchor` zone rather than a wash under the text, which is the treatment
    // the 4E hardening work introduced and the one worth seeing in a rehearsal.
    artwork: [{ section: "hero", role: "anchor", anchor: "top-end" }],
    cardDescription:
      "One cultivated detail, placed once and given room, against calm surfaces everywhere else.",
  },
  {
    ornament: "decorative",
    motifs: ["botanical", "linen"],
    density: "compact",
    asymmetry: "strong",
    rhythm: "punctuated",
    sectionContrast: "high",
    palette: ["#5A2E24", "#F6E9CE", "#C4703A", "#8A9A5B", "#2F3A27"],
    site: "03",
    // Two leaves in two sections, because `LIMITS.perSection.Artwork` is 1 and
    // `LIMITS.perPage.Artwork` is 2. The second is `atmosphere`, which resolves to `field` and is
    // the one treatment that pulls a readability scrim — so the pair covers both branches of
    // `planTreatment`'s protection decision.
    artwork: [
      { section: "hero", role: "anchor", anchor: "top-end" },
      { section: "details", role: "atmosphere", anchor: "center" },
    ],
    cardDescription:
      "Pattern and layered grounds in every direction, the way a full market stall reads at once.",
  },
];

/** `ornament` is injective across the three directions, so it identifies a sibling on its own. */
const SIBLING_BY_ORNAMENT = new Map(DIRECTIONS.map((d, index) => [d.ornament, index]));

/* ------------------------------------------------------------------ reading the request */

type Json = Record<string, unknown>;

function asObject(value: unknown): Json {
  return value && typeof value === "object" ? (value as Json) : {};
}

/** Every enum the narrowed schema offers at a property path, or `[]` where the path is not one. */
function enumAt(schema: Json, path: readonly string[]): readonly string[] {
  let node = schema;
  for (const key of path) node = asObject(asObject(node.properties)[key]);
  const values = node.enum ?? asObject(node.items).enum;
  return Array.isArray(values) ? (values as unknown[]).filter((v) => typeof v === "string") : [];
}

/**
 * The first preference the schema still offers, or its first remaining value.
 *
 * Narrowing is why this is a search rather than a lookup. On a narrowed field there is exactly one
 * legal answer and the preference list is beside the point; on an open field the preference is this
 * direction's real choice. One helper covers both, and neither can return a value the schema would
 * refuse — which is the property that keeps this stub correct for any planner output.
 */
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

/**
 * Which sibling a DesignIntent request belongs to.
 *
 * By premise title rather than by counting calls: `runConceptBatch` fans the three out with
 * `Promise.all`, so a counter would bind an answer to whichever request the event loop happened to
 * deliver first — exactly the run-to-run variation a rehearsal must not introduce.
 */
function siblingOfDesignIntent(request: Json): number {
  const text = userText(request);
  const index = PREMISE_SET.premises.findIndex((premise) => text.includes(premise.title));
  if (index < 0) {
    throw new Error("stub: no premise title in the DesignIntent request; premises out of sync");
  }
  return index;
}

/**
 * Which sibling a Composition request belongs to, and what it is allowed to reference.
 *
 * Block 3 carries the DesignIntent this stub returned a moment ago and block 2 carries the two
 * capability lists, so both are read back out of the assembled message. Reading the text is the
 * point: a stub that reached for a shared variable instead would stop noticing if the assembly ever
 * stopped sending one.
 */
function readCompositionRequest(request: Json): { sibling: number; capabilities: Capabilities } {
  const text = userText(request);
  const ornament = [...SIBLING_BY_ORNAMENT.keys()].find((value) =>
    text.includes(`ornament ${value}`),
  );
  if (ornament === undefined) {
    throw new Error("stub: no ornament in the composition request's DesignIntent block");
  }
  const at = text.indexOf("Enabled for this event:");
  const line = at < 0 ? "" : text.slice(at).split("\n")[0];
  // Split on the assembly's own separator and compare whole labels. A substring test would read
  // "external registry links" as `registry` and "RSVP deadline" as `rsvp`, which is a capability
  // the event does not have arriving through a coincidence of wording.
  const enabled = new Set(
    line
      .slice(line.indexOf(":") + 1)
      .split(",")
      .map((label) => label.trim()),
  );
  const has = (label: string) => enabled.has(label);
  return {
    sibling: SIBLING_BY_ORNAMENT.get(ornament)!,
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

/** The attractive-token ids block 7 withheld from this candidate, read back off their own docs. */
function forbiddenTokens(request: Json): string[] {
  const text = userText(request);
  return ATTRACTIVE_TOKENS.filter((token) => text.includes(token.doc)).map((token) => token.id);
}

/* ------------------------------------------------------------------ the text answers */

function designIntentJson(request: Json): string {
  const sibling = siblingOfDesignIntent(request);
  const direction = DIRECTIONS[sibling];
  const premise = PREMISE_SET.premises[sibling];
  const schema = asObject(asObject(asObject(request.text).format).schema);
  const at = (path: readonly string[], preferred: readonly string[]) =>
    pick(enumAt(schema, path), preferred);

  return JSON.stringify({
    // The four narrowed fields. Their preference lists are empty because there is nothing to
    // prefer: the schema offers exactly the planner's assignment, and taking it is the only legal
    // answer. Writing them this way rather than reading `enum[0]` directly keeps every field on
    // one code path, so a field that stops being narrowed does not silently become a constant.
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
      // Unnarrowed, and the field the whole rehearsal turns on.
      ornament: at(["composition", "ornament"], [direction.ornament]),
    },
    motifs: direction.motifs.filter((id) => enumAt(schema, ["motifs"]).includes(id)),
    presentation: { name: premise.title, description: direction.cardDescription },
  });
}

/**
 * Put one `Artwork` leaf into a section.
 *
 * Two shapes, because the fixture pages come in two. A hero that is already an `Overlay` has a
 * decoration slot waiting, and substituting into it is what the 4E spike did by hand. A root that
 * is a text-bearing `Stack`, `Frame` or `Split` is wrapped in an `Overlay` instead —
 * `nesting.overlayContent` admits exactly those three, and `nesting.overlayDecoration` admits
 * `Artwork` only while the capability is on, which is why this is never called otherwise.
 *
 * Anything else throws. A stub that quietly placed a leaf where the validator refuses it would
 * report a rehearsal of the repair path as a rehearsal of the artwork path.
 */
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
  const direction = DIRECTIONS[sibling];
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

  // Artwork only where the request says it is available. That capability is `decideArtwork`'s
  // answer for this very direction, so forcing a leaf onto the bare sibling would emit a node the
  // compiler strips — hiding the one behaviour this rehearsal exists to show.
  if (capabilities.artwork) {
    for (const slot of direction.artwork) {
      const index = tree.sections.findIndex((section) => section.kind === slot.section);
      if (index < 0) throw new Error(`stub: site ${row.id} has no ${slot.section} section`);
      const sections = [...tree.sections];
      sections[index] = withArtwork(sections[index], slot);
      tree = { ...tree, sections };
    }
  }

  // The fixtures were not authored against this batch's allotment, so a device this candidate was
  // not given would earn a re-prompt the rehearsal has no reason to spend. Neutralized with the
  // planner's own function rather than by hunting for fixtures that happen to avoid it.
  tree = JSON.parse(JSON.stringify(tree)) as CompositionTree;
  neutralize(tree, forbiddenTokens(request));

  // Capability scoping, borrowed rather than re-derived. A real model is shown a language already
  // narrowed to the event's capabilities; `repair` is this repository's own deterministic statement
  // of what that narrowing means, it calls no model, and borrowing it means the stub cannot drift
  // from the rules the compiler applies a moment later. Under `deriveCapabilities` — which enables
  // everything but artwork — it is a no-op, and the throw below is what says so out loud.
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

/**
 * The bytes come from `./openai-artwork-stub`, whole.
 *
 * Delegated rather than re-encoded: that module's PNG is already known to survive `inspectRaster`,
 * `transparencyOf`, `measureArtwork` and `rejectAsset`, and a second encoder maintained beside it
 * would be one more thing to keep true. The consequence is worth stating, because it will be
 * visible in the contact sheet: two delivered slots in one run carry **identical pixels**. They are
 * not artwork and they are not meant to be distinguishable; what distinguishes them is the slot
 * lineage the database records, which the harness asserts separately.
 */
const artworkBytes = new ArtworkStub();

/** A slot the environment asked to fail, and how. */
type FailureMode = "reject" | "malformed";

/**
 * `SMOKE_STUB_IMAGE_FAIL`, parsed once. See the module header for the grammar.
 *
 * Read at module load so a run cannot change its own mind halfway through, and so a typo shows up
 * as "no failure was injected" in the evidence rather than as an intermittent one.
 */
const INJECTED_FAILURES: ReadonlyMap<string, FailureMode> = new Map(
  (process.env.SMOKE_STUB_IMAGE_FAIL ?? "")
    .split(",")
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0)
    .map((entry) => {
      const [role, mode = "reject"] = entry.split(":");
      if (mode !== "reject" && mode !== "malformed") {
        throw new Error(`stub: SMOKE_STUB_IMAGE_FAIL mode "${mode}" is not reject or malformed`);
      }
      return [role, mode] as const;
    }),
);

/**
 * Which role a brief is for, read back out of the prompt.
 *
 * `assembleVisualArtIntent` writes a different opening sentence per role (`subjectFor`), and that
 * sentence reaches the provider inside `artworkPromptFor`'s first line. Matching it is how a
 * failure can be aimed at one slot without this file knowing anything about the batch's ordering —
 * `atmosphere` occurs once in the batch, `anchor` twice.
 */
const ROLE_MARKERS: Readonly<Record<ArtworkRole, string>> = {
  anchor: "One illustrative subject that could carry this page on its own",
  object: "A single object or small still life, isolated with nothing behind it",
  atmosphere: "An open, unfocused field",
  framed: "One editorial illustration, composed to be read as a picture",
};

function injectedFailure(prompt: string): FailureMode | null {
  for (const [role, mode] of INJECTED_FAILURES) {
    const marker = ROLE_MARKERS[role as ArtworkRole];
    if (marker && prompt.includes(marker)) return mode;
  }
  return null;
}

/* ------------------------------------------------------------------ the package surface */

let responseCounter = 0;

/** Token counts in the range the rate card makes plausible, so cost arithmetic sees real numbers. */
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
      if (format.name === "concept_premise_set") {
        return responseEnvelope(request, JSON.stringify(PREMISE_SET));
      }
      if (format.name === "design_intent_response") {
        return responseEnvelope(request, designIntentJson(request));
      }
      // The Composition call sends `{type: "json_object"}` and no schema name at all — provider-side
      // enforcement is deliberately not used there (`src/lib/ai/openai/composition.ts` says why) —
      // so the format type is the only thing left to dispatch on.
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
      const mode = injectedFailure(body.prompt ?? "");
      if (mode === "malformed") {
        // No bytes at all. The boundary classifies this `malformed_output`, which is retryable, so
        // the slot spends its one permitted retry before it fails.
        return { data: [{}], usage: {}, _request_id: "req_rehearsal_malformed" };
      }
      // 64×64 is below `MIN_ARTWORK_EDGE_PX`, so the asset decodes, measures, and is then refused
      // by `rejectAsset` — which is the path a bad real asset takes, and the one worth rehearsing.
      const size = mode === "reject" ? "64x64" : (body.size ?? "1024x1024");
      return artworkBytes.images.generate({ ...body, size }, options);
    },
  };
}
