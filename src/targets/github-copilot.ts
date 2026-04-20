/**
 * GitHub Copilot adapter.
 *
 * Copilot reads skills from three locations per scope:
 *
 *   user:    ~/.copilot/skills, ~/.claude/skills, ~/.agents/skills
 *   project: .github/skills, .claude/skills, .agents/skills
 *
 * We write to the `.agents/skills/` variant so one install serves
 * Copilot, Codex, and any other adapter that shares the same path
 * (§7.2 path sharing). Detection still uses the Copilot-specific
 * `~/.copilot/` config dir or the `copilot` CLI on PATH.
 */

import { join } from "node:path";
import { isDirectory } from "../util/fs.ts";
import type { TargetAdapter } from "./adapter.ts";
import { isOnPath, userHome } from "./path.ts";

export const githubCopilotAdapter: TargetAdapter = {
  name: "github-copilot",
  detect(): boolean {
    return isDirectory(join(userHome(), ".copilot")) || isOnPath("copilot");
  },
  userPath(): string {
    return join(userHome(), ".agents", "skills");
  },
  projectPath(cwd: string): string {
    return join(cwd, ".agents", "skills");
  },
};
