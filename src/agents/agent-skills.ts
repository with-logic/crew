/**
 * `agent-skills` fallback adapter (§7.2).
 *
 * Covers any spec-compliant agent crew doesn't ship a dedicated adapter
 * for. Paths match the cross-tool convention (`~/.agents/skills/` at
 * user scope, `<project>/.agents/skills/` at project scope) that Codex,
 * Cursor, Gemini CLI, and several others also write to.
 *
 * Fallback semantics (`detected iff no other adapter detects`) live in
 * `./fallback.ts` — this adapter's own `detect()` is always `false`.
 * See that file for why.
 */

import { join } from "node:path";
import type { AgentAdapter } from "./adapter.ts";
import { AGENT_SKILLS_NAME } from "./fallback.ts";
import { userHome } from "./path.ts";

export const agentSkillsAdapter: AgentAdapter = {
  name: AGENT_SKILLS_NAME,
  detect(): boolean {
    return false;
  },
  userPath(): string {
    return join(userHome(), ".agents", "skills");
  },
  projectPath(cwd: string): string {
    return join(cwd, ".agents", "skills");
  },
};
