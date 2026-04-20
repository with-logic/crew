/**
 * Goose adapter.
 *
 * Block's Goose docs recommend `~/.agents/skills/` (user) and
 * `.agents/skills/` (project) as the standard layout, with
 * `.goose/skills/` and `.claude/skills/` kept for backward compat.
 * We write to `.agents/skills/` so one install serves Goose plus
 * every other adapter that shares the path (§7.2 path sharing).
 * Detection still uses the Goose-specific config dir or binary.
 */

import { join } from "node:path";
import { isDirectory } from "../util/fs.ts";
import type { AgentAdapter } from "./adapter.ts";
import { isOnPath, userHome } from "./path.ts";

export const gooseAdapter: AgentAdapter = {
  name: "goose",
  detect(): boolean {
    return isDirectory(join(userHome(), ".config", "goose")) || isOnPath("goose");
  },
  userPath(): string {
    return join(userHome(), ".agents", "skills");
  },
  projectPath(cwd: string): string {
    return join(cwd, ".agents", "skills");
  },
};
