import styles from "./BrandMark.module.css";

/**
 * The diamond-in-diamond brand mark. Placeholder shape for the real
 * logo — swap the CSS geometry when the SVG lands.
 */
export function BrandMark() {
  return <span className={styles.mark} aria-hidden="true" />;
}
