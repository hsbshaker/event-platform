/**
 * The page and section shells, and the dispatcher every primitive renders its children through.
 *
 * # What arrives at runtime, and what does not
 *
 * `docs/event-renderer-system.md §6`: the renderer is "a static stylesheet keyed by classes and
 * numeric custom properties from `layout`. No CSS text is ever derived from model output." So this
 * root sets the whole page's token layer once, and everything below it is classes and numbers:
 *
 * - the **semantic palette** — never the creative one. `compile/palette.ts` already re-derived
 *   every role at a lightness its contrast target admits, and `DesignIntent` is deliberately
 *   absent from `RenderContext` so no component can reach the raw colors (`spec.md §32` #25,
 *   `docs/design-system.md §15.6`);
 * - the **font families** the pairing resolved to, as bare family names. The fallback stacks are
 *   in the stylesheet, so what is emitted here is a name from the curated catalog, not a font
 *   declaration;
 * - the **type scale and spacing**, as numbers at both breakpoints under distinct names. A custom
 *   property cannot be switched per breakpoint from an inline style, so the stylesheet's own media
 *   query chooses between `-desktop` and `-mobile`. That keeps the choice static and the values
 *   numeric, rather than having the renderer decide a viewport it cannot see;
 * - the **page system**, as classes. Border, card and button language are closed compiler enums,
 *   and the treatments they name are written out by hand in `event-tokens.css`.
 *
 * Every other `style` attribute the renderer emits is numeric custom properties only.
 *
 * # Audience
 *
 * A guest page contains no collaborator markup at all — not hidden, not `aria-hidden`, absent
 * (`CollaboratorActionSlot`). Anything else would ship editing affordances to guests in the DOM.
 */

import type { CSSProperties, ReactNode } from "react";

import type { SemanticPalette } from "@/lib/renderer/compile/palette";
import type { PreVerificationDesignSpec } from "@/lib/renderer/compile/spec";
import { NO_OVERRIDES, type VerificationOverrides } from "@/lib/renderer/compile/verification";
import type { ResolvedTypography } from "@/lib/renderer/compile/typography";
import type { PageSystem } from "@/lib/renderer/compile/page-system";
import type { AnyNode, Section } from "@/lib/renderer/composition/nodes";
import type { Emphasis } from "@/lib/renderer/composition/tokens";
import {
  cssNumbers,
  cssVars,
  type EventContent,
  type RenderAudience,
  type RenderContext,
  type SectionKind,
} from "./contract";
import { PRIMITIVES } from "./primitives";
import { NOTHING_CONFIGURED, type FeaturePresentationState } from "./feature-presentation";

/** Which section a collaborator control belongs to. Structural ids only — `s0`, `s1`, ... */
export interface SectionRef {
  readonly id: string;
  readonly kind: SectionKind;
  readonly index: number;
}

export interface EventPageProps {
  readonly spec: PreVerificationDesignSpec;
  readonly content: EventContent;
  readonly audience: RenderAudience;
  /**
   * Supplies the contextual `Edit` / `Set up` / `Add` controls for one section. Never called for a
   * guest. The controls themselves are a later phase; this is the anchor they will hang from
   * (`spec.md §31 — Creation Mode`).
   */
  readonly sectionActions?: (section: SectionRef) => ReactNode;
  /**
   * Guest visibility and readiness (`docs/event-renderer-system.md §2.3`).
   *
   * Optional, defaulting to `NOTHING_CONFIGURED`, because that is the truthful answer for every
   * event today — no registry, gift, guest or RSVP-party table exists yet. A caller that knows
   * better passes what it knows.
   */
  readonly presentation?: FeaturePresentationState;
  /**
   * What rendered-geometry verification decided for this spec, keyed by canonical node id.
   *
   * The verifier renders this component under a growing override map and re-measures, so the same
   * component that fits a page is the one that later serves it. A guest render passes the map its
   * `ResolvedDesignSpec` was verified with; anything else — a pre-verification preview, a unit test
   * — passes none and gets `NO_OVERRIDES`, which renders the tree exactly as the model authored it.
   */
  readonly overrides?: VerificationOverrides;
}

