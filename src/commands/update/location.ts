/** Shared project-location tags for re-expansion output (§10.1.1). */

import type { Scope } from "../../core/types.ts";
import { shortenHome } from "../../util/format.ts";
import { safePath } from "../../util/redact.ts";
import type { Styler } from "../../util/term.ts";

/** Keep user labels unchanged and escape project paths before applying styling. */
export function projectTag(
  row: { readonly scope: Scope; readonly project_root?: string },
  style?: Styler,
): string {
  if (row.scope !== "project" || !row.project_root) return "";
  const tag = ` (in ${safePath(shortenHome(row.project_root))})`;
  return style ? style.dim(tag) : tag;
}
