/**
 * CSS Module imports. Next.js doesn't generate per-file typed bindings
 * out of the box, so we treat module objects as plain Records. The
 * `styles.foo` style stays ergonomic — if a class doesn't exist, the
 * value is just `undefined` at runtime (React ignores undefined
 * className values), which we'd catch visually while building.
 */
declare module "*.module.css" {
  const classes: Record<string, string>;
  export default classes;
}

declare module "*.png" {
  import type { StaticImageData } from "next/image";

  const src: StaticImageData;
  export default src;
}
