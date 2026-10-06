import { cx } from "./cx";

/**
 * The brand mark (docs/design-system.md §5.2): an amber seal with an "R". It is a placeholder
 * until Revelnote has a real logo, kept to this one component so the mark is swapped in one
 * place. Decorative wherever the name "Revelnote" is also present as text.
 */
export type BrandSealSize = "sm" | "md" | "lg";

const SIZE_CLASSES: Record<BrandSealSize, string> = {
  sm: "h-6 w-6 text-label-sm",
  md: "h-8 w-8 text-heading-md",
  lg: "h-12 w-12 text-heading-lg",
};

export function BrandSeal({
  size = "md",
  className,
}: {
  size?: BrandSealSize;
  className?: string;
}) {
  return (
    <span
      aria-hidden="true"
      className={cx(
        "inline-grid shrink-0 place-items-center rounded-pill bg-app-action font-bold text-app-action-text shadow-soft",
        SIZE_CLASSES[size],
        className,
      )}
    >
      R
    </span>
  );
}

/** The seal and the name together: the app's wordmark until a real logo exists. */
export function Wordmark({ size = "md", className }: { size?: "sm" | "md"; className?: string }) {
  return (
    <span
      className={cx(
        "inline-flex items-center",
        size === "md" ? "gap-3 text-heading-md" : "gap-2 text-label-md",
        className,
      )}
    >
      <BrandSeal size={size} />
      Revelnote
    </span>
  );
}
