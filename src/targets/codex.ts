/**
 * Codex CLI adapter.
 *
 * Codex stores skills under `~/.codex/skills/` at user scope, and
 * `<project>/.codex/skills/` at project scope. The `codex` binary is the
 * detection signal when no user dir exists.
 */

import { homedir } from "node:os";
import { join } from "node:path";
import { isDirectory } from "../util/fs.ts";
import type { TargetAdapter } from "./adapter.ts";
import { isOnPath } from "./path.ts";

export const codexAdapter: TargetAdapter = {
  name: "codex",
  detect(): boolean {
    return isDirectory(join(homedir(), ".codex")) || isOnPath("codex");
  },
  userPath(): string {
    return join(homedir(), ".codex", "skills");
  },
  projectPath(cwd: string): string {
    return join(cwd, ".codex", "skills");
  },
};
