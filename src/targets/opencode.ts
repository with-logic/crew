/**
 * OpenCode adapter.
 *
 * OpenCode stores user-scope skills under `~/.config/opencode/skills/`
 * and project-scope skills under `<project>/.opencode/skills/`. The
 * `opencode` binary is the detection signal when no user config dir
 * exists.
 */

import { join } from "node:path";
import { isDirectory } from "../util/fs.ts";
import type { TargetAdapter } from "./adapter.ts";
import { isOnPath, userHome } from "./path.ts";

export const opencodeAdapter: TargetAdapter = {
  name: "opencode",
  detect(): boolean {
    return isDirectory(join(userHome(), ".config", "opencode")) || isOnPath("opencode");
  },
  userPath(): string {
    return join(userHome(), ".config", "opencode", "skills");
  },
  projectPath(cwd: string): string {
    return join(cwd, ".opencode", "skills");
  },
};
