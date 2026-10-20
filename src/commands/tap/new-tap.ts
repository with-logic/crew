/**
 * Building a brand-new tap for `crew tap add` (§16.3): derive its name,
 * clone it (leaving no partial directory on failure), and shape its
 * `config.yaml` entry. Split from `./add.ts`, which owns the add flow.
 */

import { repoClonePath } from "../../core/repo-path.ts";
import type { TapConfig } from "../../core/types.ts";
import { ensureClone } from "../../git/repo/index.ts";
import { deriveAutoTapName } from "../../install/tap-naming.ts";
import { withTapLocks } from "../../sources/tap-lock.ts";
import { exists, rmrf } from "../../util/fs.ts";
import type { TapAddTarget } from "./target.ts";

export function deriveName(target: TapAddTarget): string {
  if (target.kind === "git") return deriveAutoTapName(target.url, target.subpath);
  return target.path.split("/").filter(Boolean).pop() ?? "local";
}

/** Clone a new git tap; a failed clone leaves no partial directory (§16.3). */
export function cloneNewTap(url: string, home: string): void {
  withTapLocks(
    [{ name: "", kind: "git", url, subpath: "", path: "", registered: true }],
    home,
    () => {
      const cloneDir = repoClonePath(url, home);
      const preexisting = exists(cloneDir);
      try {
        ensureClone(url, cloneDir);
      } catch (err) {
        if (!preexisting && exists(cloneDir)) rmrf(cloneDir);
        throw err;
      }
    },
  );
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