const EMPHASIS_STEPS: readonly Emphasis[] = ["display", "primary", "secondary", "caption"];

/** `surfaceBase` → `--ev-surface-base`. The role names are the contract; this only reshapes them. */
function kebab(role: string): string {
  return role.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`);
}

function paletteVars(palette: SemanticPalette): CSSProperties {
  const out: Record<string, string> = {};
  for (const [role, value] of Object.entries(palette)) out[`--ev-${kebab(role)}`] = value;
  return out as CSSProperties;
}

function typographyVars(typography: ResolvedTypography): CSSProperties {
  const sizes: Record<string, number> = {};
  const ratios: Record<string, number> = {};
  for (const breakpoint of ["desktop", "mobile"] as const) {
    for (const step of EMPHASIS_STEPS) {
      const { sizePx, lineHeight, weight } = typography.scale[breakpoint][step];
      sizes[`--ev-${step}-size-${breakpoint}`] = sizePx;
      ratios[`--ev-${step}-lh-${breakpoint}`] = lineHeight;
      ratios[`--ev-${step}-weight-${breakpoint}`] = weight;
    }
  }
  return {
    // Family names only; `event-tokens.css` owns the fallback stacks. **Quoted**, and the quotes
    // matter: a bare family name is a sequence of CSS identifiers, and `Source Sans 3` ends in a
    // token that is a <number>, not an identifier. Unquoted, that makes the whole `font-family`
    // declaration invalid at computed-value time — and an invalid custom-property substitution
    // takes the *entire* value with it, fallback stack included, so the text renders in the UA
    // default (Times New Roman) rather than in `ui-sans-serif`. Rendered-geometry verification
    // caught it as an unloaded face; a guest would have seen a serif where a grotesk belongs.
    //
    // React escapes the quote in an attribute value — `'` becomes `&#x27;`, `"` becomes `&quot;` —
    // and the HTML parser decodes it back before CSS ever sees the declaration, which is why this
    // works and why the browser reports the face as loaded. The escape does put a `;` in the
    // attribute *text*, though, so anything that reads a style attribute as a string (a test
    // splitting on `;`, say) has to decode it first rather than tokenize it raw.
    //
    // Neither the name nor the quote comes from model output: the catalog is closed
    // (`src/lib/renderer/vocabulary`) and the compiler picked from it (`spec.md §32` #19).
    "--ev-font-display": `'${typography.display}'`,
    "--ev-font-body": `'${typography.body}'`,
    ...cssVars(sizes),
    ...cssNumbers(ratios),
  } as CSSProperties;
}

function pageSystemVars(pageSystem: PageSystem): CSSProperties {
  const { spacing } = pageSystem;
  return {
    ...cssVars({
      "--ev-rule-w": pageSystem.borderWeight,
      "--ev-section-y-desktop": spacing.sectionY.desktop,
      "--ev-section-y-mobile": spacing.sectionY.mobile,
      "--ev-container-gap-desktop": spacing.containerGap.desktop,
      "--ev-container-gap-mobile": spacing.containerGap.mobile,
      "--ev-inset-desktop": spacing.inset.desktop,
      "--ev-inset-mobile": spacing.inset.mobile,
    }),
    // Tracking is the one value that can legitimately be zero or negative, and it is an em.
    ...cssVars({ "--ev-tracking": pageSystem.displayTracking }, "em"),
  };
}

/**
 * The dispatcher.
 *
 * An unknown node type is a bug in validation, not something to render around: the language admits
 * 29 primitives and every one has a component, so failing here is louder and cheaper than silently
 * dropping a subtree the model authored and the compiler approved.
 */
