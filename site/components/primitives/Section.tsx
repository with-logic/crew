import type { HTMLAttributes, ReactNode } from "react";
import styles from "./Section.module.css";

interface SectionProps extends HTMLAttributes<HTMLElement> {
  readonly children: ReactNode;
  readonly tight?: boolean;
  readonly ruleTop?: boolean;
  readonly ruleBottom?: boolean;
}

/** A top-level page section with consistent vertical padding. */
export function Section({
  children,
  tight = false,
  ruleTop = false,
  ruleBottom = false,
  className,
  ...rest
}: SectionProps) {
  const classes = [
    styles.section,
    tight && styles.tight,
    ruleTop && styles.ruleTop,
    ruleBottom && styles.ruleBottom,
    className,
  ]
    .filter(Boolean)
    .join(" ");
  return (
    <section className={classes} {...rest}>
      {children}
    </section>
  );
}
