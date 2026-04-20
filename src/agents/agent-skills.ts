/**
 * `agent-skills` adapter (§7.2).
 *
 * Covers any spec-compliant agent crew doesn't ship a dedicated adapter
 * for. Paths match the cross-tool convention (`~/.agents/skills/` at
 * user scope, `<project>/.agents/skills/` at project scope) that Codex,
 * Cursor, Gemini CLI, and others also write to — path-sharing (§7.2)
 * already handles the case where multiple adapters resolve to the same
 * directory.
 *
 * Detection is just "is `~/.agents/` present?". If yes, at least one
 * spec-compliant tool has been installed on the machine — we don't
 * need to know which one to write a skill there. This keeps the
 * adapter interface honest (`detect()` is self-contained) and means
 * users can run `crew agents enable agent-skills` to force it on.
 */

import { join } from "node:path";
import { isDirectory } from "../util/fs.ts";
import type { AgentAdapter } from "./adapter.ts";
import { userHome } from "./path.ts";

export const agentSkillsAdapter: AgentAdapter = {
  name: "agent-skills",
  detect(): boolean {
    return isDirectory(join(userHome(), ".agents"));
  },
  userPath(): string {
    return join(userHome(), ".agents", "skills");
  },
  projectPath(cwd: string): string {
    return join(cwd, ".agents", "skills");
  },
};
