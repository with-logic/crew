/**
 * Amp adapter.
 *
 * Amp (Sourcegraph) stores user-scope skills under
 * `~/.config/amp/skills/` and project-scope skills under
 * `<project>/.agents/skills/`. The `amp` binary is the detection
 * signal when no user config dir exists.
 */

import { join } from "node:path";
import { isDirectory } from "../util/fs.ts";
import type { AgentAdapter } from "./adapter.ts";
import { isOnPath, userHome } from "./path.ts";

export const ampAdapter: AgentAdapter = {
  name: "amp",
  detect(): boolean {
    return isDirectory(join(userHome(), ".config", "amp")) || isOnPath("amp");
  },
  userPath(): string {
    return join(userHome(), ".config", "amp", "skills");
  },
  projectPath(cwd: string): string {
    return join(cwd, ".agents", "skills");
  },
};
