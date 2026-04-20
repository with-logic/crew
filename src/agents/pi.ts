/**
 * pi adapter.
 *
 * pi (badlogic's coding-agent) reads skills from both its own paths
 * (`~/.pi/agent/skills/`, `.pi/skills/`) and the cross-tool
 * `.agents/skills/` convention. We write to `.agents/skills/` so one
 * install serves pi plus every other adapter that shares the path
 * (§7.2 path sharing). Detection still uses the pi-specific config
 * dir or binary.
 */

import { join } from "node:path";
import { isDirectory } from "../util/fs.ts";
import type { AgentAdapter } from "./adapter.ts";
import { isOnPath, userHome } from "./path.ts";

export const piAdapter: AgentAdapter = {
  name: "pi",
  detect(): boolean {
    return isDirectory(join(userHome(), ".pi")) || isOnPath("pi");
  },
  userPath(): string {
    return join(userHome(), ".agents", "skills");
  },
  projectPath(cwd: string): string {
    return join(cwd, ".agents", "skills");
  },
};
