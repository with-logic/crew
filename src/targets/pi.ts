/**
 * pi adapter.
 *
 * pi (badlogic's coding-agent) stores skills under `~/.pi/agent/skills/`
 * at user scope and `<project>/.pi/skills/` at project scope. The `pi`
 * binary is the detection signal when no user config dir exists.
 */

import { join } from "node:path";
import { isDirectory } from "../util/fs.ts";
import type { TargetAdapter } from "./adapter.ts";
import { isOnPath, userHome } from "./path.ts";

export const piAdapter: TargetAdapter = {
  name: "pi",
  detect(): boolean {
    return isDirectory(join(userHome(), ".pi")) || isOnPath("pi");
  },
  userPath(): string {
    return join(userHome(), ".pi", "agent", "skills");
  },
  projectPath(cwd: string): string {
    return join(cwd, ".pi", "skills");
  },
};
