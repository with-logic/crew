/**
 * Autohand Code CLI adapter.
 *
 * Autohand stores skills under `~/.autohand/skills/` at user scope and
 * `<project>/.autohand/skills/` at project scope. The `autohand` binary
 * is the detection signal when no user config dir exists.
 */

import { join } from "node:path";
import { isDirectory } from "../util/fs.ts";
import type { AgentAdapter } from "./adapter.ts";
import { isOnPath, userHome } from "./path.ts";

export const autohandAdapter: AgentAdapter = {
  name: "autohand",
  detect(): boolean {
    return isDirectory(join(userHome(), ".autohand")) || isOnPath("autohand");
  },
  userPath(): string {
    return join(userHome(), ".autohand", "skills");
  },
  projectPath(cwd: string): string {
    return join(cwd, ".autohand", "skills");
  },
};
