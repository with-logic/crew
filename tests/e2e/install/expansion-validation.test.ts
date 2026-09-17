/**
 * Directory expansion: invalid children are soft-skipped, an all-invalid
 * or empty source is a hard failure (§9 step 5; C-INST-09/20/21).
 */

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { existsSync } from "node:fs";
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

describe("install directory expansion", () => {
  test("C-INST-20 invalid skill in a multi-skill source is soft-skipped", () => {
    const home = makeCrewHome();
    const container = makeTempDir("crew-soft-");
    // A valid skill alongside an invalid one whose declared name uses uppercase.
    makeSkill(container, "good-skill", skillFrontmatter({ name: "good-skill" }));
    makeSkill(container, "bad-dir", skillFrontmatter({ name: "Bad" }));
    const capture = captureStreams();
    const code = runCli(["install", container], { home, streams: capture.streams });
    // Exit 1: partial success, not 4.
    expect(code).toBe(1);
    // The valid sibling installed.
    expect(existsSync(join(redirect.agents["claude-code"]!, "good-skill"))).toBe(true);
    // The invalid one was reported in stdout, not as a hard error.
    expect(capture.stdout()).toContain("Failed");
    expect(capture.stdout()).toContain("name: Bad");
  });

  test("C-INST-21 multi-skill dir where every skill is invalid: exit 4, all listed in Failed", () => {
    const home = makeCrewHome();
    const container = makeTempDir("crew-all-invalid-");
    makeSkill(container, "bad-one", skillFrontmatter({ name: "BadOne" }));
    makeSkill(container, "bad-two", skillFrontmatter({ name: "BadTwo" }));
    const capture = captureStreams();
    const code = runCli(["install", container], { home, streams: capture.streams });
    // Zero succeeded AND ≥1 validation failure → exit 4.
    expect(code).toBe(4);
    const out = capture.stdout();
    expect(out).toContain("Failed");
    // Both validation failures were reported.
    expect(out).toContain("name: BadOne");
    expect(out).toContain("name: BadTwo");
  });

  test("C-INST-20 --json surfaces skipped skills", () => {
    const home = makeCrewHome();
    const container = makeTempDir("crew-soft-json-");
    makeSkill(container, "good-skill", skillFrontmatter({ name: "good-skill" }));
    makeSkill(container, "bad-dir", skillFrontmatter({ name: "Bad" }));
    const capture = captureStreams();
    runCli(["install", "--json", container], { home, streams: capture.streams });
    const parsed = JSON.parse(capture.stdout()) as {
      skipped: { path: string; message: string; code: string }[];
    };
    expect(parsed.skipped.length).toBe(1);
    expect(parsed.skipped[0]!.code).toBe("invalid_skill");
  });

  test("C-INST-21 single-skill source still hard-fails on invalid SKILL.md", () => {
    const home = makeCrewHome();
    const container = makeTempDir("crew-hard-");
    const skill = makeSkill(container, "bad-dir", skillFrontmatter({ name: "Bad" }));
    const capture = captureStreams();
    const code = runCli(["install", skill], { home, streams: capture.streams });
    // Exit 4: the user asked for that one skill and it's invalid.
    expect(code).toBe(4);
  });

  test("C-INST-09 no valid skills -> no_skills_found exit 4", () => {
    const home = makeCrewHome();
    const container = makeTempDir("crew-empty-");
    const code = runCli(["install", container], { home, streams: captureStreams().streams });
    expect(code).toBe(4);
  });
});
