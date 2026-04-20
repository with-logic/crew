/**
 * Command Code adapter.
 *
 * Command Code reads skills from `~/.commandcode/skills/` and
 * `~/.agents/skills/` (user), plus `.commandcode/skills/` and
 * `.agents/skills/` (project). We write to `.agents/skills/` so one
 * install serves Command Code plus every other adapter that shares
 * the path (§7.2 path sharing). On name conflicts, Command Code
 * prefers its own-branded path over `.agents/`, but crew installs
 * always land at the shared path so this doesn't create a conflict
 * unless a user hand-populates `~/.commandcode/skills/`.
 */

import { join } from "node:path";
import { isDirectory } from "../util/fs.ts";
import type { AgentAdapter } from "./adapter.ts";
import { isOnPath, userHome } from "./path.ts";

export const commandCodeAdapter: AgentAdapter = {
  name: "command-code",
  detect(): boolean {
    return (
      isDirectory(join(userHome(), ".commandcode")) || isOnPath("command-code") || isOnPath("cmd")
    );
  },
  userPath(): string {
    return join(userHome(), ".agents", "skills");
  },
  projectPath(cwd: string): string {
    return join(cwd, ".agents", "skills");
  },
};
