/**
 * `crew list` rendering after real installs (§10.3).
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
  test("list shows installed", () => {
    const home = makeCrewHome();
    const src = makeTempDir();
    // Two different skills so the sort comparator hits the
    // `name.localeCompare(name)` branch.
    makeSkill(src, "apple", skillFrontmatter({ name: "apple" }));
    makeSkill(src, "banana", skillFrontmatter({ name: "banana" }));
    runCli(["install", join(src, "apple")], { home, streams: captureStreams().streams });
    runCli(["install", join(src, "banana")], { home, streams: captureStreams().streams });
    const capture = captureStreams();
    const code = runCli(["list"], { home, streams: capture.streams });
    expect(code).toBe(0);
    const out = capture.stdout();
    expect(out).toContain("apple");
    expect(out).toContain("banana");
    // Alphabetical order.
    expect(out.indexOf("apple")).toBeLessThan(out.indexOf("banana"));
  });

  test("list shows a `dep` tag for skills pulled in as dependencies", () => {
    const home = makeCrewHome();
    const src = makeTempDir();
    // `foo` depends on `bar`. Installing foo pulls bar in as an
    // implicit (non-explicit) dependency, which should render with
    // a `dep` tag in list.
    makeSkill(src, "bar", skillFrontmatter({ name: "bar" }));
    makeSkill(src, "foo", skillFrontmatter({ name: "foo", dependencies: [join(src, "bar")] }));
    runCli(["install", join(src, "foo")], { home, streams: captureStreams().streams });
    const c = captureStreams();
    runCli(["list"], { home, streams: c.streams });
    expect(c.stdout()).toContain("dep");
  });

  test("list shows explicit agent names when a skill is only in some of them", () => {
    const home = makeCrewHome();
    const src = makeTempDir();
    makeSkill(src, "partial", skillFrontmatter({ name: "partial" }));
    runCli(["install", "--agent", "claude-code", join(src, "partial")], {
      home,
      streams: captureStreams().streams,
    });
    const capture = captureStreams();
    runCli(["list"], { home, streams: capture.streams });
    expect(capture.stdout()).toContain("partial");
    // Partial install shows just the target name, not "all agents".
    expect(capture.stdout()).toContain("claude-code");
    expect(capture.stdout()).not.toContain("all agents");
  });

  test("list with no installs shows a welcoming empty state", () => {
    const home = makeCrewHome();
    const capture = captureStreams();
    const code = runCli(["list"], { home, streams: capture.streams });
    expect(code).toBe(0);
    expect(capture.stdout()).toContain("don't have any skills installed");
  });

  test("list sorts project installs of the same name by their project path", () => {
    const home = makeCrewHome();
    const src = makeTempDir();
    makeSkill(src, "demo", skillFrontmatter({ name: "demo" }));
    const projA = makeTempDir("crew-proj-a-");
    const projB = makeTempDir("crew-proj-b-");
    runCli(["install", "--scope", "project", join(src, "demo")], {
      home,
      cwd: projA,
      streams: captureStreams().streams,
    });
    runCli(["install", "--scope", "project", join(src, "demo")], {
      home,
      cwd: projB,
      streams: captureStreams().streams,
    });
    const c = captureStreams();
    runCli(["list"], { home, streams: c.streams });
    const out = c.stdout();
    // Two project installs of `demo` → one grouped name plus two
    // `└ in <project>` sub-rows, sorted alphabetically by path.
    const idxA = out.indexOf(projA);
    const idxB = out.indexOf(projB);
    expect(idxA).toBeGreaterThan(0);
    expect(idxB).toBeGreaterThan(0);
    // Since projA's basename comes first alphabetically, it should
    // appear before projB in the output.
    if (projA < projB) expect(idxA).toBeLessThan(idxB);
    else expect(idxB).toBeLessThan(idxA);
  });

  test("list groups user + project installs of the same skill under one name", () => {
    const home = makeCrewHome();
    const src = makeTempDir();
    makeSkill(src, "demo", skillFrontmatter({ name: "demo" }));
    // Install system-wide AND into a project folder.
    runCli(["install", join(src, "demo")], { home, streams: captureStreams().streams });
    const project = makeTempDir("crew-proj-");
    runCli(["install", "--scope", "project", join(src, "demo")], {
      home,
      cwd: project,
      streams: captureStreams().streams,
    });
    const c = captureStreams();
    runCli(["list"], { home, streams: c.streams });
    const out = c.stdout();
    // One grouped "demo" line plus a sub-row with "in <project>".
    expect(out).toContain("demo");
    expect(out).toContain(`in ${project}`);
    // Header still reads `(1)` — we group by skill name, not by entry.
    expect(out).toContain("Installed skills (1)");
  });
});
