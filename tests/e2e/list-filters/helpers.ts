/**
 * Shared fixtures for the `crew list --agent` / `--tap` suites (§5.1).
 *
 * Holds the two-agent redirection lifecycle and the seeded install set
 * both suites assert against, plus the JSON shape `crew list --json`
 * emits. Adapter redirection stays an explicit call in each test file.
 */

import { join } from "node:path";
import type { AgentAdapter } from "../../../src/agents/adapter.ts";
import { claudeCodeAdapter } from "../../../src/agents/claude-code.ts";
import { codexAdapter } from "../../../src/agents/codex.ts";
import { runCli } from "../../../src/cli/main.ts";
import type { Scope, StateEntry } from "../../../src/core/types.ts";
import { captureStreams } from "../../helpers/env.ts";
import { makeSkill, makeTempDir, skillFrontmatter } from "../../helpers/fixtures.ts";

/**
 * The three adapter members a test may point at a temp root: where the
 * user- and project-scope installs land, and whether crew considers the
 * adapter present at all. Named for what it permits rather than for the
 * mutation itself.
 */
type RedirectableAdapter = {
  userPath: AgentAdapter["userPath"];
  projectPath: AgentAdapter["projectPath"];
  detect: AgentAdapter["detect"];
};
// Direct assignment (no double cast) so a change to the adapter contract
// is a type error here rather than being erased by `as unknown as`.
const adapters: RedirectableAdapter[] = [claudeCodeAdapter, codexAdapter];

/**
 * Point `claude-code` and `codex` at fresh temp roots and mark both
 * detected. Returns the restore function for `afterEach`.
 */
export function redirectAdapters(): () => void {
  const originals = adapters.map((a) => ({
    userPath: a.userPath,
    projectPath: a.projectPath,
    detect: a.detect,
  }));
  for (const a of adapters) {
    const dir = makeTempDir("crew-agent-");
    a.userPath = () => dir;
    a.projectPath = (c) => join(c, ".agents", dir.split("/").pop()!);
    a.detect = () => true;
  }
  return () => {
    adapters.forEach((a, i) => {
      a.userPath = originals[i]!.userPath;
      a.projectPath = originals[i]!.projectPath;
      a.detect = originals[i]!.detect;
    });
  };
}

export const quiet = () => captureStreams().streams;

/**
 * Installs `alpha` (both agents) and `beta` (codex) at user scope, plus
 * `gamma` (codex) at PROJECT scope, and returns the project root.
 *
 * Both installs name their agents explicitly. An unrestricted `crew
 * install` targets every *detected* adapter, and these suites only
 * redirect `claude-code` and `codex` — so on a host where a third
 * adapter is detected it would join the install, making the expected
 * agent lists environment-dependent.
 *
 * The project-scope entry exists so a `--scope project` assertion can be
 * positive. Without one, a composed filter test asserting an empty
 * result passes whether or not `--scope` is honored at all.
 */
export function seed(home: string): string {
  const a = makeTempDir("crew-alpha-src-");
  const b = makeTempDir("crew-beta-src-");
  const g = makeTempDir("crew-gamma-src-");
  const projectRoot = makeTempDir("crew-project-");
  const alpha = makeSkill(a, "alpha", skillFrontmatter({ name: "alpha" }));
  const beta = makeSkill(b, "beta", skillFrontmatter({ name: "beta" }));
  const gamma = makeSkill(g, "gamma", skillFrontmatter({ name: "gamma" }));
  const alphaArgs = ["install", "--agent", "claude-code", "--agent", "codex", alpha];
  if (runCli(alphaArgs, { home, streams: quiet() }) !== 0) throw new Error("alpha");
  if (runCli(["install", "--agent", "codex", beta], { home, streams: quiet() }) !== 0)
    throw new Error("beta");
  const gammaArgs = ["install", "--scope", "project", "--agent", "codex", gamma];
  if (runCli(gammaArgs, { home, cwd: projectRoot, streams: quiet() }) !== 0)
    throw new Error("gamma");
  return projectRoot;
}

// Derived from the canonical entry and scope types rather than
// hand-written, so a change to what `crew list --json` emits is a
// compile error here instead of a test that quietly stops checking.
export interface ListJson {
  scope: Scope | null;
  agent: string[];
  tap: string | null;
  installations: StateEntry[];
}

export function run(home: string, ...args: string[]) {
  const cap = captureStreams();
  const code = runCli(["list", ...args], { home, streams: cap.streams });
  return { code, out: cap.stdout(), err: cap.stderr() };
}

export function json(home: string, ...args: string[]): ListJson {
  const r = run(home, "--json", ...args);
  if (r.code !== 0) throw new Error(`list exited ${r.code}: ${r.err}`);
  return JSON.parse(r.out) as ListJson;
}
