/**
 * Gemini CLI adapter.
 *
 * Gemini CLI reads skills from `~/.gemini/skills/` and the cross-tool
 * `~/.agents/skills/` alias (which takes precedence per Gemini's
 * docs), with the same two at project scope. We write to
 * `.agents/skills/` so one install serves Gemini plus every other
 * adapter that shares the path (§7.2 path sharing). Detection still
 * uses the Gemini-specific config dir or the `gemini` binary.
 */

import { join } from "node:path";
import { isDirectory } from "../util/fs.ts";
import type { AgentAdapter } from "./adapter.ts";
import { isOnPath, userHome } from "./path.ts";

export const geminiCliAdapter: AgentAdapter = {
  name: "gemini-cli",
  detect(): boolean {
    return isDirectory(join(userHome(), ".gemini")) || isOnPath("gemini");
  },
  userPath(): string {
    return join(userHome(), ".agents", "skills");
  },
  projectPath(cwd: string): string {
    return join(cwd, ".agents", "skills");
  },
};
