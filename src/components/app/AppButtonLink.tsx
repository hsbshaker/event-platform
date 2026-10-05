import Link from "next/link";
import type { ComponentProps } from "react";
import { appButtonClasses, type AppButtonSize, type AppButtonVariant } from "./AppButton";

/**
 * A navigation link that looks like `AppButton` (docs/design-system.md §10.1): for an action that
 * goes to another page, such as `Make it yours →`, so it stays a real link (keyboard, open in a new
 * tab) and never a button inside an anchor.
 */
export interface AppButtonLinkProps extends Omit<ComponentProps<typeof Link>, "className"> {
  variant?: AppButtonVariant;
  size?: AppButtonSize;
  className?: string;
}

export function AppButtonLink({
  variant = "primary",
  size = "md",
  className,
  children,
  ...props
}: AppButtonLinkProps) {
  return (
    <Link {...props} className={appButtonClasses(variant, size, className)}>
      {children}
    </Link>
  );
}
