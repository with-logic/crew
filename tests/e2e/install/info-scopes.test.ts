/**
 * `crew info` on installed skills across user and project scope (§10.5).
 */

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
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

describe("list, info, targets", () => {
  test("info on a skill installed in user and project scope lists both locations", () => {
    const home = makeCrewHome();
    const src = makeTempDir();
    makeSkill(src, "demo", skillFrontmatter({ name: "demo", description: "a demo" }));
    runCli(["install", join(src, "demo")], { home, streams: captureStreams().streams });
    const project = makeTempDir("crew-proj-");
    runCli(["install", "--scope", "project", join(src, "demo")], {
      home,
      cwd: project,
      streams: captureStreams().streams,
    });
    const c = captureStreams();
    runCli(["info", "demo"], { home, streams: c.streams });
    const out = c.stdout();
    expect(out).toContain("installed in");
    expect(out).toContain("for you (system-wide)");
    expect(out).toContain(project);
  });

  test("info on a project-only install shows just the project location", () => {
    const home = makeCrewHome();
    const src = makeTempDir();
    makeSkill(src, "projonly", skillFrontmatter({ name: "projonly" }));
    const project = makeTempDir("crew-proj-");
    runCli(["install", "--scope", "project", join(src, "projonly")], {
      home,
      cwd: project,
      streams: captureStreams().streams,
    });
    const c = captureStreams();
    runCli(["info", "projonly"], { home, streams: c.streams });
    const out = c.stdout();
    expect(out).toContain("installed in");
    expect(out).toContain("(project scope)");
    expect(out).not.toContain("for you (system-wide)");
  });

  test("info on installed name", () => {
    const home = makeCrewHome();
    const src = makeTempDir();
    makeSkill(src, "demo", skillFrontmatter({ name: "demo" }));
    runCli(["install", join(src, "demo")], { home, streams: captureStreams().streams });
    const capture = captureStreams();
    runCli(["info", "demo"], { home, streams: capture.streams });
    expect(capture.stdout()).toContain("demo");
  });
});
