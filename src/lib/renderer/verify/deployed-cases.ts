/**
 * The five cases the deployed runtime must clear, as one function so the route stays thin.
 *
 * Each exercises a different part of the contract at both breakpoints:
 *
 * 1. **novel** — a tree with no library counterpart, the normal creative path;
 * 2. **regression** — a second, structurally different composition, so the run is not one page
 *    measured twice;
 * 3. **demotion** — a `monumental` hierarchy with long content, so the fit loop actually runs;
 * 4. **refit** — short content verified, then long content re-fitted on the same tree, proving the
 *    hash survives a content edit on the deployed runtime and not only locally;
 * 5. **determinism** — the novel case measured `repeats` times, proving geometry is stable across
 *    repeated runs in the same function rather than only on the first.
 */

import { assemblePreVerificationSpec } from "../compile/spec";
import type { Capabilities } from "../composition/nodes";
import type { DesignIntent } from "../design-intent";
import { canonicalize } from "../composition/canonicalize";
import type { EventContent } from "@/components/event-renderer/contract";
import { refitContent } from "./refit";
import { verifyGeometry } from "./verify";
import type { ResolvedDesignSpec } from "./result";

const CAPS: Capabilities = {
  rsvp: true,
  registry: true,
  gifts: true,
  externalRegistry: true,
  cashFund: true,
  hosts: true,
  description: true,
  time: true,
  location: true,
  deadline: true,
};

const BASE_CONTENT: EventContent = {
  eyebrow: "A baby shower for our little boy",
  title: "Baby Shaker is on the way",
  hosts: "Hosted with love by Haseeb & Shezia",
  description: "An afternoon of good food, warm company, and celebrating our little boy.",
  date: "Saturday, December 19, 2026",
  dayNumeral: "19",
  monthShort: "Dec",
  year: "2026",
  weekday: "Saturday",
  time: "1:00–5:00 PM",
  venue: "The Lodge",
  location: "Aldie, Virginia",
  deadline: "Kindly respond by December 1",
  initial: "B",
};

const LONG_CONTENT: EventContent = {
  ...BASE_CONTENT,
  title: "Baby Shaker Is On The Way And We Would Be Delighted If You Came To Celebrate",
  eyebrow: "An afternoon in the depths of a long and particularly unhurried winter",
  venue: "The Lodge at Hanson Park on the far side of the north meadow, past the equestrian centre",
};

const intent = (
  overrides: Partial<DesignIntent["composition"]> = {},
  pairing: DesignIntent["typographyPairing"] = "heritage_caslon_karla",
): DesignIntent => ({
  family: "editorial",
  tonalDirection: "dark",
  palette: { colors: ["#22364F", "#F3ECDD", "#2E4638"], dominant: "#22364F" },
  typographyPairing: pairing,
  density: "balanced",
  composition: {
    asymmetry: "gentle",
    hierarchy: "editorial",
    rhythm: "alternating",
    sectionContrast: "moderate",
    ornament: "restrained",
    ...overrides,
  },
  motifs: ["plaid", "equestrian"],
});

/**
 * The compositions below are built from primitives here rather than drawn from the legacy fixture
 * library. That is deliberate: this module is production source under `src/**`, and
 * `docs/event-renderer-system.md §7.1` lets only the two named adapters reach the library.
 * Expressiveness against the real fixtures is a local gate (`tests/unit/phase3-exit.test.ts`
 * renders all 26 silhouettes, all 13 recipes and all 16 A.1 pages); what this route proves is the
 * *runtime*, which needs representative pages, not the fixtures themselves.
 */

/** A composition with no library counterpart: a Rail wrapping a Split of an Overlay and a Grid. */
function novelComposition() {
  return canonicalize({
    version: "composition_v1",
    sections: [
      {
        kind: "hero",
        surface: "accent",
        align: "center",
        fill: "screen",
        root: {
          t: "Rail",
          side: "end",
          width: "medium",
          mobile: "bottom",
          rail: { t: "MotifField", motif: { id: "gingham", role: "field" }, extent: "full" },
          child: {
            t: "Split",
            ratio: "62",
            align: "center",
            divider: "hairline",
            mobile: "stack-reverse",
            children: [
              {
                t: "Overlay",
                anchor: "bottom-end",
                extent: "third",
                mobile: "stack",
                content: {
                  t: "Stack",
                  gap: "tight",
                  children: [
                    { t: "Eyebrow" },
                    { t: "EventTitle", emphasis: "display", layout: "cascade" },
                    { t: "Hosts" },
                  ],
                },
                decoration: {
                  t: "MotifField",
                  motif: { id: "plaid", role: "field" },
                  extent: "third",
                },
              },
              {
                t: "Grid",
                columns: 2,
                mobile: 2,
                ruled: true,
                gap: "loose",
                children: [
                  { t: "Cell", child: { t: "Date", form: "numeral", emphasis: "display" } },
                  {
                    t: "Cell",
                    child: { t: "Stack", children: [{ t: "Venue" }, { t: "Location" }] },
                  },
                ],
              },
            ],
          },
        },
      },
      {
        kind: "rsvp",
        surface: "contrast",
        root: {
          t: "Split",
          ratio: "38",
          mobile: "stack",
          children: [
            { t: "Stack", children: [{ t: "SectionHeading", for: "rsvp" }, { t: "Deadline" }] },
            { t: "RSVP" },
          ],
        },
      },
      {
        kind: "registry",
        surface: "alt",
        root: {
          t: "Stack",
          children: [
            { t: "SectionHeading", for: "registry" },
            {
              t: "Registry",
              layout: {
                t: "Grid",
                columns: 3,
                mobile: 1,
                children: (["gift", "external", "cashfund"] as const).map((kind) => ({
                  t: "Cell",
                  child: { t: "RegistryItem", kind },
                })),
              },
            },
          ],
        },
      },
    ],
  } as never).tree;
}

