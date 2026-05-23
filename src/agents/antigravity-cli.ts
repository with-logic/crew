/**
 * Antigravity CLI adapter.
 *
 * Antigravity CLI stores user-scope skills under
 * `~/.gemini/antigravity-cli/skills/` and project-scope skills under
 * `<project>/.agents/skills/`.
 */

import { join } from "node:path";
import { isDirectory } from "../util/fs.ts";
import type { AgentAdapter } from "./adapter.ts";
import { isOnPath, userHome } from "./path.ts";

export const antigravityCliAdapter: AgentAdapter = {
  name: "antigravity-cli",
  detect(): boolean {
    return (
      isDirectory(join(userHome(), ".gemini", "antigravity-cli")) ||
      isOnPath("antigravity") ||
      isOnPath("antigravity-cli")
    );
  },
  userPath(): string {
    return join(userHome(), ".gemini", "antigravity-cli", "skills");
  },
  projectPath(cwd: string): string {
    return join(cwd, ".agents", "skills");
  },
};
