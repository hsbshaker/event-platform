"use client";

import { useState } from "react";

import { Field } from "./Field";
import { Input } from "./Input";

/**
 * Canonical slider with its paired numeric field (`docs/design-system.md §4.10a`, "opacity and
 * padding are a slider with its paired numeric field"): one labelled value the host can drag, step
 * with the arrow keys, or type. The two controls always show the same number. 44px tall hit target
 * (§7.4); app tokens only.
 *
 * The number may be typed freely: an in-range value applies as it is typed, and anything else is
 * brought back into range when the field loses focus (`onChange` only ever receives a whole
 * multiple of `step` inside `min`..`max`).
 */
export interface RangeFieldProps {
  /** Id of the numeric field; the slider's is `${id}-slider`. */
  id: string;
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  /** Shown after the label, e.g. `%`; spoken as part of the value (`aria-valuetext`). */
  unit?: string;
  onChange: (value: number) => void;
  disabled?: boolean;
}

function snap(n: number, min: number, max: number, step: number): number {
  const stepped = min + Math.round((n - min) / step) * step;
  return Math.min(max, Math.max(min, Number(stepped.toFixed(6))));
}

export function RangeField({
  id,
  label,
  value,
  min,
  max,
  step = 1,
  unit,
  onChange,
  disabled,
}: RangeFieldProps) {
  const [draft, setDraft] = useState<string | null>(null);
  const hint = unit ? `${min}–${max}${unit}` : `${min}–${max}`;

  return (
    <div role="group" aria-label={label} className="flex flex-col gap-1.5">
      <div className="flex items-end gap-3">
        <input
          id={`${id}-slider`}
          type="range"
          aria-label={`${label} slider`}
          aria-valuetext={`${value}${unit ?? ""}`}
          min={min}
          max={max}
          step={step}
          value={value}
          disabled={disabled}
          onChange={(event) => {
            setDraft(null);
            onChange(Number(event.target.value));
          }}
          className="h-11 min-w-0 flex-1 cursor-pointer accent-app-action disabled:cursor-not-allowed disabled:opacity-50"
        />
        <Field id={id} label={unit ? `${label} (${unit})` : label} className="w-28 shrink-0">
          {(control) => (
            <Input
              {...control}
              type="number"
              inputMode="decimal"
              min={min}
              max={max}
              step={step}
              title={hint}
              disabled={disabled}
              value={draft ?? String(value)}
              onChange={(event) => {
                const text = event.target.value;
                setDraft(text);
                const n = Number(text);
                if (text.trim() !== "" && Number.isFinite(n) && n >= min && n <= max) {
                  onChange(snap(n, min, max, step));
                }
              }}
              onBlur={() => {
                if (draft === null) return;
                const n = Number(draft);
                if (draft.trim() !== "" && Number.isFinite(n)) onChange(snap(n, min, max, step));
                setDraft(null);
              }}
            />
          )}
        </Field>
      </div>
    </div>
  );
}
