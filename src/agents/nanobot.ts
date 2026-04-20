/**
 * nanobot adapter.
 *
 * nanobot uses a single workspace directory; skills live under
 * `~/.nanobot/workspace/skills/`. nanobot does not document a
 * project-scope convention, so project-scope installs are a silent
 * no-op (per §7.2, a `—` entry in the scope column).
 */

import { join } from "node:path";
import { isDirectory } from "../util/fs.ts";
import type { AgentAdapter } from "./adapter.ts";
import { isOnPath, userHome } from "./path.ts";

export const nanobotAdapter: AgentAdapter = {
  name: "nanobot",
  detect(): boolean {
    return isDirectory(join(userHome(), ".nanobot")) || isOnPath("nanobot");
  },
  userPath(): string {
    return join(userHome(), ".nanobot", "workspace", "skills");
  },
  /**
   * nanobot has no project-scope convention. Returning an empty
   * string signals "no project path" to the install engine, which
   * treats the adapter as not-applicable for the project scope.
   */
  projectPath(): string {
    return "";
  },
};
