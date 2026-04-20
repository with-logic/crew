import type { ReactNode } from "react";
import styles from "./Eyebrow.module.css";

interface EyebrowProps {
  readonly children: ReactNode;
  /** Center the eyebrow within its container. */
  readonly centered?: boolean;
}

/** Monospace label with a leading dash. "PROMPT_LIKE LABEL". */
export function Eyebrow({ children, centered = false }: EyebrowProps) {
  return <p className={`${styles.eyebrow} ${centered ? styles.centered : ""}`}>{children}</p>;
}
