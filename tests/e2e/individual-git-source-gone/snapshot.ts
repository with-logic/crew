/** Byte, path, type, and symlink preservation evidence for update previews (§10.1.1). */

import { lstatSync, readdirSync, readFileSync, readlinkSync } from "node:fs";
import { join } from "node:path";

type NodeSnapshot =
  | { readonly type: "directory" }
  | { readonly type: "link"; readonly target: string }
  | { readonly type: "file"; readonly hex: string };

/** Capture trees without following links; only the refreshed clone tree is excluded. */
export function snapshot(
  root: string,
  excluded: readonly string[] = [],
): Record<string, NodeSnapshot> {
  const result: Record<string, NodeSnapshot> = {};
  function visit(path: string, relative: string): void {
    const stat = lstatSync(path, { throwIfNoEntry: false });
    if (!stat) return;
    if (stat.isSymbolicLink()) result[relative] = { type: "link", target: readlinkSync(path) };
    else if (stat.isDirectory()) {
      result[relative] = { type: "directory" };
      for (const name of readdirSync(path).sort()) {
        const next = relative ? `${relative}/${name}` : name;
        if (!excluded.includes(next)) visit(join(path, name), next);
      }
    } else
      result[relative] = {
        type: "file",
        hex:
          relative.startsWith("locks/") && relative.endsWith(".lock.owner")
            ? "<coordination-owner>"
            : readFileSync(path).toString("hex"),
      };
  }
  visit(root, "");
  return result;
}
