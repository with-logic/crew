import type { ReactNode } from "react";
import styles from "./Terminal.module.css";

interface TerminalProps {
  readonly children: ReactNode;
  /** Optional title shown in the terminal chrome (e.g. `~/work · zsh`). */
  readonly title?: string;
  /** Optional right-side element — a copy button, a label, etc. */
  readonly action?: ReactNode;
}

/**
 * A stylized terminal window: traffic-light dots, a title, and
 * monospace body content. Use <Prompt>, <Output>, etc. for lines.
 */
export function Terminal({ children, title, action }: TerminalProps) {
  return (
    <div className={styles.card}>
      <div className={styles.head}>
        <div className={styles.dots}>
          <i />
          <i />
          <i />
        </div>
        {title ? <span className={styles.title}>{title}</span> : null}
        {action ? <div className={styles.action}>{action}</div> : null}
      </div>
      <div className={styles.body}>{children}</div>
    </div>
  );
}
