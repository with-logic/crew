/**
 * Directory expansion: which layouts a multi-skill source install walks
 * (§9 step 5; C-INST-07/08/08b/08c, C-NS-01).
 */

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { claudeCodeAdapter } from "../../../src/agents/claude-code.ts";
import { codexAdapter } from "../../../src/agents/codex.ts";
import { geminiCliAdapter } from "../../../src/agents/gemini-cli.ts";
import { runCli } from "../../../src/cli/main.ts";
import { readConfig } from "../../../src/config/load.ts";
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

describe("install directory expansion", () => {
  test("C-INST-07 + C-INST-08 installs children but not deeper", () => {
    const home = makeCrewHome();
    const container = makeTempDir("crew-ctr-");
    makeSkill(container, "one", skillFrontmatter({ name: "one" }));
    makeSkill(container, "two", skillFrontmatter({ name: "two" }));
    // A deeper nested skill that should NOT be installed.
    const deep = join(container, "nested");
    mkdirSync(deep);
    makeSkill(deep, "three", skillFrontmatter({ name: "three" }));

    const code = runCli(["install", container], { home, streams: captureStreams().streams });
    expect(code).toBe(0);
    expect(existsSync(join(redirect.agents["claude-code"]!, "one"))).toBe(true);
    expect(existsSync(join(redirect.agents["claude-code"]!, "two"))).toBe(true);
    expect(existsSync(join(redirect.agents["claude-code"]!, "three"))).toBe(false);
  });

  test("C-INST-08b skills/ subdirectory walks one level under it", () => {
    const home = makeCrewHome();
    const container = makeTempDir("crew-ctr-skills-");
    const skillsDir = join(container, "skills");
    mkdirSync(skillsDir);
    makeSkill(skillsDir, "one", skillFrontmatter({ name: "one" }));
    makeSkill(skillsDir, "two", skillFrontmatter({ name: "two" }));
    // A stray directory at the root that LOOKS skill-like should be
    // ignored once `skills/` is found — the `skills/` index is
    // authoritative per PRD §9 step 5 case 2.
    makeSkill(container, "ignored", skillFrontmatter({ name: "ignored" }));

    const code = runCli(["install", container], { home, streams: captureStreams().streams });
    expect(code).toBe(0);
    expect(existsSync(join(redirect.agents["claude-code"]!, "one"))).toBe(true);
    expect(existsSync(join(redirect.agents["claude-code"]!, "two"))).toBe(true);
    expect(existsSync(join(redirect.agents["claude-code"]!, "ignored"))).toBe(false);
  });

  test("C-INST-08c --recursive installs nested skills when standard layouts find none", () => {
    const home = makeCrewHome();
    const container = makeTempDir("crew-ctr-recursive-");
    const nested = join(container, "teams", "support");
    mkdirSync(nested, { recursive: true });
    makeSkill(nested, "ticket-triage", skillFrontmatter({ name: "ticket-triage" }));

    const first = runCli(["install", container], { home, streams: captureStreams().streams });
    expect(first).toBe(4);
    expect(
      runCli(["tap", "add", container, "nested"], { home, streams: captureStreams().streams }),
    ).toBe(0);

    const code = runCli(["install", "--recursive", container], {
      home,
      streams: captureStreams().streams,
    });
    expect(code).toBe(0);
    expect(existsSync(join(redirect.agents["claude-code"]!, "ticket-triage"))).toBe(true);
    const state = readState(home);
    expect(state.installations[0]!.source.path).toBe("teams/support/ticket-triage");
    const tap = readConfig(home).taps.find((t) => t.path === container)!;
    expect(tap.discovery).toBe("recursive");
  });

  test("C-NS-01 namespace dirs under skills/ install every skill", () => {
    const home = makeCrewHome();
    const container = makeTempDir("crew-ns-");
    const skillsDir = join(container, "skills");
    mkdirSync(skillsDir);
    const marketing = join(skillsDir, "marketing");
    mkdirSync(marketing);
    makeSkill(marketing, "email-outreach", skillFrontmatter({ name: "email-outreach" }));
    makeSkill(marketing, "social-posts", skillFrontmatter({ name: "social-posts" }));
    const engineering = join(skillsDir, "engineering");
    mkdirSync(engineering);
    makeSkill(engineering, "code-review", skillFrontmatter({ name: "code-review" }));

    const code = runCli(["install", container], { home, streams: captureStreams().streams });
    expect(code).toBe(0);
    expect(existsSync(join(redirect.agents["claude-code"]!, "email-outreach"))).toBe(true);
    expect(existsSync(join(redirect.agents["claude-code"]!, "social-posts"))).toBe(true);
    expect(existsSync(join(redirect.agents["claude-code"]!, "code-review"))).toBe(true);
  });
});
