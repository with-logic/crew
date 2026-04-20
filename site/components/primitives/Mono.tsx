import type { ReactNode } from "react";

/** Inline monospace text. Thin semantic wrapper over `<code>`. */
export function Mono({ children }: { readonly children: ReactNode }) {
  return <code>{children}</code>;
}
