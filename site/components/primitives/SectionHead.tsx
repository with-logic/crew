import type { ReactNode } from "react";
import styles from "./SectionHead.module.css";

interface SectionHeadProps {
  readonly number: string;
  readonly label: string;
  readonly title: ReactNode;
  readonly description: ReactNode;
}

/**
 * Two-column section head used at the top of most page sections:
 * a "§ NN  <label>" number block on the left, a heading + lede on the right.
 */
export function SectionHead({ number, label, title, description }: SectionHeadProps) {
  return (
    <div className={styles.head}>
      <div className={styles.num}>
        § {number}&nbsp;&nbsp;<strong>{label}</strong>
      </div>
      <div>
        <h2 className={styles.title}>{title}</h2>
        <p className={styles.description}>{description}</p>
      </div>
    </div>
  );
}
