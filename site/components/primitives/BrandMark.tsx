import Image from "next/image";
import logo from "../../public/logo.png";
import styles from "./BrandMark.module.css";

/**
 * The crew brand mark — stacked rotated squares, terracotta, on a
 * transparent background. Used in the nav and footer. Next.js
 * requires an intrinsic width/height so it can reserve layout space;
 * the CSS class sizes it down to display size (16px).
 */
export function BrandMark() {
  return (
    <Image
      src={logo}
      alt=""
      width={512}
      height={512}
      className={styles.mark}
      aria-hidden="true"
      priority
    />
  );
}
