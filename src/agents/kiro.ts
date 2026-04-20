/**
 * Kiro adapter.
 *
 * Kiro stores skills under `~/.kiro/skills/` at user scope and
 * `<project>/.kiro/skills/` at project scope. The `kiro` binary on
 * PATH is the detection signal when no user config dir exists.
 */

import { join } from "node:path";
import { isDirectory } from "../util/fs.ts";
import type { AgentAdapter } from "./adapter.ts";
import { isOnPath, userHome } from "./path.ts";

export const kiroAdapter: AgentAdapter = {
  name: "kiro",
  detect(): boolean {
    return isDirectory(join(userHome(), ".kiro")) || isOnPath("kiro");
  },
  userPath(): string {
    return join(userHome(), ".kiro", "skills");
  },
  projectPath(cwd: string): string {
    return join(cwd, ".kiro", "skills");
  },
};
