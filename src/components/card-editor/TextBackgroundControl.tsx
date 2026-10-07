"use client";

import { useState } from "react";

import { Chip } from "@/components/app/Chip";
import { Field } from "@/components/app/Field";
import { Input } from "@/components/app/Input";
import { RangeField } from "@/components/app/RangeField";
import {
  TEXT_BACKGROUND_DARK,
  TEXT_BACKGROUND_LIGHT,
  TEXT_BACKGROUND_PADDING_MAX,
  type TextBackground,
} from "@/lib/card/text-background";

import {
  choiceOf,
  chooseStyle,
  OPACITY_PERCENT,
  opacityPercent,
  setColor,
  setOpacity,
  setPadding,
  type TextBackgroundChoice,
  type TextBackgroundText,
} from "./text-background-control";

/**
 * The text background control of the card editor's Background panel (`spec.md §20.1`;
 * `docs/design-system.md §4.10a`): a radio group of four chips (None, Highlight, Rounded box, Soft
 * backdrop), and for a background its colour (artwork swatches plus white and near-black, and a
 * hex field), opacity and padding. App chrome in app tokens; it never draws card styling, and it
 * never touches the text's own colour or opacity. The swatches are the only coloured elements, and
 * show the colour they set.
 *
 * Controlled: `onChange` receives the next background, or `undefined` for None.
 */

const CHOICES: { choice: TextBackgroundChoice; label: string }[] = [
  { choice: "none", label: "None" },
  { choice: "highlight", label: "Highlight" },
  { choice: "box", label: "Rounded box" },
  { choice: "backdrop", label: "Soft backdrop" },
];

export interface TextBackgroundControlProps {
  value: TextBackground | undefined;
  /** The box's text colour and size: the starting fill and padding derive from them. */
  text: TextBackgroundText;
  /** Colours from the card's artwork, `#RRGGBB`. */
  swatches?: readonly string[];
  onChange: (next: TextBackground | undefined) => void;
  /** Unique within the page: prefixes every control's id. */
  idPrefix: string;
  disabled?: boolean;
}

export function TextBackgroundControl({
  value,
  text,
  swatches = [],
  onChange,
  idPrefix,
  disabled,
}: TextBackgroundControlProps) {
  const selected = choiceOf(value);
  const labelId = `${idPrefix}-style-label`;
  const colours = [
    ...new Set([...swatches, TEXT_BACKGROUND_LIGHT, TEXT_BACKGROUND_DARK].map((c) => c.toUpperCase())),
  ];

  return (
    <div className="flex flex-col gap-4" data-text-background-control="">
      <div className="flex flex-col gap-2">
        <span id={labelId} className="text-label-md text-app-text">
          Text background
        </span>
        <div role="radiogroup" aria-labelledby={labelId} className="flex flex-wrap gap-2">
          {CHOICES.map(({ choice, label }, index) => (
            <Chip
              key={choice}
              role="radio"
              selected={selected === choice}
              disabled={disabled}
              // Roving tabindex: the group is one tab stop and the arrow keys move within it.
              tabIndex={selected === choice ? 0 : -1}
              data-text-background-choice={choice}
              onClick={() => onChange(chooseStyle(value, choice, text))}
              onKeyDown={(event) => {
                const step =
                  event.key === "ArrowRight" || event.key === "ArrowDown"
                    ? 1
                    : event.key === "ArrowLeft" || event.key === "ArrowUp"
                      ? -1
                      : 0;
                if (step === 0) return;
                event.preventDefault();
                const next = CHOICES[(index + step + CHOICES.length) % CHOICES.length];
                onChange(chooseStyle(value, next.choice, text));
                const group = event.currentTarget.parentElement;
                requestAnimationFrame(() =>
                  group
                    ?.querySelector<HTMLElement>(`[data-text-background-choice="${next.choice}"]`)
                    ?.focus(),
                );
              }}
            >
              {label}
            </Chip>
          ))}
        </div>
      </div>

      {value && (
        <>
          <ColorPicker
            idPrefix={idPrefix}
            value={value}
            colours={colours}
            disabled={disabled}
            onChange={onChange}
          />
          <RangeField
            id={`${idPrefix}-opacity`}
            label="Opacity"
            unit="%"
            min={OPACITY_PERCENT.min}
            max={OPACITY_PERCENT.max}
            value={opacityPercent(value)}
            disabled={disabled}
            onChange={(percent) => onChange(setOpacity(value, percent))}
          />
          <RangeField
            id={`${idPrefix}-padding`}
            label="Padding"
            min={0}
            max={TEXT_BACKGROUND_PADDING_MAX}
            value={value.padding}
            disabled={disabled}
            onChange={(padding) => onChange(setPadding(value, padding))}
          />
        </>
      )}
    </div>
  );
}

function ColorPicker({
  idPrefix,
  value,
  colours,
  disabled,
  onChange,
}: {
  idPrefix: string;
  value: TextBackground;
  colours: readonly string[];
  disabled?: boolean;
  onChange: (next: TextBackground) => void;
}) {
  // What the host has typed, until it is a colour; the chosen colour otherwise.
  const [draft, setDraft] = useState<string | null>(null);
  const [error, setError] = useState<string | undefined>();
  const labelId = `${idPrefix}-colour-label`;

  return (
    <div className="flex flex-col gap-2">
      <span id={labelId} className="text-label-md text-app-text">
        Colour
      </span>
      <div role="group" aria-labelledby={labelId} className="flex flex-wrap gap-2">
        {colours.map((colour) => (
          <button
            key={colour}
            type="button"
            aria-label={colour}
            aria-pressed={value.color === colour}
            disabled={disabled}
            data-text-background-swatch={colour}
            onClick={() => {
              setDraft(null);
              setError(undefined);
              onChange({ ...value, color: colour });
            }}
            className={
              "app-press inline-flex h-11 w-11 items-center justify-center rounded-pill border disabled:cursor-not-allowed disabled:opacity-50 " +
              (value.color === colour
                ? "border-app-text ring-2 ring-app-text"
                : "border-app-border-strong")
            }
          >
            <span
              aria-hidden="true"
              className="h-7 w-7 rounded-pill border border-app-border"
              // The swatch shows the colour it sets: a data value, not an app colour.
              style={{ background: colour }}
            />
          </button>
        ))}
      </div>
      <Field id={`${idPrefix}-hex`} label="Hex colour" error={error}>
        {(control) => (
          <Input
            {...control}
            type="text"
            autoComplete="off"
            autoCapitalize="characters"
            spellCheck={false}
            maxLength={8}
            disabled={disabled}
            value={draft ?? value.color}
            onChange={(event) => {
              const input = event.target.value;
              setDraft(input);
              const result = setColor(value, input);
              if (result.ok) {
                setError(undefined);
                onChange(result.value);
              } else {
                setError(result.error);
              }
            }}
            onBlur={() => {
              // Back to the colour in force; a half-typed one is dropped.
              setDraft(null);
              setError(undefined);
            }}
          />
        )}
      </Field>
    </div>
  );
}
