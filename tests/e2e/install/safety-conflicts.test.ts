/**
 * Install safety for customized installs and name conflicts, and what
 * `--force` does and does not override (§7.3, §13; C-SAFE-02/05, C-INST-14).
 */

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { claudeCodeAdapter } from "../../../src/agents/claude-code.ts";
import { codexAdapter } from "../../../src/agents/codex.ts";
import { geminiCliAdapter } from "../../../src/agents/gemini-cli.ts";
import { runCli } from "../../../src/cli/main.ts";
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

describe("install safety", () => {
  test("C-SAFE-02 customized detection", () => {
    const home = makeCrewHome();
    const src = makeTempDir();
    const skill = makeSkill(src, "demo", skillFrontmatter({ name: "demo" }));
    // First install.
    runCli(["install", "--agent", "claude-code", skill], {
      home,
      streams: captureStreams().streams,
    });
    // User tampers.
    writeFileSync(
      join(redirect.agents["claude-code"]!, "demo", "SKILL.md"),
      "---\nname: demo\ndescription: hacked\n---\n",
    );
    // Another install attempt (from the same source so no name_conflict).
    // We forge a different content to cause a reinstall path — add a file to the source.
    writeFileSync(join(skill, "NEW.md"), "new");
    const code = runCli(["install", "--agent", "claude-code", skill], {
      home,
      streams: captureStreams().streams,
    });
    // Customized → no success for this target → exit 1.
    expect(code).toBe(1);
  });

  test("C-SAFE-05 --force overrides customized", () => {
    const home = makeCrewHome();
    const src = makeTempDir();
    const skill = makeSkill(src, "demo", skillFrontmatter({ name: "demo" }));
    runCli(["install", "--agent", "claude-code", skill], {
      home,
      streams: captureStreams().streams,
    });
    writeFileSync(
      join(redirect.agents["claude-code"]!, "demo", "SKILL.md"),
      "---\nname: demo\ndescription: hacked\n---\n",
    );
    writeFileSync(join(skill, "NEW.md"), "new"); // force a different hash
    const code = runCli(["install", "--force", "--agent", "claude-code", skill], {
      home,
      streams: captureStreams().streams,
    });
    expect(code).toBe(0);
  });

  test("name_conflict on different source", () => {
    const home = makeCrewHome();
    const srcA = makeTempDir();
    const srcB = makeTempDir();
    makeSkill(srcA, "demo", skillFrontmatter({ name: "demo", description: "A" }));
    makeSkill(srcB, "demo", skillFrontmatter({ name: "demo", description: "B" }));
    runCli(["install", join(srcA, "demo")], { home, streams: captureStreams().streams });
    const code = runCli(["install", join(srcB, "demo")], {
      home,
      streams: captureStreams().streams,
    });
    expect(code).toBe(4);
  });

  test("C-INST-14 --force does NOT override name_conflict", () => {
    const home = makeCrewHome();
    const srcA = makeTempDir();
    const srcB = makeTempDir();
    makeSkill(srcA, "demo", skillFrontmatter({ name: "demo", description: "A" }));
    makeSkill(srcB, "demo", skillFrontmatter({ name: "demo", description: "B" }));
    runCli(["install", join(srcA, "demo")], { home, streams: captureStreams().streams });
    const code = runCli(["install", "--force", join(srcB, "demo")], {
      home,
      streams: captureStreams().streams,
    });
    expect(code).toBe(4);
  });
});
