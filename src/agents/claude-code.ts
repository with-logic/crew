/**
 * Claude Code adapter.
 *
 * Claude Code stores skills under `~/.claude/skills/` at user scope and
 * `<project>/.claude/skills/` at project scope. The `claude` CLI is the
 * typical installed-binary indicator. Either signal counts as detection
 * per §7.2.
 */

import { join } from "node:path";
import { isDirectory } from "../util/fs.ts";
import type { AgentAdapter } from "./adapter.ts";
import { isOnPath, userHome } from "./path.ts";

export const claudeCodeAdapter: AgentAdapter = {
  name: "claude-code",
  detect(): boolean {
    return isDirectory(join(userHome(), ".claude")) || isOnPath("claude");
  },
  userPath(): string {
    return join(userHome(), ".claude", "skills");
  },
  projectPath(cwd: string): string {
    return join(cwd, ".claude", "skills");
  },
};
