/**
 * Junie adapter.
 *
 * Junie is a JetBrains IDE plugin (no PATH binary). Skills live under
 * `~/.junie/skills/` at user scope and `<project>/.junie/skills/` at
 * project scope. Detection relies on the presence of `~/.junie/` since
 * there's no binary to look for.
 */

import { join } from "node:path";
import { isDirectory } from "../util/fs.ts";
import type { TargetAdapter } from "./adapter.ts";
import { userHome } from "./path.ts";

export const junieAdapter: TargetAdapter = {
  name: "junie",
  detect(): boolean {
    return isDirectory(join(userHome(), ".junie"));
  },
  userPath(): string {
    return join(userHome(), ".junie", "skills");
  },
  projectPath(cwd: string): string {
    return join(cwd, ".junie", "skills");
  },
};
