/** Shared raw namespace-qualified references for search results (§8, §16.6). */
import type { SearchHit } from "./types.ts";

export function skillRef(hit: Pick<SearchHit, "name" | "namespace">): string {
  if (hit.namespace === null) return hit.name;
  return `${hit.namespace}/${hit.name}`;
}
