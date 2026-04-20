/**
 * Mistral Vibe adapter.
 *
 * Mistral Vibe stores skills under `~/.vibe/skills/` at user scope and
 * `<project>/.vibe/skills/` at project scope. The `vibe` binary is the
 * detection signal when no user config dir exists.
 */

import { join } from "node:path";
import { isDirectory } from "../util/fs.ts";
import type { AgentAdapter } from "./adapter.ts";
import { isOnPath, userHome } from "./path.ts";

export const mistralVibeAdapter: AgentAdapter = {
  name: "mistral-vibe",
  detect(): boolean {
    return isDirectory(join(userHome(), ".vibe")) || isOnPath("vibe");
  },
  userPath(): string {
    return join(userHome(), ".vibe", "skills");
  },
  projectPath(cwd: string): string {
    return join(cwd, ".vibe", "skills");
  },
};
