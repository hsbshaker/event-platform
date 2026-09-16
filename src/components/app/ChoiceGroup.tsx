import type { ReactNode } from "react";
import { cx } from "./cx";

/**
 * Canonical single-choice control: a real radio group, one visible label per option.
 *
 * Added here rather than inlined in a feature screen because `docs/design-system.md §23` forbids
 * page-local forks of shared controls, and §10.5 already anticipates `Field` wrapping a
 * "structured control wrapper" — this is that wrapper for the one case `Field` cannot serve, since
 * a group of radios is labelled by a `<legend>` and not by a `<label for>`. It introduces no new
 * colour, radius, shadow, spacing step or type size: every value here is an existing semantic
 * token, and the option row is the same 44px minimum `AppButton` uses (§7.6).
 *
 * Native `<input type="radio">` on purpose. Arrow-key traversal, roving focus, the required-group
 * semantics and the announcement of the legend all come from the platform; a div-with-ARIA
 * reimplementation of that is how a surface ends up keyboard-reachable in a test and unusable in
 * a screen reader.
 *
 * Not yet an entry in `docs/design-system.md §10` — adding one is a canonical change under
 * `CLAUDE.md §12` and needs explicit approval, so it is proposed rather than assumed.
 */

export interface ChoiceOption {
  value: string;
  label: string;
  /** Optional quiet note under the label. Never carries meaning colour alone (§14.6). */
  note?: string;
}

export interface ChoiceGroupProps {
  name: string;
  legend: string;
  /** Supporting copy, associated with the group rather than with one option. */
  hint?: ReactNode;
  options: ChoiceOption[];
  value: string | null;
  onChange: (value: string) => void;
  error?: string;
  disabled?: boolean;
  className?: string;
}

export function ChoiceGroup({
  name,
  legend,
  hint,
  options,
  value,
  onChange,
  error,
  disabled,
  className,
}: ChoiceGroupProps) {
  const hintId = hint ? `${name}-hint` : undefined;
  const errorId = error ? `${name}-error` : undefined;
  const describedBy = [hintId, errorId].filter(Boolean).join(" ") || undefined;

  return (
    <fieldset
      className={cx("flex flex-col gap-3 border-0 p-0", className)}
      aria-describedby={describedBy}
      aria-invalid={error ? true : undefined}
      disabled={disabled}
    >
      <legend className="text-label-md text-app-text">{legend}</legend>
      {hint && (
        <p id={hintId} className="text-body-sm text-app-text-secondary">
          {hint}
        </p>
      )}
      <div className="flex flex-col gap-2">
        {options.map((option) => (
          <label
            key={option.value}
            className={cx(
              "flex min-h-11 cursor-pointer items-start gap-3 rounded-lg border p-3 transition-colors",
              "has-[:focus-visible]:outline has-[:focus-visible]:outline-2",
              "has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-app-focus",
              value === option.value
                ? "border-app-border-strong bg-app-surface-subtle"
                : "border-app-border bg-app-surface hover:bg-app-surface-subtle",
            )}
          >
            <input
              type="radio"
              name={name}
              value={option.value}
              checked={value === option.value}
              onChange={() => onChange(option.value)}
              className="mt-0.5 h-5 w-5 shrink-0 accent-[var(--app-action)]"
            />
            <span className="flex flex-col gap-0.5">
              <span className="text-body-md text-app-text">{option.label}</span>
              {option.note && (
                <span className="text-body-sm text-app-text-secondary">{option.note}</span>
              )}
            </span>
          </label>
        ))}
      </div>
      {error && (
        <p id={errorId} role="alert" className="text-body-sm text-app-danger">
          {error}
        </p>
      )}
    </fieldset>
  );
}
