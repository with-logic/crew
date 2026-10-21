/** Real child-process uninstall used to invalidate doctor inventories (§11.1, §14). */
import type { Scope } from "../../../src/core/types.ts";

// Fail a hung child well before the state lock's 30-second acquisition timeout.
const CHILD_TIMEOUT_MS = 10_000;

/** Redirect every child adapter while preserving the parent's independent scan process. */
export function uninstallInChild(input: {
  readonly home: string;
  readonly target: string;
  readonly cwd: string;
  readonly scope: Scope;
}) {
  const script = `
    import { join } from "node:path";
    import { ALL_AGENTS } from ${JSON.stringify(new URL("../../../src/agents/registry.ts", import.meta.url).href)};
    import { runCli } from ${JSON.stringify(new URL("../../../src/cli/main.ts", import.meta.url).href)};
    const { home, target, cwd, scope } = JSON.parse(process.argv[1]);
    for (const adapter of ALL_AGENTS) {
      adapter.userPath = () => join(target, adapter.name);
      adapter.projectPath = (root) => join(root, adapter.name);
      adapter.detect = () => adapter.name === "claude-code";
    }
    process.exitCode = runCli(["uninstall", "demo", "--scope", scope, "--json"], { home, cwd });
  `;
  const child = Bun.spawnSync([process.execPath, "--eval", script, JSON.stringify(input)], {
    stdout: "pipe",
    stderr: "pipe",
    timeout: CHILD_TIMEOUT_MS,
  });
  return {
    exitCode: child.exitCode,
    stderr: child.stderr.toString(),
    stdout: child.stdout.toString(),
  };
}
