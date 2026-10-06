import { LOW_CONTRAST_HINT, showLowContrastHint } from "./low-contrast-hint";

/**
 * The plain line under the card telling the host that some words sit on a busy part of the
 * picture (`low-contrast-hint.ts`), or nothing. App chrome beside the card, in the same text style
 * as the "not confirmed yet" line (`ConfirmLegend`); never part of the card, so guests never see it.
 */
export function LowContrastHint({
  card,
  className,
}: {
  card: { lowContrast: boolean; customization: unknown };
  className?: string;
}) {
  if (!showLowContrastHint(card)) return null;
  return (
    <p
      role="note"
      data-low-contrast-hint=""
      className={`text-center text-body-sm text-app-text-secondary ${className ?? ""}`}
    >
      {LOW_CONTRAST_HINT}
    </p>
  );
}
