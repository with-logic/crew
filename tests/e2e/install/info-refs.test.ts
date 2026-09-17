/**
 * `crew info` on path refs, tap names, and pinned refs (§10.5).
 */

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { join } from "node:path";
import { claudeCodeAdapter } from "../../../src/agents/claude-code.ts";
import { codexAdapter } from "../../../src/agents/codex.ts";
import { geminiCliAdapter } from "../../../src/agents/gemini-cli.ts";
import { runCli } from "../../../src/cli/main.ts";
import { captureStreams, makeCrewHome } from "../../helpers/env.ts";
import {
  commitAll,
  makeGitRepo,
  makeSkill,
  makeTempDir,
  skillFrontmatter,
  tagRepo,
} from "../../helpers/fixtures.ts";

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
  test("info on path ref", () => {
    const home = makeCrewHome();
    const src = makeTempDir();
    const skill = makeSkill(src, "demo", skillFrontmatter({ name: "demo" }));
    const capture = captureStreams();
    runCli(["info", skill], { home, streams: capture.streams });
    // Expect the skill's actual description text to appear.
    expect(capture.stdout()).toContain("A test skill");
  });

  test("info on path ref that backs a configured tap", () => {
    const home = makeCrewHome();
    const src = makeTempDir();
    const skill = makeSkill(src, "demo", skillFrontmatter({ name: "demo" }));
    // Install once to create an auto-tap for the path.
    runCli(["install", skill], { home, streams: captureStreams().streams });
    // Now `info <same-path>` should find the auto-tap in config instead
    // of attributing ephemerally (exercises the matched-ref branch).
    const capture = captureStreams();
    const code = runCli(["info", skill], { home, streams: capture.streams });
    expect(code).toBe(0);
    expect(capture.stdout()).toContain("A test skill");
  });

  test("info <tap-name> lists every skill in that tap", () => {
    const home = makeCrewHome();
    // Install via path to create an auto path-tap.
    const src = makeTempDir();
    const skill = makeSkill(src, "widget", skillFrontmatter({ name: "widget" }));
    runCli(["install", skill], { home, streams: captureStreams().streams });
    // The auto tap's name is derived from the basename — "widget".
    const capture = captureStreams();
    const code = runCli(["info", "widget"], { home, streams: capture.streams });
    expect(code).toBe(0);
    // Either matched the installed state entry OR walked the tap — both
    // must mention the skill name.
    expect(capture.stdout()).toContain("widget");
  });

  test("info on an installed child of a multi-skill tap shows a subpath `from`", () => {
    const home = makeCrewHome();
    const src = makeTempDir();
    makeSkill(src, "alpha", skillFrontmatter({ name: "alpha" }));
    makeSkill(src, "beta", skillFrontmatter({ name: "beta" }));
    runCli(["install", src], { home, streams: captureStreams().streams });
    const c = captureStreams();
    runCli(["info", "alpha"], { home, streams: c.streams });
    // Because alpha came from a multi-skill install, its source.path is
    // "alpha" inside the parent tap — info renders "<tap>/alpha".
    expect(c.stdout()).toMatch(/from\s+\S+\/alpha/);
  });

  test("info shows `ref (sha)` when a skill is pinned to a tag", () => {
    const home = makeCrewHome();
    const repo = makeTempDir();
    makeGitRepo(repo);
    makeSkill(repo, "demo", skillFrontmatter({ name: "demo" }));
    commitAll(repo, "init");
    tagRepo(repo, "v1.0.0");
    runCli(["install", `file://${repo}@v1.0.0//demo`], {
      home,
      streams: captureStreams().streams,
    });
    const c = captureStreams();
    runCli(["info", "demo"], { home, streams: c.streams });
    // Version line should show the tag AND the short SHA (they differ).
    expect(c.stdout()).toMatch(/v1\.0\.0\s*\(/);
  });
});
