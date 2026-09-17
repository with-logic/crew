/**
 * Building a brand-new tap for `crew tap add` (§16.3): derive its name,
 * clone it (leaving no partial directory on failure), and shape its
 * `config.yaml` entry. Split from `./add.ts`, which owns the add flow.
 */

import { tapPath } from "../../core/paths.ts";
import type { TapConfig } from "../../core/types.ts";
import { ensureClone } from "../../git/repo/index.ts";
import { deriveAutoTapName } from "../../install/tap-naming.ts";
import { exists, rmrf } from "../../util/fs.ts";
import type { TapAddTarget } from "./target.ts";

export function deriveName(target: TapAddTarget): string {
  if (target.kind === "git") return deriveAutoTapName(target.url, target.subpath);
  return target.path.split("/").filter(Boolean).pop() ?? "local";
}

/** Clone a new git tap; a failed clone leaves no partial directory (§16.3). */
export function cloneNewTap(name: string, url: string, home: string): void {
  const cloneDir = tapPath(name, home);
  try {
    ensureClone(url, cloneDir);
  } catch (err) {
    if (exists(cloneDir)) rmrf(cloneDir);
    throw err;
  }
}

export function newTapOf(name: string, target: TapAddTarget, recursive: boolean): TapConfig {
  return {
    name,
    kind: target.kind,
    registered: true,
    url: target.url,
    subpath: target.subpath,
    path: target.path,
    ...(recursive ? { discovery: "recursive" } : {}),
  };
}
