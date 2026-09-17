/**
 * Uninstall through the install flow's fixtures (§7.4; C-UNINST-01/03/04).
 */

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { claudeCodeAdapter } from "../../../src/agents/claude-code.ts";
import { codexAdapter } from "../../../src/agents/codex.ts";
import { geminiCliAdapter } from "../../../src/agents/gemini-cli.ts";
import { runCli } from "../../../src/cli/main.ts";
import { readState } from "../../../src/state/load.ts";
import { captureStreams, makeCrewHome } from "../../helpers/env.ts";
import { makeSkill, makeTempDir, skillFrontmatter } from "../../helpers/fixtures.ts";

type Redirectable = {
  userPath: () => string;
  projectPath: (cwd: string) => string;
  detect: () => boolean;
};
/** Every target adapter with the `<cwd>/<dir>/skills` project layout it uses. */
const ADAPTERS: ReadonlyArray<readonly [name: string, adapter: Redirectable, dir: string]> = [
  ["claude-code", claudeCodeAdapter, ".claude"],
  ["codex", codexAdapter, ".codex"],
  ["gemini-cli", geminiCliAdapter, ".gemini"],
];

/**
 * Redirect every target adapter to a tmp directory so tests never touch
 * `~/.claude/skills` etc. Returns the tmp roots keyed by adapter name and
 * a restore function.
 */
function redirectAdapters(): { agents: Record<string, string>; restore: () => void } {
  const agents: Record<string, string> = {};
  const saved = ADAPTERS.map(
    ([, adapter]) =>
      [
        adapter,
        { userPath: adapter.userPath, projectPath: adapter.projectPath, detect: adapter.detect },
      ] as const,
  );
  for (const [name, adapter, dir] of ADAPTERS) {
    const root = makeTempDir(`crew-${name}-`);
    agents[name] = root;
    adapter.userPath = () => root;
    adapter.projectPath = (cwd) => join(cwd, dir, "skills");
    adapter.detect = () => true;
  }
  return {
    agents,
    restore() {
      for (const [adapter, original] of saved) Object.assign(adapter, original);
    },
  };
}

let redirect: ReturnType<typeof redirectAdapters>;

beforeEach(() => {
  redirect = redirectAdapters();
});
afterEach(() => {
  redirect.restore();
});

describe("uninstall", () => {
  test("C-UNINST-01 removes from every installed target", () => {
    const home = makeCrewHome();
    const src = makeTempDir();
    const skill = makeSkill(src, "demo", skillFrontmatter({ name: "demo" }));
    runCli(["install", skill], { home, streams: captureStreams().streams });
    const code = runCli(["uninstall", "demo"], { home, streams: captureStreams().streams });
    expect(code).toBe(0);
    for (const adapter of ["claude-code", "codex", "gemini-cli"]) {
      expect(existsSync(join(redirect.agents[adapter]!, "demo"))).toBe(false);
    }
    expect(readState(home).installations).toHaveLength(0);
  });

  test("C-UNINST-03 sibling skills untouched", () => {
    const home = makeCrewHome();
    const src = makeTempDir();
    makeSkill(src, "a", skillFrontmatter({ name: "a" }));
    makeSkill(src, "b", skillFrontmatter({ name: "b" }));
    runCli(["install", join(src, "a"), join(src, "b")], {
      home,
      streams: captureStreams().streams,
    });
    runCli(["uninstall", "a"], { home, streams: captureStreams().streams });
    for (const adapter of ["claude-code", "codex", "gemini-cli"]) {
      expect(existsSync(join(redirect.agents[adapter]!, "a"))).toBe(false);
      expect(existsSync(join(redirect.agents[adapter]!, "b"))).toBe(true);
    }
  });

  test("C-UNINST-04 uninstall of non-installed -> not_installed_here", () => {
    const home = makeCrewHome();
    const code = runCli(["uninstall", "nonexistent"], { home, streams: captureStreams().streams });
    expect(code).toBe(6);
  });

  test("--force makes uninstall idempotent", () => {
    const home = makeCrewHome();
    const code = runCli(["uninstall", "--force", "ghost"], {
      home,
      streams: captureStreams().streams,
    });
    expect(code).toBe(0);
  });
});
