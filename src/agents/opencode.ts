/**
 * OpenCode adapter.
 *
 * OpenCode reads skills from `~/.config/opencode/skills/`,
 * `~/.claude/skills/`, and `~/.agents/skills/` at user scope, and the
 * corresponding project-scoped paths. We write to `.agents/skills/`
 * so one install serves OpenCode plus every other adapter that
 * shares the path (§7.2 path sharing). Detection still uses the
 * OpenCode-specific config dir or binary.
 */

import { join } from "node:path";
import { isDirectory } from "../util/fs.ts";
import type { AgentAdapter } from "./adapter.ts";
import { isOnPath, userHome } from "./path.ts";

export const opencodeAdapter: AgentAdapter = {
  name: "opencode",
  detect(): boolean {
    return isDirectory(join(userHome(), ".config", "opencode")) || isOnPath("opencode");
  },
  userPath(): string {
    return join(userHome(), ".agents", "skills");
  },
  projectPath(cwd: string): string {
    return join(cwd, ".agents", "skills");
  },
};
