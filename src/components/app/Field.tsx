import type { ReactNode } from "react";

/**
 * Canonical field wrapper (docs/design-system.md §10.5, §11.1-§11.2): a persistent visible
 * label, optional hint, and inline error — never a floating-label pattern.
 *
 * The control itself is supplied by the caller through a render-prop so the accessibility
 * wiring (`id`, `aria-describedby`, `aria-invalid`) always lines up with the label/hint/error
 * actually rendered.
 */

export interface FieldControlProps {
  id: string;
  "aria-describedby"?: string;
  "aria-invalid"?: boolean;
}

export interface FieldProps {
  id: string;
  label: string;
  hint?: string;
  error?: string;
  required?: boolean;
  className?: string;
  children: (controlProps: FieldControlProps) => ReactNode;
}

export function Field({ id, label, hint, error, required, className, children }: FieldProps) {
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  const describedBy = [hintId, errorId].filter(Boolean).join(" ") || undefined;

  return (
    <div className={className ? `flex flex-col gap-1.5 ${className}` : "flex flex-col gap-1.5"}>
      <label htmlFor={id} className="text-label-md text-app-text">
        {label}
        {required && (
          <span aria-hidden="true" className="text-app-danger">
            {" "}
            *
          </span>
        )}
      </label>
      {children({ id, "aria-describedby": describedBy, "aria-invalid": Boolean(error) })}
      {hint && !error && (
        <p id={hintId} className="text-body-sm text-app-text-secondary">
          {hint}
        </p>
      )}
      {error && (
        <p id={errorId} role="alert" className="text-body-sm text-app-danger">
          {error}
        </p>
      )}
    </div>
  );
}
