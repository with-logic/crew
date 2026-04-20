/**
 * Cursor adapter.
 *
 * Cursor stores skills under `~/.cursor/skills/` at user scope and
 * `<project>/.cursor/skills/` at project scope. Detection accepts any
 * of: `cursor-agent` on PATH, `~/.cursor/` exists, or the Cursor.app
 * bundle is installed under `/Applications/`.
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
    return join(userHome(), ".cursor", "skills");
  },
  projectPath(cwd: string): string {
    return join(cwd, ".cursor", "skills");
  },
};
