/**
 * Codex CLI adapter.
 *
 * Codex reads skills from the cross-tool `~/.agents/skills/` directory
 * at user scope and `<project>/.agents/skills/` at project scope
 * (not from a Codex-namespaced directory — `~/.codex/` only holds
 * Codex's config file). Detection still uses `~/.codex/` since that's
 * what indicates Codex is installed.
 *
 * Other adapters may resolve to the same `.agents/skills/` path (e.g.
 * `gemini-cli`'s alias); the install engine dedupes writes by path
 * while still reporting each adapter name to the user (§7.2, §7.3).
 */

import { join } from "node:path";
import { isDirectory } from "../util/fs.ts";
import type { AgentAdapter } from "./adapter.ts";
import { isOnPath, userHome } from "./path.ts";

export const codexAdapter: AgentAdapter = {
  name: "codex",
  detect(): boolean {
    return isDirectory(join(userHome(), ".codex")) || isOnPath("codex");
  },
  userPath(): string {
    return join(userHome(), ".agents", "skills");
  },
  projectPath(cwd: string): string {
    return join(cwd, ".agents", "skills");
  },
};
