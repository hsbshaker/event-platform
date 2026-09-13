/**
 * The 26 hero silhouettes: `recipe:variant` → a fresh hero `Section.root` on each call.
 *
 * These are regression/expressiveness fixtures and rotated few-shot material only
 * (`docs/event-renderer-system.md §7.1`) — never a selection menu for generation.
 *
 * Ported from `proof-b/library.js` with no behaviour change (Phase 3, item 2).
 */

import type { CNode } from "../composition/nodes";
import { T, cell, cluster, copy, field, split, stack, title } from "./helpers";

export type HeroKey =
  | "editorial_split:field_right"
  | "editorial_split:field_left"
  | "editorial_masthead:rail_right"
  | "editorial_masthead:rail_left"
  | "editorial_masthead:band_top"
  | "editorial_offset:plate_left"
  | "editorial_offset:plate_right"
  | "editorial_daterail:rail_left"
  | "editorial_daterail:rail_right"
  | "editorial_rulegrid:cells"
  | "editorial_rulegrid:columns"
  | "framed_invitation:thin_frame"
  | "framed_invitation:deep_margin"
  | "invitation_card:floating"
  | "invitation_card:sheet"
  | "invitation_monogram:crest"
  | "invitation_monogram:watermark"
  | "invitation_ticket:stub_right"
  | "invitation_ticket:stub_left"
  | "typography_first:band_below"
  | "typography_first:band_above"
  | "typography_first:band_rail"
  | "statement_stack:alternate"
  | "statement_stack:cascade"
  | "statement_numeral:numeral_left"
  | "statement_numeral:numeral_top";

