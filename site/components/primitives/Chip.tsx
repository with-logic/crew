import type { ReactNode } from "react";
import styles from "./Chip.module.css";

interface ChipProps {
  readonly children: ReactNode;
  /** Small circular dot before the label (common "status chip" pattern). */
  readonly dot?: boolean;
}

/** Small rounded-rectangle label, used in the agents strip and elsewhere. */
export function Chip({ children, dot = false }: ChipProps) {
  return (
    <span className={`${styles.chip} ${dot ? styles.withDot : ""}`}>
      {dot ? <span className={styles.dot} /> : null}
      {children}
    </span>
  );
}
