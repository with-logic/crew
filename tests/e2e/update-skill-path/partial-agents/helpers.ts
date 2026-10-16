/**
 * Two redirected agents for the partial-agent update tests (§10.1,
 * §10.1.1 step 2): claude-code and gemini-cli, each with its own skills
 * folder, both detected.
 */

import { chmodSync } from "node:fs";
import { join } from "node:path";
import { claudeCodeAdapter } from "../../../../src/agents/claude-code.ts";
import { geminiCliAdapter } from "../../../../src/agents/gemini-cli.ts";
import { readState } from "../../../../src/state/load.ts";
import { makeSkill, makeTempDir, skillFrontmatter } from "../../../helpers/fixtures.ts";
import { run } from "../helpers.ts";

type Redirectable = { userPath: () => string; detect: () => boolean };
const ADAPTERS = [
  ["claude-code", claudeCodeAdapter as Redirectable],
  ["gemini-cli", geminiCliAdapter as Redirectable],
] as const;
type AgentName = (typeof ADAPTERS)[number][0];

/** Point both agents at fresh skills folders; returns them by agent name and an undo. */
export function redirectAgents(): { roots: Record<AgentName, string>; restore: () => void } {
  const roots = {} as Record<AgentName, string>;
  const saved = ADAPTERS.map(([, a]) => [a, { userPath: a.userPath, detect: a.detect }] as const);
  for (const [name, adapter] of ADAPTERS) {
    const root = makeTempDir(`crew-${name}-`);
    roots[name] = root;
    adapter.userPath = () => root;
    adapter.detect = () => true;
  }
  return {
    roots,
    restore: () => {
      for (const [adapter, original] of saved) Object.assign(adapter, original);
    },
  };
}

/**
 * A path tap `mine` holding `skills/beta`, installed whole into both
 * agents; returns the tap's folder. Throws unless installs go to
 * claude-code first, which every rollback test depends on.
 */
export function installTrackedTap(home: string): string {
  const tapDir = makeTempDir();
  makeSkill(join(tapDir, "skills"), "beta", skillFrontmatter({ name: "beta" }));
  const codes = [run(home, ["tap", "add", tapDir, "mine"]), run(home, ["install", "mine"])];
  const beta = readState(home).installations.find((e) => e.name === "beta");
  const setUp = `exit ${codes.map((r) => r.code).join(",")}, agents ${beta?.agents.join(",")}`;
  if (setUp !== "exit 0,0, agents claude-code,gemini-cli") throw new Error(`tracked tap: ${setUp}`);
  return tapDir;
}

/** Run `fn` while `dir` can be read but not written. */
export function whileReadOnly<T>(dir: string, fn: () => T): T {
  chmodSync(dir, 0o555);
  try {
    return fn();
  } finally {
    chmodSync(dir, 0o755);
  }
}
