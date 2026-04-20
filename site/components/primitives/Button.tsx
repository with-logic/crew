import type { AnchorHTMLAttributes, ReactNode } from "react";
import styles from "./Button.module.css";

interface ButtonProps extends AnchorHTMLAttributes<HTMLAnchorElement> {
  readonly children: ReactNode;
  readonly variant?: "solid" | "ghost";
}

/** Monospace CTA button. Rendered as an anchor. */
export function Button({ children, variant = "solid", className, ...rest }: ButtonProps) {
  const classes = [styles.btn, variant === "ghost" && styles.ghost, className]
    .filter(Boolean)
    .join(" ");
  return (
    <a className={classes} {...rest}>
      {children}
    </a>
  );
}