export const HEROES: Record<HeroKey, () => CNode> = {
  "editorial_split:field_right": () =>
    split("62", [copy([T("Glyph", { motif: "equestrian" })]), field("plaid")]),
  "editorial_split:field_left": () =>
    split("38", [field("linen"), copy([T("Glyph", { motif: "botanical" })])], "stack-reverse"),
  "editorial_masthead:rail_right": () =>
    stack([
      T("Rule", { weight: "strong" }),
      cluster([T("Date", { form: "full" }), T("Venue"), T("Time")], { justify: "between" }),
      T("Rule", { weight: "hairline" }),
      T("Rail", {
        side: "end",
        width: "medium",
        rail: field("stripe", "band"),
        mobile: "bottom",
        child: stack([T("Eyebrow"), title(), T("Hosts")]),
      }),
      T("Rule", { weight: "hairline", glyphs: "botanical" }),
      cluster([T("Deadline"), T("CTA", { target: "rsvp" })], { justify: "between" }),
    ]),
  "editorial_masthead:rail_left": () =>
    stack([
      T("Rule", { weight: "strong" }),
      cluster([T("Date", { form: "full" }), T("Venue"), T("Time")], { justify: "between" }),
      T("Rule", { weight: "hairline" }),
      T("Rail", {
        side: "start",
        width: "medium",
        rail: field("stripe", "band"),
        mobile: "top",
        child: stack([T("Eyebrow"), title(), T("Hosts")]),
      }),
      T("Rule", { weight: "hairline", glyphs: "botanical" }),
      cluster([T("Deadline"), T("CTA", { target: "rsvp" })], { justify: "between" }),
    ]),
  "editorial_masthead:band_top": () =>
    stack([
      T("Rule", { weight: "strong" }),
      cluster([T("Date", { form: "full" }), T("Venue"), T("Time")], { justify: "between" }),
      T("Rule", { weight: "hairline" }),
      T("MotifBand", { motif: { id: "plaid", role: "band" }, height: "tall" }),
      stack([T("Eyebrow"), title(), T("Hosts")]),
      T("Rule", { weight: "hairline", glyphs: "equestrian" }),
      cluster([T("Deadline"), T("CTA", { target: "rsvp" })], { justify: "between" }),
    ]),
  "editorial_offset:plate_left": () =>
    T("Overlay", {
      anchor: "bottom-start",
      extent: "half",
      mobile: "stack",
      decoration: field("gingham"),
      content: split(
        "38",
        [
          stack([T("Date", { form: "full" }), T("Time"), T("Venue"), T("Hosts")], {
            gap: "tight",
          }),
          stack([
            T("Glyph", { motif: "equestrian" }),
            T("Eyebrow"),
            title(),
            T("CTA", { target: "rsvp" }),
          ]),
        ],
        "stack-reverse",
        { align: "start" },
      ),
    }),
  "editorial_offset:plate_right": () =>
    T("Overlay", {
      anchor: "bottom-end",
      extent: "half",
      mobile: "stack",
      decoration: field("gingham"),
      content: split(
        "62",
        [
          stack([
            T("Glyph", { motif: "equestrian" }),
            T("Eyebrow"),
            title(),
            T("CTA", { target: "rsvp" }),
          ]),
          stack([T("Date", { form: "full" }), T("Time"), T("Venue"), T("Hosts")], {
            gap: "tight",
            align: "end",
          }),
        ],
        "stack",
        { align: "start" },
      ),
    }),
  "editorial_daterail:rail_left": () =>
    T("Rail", {
      side: "start",
      width: "wide",
      mobile: "top",
      rail: stack([
        T("Date", { form: "month-year" }),
        T("Date", { form: "numeral", emphasis: "display" }),
        T("Time"),
        T("Venue"),
      ]),
      child: stack([
        T("Glyph", { motif: "celestial" }),
        T("Eyebrow"),
        title(),
        T("Hosts"),
        T("CTA", { target: "rsvp" }),
      ]),
    }),
  "editorial_daterail:rail_right": () =>
    T("Rail", {
      side: "end",
      width: "wide",
      mobile: "top",
      rail: stack([
        T("Date", { form: "month-year" }),
        T("Date", { form: "numeral", emphasis: "display" }),
        T("Time"),
        T("Venue"),
      ]),
      child: stack([
        T("Glyph", { motif: "celestial" }),
        T("Eyebrow"),
        title(),
        T("Hosts"),
        T("CTA", { target: "rsvp" }),
      ]),
    }),
  "editorial_rulegrid:cells": () =>
    T("Grid", {
      columns: 3,
      ruled: true,
      mobile: 2,
      children: [
        cell(stack([T("Eyebrow"), title()]), { span: 2 }),
        cell(stack([T("Glyph", { motif: "equestrian" }), T("Hosts")])),
        cell(T("Date", { form: "full", emphasis: "primary" })),
        cell(T("Time", { emphasis: "primary" })),
        cell(
          stack([T("Venue", { emphasis: "primary" }), T("Location"), T("CTA", { target: "rsvp" })]),
        ),
      ],
    }),
  "editorial_rulegrid:columns": () =>
    T("Grid", {
      columns: 4,
      ruled: true,
      mobile: 2,
      children: [
        cell(stack([T("Eyebrow"), title()]), { span: 4 }),
        cell(stack([T("Glyph", { motif: "equestrian" }), T("Hosts")])),
        cell(T("Date", { form: "full", emphasis: "primary" })),
        cell(T("Time", { emphasis: "primary" })),
        cell(
          stack([T("Venue", { emphasis: "primary" }), T("Location"), T("CTA", { target: "rsvp" })]),
        ),
      ],
    }),
  "framed_invitation:thin_frame": () =>
    T("Frame", {
      rule: "hairline",
      inset: "tight",
      motif: { id: "linen", role: "frame" },
      child: stack(
        [
          T("Glyph", { motif: "equestrian" }),
          T("Eyebrow"),
          title(),
          T("Hosts"),
          cluster([T("Date", { form: "full" }), T("Time"), T("Venue")], { justify: "center" }),
          T("CTA", { target: "rsvp" }),
        ],
        { align: "center" },
      ),
    }),
  "framed_invitation:deep_margin": () =>
    T("Frame", {
      rule: "hairline",
      inset: "deep",
      motif: { id: "plaid", role: "frame" },
      child: stack(
        [
          T("Glyph", { motif: "celestial" }),
          T("Eyebrow"),
          title(),
          T("Hosts"),
          cluster([T("Date", { form: "full" }), T("Time"), T("Venue")], { justify: "center" }),
          T("CTA", { target: "rsvp" }),
        ],
        { align: "center" },
      ),
    }),
  "invitation_card:floating": () =>
    T("Overlay", {
      anchor: "center",
      extent: "full",
      mobile: "keep",
      decoration: field("linen"),
      content: T("Frame", {
        rule: "none",
        inset: "deep",
        child: T("Surface", {
          role: "contrast",
          inset: "deep",
          child: stack(
            [
              T("Eyebrow"),
              title(),
              T("Rule", { weight: "hairline", glyphs: "botanical" }),
              cluster([T("Date", { form: "full" }), T("Time")], { justify: "center" }),
              cluster([T("Venue"), T("Location")], { justify: "center" }),
              T("Hosts"),
              T("CTA", { target: "rsvp" }),
            ],
            { align: "center" },
          ),
        }),
      }),
    }),
  "invitation_card:sheet": () =>
    stack(
      [
        T("MotifBand", { motif: { id: "linen", role: "band" }, height: "tall" }),
        T("Surface", {
          role: "contrast",
          inset: "deep",
          child: stack(
            [
              T("Eyebrow"),
              title(),
              T("Rule", { weight: "hairline", glyphs: "botanical" }),
              cluster([T("Date", { form: "full" }), T("Time")], { justify: "center" }),
              cluster([T("Venue"), T("Location")], { justify: "center" }),
              T("Hosts"),
              T("CTA", { target: "rsvp" }),
            ],
            { align: "center" },
          ),
        }),
        T("MotifBand", { motif: { id: "linen", role: "band" }, height: "tall" }),
      ],
      { gap: "tight" },
    ),
  "invitation_monogram:crest": () =>
    stack(
      [
        T("Monogram", { style: "ring" }),
        T("Rule", { weight: "hairline" }),
        T("Eyebrow"),
        title({ emphasis: "primary", case: "upper" }),
        T("Hosts"),
        T("Rule", { weight: "hairline", glyphs: "celestial" }),
        split("50", [
          stack([T("Date", { form: "full", emphasis: "primary" }), T("Time")], { align: "center" }),
          stack([T("Venue", { emphasis: "primary" }), T("Location")], { align: "center" }),
        ]),
        T("CTA", { target: "rsvp" }),
      ],
      { align: "center" },
    ),
  "invitation_monogram:watermark": () =>
    T("Overlay", {
      anchor: "center",
      extent: "half",
      mobile: "keep",
      decoration: T("Monogram", { style: "watermark" }),
      content: stack(
        [
          T("Eyebrow"),
          title({ emphasis: "primary", case: "upper" }),
          T("Hosts"),
          T("Rule", { weight: "hairline", glyphs: "celestial" }),
          split("50", [
            stack([T("Date", { form: "full", emphasis: "primary" }), T("Time")], {
              align: "center",
            }),
            stack([T("Venue", { emphasis: "primary" }), T("Location")], { align: "center" }),
          ]),
          T("CTA", { target: "rsvp" }),
        ],
        { align: "center" },
      ),
    }),
  "invitation_ticket:stub_right": () =>
    T("Overlay", {
      anchor: "center",
      extent: "full",
      mobile: "keep",
      decoration: field("plaid", "frame"),
      content: T("Frame", {
        rule: "none",
        inset: "normal",
        child: T("Surface", {
          role: "contrast",
          inset: "normal",
          child: split(
            "62",
            [
              stack(
                [
                  T("Eyebrow"),
                  title({ emphasis: "primary" }),
                  T("Rule", { weight: "hairline", glyphs: "celestial" }),
                  T("Hosts"),
                  T("Venue"),
                ],
                { align: "center" },
              ),
              stack(
                [
                  T("Date", { form: "numeral", emphasis: "display" }),
                  T("Date", { form: "month-year" }),
                  T("Time"),
                  T("CTA", { target: "rsvp" }),
                ],
                { align: "center" },
              ),
            ],
            "stack",
            { divider: "dashed" },
          ),
        }),
      }),
    }),
  "invitation_ticket:stub_left": () =>
    T("Overlay", {
      anchor: "center",
      extent: "full",
      mobile: "keep",
      decoration: field("plaid", "frame"),
      content: T("Frame", {
        rule: "none",
        inset: "normal",
        child: T("Surface", {
          role: "contrast",
          inset: "normal",
          child: split(
            "38",
            [
              stack(
                [
                  T("Date", { form: "numeral", emphasis: "display" }),
                  T("Date", { form: "month-year" }),
                  T("Time"),
                  T("CTA", { target: "rsvp" }),
                ],
                { align: "center" },
              ),
              stack(
                [
                  T("Eyebrow"),
                  title({ emphasis: "primary" }),
                  T("Rule", { weight: "hairline", glyphs: "celestial" }),
                  T("Hosts"),
                  T("Venue"),
                ],
                { align: "center" },
              ),
            ],
            "stack-reverse",
            { divider: "dashed" },
          ),
        }),
      }),
    }),
  "typography_first:band_below": () =>
    stack([
      T("Eyebrow"),
      title({ case: "upper" }),
      T("MotifBand", { motif: { id: "stripe", role: "band" }, height: "medium" }),
      cluster([T("Date", { form: "full" }), T("Time"), T("Venue")], { justify: "between" }),
      T("CTA", { target: "rsvp" }),
    ]),
  "typography_first:band_above": () =>
    stack([
      T("MotifBand", { motif: { id: "stripe", role: "band" }, height: "tall" }),
      T("Eyebrow"),
      title({ case: "upper" }),
      cluster([T("Date", { form: "full" }), T("Time"), T("Venue")], { justify: "between" }),
      T("CTA", { target: "rsvp" }),
    ]),
  "typography_first:band_rail": () =>
    T("Rail", {
      side: "start",
      width: "thin",
      mobile: "top",
      rail: field("gingham", "band"),
      child: stack([
        T("Eyebrow"),
        title({ case: "upper" }),
        cluster([T("Date", { form: "full" }), T("Time"), T("Venue")], { justify: "between" }),
        T("CTA", { target: "rsvp" }),
      ]),
    }),
  "statement_stack:alternate": () =>
    T("Rail", {
      side: "start",
      width: "thin",
      mobile: "top",
      rail: stack([T("Date", { form: "full" }), T("Venue")]),
      child: stack([
        title({ layout: "stagger" }),
        cluster([T("Eyebrow"), T("Hosts"), T("Time")], { justify: "between" }),
        cluster([T("Glyph", { motif: "celestial" }), T("CTA", { target: "rsvp" })], {
          justify: "end",
        }),
      ]),
    }),
  "statement_stack:cascade": () =>
    T("Rail", {
      side: "start",
      width: "thin",
      mobile: "top",
      rail: stack([T("Date", { form: "full" }), T("Venue")]),
      child: stack([
        title({ layout: "cascade" }),
        cluster([T("Eyebrow"), T("Hosts"), T("Time")], { justify: "between" }),
        cluster([T("Glyph", { motif: "celestial" }), T("CTA", { target: "rsvp" })], {
          justify: "end",
        }),
      ]),
    }),
  "statement_numeral:numeral_left": () =>
    split(
      "38",
      [
        stack([
          T("Date", { form: "month-year" }),
          T("Date", { form: "numeral", emphasis: "display" }),
          T("MotifBand", { motif: { id: "stripe", role: "band" }, height: "tall" }),
        ]),
        stack([
          T("Eyebrow"),
          title({ emphasis: "primary" }),
          T("Hosts"),
          cluster([T("Time"), T("Venue"), T("Location")]),
          T("CTA", { target: "rsvp" }),
        ]),
      ],
      "keep",
    ),
  "statement_numeral:numeral_top": () =>
    stack([
      split(
        "38",
        [
          T("Date", { form: "numeral", emphasis: "display" }),
          T("MotifBand", { motif: { id: "stripe", role: "band" }, height: "tall" }),
        ],
        "keep",
        { align: "center" },
      ),
      T("Rule", { weight: "strong" }),
      stack([
        T("Date", { form: "month-year" }),
        T("Eyebrow"),
        title({ emphasis: "primary" }),
        T("Hosts"),
        cluster([T("Time"), T("Venue"), T("Location")]),
        T("CTA", { target: "rsvp" }),
      ]),
    ]),
};

export const HERO_KEYS: readonly HeroKey[] = Object.keys(HEROES) as HeroKey[];
