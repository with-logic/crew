/**
 * Gemini CLI adapter.
 *
 * Gemini CLI stores skills under `~/.gemini/skills/` at user scope and
 * `<project>/.gemini/skills/` at project scope. The `gemini` binary is
 * the detection signal when no user dir exists.
 */

import { join } from "node:path";
import { isDirectory } from "../util/fs.ts";
import type { TargetAdapter } from "./adapter.ts";
import { isOnPath, userHome } from "./path.ts";

export const geminiCliAdapter: TargetAdapter = {
  name: "gemini-cli",
  detect(): boolean {
    return isDirectory(join(userHome(), ".gemini")) || isOnPath("gemini");
  },
  userPath(): string {
    return join(userHome(), ".gemini", "skills");
  },
  projectPath(cwd: string): string {
    return join(cwd, ".gemini", "skills");
  },
};
