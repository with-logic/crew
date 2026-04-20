/**
 * Command Code adapter.
 *
 * Command Code stores skills under `~/.commandcode/skills/` at user
 * scope and `<project>/.commandcode/skills/` at project scope. The
 * `command-code` (or shorter `cmd`) binary on PATH is the detection
 * signal when no user config dir exists.
 */

import { join } from "node:path";
import { isDirectory } from "../util/fs.ts";
import type { TargetAdapter } from "./adapter.ts";
import { isOnPath, userHome } from "./path.ts";

export const commandCodeAdapter: TargetAdapter = {
  name: "command-code",
  detect(): boolean {
    return (
      isDirectory(join(userHome(), ".commandcode")) || isOnPath("command-code") || isOnPath("cmd")
    );
  },
  userPath(): string {
    return join(userHome(), ".commandcode", "skills");
  },
  projectPath(cwd: string): string {
    return join(cwd, ".commandcode", "skills");
  },
};
