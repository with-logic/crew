import type { ReactNode } from "react";
import styles from "./Pill.module.css";

interface PillProps {
  readonly children: ReactNode;
  /** Tinted accent background with a colored border. */
  readonly accent?: boolean;
}

/** Rounded monospace pill. Used for kickers, chips, small labels. */
export function Pill({ children, accent = false }: PillProps) {
  return <span className={`${styles.pill} ${accent ? styles.accent : ""}`}>{children}</span>;
}
