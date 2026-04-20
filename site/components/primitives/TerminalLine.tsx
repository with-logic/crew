import type { ReactNode } from "react";
import styles from "./TerminalLine.module.css";

interface TerminalLineProps {
  readonly children: ReactNode;
  /** Prompt shown in the gutter. Defaults to `$ `. Pass "" for a continuation line. */
  readonly prompt?: string;
  /** A status marker at the start of the content: ✓, ✗, etc. */
  readonly status?: "ok" | "warn" | "muted";
}

/** A single line inside a <Terminal>. */
export function TerminalLine({ children, prompt = "$", status }: TerminalLineProps) {
  const statusClass = status ? styles[status] : undefined;
  return (
    <div className={styles.line}>
      <span className={styles.prompt}>{prompt || <>&nbsp;</>}</span>
      {status ? (
        <span className={statusClass}>{status === "ok" ? "✓" : status === "warn" ? "✗" : "·"}</span>
      ) : null}
      <span className={styles.content}>{children}</span>
    </div>
  );
}
