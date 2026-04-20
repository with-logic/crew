import styles from "./Brand.module.css";
import { BrandMark } from "./BrandMark";

interface BrandProps {
  readonly as?: "div" | "span";
}

/** Brand mark + wordmark combo, as rendered in the nav and footer. */
export function Brand({ as: Tag = "div" }: BrandProps) {
  return (
    <Tag className={styles.brand}>
      <BrandMark /> crew
    </Tag>
  );
}
