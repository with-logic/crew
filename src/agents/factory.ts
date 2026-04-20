/**
 * Factory adapter.
 *
 * Factory stores skills under `~/.factory/skills/` at user scope and
 * `<project>/.factory/skills/` at project scope. The product's CLI
 * binary is `droid` (not `factory`) — that's what the Factory docs
 * document and what users have on their PATH.
 */

import { join } from "node:path";
import { isDirectory } from "../util/fs.ts";
import type { AgentAdapter } from "./adapter.ts";
import { isOnPath, userHome } from "./path.ts";

export const factoryAdapter: AgentAdapter = {
  name: "factory",
  detect(): boolean {
    return isDirectory(join(userHome(), ".factory")) || isOnPath("droid");
  },
  userPath(): string {
    return join(userHome(), ".factory", "skills");
  },
  projectPath(cwd: string): string {
    return join(cwd, ".factory", "skills");
  },
};