export interface DeployedCase {
  readonly name: string;
  readonly ok: boolean;
  readonly ms: number;
  readonly detail: Record<string, unknown>;
}

async function timed<T>(fn: () => Promise<T>): Promise<[T, number]> {
  const t = performance.now();
  const out = await fn();
  return [out, Math.round(performance.now() - t)];
}

export async function runDeployedCases({ repeats }: { repeats: number }): Promise<DeployedCase[]> {
  const out: DeployedCase[] = [];
  const summarise = (spec: ResolvedDesignSpec) => ({
    clean: spec.verified.clean,
    hash: spec.compositionHash,
    demotions: spec.verified.fitDemotions,
    relaxations: spec.verified.fitRelaxations,
    desktopOverflow: spec.verified.desktop.pageOverflow,
    mobileOverflow: spec.verified.mobile.pageOverflow,
    fonts: spec.verified.fonts,
  });

  // 1. novel
  const novelSpec = assemblePreVerificationSpec({
    composition: novelComposition(),
    designIntent: intent(),
    capabilities: CAPS,
    seed: 11,
  });
  const [novel, novelMs] = await timed(() =>
    verifyGeometry({ spec: novelSpec, content: BASE_CONTENT }),
  );
  out.push({
    name: "novel",
    ok: novel.ok && novel.spec.verified.clean === true,
    ms: novelMs,
    detail: novel.ok
      ? {
          ...summarise(novel.spec),
          hashPreserved: novel.spec.compositionHash === novelSpec.compositionHash,
        }
      : { kind: novel.kind, detail: novel.detail },
  });

  // 2. a structurally different regression composition: a centred framed hero on a contrast
  // ground, sharing nothing with the novel case's Rail/Split/Overlay shape.
  const regressionSpec = assemblePreVerificationSpec({
    composition: canonicalize({
      version: "composition_v1",
      sections: [
        {
          kind: "hero",
          surface: "contrast",
          align: "center",
          fill: "screen",
          root: {
            t: "Frame",
            rule: "hairline",
            inset: "deep",
            motif: { id: "linen", role: "frame" },
            child: {
              t: "Stack",
              align: "center",
              children: [
                { t: "Glyph", motif: "equestrian" },
                { t: "Eyebrow" },
                { t: "EventTitle", emphasis: "display" },
                { t: "Hosts" },
                {
                  t: "Cluster",
                  justify: "center",
                  children: [{ t: "Date", form: "full" }, { t: "Time" }, { t: "Venue" }],
                },
                { t: "CTA", target: "rsvp" },
              ],
            },
          },
        },
        {
          kind: "details",
          surface: "base",
          root: {
            t: "Stack",
            children: [
              { t: "SectionHeading", for: "details" },
              { t: "Description" },
              { t: "Rule", weight: "hairline", glyphs: "botanical" },
              { t: "Location" },
            ],
          },
        },
        {
          kind: "rsvp",
          surface: "alt",
          root: {
            t: "Stack",
            children: [{ t: "SectionHeading", for: "rsvp" }, { t: "Deadline" }, { t: "RSVP" }],
          },
        },
        {
          kind: "registry",
          surface: "base",
          root: {
            t: "Stack",
            children: [
              { t: "SectionHeading", for: "registry" },
              {
                t: "Registry",
                layout: {
                  t: "Stack",
                  children: (["gift", "external", "cashfund"] as const).map((kind) => ({
                    t: "RegistryItem",
                    kind,
                  })),
                },
              },
            ],
          },
        },
      ],
    } as never).tree,
    designIntent: intent({ asymmetry: "symmetric" }),
    capabilities: CAPS,
    seed: 1,
  });
  const [regression, regressionMs] = await timed(() =>
    verifyGeometry({ spec: regressionSpec, content: BASE_CONTENT }),
  );
  out.push({
    name: "regression",
    ok: regression.ok && regression.spec.verified.clean === true,
    ms: regressionMs,
    detail: regression.ok
      ? summarise(regression.spec)
      : { kind: regression.kind, detail: regression.detail },
  });

  // 3. a page that needs a demotion
  const demotionSpec = assemblePreVerificationSpec({
    composition: canonicalize({
      version: "composition_v1",
      sections: [
        {
          kind: "hero",
          surface: "base",
          fill: "screen",
          root: {
            t: "Split",
            ratio: "38",
            mobile: "keep",
            children: [
              {
                t: "Stack",
                children: [
                  { t: "Date", form: "month-year" },
                  { t: "Date", form: "numeral", emphasis: "display" },
                  { t: "MotifBand", motif: { id: "stripe", role: "band" }, height: "tall" },
                ],
              },
              {
                t: "Stack",
                children: [
                  { t: "Eyebrow" },
                  { t: "EventTitle", emphasis: "display" },
                  { t: "Hosts" },
                  { t: "Cluster", children: [{ t: "Time" }, { t: "Venue" }, { t: "Location" }] },
                  { t: "CTA", target: "rsvp" },
                ],
              },
            ],
          },
        },
        {
          kind: "details",
          surface: "alt",
          root: {
            t: "Stack",
            align: "center",
            children: [
              { t: "SectionHeading", for: "details" },
              { t: "Description" },
              { t: "Rule", weight: "hairline" },
              { t: "Venue", emphasis: "primary" },
            ],
          },
        },
        {
          kind: "rsvp",
          surface: "base",
          root: {
            t: "Stack",
            children: [{ t: "SectionHeading", for: "rsvp" }, { t: "Deadline" }, { t: "RSVP" }],
          },
        },
        {
          kind: "registry",
          surface: "alt",
          root: {
            t: "Stack",
            children: [
              { t: "SectionHeading", for: "registry" },
              {
                t: "Registry",
                layout: {
                  t: "Grid",
                  columns: 3,
                  mobile: 1,
                  children: (["gift", "external", "cashfund"] as const).map((kind) => ({
                    t: "Cell",
                    child: { t: "RegistryItem", kind },
                  })),
                },
              },
            ],
          },
        },
      ],
    } as never).tree,
    designIntent: intent({ hierarchy: "monumental" }, "grotesk_space_sourcesans"),
    capabilities: CAPS,
    seed: 5,
  });
  const [demotion, demotionMs] = await timed(() =>
    verifyGeometry({ spec: demotionSpec, content: LONG_CONTENT }),
  );
  out.push({
    name: "demotion",
    ok: demotion.ok && demotion.spec.verified.clean === true,
    ms: demotionMs,
    detail: demotion.ok
      ? {
          ...summarise(demotion.spec),
          overrides: Object.keys(demotion.spec.overrides.emphasis).length,
        }
      : { kind: demotion.kind, detail: demotion.detail },
  });

  // 4. re-fit: short then long, same tree
  const refitSpec = assemblePreVerificationSpec({
    composition: novelComposition(),
    designIntent: intent(),
    capabilities: CAPS,
    seed: 11,
  });
  const [refit, refitMs] = await timed(async () => {
    const first = await verifyGeometry({
      spec: refitSpec,
      content: BASE_CONTENT,
      contentVersion: 1,
    });
    if (!first.ok) return { stage: "first", result: first } as const;
    const second = await refitContent({
      previous: first.spec,
      content: LONG_CONTENT,
      previousSpecId: "deployed-1",
    });
    return { stage: "refit", first: first.spec, result: second } as const;
  });
  out.push({
    name: "refit",
    ok: refit.result.ok && refit.stage === "refit",
    ms: refitMs,
    detail:
      refit.stage === "refit" && refit.result.ok
        ? {
            hashPreserved: refit.result.spec.compositionHash === refit.first.compositionHash,
            treePreserved:
              JSON.stringify(refit.result.spec.composition) ===
              JSON.stringify(refit.first.composition),
            contentVersion: refit.result.spec.contentVersion,
            supersedes: refit.result.spec.supersedesSpecId,
            clean: refit.result.spec.verified.clean,
          }
        : { stage: refit.stage, failure: refit.result.ok ? null : refit.result.kind },
  });

  // 5. determinism across repeated runs in the same function
  const keys: string[] = [];
  const [, determinismMs] = await timed(async () => {
    for (let i = 0; i < repeats; i++) {
      const spec = assemblePreVerificationSpec({
        composition: novelComposition(),
        designIntent: intent(),
        capabilities: CAPS,
        seed: 11,
      });
      const r = await verifyGeometry({ spec, content: BASE_CONTENT });
      keys.push(
        r.ok
          ? JSON.stringify([r.spec.verified.desktop, r.spec.verified.mobile])
          : `failed:${r.kind}`,
      );
    }
  });
  out.push({
    name: "determinism",
    ok: keys.length === repeats && new Set(keys).size === 1,
    ms: determinismMs,
    detail: { repeats, distinctGeometries: new Set(keys).size },
  });

  return out;
}
