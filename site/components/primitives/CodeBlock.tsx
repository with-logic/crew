import type { ReactNode } from "react";
import styles from "./CodeBlock.module.css";

interface CodeBlockProps {
  readonly children: ReactNode;
  /** Dark terminal palette (default) or light paper palette. */
  readonly variant?: "dark" | "light";
}

/** A monospace code block with light or dark palette. */
export function CodeBlock({ children, variant = "dark" }: CodeBlockProps) {
  const cls = variant === "light" ? `${styles.code} ${styles.light}` : styles.code;
  return <pre className={cls}>{children}</pre>;
}

/** Syntax-highlight helpers for use inside <CodeBlock>. */
export const Cmt = ({ children }: { children: ReactNode }) => (
  <span className={styles.cmt}>{children}</span>
);
export const Prompt = ({ children = "$" }: { children?: ReactNode }) => (
  <span className={styles.p}>{children}</span>
);
export const Ok = ({ children }: { children: ReactNode }) => (
  <span className={styles.ok}>{children}</span>
);
export const Warn = ({ children }: { children: ReactNode }) => (
  <span className={styles.warn}>{children}</span>
);
export const Acc = ({ children }: { children: ReactNode }) => (
  <span className={styles.acc}>{children}</span>
);
export const Key = ({ children }: { children: ReactNode }) => (
  <span className={styles.key}>{children}</span>
);
