/**
 * GitHub Copilot adapter.
 *
 * The GitHub Copilot CLI (`@github/copilot`) stores skills under
 * `~/.copilot/skills/` at user scope and `<project>/.github/skills/`
 * at project scope (the `.github/` location is also what the hosted
 * Copilot coding agent picks up from a repo).
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
    return join(userHome(), ".copilot", "skills");
  },
  projectPath(cwd: string): string {
    return join(cwd, ".github", "skills");
  },
};
