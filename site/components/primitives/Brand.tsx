import styles from "./Brand.module.css";
import { BrandMark } from "./BrandMark";

interface BrandProps {
  readonly as?: "div" | "span";
  /** If set, renders as a link to this href. */
  readonly href?: string;
}

/** Brand mark + wordmark combo, as rendered in the nav and footer. */
export function Brand({ as: Tag = "div", href }: BrandProps) {
  if (href !== undefined) {
    return (
      <a className={styles.brand} href={href} aria-label="crew home">
        <BrandMark /> crew
      </a>
    );
  }
  return (
    <Tag className={styles.brand}>
      <BrandMark /> crew
    </Tag>
  );
}
