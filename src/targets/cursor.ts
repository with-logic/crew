/**
 * Cursor adapter.
 *
 * Cursor reads skills from `~/.agents/skills/`, `~/.cursor/skills/`,
 * `~/.claude/skills/`, and `~/.codex/skills/` at user scope, and the
 * same four `.foo/skills/` variants at project scope. We write to
 * `.agents/skills/` so one install serves Cursor plus every other
 * adapter that shares the path (§7.2 path sharing). Detection still
 * uses the Cursor-specific signals: `cursor-agent` on PATH,
 * `~/.cursor/` exists, or the Cursor.app bundle under `/Applications/`.
 */

import { join } from "node:path";
import { isDirectory } from "../util/fs.ts";
import type { TargetAdapter } from "./adapter.ts";
import { isOnPath, userHome } from "./path.ts";

export const cursorAdapter: TargetAdapter = {
  name: "cursor",
  detect(): boolean {
    return (
      isDirectory(join(userHome(), ".cursor")) ||
      isOnPath("cursor-agent") ||
      isDirectory("/Applications/Cursor.app")
    );
  },
  userPath(): string {
    return join(userHome(), ".agents", "skills");
  },
  projectPath(cwd: string): string {
    return join(cwd, ".agents", "skills");
  },
};