function createRenderNode(base: Omit<RenderContext, "renderNode">): RenderContext {
  const ctx: RenderContext = {
    ...base,
    renderNode: (node: AnyNode) => {
      const Primitive = PRIMITIVES[node.t];
      if (!Primitive) throw new Error(`event renderer: no component for primitive "${node.t}"`);
      return <Primitive node={node} ctx={ctx} />;
    },
  };
  return ctx;
}

/**
 * The collaborator anchor for one section.
 *
 * Rendered once per section and only for a collaborator. For a guest this component is never
 * reached, so no class, id or data attribute of it exists in the guest DOM — visibility is not the
 * mechanism, absence is.
 */
export function CollaboratorActionSlot({
  section,
  children,
}: {
  section: SectionRef;
  children?: ReactNode;
}) {
  return (
    <div className="ev-collaborator-slot" data-collaborator-section={section.id}>
      {children}
    </div>
  );
}

function EventSection({
  section,
  index,
  ctx,
  sectionActions,
}: {
  section: Section;
  index: number;
  ctx: RenderContext;
  sectionActions?: (section: SectionRef) => ReactNode;
}) {
  const ref: SectionRef = { id: section.id ?? `s${index}`, kind: section.kind, index };

  // `docs/event-renderer-system.md §2.3`: registry is visible once it has an external registry,
  // native gift or cash fund; RSVP once it is configured and at least one party is invited. Until
  // then a guest is shown nothing rather than an empty shell — which is what made two of the
  // Phase 4D smoke's concepts thousands of pixels of skeleton. The composition is unchanged; only
  // visibility is, and a collaborator still sees the section so they can set it up.
  const gated =
    section.kind === "rsvp" || section.kind === "registry"
      ? ctx.presentation.sections[section.kind]
      : "visible";
  if (gated === "setup" && ctx.audience === "guest") return null;

  const root = ctx.renderNode(section.root as AnyNode);
  return (
    <section
      className={`ev-section ev-kind-${section.kind} ev-surf-${section.surface} ev-al-${section.align ?? "start"} ev-fill-${section.fill ?? "auto"}`}
      data-id={ref.id}
    >
      {ctx.audience === "collaborator" ? (
        <CollaboratorActionSlot section={ref}>{sectionActions?.(ref)}</CollaboratorActionSlot>
      ) : null}
      {/* A band is edge-to-edge by definition, so it is the one section root that takes no gutter. */}
      {section.kind === "band" ? root : <div className="ev-inner">{root}</div>}
    </section>
  );
}

export function EventPage({
  spec,
  content,
  audience,
  sectionActions,
  overrides,
  presentation,
}: EventPageProps) {
  const { pageSystem, tokens, composition } = spec;
  const ctx = createRenderNode({
    layout: spec.layout,
    motifs: spec.motifs,
    pageSystem,
    palette: tokens.palette,
    typography: tokens.typography,
    content,
    audience,
    // Defaults to "nothing is set up", which is the truthful answer for every event today: no
    // registry, gift, guest or RSVP-party table exists yet (`./feature-presentation.ts`).
    presentation: presentation ?? NOTHING_CONFIGURED,
    overrides: overrides ?? NO_OVERRIDES,
  });

  return (
    <div
      // No tonal-direction class: the semantic palette already *is* the tone, resolved against its
      // contrast targets. A class that let the stylesheet branch on tone again would be the
      // renderer re-deriving a decision the compiler owns.
      className={[
        "ev-site",
        `ev-border-${pageSystem.border}`,
        `ev-card-${pageSystem.card}`,
        `ev-btn-${pageSystem.button}`,
        `ev-page-align-${pageSystem.defaultAlign}`,
      ].join(" ")}
      style={{
        ...paletteVars(tokens.palette),
        ...typographyVars(tokens.typography),
        ...pageSystemVars(pageSystem),
      }}
    >
      {composition.sections.map((section, index) => (
        <EventSection
          key={section.id ?? index}
          section={section}
          index={index}
          ctx={ctx}
          sectionActions={sectionActions}
        />
      ))}
    </div>
  );
}
