/** Invalid owner and digest values rejected by doctor's §11.2 marker inventory. */
import type { Marker } from "../../../src/core/types.ts";

export const INVALID_METADATA: readonly {
  readonly name: string;
  readonly kind: "path" | "git";
  readonly fields: Partial<Marker>;
}[] = [
  { name: "unknown-only owners", kind: "path", fields: { agents: ["unsupported-agent"] } },
  { name: "mixed owners", kind: "path", fields: { agents: ["claude-code", "unsupported-agent"] } },
  { name: "empty hash", kind: "path", fields: { content_hash: "" } },
  { name: "short hash", kind: "path", fields: { content_hash: "sha256:abc" } },
  { name: "prefixless hash", kind: "path", fields: { content_hash: "a".repeat(64) } },
  { name: "nonhex hash", kind: "path", fields: { content_hash: `sha256:${"g".repeat(64)}` } },
  { name: "uppercase hash", kind: "path", fields: { content_hash: `sha256:${"A".repeat(64)}` } },
  { name: "newline hash", kind: "path", fields: { content_hash: `sha256:${"a".repeat(64)}\n` } },
  { name: "path SHA", kind: "path", fields: { resolved_sha: "a".repeat(40) } },
  { name: "null git SHA", kind: "git", fields: { resolved_sha: null } },
  { name: "empty git SHA", kind: "git", fields: { resolved_sha: "" } },
  { name: "short git SHA", kind: "git", fields: { resolved_sha: "a".repeat(39) } },
  { name: "nonhex git SHA", kind: "git", fields: { resolved_sha: "g".repeat(40) } },
  { name: "newline git SHA", kind: "git", fields: { resolved_sha: `${"a".repeat(40)}\n` } },
];
