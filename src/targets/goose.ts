/**
 * Goose adapter.
 *
 * Block's Goose stores user-scope skills under
 * `~/.config/goose/skills/` (matching Goose's other configuration at
 * `~/.config/goose/`) and project-scope skills under
 * `<project>/.goose/skills/`.
 */

import { join } from "node:path";
import { isDirectory } from "../util/fs.ts";
import type { TargetAdapter } from "./adapter.ts";
import { isOnPath, userHome } from "./path.ts";

export const gooseAdapter: TargetAdapter = {
  name: "goose",
  detect(): boolean {
    return isDirectory(join(userHome(), ".config", "goose")) || isOnPath("goose");
  },
  userPath(): string {
    return join(userHome(), ".config", "goose", "skills");
  },
  projectPath(cwd: string): string {
    return join(cwd, ".goose", "skills");
  },
};
