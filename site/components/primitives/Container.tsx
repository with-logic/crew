import type { HTMLAttributes, ReactNode } from "react";
import styles from "./Container.module.css";

interface ContainerProps extends HTMLAttributes<HTMLDivElement> {
  readonly children: ReactNode;
}

/** Horizontally-constrained content wrapper. */
export function Container({ children, className, ...rest }: ContainerProps) {
  const composed = className ? `${styles.wrap} ${className}` : styles.wrap;
  return (
    <div className={composed} {...rest}>
      {children}
    </div>
  );
}
