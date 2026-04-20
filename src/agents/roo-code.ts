/**
 * Roo Code adapter.
 *
 * Roo Code is a VS Code extension (no standalone PATH binary). Skills
 * live under `~/.roo/skills/` at user scope and `<project>/.roo/skills/`
 * at project scope. Detection relies on the presence of `~/.roo/` since
 * there's no binary to look for.
 */

import { join } from "node:path";
import { isDirectory } from "../util/fs.ts";
import type { AgentAdapter } from "./adapter.ts";
import { userHome } from "./path.ts";

export const rooCodeAdapter: AgentAdapter = {
  name: "roo-code",
  detect(): boolean {
    return isDirectory(join(userHome(), ".roo"));
  },
  userPath(): string {
    return join(userHome(), ".roo", "skills");
  },
  projectPath(cwd: string): string {
    return join(cwd, ".roo", "skills");
  },
};
